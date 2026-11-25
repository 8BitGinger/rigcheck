let liveState = null;
let viewMode = 'live';
let portScope = 'studio'; // 'studio' | 'all'
let portFilter = '';

const el = (id) => document.getElementById(id);

function updateFavicon(isReady) {
  const color = isReady ? '%2310b981' : '%23ef4444';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
    <circle cx='32' cy='32' r='27' fill='%230b111a' stroke='${color}' stroke-width='5'/>
    <circle cx='32' cy='9' r='4' fill='${color}'/>
    <rect x='21' y='26' width='6' height='22' rx='2' fill='${color}'/>
    <rect x='30' y='18' width='6' height='30' rx='2' fill='${color}'/>
    <rect x='39' y='31' width='6' height='17' rx='2' fill='${color}'/>
  </svg>`;
  el('dynamic-favicon').href = `data:image/svg+xml,${svg}`;
  el('brand-icon').classList.toggle('not-ready', !isReady);
}

function setBadge(element, isReady) {
  element.textContent = isReady ? 'READY' : 'NOT READY';
  element.classList.toggle('ready', isReady);
  element.classList.toggle('not-ready', !isReady);
}

function setMeter(barEl, valEl, percent, labelOverride = null) {
  if (percent === null || percent === undefined) {
    valEl.textContent = 'N/A';
    barEl.style.width = '0%';
    barEl.className = 'meter-fill';
    return;
  }
  valEl.textContent = labelOverride || `${percent}%`;
  barEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  barEl.className = 'meter-fill';
  if (percent >= 85) barEl.classList.add('crit');
  else if (percent >= 70) barEl.classList.add('warn');
}

function getDemoState(type) {
  const ready = type === 'demo-ready';
  return {
    timestamp: Date.now(),
    activeSwitcher: 'obs',
    overallReady: ready,
    blockers: ready ? [] : ['OBS WebSocket: WebSocket disconnected', 'Custom OBS Docks: 1 of 2 offline'],
    switcher: {
      mode: 'obs',
      ready,
      conflict: false,
      obs: { ready, connected: ready, scene: 'Studio Main 3-Cam', fps: 59.9, renderSkippedFrames: 0 },
      vmix: { ready: false }
    },
    gear: {
      rodecaster: {
        ready: true,
        detail: 'RØDECaster Pro Stereo • 2 audio endpoints active • No errors'
      },
      customDocks: {
        ready,
        total: 2,
        online: ready ? 2 : 1,
        items: [
          { name: 'Lower Thirds / FX Dock', target: '127.0.0.1:8090', ready: true, latencyMs: 4 },
          { name: 'Show Timer Dock', target: '127.0.0.1:8091', ready, latencyMs: ready ? 2 : null, error: ready ? null : 'Connection refused' }
        ]
      },
      streamDeck: {
        ready: true,
        detail: 'Running (PID 14820) • Port 28196'
      }
    },
    pc: {
      cpuLoad: ready ? 24.6 : 68.2,
      ramPercent: 46.5,
      ramUsedGb: 14.9,
      ramTotalGb: 32,
      gpuLoad: ready ? 31.0 : 54.0,
      gpuName: 'NVIDIA RTX Broadcast GPU'
    },
    ports: [
      { port: 4455, protocol: 'TCP', pid: 10412, process: 'obs64.exe', address: '127.0.0.1', isStudio: true },
      { port: 8090, protocol: 'TCP', pid: 8820, process: 'node.exe', address: '127.0.0.1', isStudio: true },
      { port: 28196, protocol: 'TCP', pid: 14820, process: 'StreamDeck.exe', address: '127.0.0.1', isStudio: true },
      { port: 3100, protocol: 'TCP', pid: 19204, process: 'node.exe', address: '127.0.0.1', isStudio: true }
    ]
  };
}

function render(data) {
  if (!data || document.hidden) return;

  // Switcher buttons & top status
  el('btn-obs').classList.toggle('active', data.activeSwitcher === 'obs');
  el('btn-vmix').classList.toggle('active', data.activeSwitcher === 'vmix');
  setBadge(el('switcher-badge'), data.switcher.ready);

  // Overall banner
  const banner = el('overall-banner');
  banner.classList.toggle('ready', data.overallReady);
  banner.classList.toggle('not-ready', !data.overallReady);
  el('overall-verdict').textContent = data.overallReady ? 'READY FOR BROADCAST' : 'NOT READY';
  el('overall-details').textContent = data.overallReady
    ? 'All studio systems verified: active switcher, RØDECaster Pro, custom docks, and Stream Deck are online with no errors.'
    : `Action required: ${data.blockers.join('  •  ')}`;

  if (data.activeSwitcher === 'obs') {
    const o = data.switcher.obs;
    el('switcher-telemetry').textContent = o.connected
      ? `OBS: ${o.scene || 'Connected'} • ${o.fps ?? '--'} FPS`
      : `OBS: ${o.error || 'Disconnected'}`;
  } else {
    const v = data.switcher.vmix;
    el('switcher-telemetry').textContent = v.responding
      ? `vMix ${v.version || ''} • Active Input ${v.activeInput || '--'}`
      : `vMix: ${v.error || 'Unreachable'}`;
  }

  el('last-sync').textContent = `SYNC ${new Date(data.timestamp).toLocaleTimeString()}`;
  updateFavicon(data.overallReady);

  // Studio gear cards
  setBadge(el('badge-rodecaster'), data.gear.rodecaster.ready);
  el('detail-rodecaster').textContent = data.gear.rodecaster.detail;

  setBadge(el('badge-docks'), data.gear.customDocks.ready);
  const dockList = el('list-docks');
  dockList.innerHTML = '';
  for (const dock of data.gear.customDocks.items || []) {
    const li = document.createElement('li');
    li.className = 'dock-item';
    li.innerHTML = `
      <span><span class="dock-dot ${dock.ready ? 'ready' : 'not-ready'}"></span>${dock.name}</span>
      <span class="dock-meta">${dock.ready ? `${dock.latencyMs}ms` : dock.error || 'Offline'}</span>
    `;
    dockList.appendChild(li);
  }

  setBadge(el('badge-streamdeck'), data.gear.streamDeck.ready);
  el('detail-streamdeck').textContent = data.gear.streamDeck.detail;

  // PC Health
  setMeter(el('bar-cpu'), el('val-cpu'), data.pc.cpuLoad);
  setMeter(
    el('bar-ram'),
    el('val-ram'),
    data.pc.ramPercent,
    `${data.pc.ramPercent}% (${data.pc.ramUsedGb}/${data.pc.ramTotalGb} GB)`
  );
  setMeter(el('bar-gpu'), el('val-gpu'), data.pc.gpuLoad);
  el('pc-gpu-name').textContent = data.pc.gpuName || 'GPU';

  // Ports table
  renderPorts(data.ports || []);
}

function renderPorts(ports) {
  const tbody = el('ports-tbody');
  const q = portFilter.trim().toLowerCase();
  const filtered = ports.filter((p) => {
    if (portScope === 'studio' && !p.isStudio) return false;
    if (!q) return true;
    return String(p.port).includes(q) || String(p.process).toLowerCase().includes(q) || String(p.pid).includes(q);
  });

  tbody.innerHTML = filtered
    .slice(0, 60)
    .map(
      (p) => `
      <tr class="${p.isStudio ? 'studio-row' : ''}">
        <td>${p.port}</td>
        <td>${p.protocol}</td>
        <td>${p.pid}</td>
        <td>${p.process}</td>
        <td>${p.address}</td>
      </tr>`
    )
    .join('');
}

function refreshView() {
  if (viewMode === 'live') render(liveState);
  else render(getDemoState(viewMode));
}

async function setSwitcher(mode) {
  if (viewMode !== 'live') return;
  await fetch('/api/switcher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  });
}

el('btn-obs').addEventListener('click', () => setSwitcher('obs'));
el('btn-vmix').addEventListener('click', () => setSwitcher('vmix'));

el('demo-mode').addEventListener('change', (e) => {
  viewMode = e.target.value;
  refreshView();
});

el('port-search').addEventListener('input', (e) => {
  portFilter = e.target.value;
  refreshView();
});

el('btn-port-scope').addEventListener('click', (e) => {
  portScope = portScope === 'studio' ? 'all' : 'studio';
  e.target.textContent = portScope === 'studio' ? 'Studio Ports' : 'All Ports';
  refreshView();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshView();
});

// Connect SSE stream
const events = new EventSource('/api/events');
events.onmessage = (event) => {
  liveState = JSON.parse(event.data);
  if (viewMode === 'live') render(liveState);
};
