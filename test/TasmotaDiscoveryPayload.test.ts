import { describe, it, expect } from 'vitest';
import {
  TasmotaDiscoveryPayload,
  LIGHT_DIMMER, LIGHT_CW, LIGHT_RGB, LIGHT_RGBCW,
  RELAY_LIGHT, RELAY_RELAY, RELAY_NONE, RELAY_SHUTTER,
  type SensorsPayload,
} from '../lib/TasmotaDiscoveryPayload.js';

function makeRaw(overrides: Record<string, unknown> = {}) {
  return {
    dn: 'Test Light',
    fn: ['Test Light'],
    t: 'tasmota_test',
    ft: '%prefix%/%topic%/',
    tp: ['cmnd', 'stat', 'tele'] as [string, string, string],
    mac: 'AABBCCDDEEFF',
    ip: '192.168.1.50',
    md: 'Sonoff Basic',
    sw: '14.4.1',
    rl: [RELAY_LIGHT],
    lt_st: LIGHT_RGBCW,
    ofln: 'Offline',
    onln: 'Online',
    state: ['OFF', 'ON', 'TOGGLE', 'HOLD'],
    ver: 1,
    ...overrides,
  };
}

describe('TasmotaDiscoveryPayload.parse', () => {
  it('parses valid JSON', () => {
    const payload = TasmotaDiscoveryPayload.parse(JSON.stringify(makeRaw()));
    expect(payload).not.toBeNull();
    expect(payload!.deviceName).toBe('Test Light');
    expect(payload!.mac).toBe('AABBCCDDEEFF');
  });

  it('returns null for invalid JSON', () => {
    expect(TasmotaDiscoveryPayload.parse('not json')).toBeNull();
  });

  it('returns null for wrong version', () => {
    expect(TasmotaDiscoveryPayload.parse(JSON.stringify(makeRaw({ ver: 2 })))).toBeNull();
  });

  it('returns null for missing mac', () => {
    expect(TasmotaDiscoveryPayload.parse(JSON.stringify(makeRaw({ mac: '' })))).toBeNull();
  });

  it('returns null for missing topic', () => {
    expect(TasmotaDiscoveryPayload.parse(JSON.stringify(makeRaw({ t: undefined })))).toBeNull();
  });

  it('returns null for missing full template', () => {
    expect(TasmotaDiscoveryPayload.parse(JSON.stringify(makeRaw({ ft: undefined })))).toBeNull();
  });

  it('returns null for incorrect prefix count', () => {
    expect(TasmotaDiscoveryPayload.parse(JSON.stringify(makeRaw({ tp: ['cmnd', 'stat'] })))).toBeNull();
  });
});

describe('getLightCapabilities', () => {
  it('returns onoff + dim for DIMMER', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ lt_st: LIGHT_DIMMER }));
    const caps = p.getLightCapabilities();
    expect(caps).toContain('onoff');
    expect(caps).toContain('dim');
    expect(caps).not.toContain('light_temperature');
    expect(caps).not.toContain('light_hue');
  });

  it('adds light_temperature for CW', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ lt_st: LIGHT_CW }));
    const caps = p.getLightCapabilities();
    expect(caps).toContain('light_temperature');
    expect(caps).not.toContain('light_hue');
  });

  it('adds hue/sat/mode for RGB', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ lt_st: LIGHT_RGB }));
    const caps = p.getLightCapabilities();
    expect(caps).toContain('light_hue');
    expect(caps).toContain('light_saturation');
    expect(caps).toContain('light_mode');
    expect(caps).toContain('light_temperature');
  });

  it('includes all capabilities for RGBCW', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ lt_st: LIGHT_RGBCW }));
    const caps = p.getLightCapabilities();
    expect(caps).toContain('light_temperature');
    expect(caps).toContain('light_hue');
    expect(caps).toContain('light_saturation');
    expect(caps).toContain('light_mode');
    expect(caps).toContain('measure_signal_strength');
    expect(caps).toContain('measure_wifi_percent');
  });

  it('always includes wifi metrics', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ lt_st: LIGHT_DIMMER }));
    const caps = p.getLightCapabilities();
    expect(caps).toContain('measure_signal_strength');
    expect(caps).toContain('measure_wifi_percent');
  });
});

describe('isLight / hasLight', () => {
  it('returns true for RELAY_LIGHT type', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_LIGHT] }));
    expect(p.isLight(0)).toBe(true);
    expect(p.hasLight()).toBe(true);
  });

  it('returns true for RELAY_RELAY with so.30', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_RELAY], so: { 30: 1 } }));
    expect(p.isLight(0)).toBe(true);
  });

  it('returns false for RELAY_RELAY without so.30', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_RELAY] }));
    expect(p.isLight(0)).toBe(false);
  });
});

describe('ctRange', () => {
  it('returns standard range by default', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw());
    expect(p.ctRange).toEqual({ min: 153, max: 500 });
  });

  it('returns narrow range with so.82', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ so: { 82: 1 } }));
    expect(p.ctRange).toEqual({ min: 200, max: 380 });
    expect(p.hasNarrowCtRange).toBe(true);
  });
});

describe('buildTopic', () => {
  it('builds topic from payload parts', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw());
    expect(p.buildTopic(0, 'POWER')).toBe('cmnd/tasmota_test/POWER');
  });
});

describe('hasRelay', () => {
  it('returns true for plain relay', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_RELAY, RELAY_NONE], lt_st: 0 }));
    expect(p.hasRelay()).toBe(true);
  });

  it('returns false for relay that is a light (RELAY_LIGHT)', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_LIGHT], lt_st: LIGHT_RGBCW }));
    expect(p.hasRelay()).toBe(false);
  });

  it('returns false for relay with so.30 (makes it a light)', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_RELAY], so: { 30: 1 } }));
    expect(p.hasRelay()).toBe(false);
  });

  it('returns false when all relays are NONE', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_NONE, RELAY_NONE], lt_st: 0 }));
    expect(p.hasRelay()).toBe(false);
  });

  it('returns false for iFan devices', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_RELAY], lt_st: 0, if: 1 }));
    expect(p.hasRelay()).toBe(false);
  });

  it('returns false for shutter relays', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_SHUTTER, RELAY_SHUTTER], lt_st: 0 }));
    expect(p.hasRelay()).toBe(false);
  });
});

describe('relayCount', () => {
  it('counts plain relays', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_RELAY, RELAY_RELAY, RELAY_NONE], lt_st: 0 }));
    expect(p.relayCount).toBe(2);
  });

  it('excludes light relays', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_RELAY, RELAY_LIGHT], lt_st: 0 }));
    expect(p.relayCount).toBe(1);
  });

  it('returns 0 for sensor-only device', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_NONE], lt_st: 0 }));
    expect(p.relayCount).toBe(0);
  });
});

describe('hasShutter', () => {
  it('returns true when shutter relay present', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_SHUTTER, RELAY_SHUTTER], lt_st: 0 }));
    expect(p.hasShutter()).toBe(true);
  });

  it('returns false for plain relays', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_RELAY], lt_st: 0 }));
    expect(p.hasShutter()).toBe(false);
  });
});

describe('hasSensorOnly', () => {
  it('returns true when all relays are NONE and no light', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_NONE, RELAY_NONE], lt_st: 0 }));
    expect(p.hasSensorOnly()).toBe(true);
  });

  it('returns false when relay present', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_RELAY], lt_st: 0 }));
    expect(p.hasSensorOnly()).toBe(false);
  });

  it('returns false when light present', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_LIGHT], lt_st: LIGHT_DIMMER }));
    expect(p.hasSensorOnly()).toBe(false);
  });

  it('returns false for iFan', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_NONE], lt_st: 0, if: 1 }));
    expect(p.hasSensorOnly()).toBe(false);
  });
});

describe('getShutterCapabilities', () => {
  it('returns base capabilities without tilt', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_SHUTTER, RELAY_SHUTTER], lt_st: 0 }));
    const caps = p.getShutterCapabilities();
    expect(caps).toContain('windowcoverings_set');
    expect(caps).toContain('windowcoverings_state');
    expect(caps).not.toContain('windowcoverings_tilt_set');
    expect(caps).toContain('measure_signal_strength');
  });

  it('includes tilt when sht config present', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ rl: [RELAY_SHUTTER, RELAY_SHUTTER], lt_st: 0, sht: [[0, 0, 0]] }));
    const caps = p.getShutterCapabilities();
    expect(caps).toContain('windowcoverings_tilt_set');
  });
});

describe('getFanCapabilities', () => {
  it('returns onoff, fan_speed, and wifi metrics', () => {
    const p = new TasmotaDiscoveryPayload(makeRaw({ if: 1 }));
    const caps = p.getFanCapabilities();
    expect(caps).toEqual(['onoff', 'fan_speed', 'measure_signal_strength', 'measure_wifi_percent']);
  });
});

describe('getSensorCapabilities', () => {
  it('detects temperature and humidity from AM2301', () => {
    const sensors: SensorsPayload = { sn: { Time: '', AM2301: { Temperature: '', Humidity: '' }, TempUnit: '' }, ver: 1 };
    const caps = TasmotaDiscoveryPayload.getSensorCapabilities(sensors);
    expect(caps).toContain('measure_temperature');
    expect(caps).toContain('measure_humidity');
    expect(caps).not.toContain('measure_pressure');
  });

  it('detects pressure from BME280', () => {
    const sensors: SensorsPayload = { sn: { Time: '', BME280: { Temperature: '', Humidity: '', Pressure: '' } }, ver: 1 };
    const caps = TasmotaDiscoveryPayload.getSensorCapabilities(sensors);
    expect(caps).toContain('measure_temperature');
    expect(caps).toContain('measure_humidity');
    expect(caps).toContain('measure_pressure');
  });

  it('detects temperature-only from DS18B20', () => {
    const sensors: SensorsPayload = { sn: { Time: '', DS18B20: { Temperature: '' } }, ver: 1 };
    const caps = TasmotaDiscoveryPayload.getSensorCapabilities(sensors);
    expect(caps).toContain('measure_temperature');
    expect(caps).not.toContain('measure_humidity');
  });

  it('returns only wifi metrics for null sensors', () => {
    const caps = TasmotaDiscoveryPayload.getSensorCapabilities(null);
    expect(caps).toEqual(['measure_signal_strength', 'measure_wifi_percent']);
  });

  it('always includes wifi metrics', () => {
    const sensors: SensorsPayload = { sn: { Time: '', AM2301: { Temperature: '' } }, ver: 1 };
    const caps = TasmotaDiscoveryPayload.getSensorCapabilities(sensors);
    expect(caps).toContain('measure_signal_strength');
    expect(caps).toContain('measure_wifi_percent');
  });
});

describe('getSensorKeys', () => {
  it('extracts sensor keys excluding metadata', () => {
    const sensors: SensorsPayload = { sn: { Time: '', AM2301: { Temperature: '' }, TempUnit: '' }, ver: 1 };
    const keys = TasmotaDiscoveryPayload.getSensorKeys(sensors);
    expect(keys).toEqual(['AM2301']);
  });

  it('extracts multiple sensor keys', () => {
    const sensors: SensorsPayload = { sn: { Time: '', BME280: { Temperature: '' }, SHT3X: { Humidity: '' } }, ver: 1 };
    const keys = TasmotaDiscoveryPayload.getSensorKeys(sensors);
    expect(keys).toContain('BME280');
    expect(keys).toContain('SHT3X');
  });

  it('returns empty for null sensors', () => {
    expect(TasmotaDiscoveryPayload.getSensorKeys(null)).toEqual([]);
  });
});
