import TasmotaDriverBase, { type TasmotaPairDevice } from '../TasmotaDriverBase.js';
import type { TasmotaDiscoveryPayload } from '../../lib/TasmotaDiscoveryPayload.js';

export default class TasmotaLightDriver extends TasmotaDriverBase {
  protected filterDevice(config: TasmotaDiscoveryPayload): TasmotaPairDevice | null {
    if (!config.hasLight()) return null;

    return {
      name: config.displayName,
      data: { id: config.mac },
      capabilities: config.getLightCapabilities(),
      settings: {
        ...config.getBaseSettings(),
        lt_st: config.lightSubtype,
        ct_min: config.ctRange.min,
        ct_max: config.ctRange.max,
      },
    };
  }
}

module.exports = TasmotaLightDriver;
