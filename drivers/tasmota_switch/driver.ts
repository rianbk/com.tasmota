import TasmotaDriverBase, { type TasmotaPairDevice } from '../TasmotaDriverBase.js';
import { type TasmotaDiscoveryPayload, RELAY_RELAY } from '../../lib/TasmotaDiscoveryPayload.js';

export default class TasmotaSwitchDriver extends TasmotaDriverBase {
  protected filterDevice(config: TasmotaDiscoveryPayload): TasmotaPairDevice | TasmotaPairDevice[] | null {
    if (!config.hasRelay()) return null;

    const devices: TasmotaPairDevice[] = [];
    const relayIndices: number[] = [];

    for (let i = 0; i < config.relays.length; i++) {
      if (config.relays[i] === RELAY_RELAY && !config.isLight(i)) {
        relayIndices.push(i + 1); // Tasmota uses 1-based indexing
      }
    }

    const isMulti = relayIndices.length > 1;

    for (const relayIndex of relayIndices) {
      const arrayIdx = relayIndex - 1;
      devices.push({
        name: isMulti
          ? config.friendlyNames[arrayIdx] || `${config.deviceName} CH${relayIndex}`
          : config.displayName,
        data: { id: isMulti ? `${config.mac}_relay${relayIndex}` : config.mac },
        capabilities: config.getRelayCapabilities(),
        settings: {
          ...config.getBaseSettings(),
          relay_index: relayIndex,
        },
      });
    }

    return devices.length === 1 ? devices[0] : devices;
  }
}

module.exports = TasmotaSwitchDriver;
