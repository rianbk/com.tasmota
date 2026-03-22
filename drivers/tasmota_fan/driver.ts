import TasmotaDriverBase, { type TasmotaPairDevice } from '../TasmotaDriverBase.js';
import type { TasmotaDiscoveryPayload } from '../../lib/TasmotaDiscoveryPayload.js';

export default class TasmotaFanDriver extends TasmotaDriverBase {
  protected filterDevice(config: TasmotaDiscoveryPayload): TasmotaPairDevice | null {
    if (!config.isIfan) return null;

    return {
      name: config.displayName,
      data: { id: config.mac },
      capabilities: config.getFanCapabilities(),
      settings: config.getBaseSettings(),
    };
  }
}

module.exports = TasmotaFanDriver;
