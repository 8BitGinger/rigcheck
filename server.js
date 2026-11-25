import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig } from './lib/configStore.js';
import { ObsMonitor } from './lib/obsMonitor.js';
import { VmixMonitor } from './lib/vmixMonitor.js';
import { SystemMonitor } from './lib/systemMonitor.js';
import {
  probeCustomDocks,
  evaluateRodecaster,
  evaluateStreamDeck,
  detectSwitcherProcesses
} from './lib/studioProbes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sseClients = new Set();
let docksState = { ready: false, total: config.customDocks?.length || 0, online: 0, items: [] };

function broadcastState() {
  const payload = `data: ${JSON.stringify(buildPayload())}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

const obsMonitor = new ObsMonitor(config, broadcastState);
const vmixMonitor = new VmixMonitor(config, broadcastState);
const systemMonitor = new SystemMonitor(config, broadcastState);

function applyActiveSwitcher(mode) {
  config.activeSwitcher = mode === 'vmix' ? 'vmix' : 'obs';
  if (config.activeSwitcher === 'obs') {
    vmixMonitor.stop();
    obsMonitor.start();
  } else {
    obsMonitor.stop();
    vmixMonitor.start();
  }
}

async function pollDocks() {
  docksState = await probeCustomDocks(config.customDocks || []);
  broadcastState();
}

function buildPayload() {
  const sysState = systemMonitor.getState();
  const procFlags = detectSwitcherProcesses(config, sysState);
  const rodecaster = evaluateRodecaster(config, sysState);
  const streamDeck = evaluateStreamDeck(config, sysState);

  const activeSwitcher = config.activeSwitcher;
  const obs = obsMonitor.getState();
  const vmix = vmixMonitor.getState();
  const activeSwitcherState = activeSwitcher === 'obs' ? obs : vmix;

  const switcherReady = Boolean(activeSwitcherState.ready) && !procFlags.conflict;

  const blockers = [];
  if (procFlags.conflict) {
    blockers.push('Both OBS and vMix are running simultaneously');
  } else if (!activeSwitcherState.ready) {
    blockers.push(
      activeSwitcher === 'obs'
        ? `OBS WebSocket: ${obs.error || 'Not reachable'}`
        : `vMix API: ${vmix.error || 'Not responding'}`
    );
  }

  if (!rodecaster.ready) blockers.push(`RØDECaster Pro: ${rodecaster.error || 'Not ready'}`);
  if (!docksState.ready) {
    const downCount = docksState.total - docksState.online;
    blockers.push(`Custom OBS Docks: ${downCount} of ${docksState.total} offline`);
  }
  if (!streamDeck.ready) blockers.push(`Stream Deck: ${streamDeck.error || 'Not ready'}`);

  const overallReady =
    switcherReady && rodecaster.ready && docksState.ready && streamDeck.ready;

  return {
    timestamp: Date.now(),
    activeSwitcher,
    overallReady,
    blockers,
    switcher: {
      mode: activeSwitcher,
      ready: switcherReady,
      conflict: procFlags.conflict,
      obsRunning: procFlags.obsRunning,
      vmixRunning: procFlags.vmixRunning,
      obs,
      vmix
    },
    gear: {
      rodecaster,
      customDocks: docksState,
      streamDeck
    },
    pc: sysState.pc,
    ports: sysState.ports
  };
}

app.get('/api/state', (_req, res) => {
  res.json(buildPayload());
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify(buildPayload())}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.post('/api/switcher', (req, res) => {
  const mode = req.body?.mode;
  if (mode !== 'obs' && mode !== 'vmix') {
    return res.status(400).json({ error: 'Mode must be "obs" or "vmix"' });
  }
  applyActiveSwitcher(mode);
  try {
    saveConfig(config);
  } catch (err) {
    console.warn('Could not persist config.json:', err.message);
  }
  broadcastState();
  return res.json({ ok: true, activeSwitcher: config.activeSwitcher });
});

// Start monitors
systemMonitor.start();
applyActiveSwitcher(config.activeSwitcher || 'obs');
pollDocks();
setInterval(pollDocks, config.polling?.mediumMs || 5000);

const host = config.server?.host || '127.0.0.1';
const port = config.server?.port || 3100;

app.listen(port, host, () => {
  console.log(`RigCheck running at http://${host}:${port} (Default switcher: ${config.activeSwitcher.toUpperCase()})`);
});
