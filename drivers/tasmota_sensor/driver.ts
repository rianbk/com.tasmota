import TasmotaDriverBase, { type TasmotaPairDevice } from '../TasmotaDriverBase.js';
import type TasmotaMqttApp from '../../app.js';
import { TasmotaDiscoveryPayload } from '../../lib/TasmotaDiscoveryPayload.js';

export default class TasmotaSensorDriver extends TasmotaDriverBase {
  protected filterDevice(config: TasmotaDiscoveryPayload): TasmotaPairDevice | null {
    if (!config.hasSensorOnly()) return null;

    const app = this.homey.app as TasmotaMqttApp;
    const entry = app.discoveryManager.getDevice(config.mac);
    const sensors = entry?.sensors ?? null;

    return {
      name: config.displayName,
      data: { id: config.mac },
      capabilities: TasmotaDiscoveryPayload.getSensorCapabilities(sensors),
      settings: {
        ...config.getBaseSettings(),
        sensor_keys: TasmotaDiscoveryPayload.getSensorKeys(sensors),
      },
    };
  }
}

module.exports = TasmotaSensorDriver;
