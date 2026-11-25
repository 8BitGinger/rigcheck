import net from 'node:net';

function probeTcp(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    let done = false;

    const finish = (ok, error = null) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok, latencyMs: Date.now() - start, error });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'TCP timeout'));
    socket.once('error', (err) => finish(false, err.code || 'Connection refused'));
  });
}

async function probeHttp(url, timeoutMs = 1200) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return {
      ok: res.status < 500,
      statusCode: res.status,
      latencyMs: Date.now() - start,
      error: res.status >= 500 ? `HTTP ${res.status}` : null
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: null,
      latencyMs: Date.now() - start,
      error: err?.name === 'TimeoutError' ? 'HTTP timeout' : 'Unreachable'
    };
  }
}

export async function probeCustomDocks(docks = []) {
  if (!docks.length) {
    return { ready: true, total: 0, online: 0, items: [] };
  }

  const items = await Promise.all(
    docks.map(async (dock) => {
      const result =
        dock.type === 'tcp'
          ? await probeTcp(dock.host || '127.0.0.1', dock.port, dock.timeoutMs)
          : await probeHttp(dock.url, dock.timeoutMs);

      return {
        name: dock.name,
        target: dock.type === 'tcp' ? `${dock.host || '127.0.0.1'}:${dock.port}` : dock.url,
        ready: result.ok,
        latencyMs: result.latencyMs,
        error: result.error
      };
    })
  );

  const online = items.filter((i) => i.ready).length;
  return {
    ready: online === items.length,
    total: items.length,
    online,
    items
  };
}

export function evaluateRodecaster(config, sysState) {
  const keywords = (config.rodecaster?.matchKeywords || ['rodecaster', 'rode']).map((k) =>
    k.toLowerCase()
  );

  const matchesKeyword = (text = '') =>
    keywords.some((kw) => String(text).toLowerCase().includes(kw));

  const matchedAudio = (sysState.audioDevices || []).filter(
    (d) => matchesKeyword(d.name) || matchesKeyword(d.manufacturer)
  );
  const matchedUsb = (sysState.usbDevices || []).filter(
    (d) => matchesKeyword(d.name) || matchesKeyword(d.vendor)
  );

  const present = matchedAudio.length > 0 || matchedUsb.length > 0;
  const badStatus = matchedAudio.find(
    (d) => d.status && !['ok', 'online', 'ready', 'started'].includes(String(d.status).toLowerCase())
  );

  if (!present) {
    return {
      ready: false,
      present: false,
      deviceName: null,
      detail: 'Device not detected on USB/Audio bus',
      error: 'Not detected'
    };
  }

  if (badStatus) {
    return {
      ready: false,
      present: true,
      deviceName: badStatus.name,
      detail: `Device reported status: ${badStatus.status}`,
      error: `Hardware status: ${badStatus.status}`
    };
  }

  const primaryName = matchedAudio[0]?.name || matchedUsb[0]?.name || 'RØDECaster Pro';
  return {
    ready: true,
    present: true,
    deviceName: primaryName,
    detail: `${matchedAudio.length} audio endpoint(s) active • No errors`,
    error: null
  };
}

export function evaluateStreamDeck(config, sysState) {
  const targetProc = (config.streamDeck?.processName || 'StreamDeck.exe').toLowerCase();
  const baseProc = targetProc.replace(/\.exe$/i, '');

  const running = (sysState.processes || []).find((p) => {
    const n = String(p.name || '').toLowerCase();
    return n === targetProc || n === baseProc;
  });

  const activePorts = (sysState.ports || []).filter((p) =>
    String(p.process || '').toLowerCase().includes(baseProc)
  );

  const requirePort = Boolean(config.streamDeck?.requireListeningPort);
  const ready = Boolean(running) && (!requirePort || activePorts.length > 0);

  return {
    ready,
    running: Boolean(running),
    pid: running?.pid || null,
    activePorts: activePorts.map((p) => p.port),
    detail: running
      ? `Running (PID ${running.pid})${activePorts.length ? ` • Port ${activePorts[0].port}` : ''}`
      : 'StreamDeck.exe process not running',
    error: ready ? null : running ? 'No active Stream Deck socket' : 'Process not running'
  };
}

export function detectSwitcherProcesses(config, sysState) {
  const hasProc = (expected) => {
    const clean = String(expected || '').toLowerCase().replace(/\.exe$/i, '');
    return (sysState.processes || []).some((p) => {
      const n = String(p.name || '').toLowerCase().replace(/\.exe$/i, '');
      return n === clean;
    });
  };

  const obsRunning = hasProc(config.obs?.processName || 'obs64.exe');
  const vmixRunning = hasProc(config.vmix?.processName || 'vMix64.exe');

  return {
    obsRunning,
    vmixRunning,
    conflict: obsRunning && vmixRunning
  };
}
