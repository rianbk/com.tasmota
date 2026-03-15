import { describe, it, expect } from 'vitest';
import {
  TasmotaDiscoveryPayload,
  LIGHT_DIMMER, LIGHT_CW, LIGHT_RGB, LIGHT_RGBCW,
  RELAY_LIGHT, RELAY_RELAY,
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
