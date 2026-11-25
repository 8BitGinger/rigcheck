import { OBSWebSocket } from 'obs-websocket-js';

export class ObsMonitor {
  constructor(config, onUpdate) {
    this.config = config;
    this.onUpdate = onUpdate;
    this.obs = new OBSWebSocket();
    this.enabled = false;
    this.connecting = false;
    this.reconnectTimer = null;
    this.statsTimer = null;

    this.state = {
      ready: false,
      connected: false,
      scene: null,
      streaming: false,
      recording: false,
      fps: null,
      renderSkippedFrames: 0,
      cpuUsage: null,
      version: null,
      error: 'Standby',
      lastChecked: null
    };

    this._bindEvents();
  }

  _bindEvents() {
    this.obs.on('ConnectionClosed', () => {
      this.state.connected = false;
      this.state.ready = false;
      this.state.error = this.enabled ? 'WebSocket disconnected' : 'Standby';
      this.state.lastChecked = Date.now();
      this._stopStatsPolling();
      this.onUpdate(this.getState());
      if (this.enabled) this._scheduleReconnect();
    });

    this.obs.on('CurrentProgramSceneChanged', ({ sceneName }) => {
      this.state.scene = sceneName;
      this.onUpdate(this.getState());
    });

    this.obs.on('StreamStateChanged', ({ outputActive }) => {
      this.state.streaming = Boolean(outputActive);
      this.onUpdate(this.getState());
    });

    this.obs.on('RecordStateChanged', ({ outputActive }) => {
      this.state.recording = Boolean(outputActive);
      this.onUpdate(this.getState());
    });
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this._connect();
  }

  async stop() {
    this.enabled = false;
    clearTimeout(this.reconnectTimer);
    this._stopStatsPolling();
    try {
      await this.obs.disconnect();
    } catch {
      // Ignore disconnect errors if already closed
    }
    this.state.connected = false;
    this.state.ready = false;
    this.state.error = 'Standby (vMix selected)';
    this.onUpdate(this.getState());
  }

  async _connect() {
    if (!this.enabled || this.connecting || this.state.connected) return;
    this.connecting = true;
    try {
      const { obsWebSocketVersion } = await this.obs.connect(
        this.config.obs.url,
        this.config.obs.password || undefined,
        { rpcVersion: 1 }
      );

      this.state.connected = true;
      this.state.ready = true;
      this.state.version = obsWebSocketVersion;
      this.state.error = null;
      this.state.lastChecked = Date.now();

      await this._fetchInitialSnapshot();
      this._startStatsPolling();
      this.onUpdate(this.getState());
    } catch (err) {
      this.state.connected = false;
      this.state.ready = false;
      this.state.error = err?.message || 'OBS WebSocket unreachable';
      this.state.lastChecked = Date.now();
      this.onUpdate(this.getState());
      this._scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  async _fetchInitialSnapshot() {
    try {
      const [sceneRes, streamRes, recordRes, statsRes] = await Promise.all([
        this.obs.call('GetCurrentProgramScene'),
        this.obs.call('GetStreamStatus'),
        this.obs.call('GetRecordStatus'),
        this.obs.call('GetStats')
      ]);

      this.state.scene = sceneRes?.currentProgramSceneName || null;
      this.state.streaming = Boolean(streamRes?.outputActive);
      this.state.recording = Boolean(recordRes?.outputActive);
      this._applyStats(statsRes);
    } catch {
      // Non-fatal; next stats tick will refresh
    }
  }

  _applyStats(stats) {
    if (!stats) return;
    this.state.fps = typeof stats.activeFps === 'number' ? Number(stats.activeFps.toFixed(1)) : null;
    this.state.renderSkippedFrames = stats.renderSkippedFrames ?? 0;
    this.state.cpuUsage = typeof stats.cpuUsage === 'number' ? Number(stats.cpuUsage.toFixed(1)) : null;
    this.state.lastChecked = Date.now();
  }

  _startStatsPolling() {
    this._stopStatsPolling();
    const interval = Math.max(2000, this.config.polling?.fastMs || 2500);
    this.statsTimer = setInterval(async () => {
      if (!this.enabled || !this.state.connected) return;
      try {
        const stats = await this.obs.call('GetStats');
        this._applyStats(stats);
        this.onUpdate(this.getState());
      } catch {
        // ConnectionClosed handler manages drops
      }
    }, interval);
  }

  _stopStatsPolling() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  _scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    if (!this.enabled) return;
    this.reconnectTimer = setTimeout(() => this._connect(), 4000);
  }

  getState() {
    return { ...this.state };
  }
}
