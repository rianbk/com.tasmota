import Homey from 'homey';
import type TasmotaMqttApp from '../app.js';
import type { TasmotaDiscoveryPayload } from '../lib/TasmotaDiscoveryPayload.js';

export interface TasmotaPairDevice {
  name: string;
  data: { id: string };
  capabilities: string[];
  settings: Record<string, unknown>;
}

/**
 * Base driver with shared pairing logic using discovery cache.
 */
export default class TasmotaDriverBase extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log(`${this.constructor.name} initialized`);
  }

  /**
   * Override in subclass to filter discovery results to this driver's device type.
   * Return null to skip, a single device, or an array (e.g. for multi-relay).
   */
  protected filterDevice(_config: TasmotaDiscoveryPayload): TasmotaPairDevice | TasmotaPairDevice[] | null {
    return null;
  }

  async onPairListDevices(): Promise<TasmotaPairDevice[]> {
    const app = this.homey.app as TasmotaMqttApp;
    const discovered = app.discoveryManager.getDiscoveredDevices();
    const devices: TasmotaPairDevice[] = [];

    // Get already-paired device IDs
    const pairedIds = new Set(this.getDevices().map((d) => d.getData().id as string));

    const showOffline = this.homey.settings.get('show_offline_devices') ?? false;

    for (const [, entry] of discovered) {
      if (!showOffline && !entry.online) continue;

      const result = this.filterDevice(entry.config);
      if (!result) continue;

      const candidates = Array.isArray(result) ? result : [result];
      for (const device of candidates) {
        if (!pairedIds.has(device.data.id)) {
          devices.push(device);
        }
      }
    }

    return devices;
  }
}

module.exports = TasmotaDriverBase;
