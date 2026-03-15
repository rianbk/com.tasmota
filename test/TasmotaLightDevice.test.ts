import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for TasmotaLightDevice capability listener logic.
 *
 * We can't instantiate Homey.Device directly, so we extract and test the
 * capability handler function in isolation by simulating what
 * registerMultipleCapabilityListener receives.
 */

// --- Helpers to build a minimal mock device ---

interface MockDevice {
  commands: Array<{ command: string; payload: string }>;
  capabilities: Record<string, unknown>;
  settings: Record<string, unknown>;
  /** The handler registered via registerMultipleCapabilityListener */
  handler: (values: Record<string, unknown>) => Promise<void>;
}

/**
 * Creates a mock device and wires up the same logic as TasmotaLightDevice.onInit().
 * This mirrors the production code so we can test the coupling rules.
 */
function createMockDevice(opts?: {
  capabilities?: string[];
  capabilityValues?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}): MockDevice {
  const caps = opts?.capabilities ?? ['onoff', 'dim', 'light_temperature', 'light_hue', 'light_saturation', 'light_mode'];
  const capValues: Record<string, unknown> = {
    onoff: true,
    dim: 0.5,
    light_temperature: 0.5,
    light_hue: 0,
    light_saturation: 0,
    light_mode: 'color',
    ...opts?.capabilityValues,
  };
  const settings: Record<string, unknown> = {
    ct_min: 153,
    ct_max: 500,
    ...opts?.settings,
  };
  const commands: Array<{ command: string; payload: string }> = [];

  function sendCommand(command: string, payload: string): void {
    commands.push({ command, payload });
  }

  function getCapabilityValue(cap: string): unknown {
    return capValues[cap] ?? null;
  }

  function hasCapability(cap: string): boolean {
    return caps.includes(cap);
  }

  function getSettings(): Record<string, unknown> {
    return settings;
  }

  // Replicate the handler logic from device.ts
  const handler = async (values: Record<string, unknown>): Promise<void> => {
    const onoff = values.onoff ?? getCapabilityValue('onoff');
    const dim = values.dim ?? getCapabilityValue('dim');

    // onoff takes precedence
    if ('onoff' in values) {
      if (!values.onoff) {
        sendCommand('Power', 'OFF');
        return;
      }
      sendCommand('Power', 'ON');
    }

    // If device is off and only color/temp/mode changed (no onoff/dim), don't turn on
    if (!onoff && !('onoff' in values) && !('dim' in values)) {
      return;
    }

    // dim to 0 = off, dim from 0 = on
    if ('dim' in values) {
      if (values.dim === 0) {
        sendCommand('Power', 'OFF');
        return;
      }
      if (!onoff) {
        sendCommand('Power', 'ON');
      }
      sendCommand('Dimmer', String(Math.round((values.dim as number) * 100)));
    }

    // CT
    if ('light_temperature' in values) {
      const s = getSettings();
      const ctMin = s.ct_min as number ?? 153;
      const ctMax = s.ct_max as number ?? 500;
      const ct = Math.round(ctMin + (values.light_temperature as number) * (ctMax - ctMin));
      sendCommand('CT', String(ct));
    }

    // HSBColor
    if ('light_hue' in values || 'light_saturation' in values) {
      const hue = (values.light_hue ?? getCapabilityValue('light_hue') ?? 0) as number;
      const sat = (values.light_saturation ?? getCapabilityValue('light_saturation') ?? 0) as number;
      const d = (values.dim ?? getCapabilityValue('dim') ?? 1) as number;
      sendCommand('HSBColor', `${Math.round(hue * 360)},${Math.round(sat * 100)},${Math.round(d * 100)}`);
    }
  };

  return { commands, capabilities: capValues, settings, handler };
}

// --- Tests ---

describe('TasmotaLightDevice capability coupling', () => {
  let device: MockDevice;

  beforeEach(() => {
    device = createMockDevice();
  });

  describe('onoff precedence', () => {
    it('turning off sends Power OFF and ignores other values', async () => {
      await device.handler({ onoff: false, dim: 0.8, light_temperature: 0.3 });
      expect(device.commands).toEqual([{ command: 'Power', payload: 'OFF' }]);
    });

    it('turning on sends Power ON', async () => {
      device.capabilities.onoff = false;
      await device.handler({ onoff: true });
      expect(device.commands).toEqual([{ command: 'Power', payload: 'ON' }]);
    });

    it('turning on with dim sends Power ON then Dimmer', async () => {
      device.capabilities.onoff = false;
      await device.handler({ onoff: true, dim: 0.75 });
      expect(device.commands).toEqual([
        { command: 'Power', payload: 'ON' },
        { command: 'Dimmer', payload: '75' },
      ]);
    });
  });

  describe('dim coupling', () => {
    it('dim to 0 sends Power OFF', async () => {
      await device.handler({ dim: 0 });
      expect(device.commands).toEqual([{ command: 'Power', payload: 'OFF' }]);
    });

    it('dim from 0 (device was off) sends Power ON then Dimmer', async () => {
      device.capabilities.onoff = false;
      await device.handler({ dim: 0.5 });
      expect(device.commands).toEqual([
        { command: 'Power', payload: 'ON' },
        { command: 'Dimmer', payload: '50' },
      ]);
    });

    it('dim while already on sends only Dimmer', async () => {
      await device.handler({ dim: 0.8 });
      expect(device.commands).toEqual([{ command: 'Dimmer', payload: '80' }]);
    });

    it('dim rounds to nearest integer', async () => {
      await device.handler({ dim: 0.333 });
      expect(device.commands).toEqual([{ command: 'Dimmer', payload: '33' }]);
    });
  });

  describe('color/temp while off — must NOT turn on', () => {
    beforeEach(() => {
      device.capabilities.onoff = false;
    });

    it('light_temperature change while off is ignored', async () => {
      await device.handler({ light_temperature: 0.8 });
      expect(device.commands).toEqual([]);
    });

    it('light_hue change while off is ignored', async () => {
      await device.handler({ light_hue: 0.5 });
      expect(device.commands).toEqual([]);
    });

    it('light_saturation change while off is ignored', async () => {
      await device.handler({ light_saturation: 0.7 });
      expect(device.commands).toEqual([]);
    });

    it('light_mode change while off is ignored', async () => {
      await device.handler({ light_mode: 'temperature' });
      expect(device.commands).toEqual([]);
    });

    it('hue + saturation together while off are ignored', async () => {
      await device.handler({ light_hue: 0.5, light_saturation: 0.8 });
      expect(device.commands).toEqual([]);
    });
  });

  describe('color/temp while on', () => {
    it('light_temperature sends CT command', async () => {
      await device.handler({ light_temperature: 0 });
      expect(device.commands).toEqual([{ command: 'CT', payload: '153' }]);
    });

    it('light_temperature 1.0 sends max CT', async () => {
      await device.handler({ light_temperature: 1 });
      expect(device.commands).toEqual([{ command: 'CT', payload: '500' }]);
    });

    it('light_temperature uses custom ct_min/ct_max from settings', async () => {
      device.settings.ct_min = 200;
      device.settings.ct_max = 400;
      await device.handler({ light_temperature: 0.5 });
      expect(device.commands).toEqual([{ command: 'CT', payload: '300' }]);
    });

    it('light_hue sends HSBColor with current sat and dim', async () => {
      device.capabilities.light_saturation = 0.5;
      device.capabilities.dim = 0.8;
      await device.handler({ light_hue: 0.5 });
      expect(device.commands).toEqual([{ command: 'HSBColor', payload: '180,50,80' }]);
    });

    it('light_saturation sends HSBColor with current hue and dim', async () => {
      device.capabilities.light_hue = 0.25;
      device.capabilities.dim = 1;
      await device.handler({ light_saturation: 0.6 });
      expect(device.commands).toEqual([{ command: 'HSBColor', payload: '90,60,100' }]);
    });

    it('hue + saturation together sends single HSBColor', async () => {
      device.capabilities.dim = 0.5;
      await device.handler({ light_hue: 0.75, light_saturation: 1 });
      expect(device.commands).toEqual([{ command: 'HSBColor', payload: '270,100,50' }]);
    });

    it('dim + hue together sends Dimmer and HSBColor with new dim', async () => {
      await device.handler({ dim: 0.6, light_hue: 0.5 });
      expect(device.commands).toEqual([
        { command: 'Dimmer', payload: '60' },
        { command: 'HSBColor', payload: '180,0,60' },
      ]);
    });
  });

  describe('combined scenarios', () => {
    it('turning on + setting color sends Power ON and HSBColor', async () => {
      device.capabilities.onoff = false;
      await device.handler({ onoff: true, light_hue: 0.5, light_saturation: 1 });
      expect(device.commands).toEqual([
        { command: 'Power', payload: 'ON' },
        { command: 'HSBColor', payload: '180,100,50' },
      ]);
    });

    it('turning on + setting CT sends Power ON and CT', async () => {
      device.capabilities.onoff = false;
      await device.handler({ onoff: true, light_temperature: 0.5 });
      expect(device.commands).toEqual([
        { command: 'Power', payload: 'ON' },
        { command: 'CT', payload: '327' },
      ]);
    });

    it('light_mode alone while on sends no commands (mode is implicit)', async () => {
      await device.handler({ light_mode: 'temperature' });
      expect(device.commands).toEqual([]);
    });
  });
});
