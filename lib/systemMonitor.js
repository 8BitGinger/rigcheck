import si from 'systeminformation';

export class SystemMonitor {
  constructor(config, onUpdate) {
    this.config = config;
    this.onUpdate = onUpdate;
    this.timers = [];
    this.busy = { fast: false, medium: false, slow: false };

    this.state = {
      pc: {
        cpuLoad: 0,
        ramPercent: 0,
        ramUsedGb: 0,
        ramTotalGb: 0,
        gpuLoad: null,
        gpuName: null,
        gpuVramPercent: null
      },
      processes: [],
      ports: [],
      audioDevices: [],
      usbDevices: [],
      lastUpdated: null
    };
  }

  start() {
    this._pollFast();
    this._pollMedium();
    this._pollSlow();

    this.timers.push(
      setInterval(() => this._pollFast(), this.config.polling?.fastMs || 2500),
      setInterval(() => this._pollMedium(), this.config.polling?.mediumMs || 5000),
      setInterval(() => this._pollSlow(), this.config.polling?.slowMs || 8000)
    );
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  async _pollFast() {
    if (this.busy.fast) return;
    this.busy.fast = true;
    try {
      const [load, mem] = await Promise.all([si.currentLoad(), si.mem()]);
      this.state.pc.cpuLoad = Number((load.currentLoad || 0).toFixed(1));
      const total = mem.total || 1;
      const used = mem.active || mem.used || 0;
      this.state.pc.ramPercent = Number(((used / total) * 100).toFixed(1));
      this.state.pc.ramUsedGb = Number((used / 1073741824).toFixed(1));
      this.state.pc.ramTotalGb = Number((total / 1073741824).toFixed(1));
      this.state.lastUpdated = Date.now();
      this.onUpdate(this.state);
    } catch {
      // Keep previous cached reading on transient OS error
    } finally {
      this.busy.fast = false;
    }
  }

  async _pollMedium() {
    if (this.busy.medium) return;
    this.busy.medium = true;
    try {
      const graphics = await si.graphics();
      const controllers = graphics?.controllers || [];
      const primary =
        controllers.find((c) => typeof c.utilizationGpu === 'number') ||
        controllers.find((c) => /nvidia|amd|radeon|rtx|gtx/i.test(c.model || '')) ||
        controllers[0];

      if (primary) {
        this.state.pc.gpuName = primary.model || 'GPU';
        this.state.pc.gpuLoad =
          typeof primary.utilizationGpu === 'number'
            ? Number(primary.utilizationGpu.toFixed(1))
            : null;
        if (primary.memoryTotal && primary.memoryUsed) {
          this.state.pc.gpuVramPercent = Number(
            ((primary.memoryUsed / primary.memoryTotal) * 100).toFixed(1)
          );
        }
      }
      this.onUpdate(this.state);
    } catch {
      // Non-fatal if GPU counter unavailable
    } finally {
      this.busy.medium = false;
    }
  }

  async _pollSlow() {
    if (this.busy.slow) return;
    this.busy.slow = true;
    try {
      const [procData, netConns, audio, usb] = await Promise.all([
        si.processes(),
        si.networkConnections(),
        si.audio().catch(() => []),
        si.usb().catch(() => [])
      ]);

      const procList = procData?.list || [];
      const pidMap = new Map();
      for (const p of procList) {
        pidMap.set(p.pid, p.name);
      }

      const highlightPorts = new Set(this.config.studioHighlightPorts || []);
      const studioProcPattern = /(obs|vmix|streamdeck|node|rode)/i;

      const seen = new Set();
      const listeningPorts = [];
      for (const conn of netConns || []) {
        if (String(conn.state).toUpperCase() !== 'LISTEN') continue;
        const portNum = Number(conn.localPort);
        const key = `${conn.protocol}:${portNum}:${conn.pid}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const procName = conn.process || pidMap.get(conn.pid) || 'System';
        const isStudio = highlightPorts.has(portNum) || studioProcPattern.test(procName);

        listeningPorts.push({
          protocol: (conn.protocol || 'tcp').toUpperCase(),
          address: conn.localAddress || '0.0.0.0',
          port: portNum,
          pid: conn.pid || 0,
          process: procName,
          isStudio
        });
      }

      listeningPorts.sort((a, b) => Number(b.isStudio) - Number(a.isStudio) || a.port - b.port);

      this.state.processes = procList.map((p) => ({ pid: p.pid, name: p.name }));
      this.state.ports = listeningPorts;
      this.state.audioDevices = audio || [];
      this.state.usbDevices = usb || [];
      this.state.lastUpdated = Date.now();
      this.onUpdate(this.state);
    } catch {
      // Retain last known snapshot
    } finally {
      this.busy.slow = false;
    }
  }

  getState() {
    return this.state;
  }
}
