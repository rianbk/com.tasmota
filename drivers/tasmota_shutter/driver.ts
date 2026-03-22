import TasmotaDriverBase, { type TasmotaPairDevice } from '../TasmotaDriverBase.js';
import type { TasmotaDiscoveryPayload } from '../../lib/TasmotaDiscoveryPayload.js';

export default class TasmotaShutterDriver extends TasmotaDriverBase {
  protected filterDevice(config: TasmotaDiscoveryPayload): TasmotaPairDevice | null {
    if (!config.hasShutter()) return null;

    return {
      name: config.displayName,
      data: { id: config.mac },
      capabilities: config.getShutterCapabilities(),
      settings: config.getBaseSettings(),
    };
  }
}

module.exports = TasmotaShutterDriver;
