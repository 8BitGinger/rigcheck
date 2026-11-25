export class VmixMonitor {
  constructor(config, onUpdate) {
    this.config = config;
    this.onUpdate = onUpdate;
    this.enabled = false;
    this.timer = null;

    this.state = {
      ready: false,
      responding: false,
      version: null,
      activeInput: null,
      recording: false,
      streaming: false,
      error: 'Standby (OBS selected)',
      lastChecked: null
    };
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this._poll();
    const interval = Math.max(2000, this.config.polling?.fastMs || 2500);
    this.timer = setInterval(() => this._poll(), interval);
  }

  stop() {
    this.enabled = false;
    clearInterval(this.timer);
    this.timer = null;
    this.state.ready = false;
    this.state.responding = false;
    this.state.error = 'Standby (OBS selected)';
    this.onUpdate(this.getState());
  }

  async _poll() {
    if (!this.enabled) return;
    try {
      const res = await fetch(this.config.vmix.url, {
        signal: AbortSignal.timeout(1500)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      if (!xml.includes('<vmix')) throw new Error('Unexpected response from vMix port');

      const matchTag = (tag) => {
        const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
        return m ? m[1].trim() : null;
      };

      this.state.ready = true;
      this.state.responding = true;
      this.state.version = matchTag('version');
      this.state.activeInput = matchTag('active');
      this.state.recording = matchTag('recording') === 'True';
      this.state.streaming = matchTag('streaming') === 'True';
      this.state.error = null;
      this.state.lastChecked = Date.now();
    } catch (err) {
      this.state.ready = false;
      this.state.responding = false;
      this.state.error = err?.name === 'TimeoutError' ? 'vMix API timeout' : 'vMix API unreachable';
      this.state.lastChecked = Date.now();
    }

    this.onUpdate(this.getState());
  }

  getState() {
    return { ...this.state };
  }
}
