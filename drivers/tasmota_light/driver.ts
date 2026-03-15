import TasmotaDriverBase, { type TasmotaPairDevice } from '../TasmotaDriverBase.js';
import type { TasmotaDiscoveryPayload } from '../../lib/TasmotaDiscoveryPayload.js';

export default class TasmotaLightDriver extends TasmotaDriverBase {
  protected filterDevice(config: TasmotaDiscoveryPayload): TasmotaPairDevice | null {
    if (!config.hasLight()) return null;

    return {
      name: config.friendlyNames[0] || config.deviceName,
      data: { id: config.mac },
      capabilities: config.getLightCapabilities(),
      settings: {
        t: config.topic,
        ft: config.raw.ft,
        tp: config.raw.tp,
        mac: config.mac,
        hn: config.raw.hn ?? '',
        ip: config.ip,
        model: config.model,
        firmware: config.firmware,
        lt_st: config.lightSubtype,
        ofln: config.offlinePayload,
        onln: config.onlinePayload,
        ct_min: config.ctRange.min,
        ct_max: config.ctRange.max,
      },
    };
  }
}

module.exports = TasmotaLightDriver;
