import {
  describe, it, expect, vi, beforeEach, type Mock,
} from 'vitest';

/**
 * Tests for TasmotaSwitchDevice logic.
 * Same mock pattern as TasmotaLightDevice.test.ts.
 */

interface MockDevice {
  commands: Array<{ command: string; payload: string }>;
  capabilities: Record<string, unknown>;
  settings: Record<string, unknown>;
  onoffListener: (value: boolean) => Promise<void>;
  onTasmotaState: (data: Record<string, unknown>) => void;
  onTasmotaSensor: (data: Record<string, unknown>) => void;
  onSettings: (args: { oldSettings: Record<string, unknown>; newSettings: Record<string, unknown>; changedKeys: string[] }) => Promise<void>;
  setCapabilityValueSpy: Mock;
  setSettingsSpy: Mock;
}

function createMockDevice(opts?: {
  relayIndex?: number;
  capabilities?: string[];
  capabilityValues?: Record<string, unknown>;
}): MockDevice {
  const relayIndex = opts?.relayIndex ?? 1;
  const powerKey = relayIndex === 1 ? 'Power' : `Power${relayIndex}`;
  const caps = opts?.capabilities ?? ['onoff', 'measure_power', 'meter_power', 'measure_signal_strength', 'measure_wifi_percent'];
  const capValues: Record<string, unknown> = { onoff: false, ...opts?.capabilityValues };
  const settings: Record<string, unknown> = { relay_index: relayIndex };
  const commands: Array<{ command: string; payload: string }> = [];
  const setCapabilityValueSpy = vi.fn().mockResolvedValue(undefined);
  const setSettingsSpy = vi.fn().mockResolvedValue(undefined);

  function sendCommand(command: string, payload: string): void {
    commands.push({ command, payload });
  }

  function hasCapability(cap: string): boolean {
    return caps.includes(cap);
  }

  const onoffListener = async (value: boolean): Promise<void> => {
    sendCommand(powerKey, value ? 'ON' : 'OFF');
  };

  // Simulate base class onTasmotaState
  const baseOnTasmotaState = (data: Record<string, unknown>): void => {
    if (typeof data['PowerOnState'] === 'number') {
      setSettingsSpy({ power_on_state: String(data['PowerOnState']) });
    }
  };

  const onTasmotaState = (data: Record<string, unknown>): void => {
    baseOnTasmotaState(data);

    const power = data[`POWER${relayIndex}`] as string | undefined
      ?? (relayIndex === 1 ? data['POWER'] as string | undefined : undefined);
    if (power != null) {
      capValues.onoff = power === 'ON';
      setCapabilityValueSpy('onoff', power === 'ON');
    }
  };

  const onTasmotaSensor = (data: Record<string, unknown>): void => {
    const energy = data['ENERGY'] as Record<string, unknown> | undefined;
    if (!energy) return;
    if (typeof energy['Power'] === 'number' && hasCapability('measure_power')) {
      setCapabilityValueSpy('measure_power', energy['Power']);
    }
    if (typeof energy['Total'] === 'number' && hasCapability('meter_power')) {
      setCapabilityValueSpy('meter_power', energy['Total']);
    }
  };

  const onSettings = async (args: { oldSettings: Record<string, unknown>; newSettings: Record<string, unknown>; changedKeys: string[] }): Promise<void> => {
    if (args.changedKeys.includes('power_on_state')) {
      sendCommand('PowerOnState', args.newSettings.power_on_state as string);
    }
  };

  return {
    commands, capabilities: capValues, settings, onoffListener, onTasmotaState, onTasmotaSensor, onSettings, setCapabilityValueSpy, setSettingsSpy,
  };
}

describe('TasmotaSwitchDevice capability listener', () => {
  let device: MockDevice;

  beforeEach(() => {
    device = createMockDevice();
  });

  it('onoff true sends Power ON', async () => {
    await device.onoffListener(true);
    expect(device.commands).toEqual([{ command: 'Power', payload: 'ON' }]);
  });

  it('onoff false sends Power OFF', async () => {
    await device.onoffListener(false);
    expect(device.commands).toEqual([{ command: 'Power', payload: 'OFF' }]);
  });
});

describe('TasmotaSwitchDevice multi-relay', () => {
  it('relay_index 2 sends Power2 ON', async () => {
    const device = createMockDevice({ relayIndex: 2 });
    await device.onoffListener(true);
    expect(device.commands).toEqual([{ command: 'Power2', payload: 'ON' }]);
  });

  it('relay_index 3 sends Power3 OFF', async () => {
    const device = createMockDevice({ relayIndex: 3 });
    await device.onoffListener(false);
    expect(device.commands).toEqual([{ command: 'Power3', payload: 'OFF' }]);
  });
});

describe('TasmotaSwitchDevice state sync', () => {
  let device: MockDevice;

  beforeEach(() => {
    device = createMockDevice();
  });

  it('STATE POWER ON sets onoff true', () => {
    device.onTasmotaState({ POWER: 'ON' });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('onoff', true);
  });

  it('STATE POWER OFF sets onoff false', () => {
    device.onTasmotaState({ POWER: 'OFF' });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('onoff', false);
  });

  it('STATE POWER1 ON sets onoff true (indexed key)', () => {
    device.onTasmotaState({ POWER1: 'ON' });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('onoff', true);
  });

  it('relay_index 2 reads POWER2 and ignores POWER1', () => {
    const dev = createMockDevice({ relayIndex: 2 });
    dev.onTasmotaState({ POWER1: 'ON', POWER2: 'OFF' });
    expect(dev.setCapabilityValueSpy).toHaveBeenCalledWith('onoff', false);
  });

  it('relay_index 2 ignores unindexed POWER', () => {
    const dev = createMockDevice({ relayIndex: 2 });
    dev.onTasmotaState({ POWER: 'ON' });
    expect(dev.setCapabilityValueSpy).not.toHaveBeenCalled();
  });

  it('PowerOnState syncs setting', () => {
    device.onTasmotaState({ PowerOnState: 2 });
    expect(device.setSettingsSpy).toHaveBeenCalledWith({ power_on_state: '2' });
  });
});

describe('TasmotaSwitchDevice energy monitoring', () => {
  let device: MockDevice;

  beforeEach(() => {
    device = createMockDevice();
  });

  it('SENSOR with ENERGY updates measure_power and meter_power', () => {
    device.onTasmotaSensor({ ENERGY: { Power: 45, Total: 123.4 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_power', 45);
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('meter_power', 123.4);
  });

  it('SENSOR with partial ENERGY (only Power)', () => {
    device.onTasmotaSensor({ ENERGY: { Power: 10 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_power', 10);
    expect(device.setCapabilityValueSpy).not.toHaveBeenCalledWith('meter_power', expect.anything());
  });

  it('SENSOR without ENERGY does nothing', () => {
    device.onTasmotaSensor({ AM2301: { Temperature: 22 } });
    expect(device.setCapabilityValueSpy).not.toHaveBeenCalled();
  });

  it('SENSOR ENERGY ignored if capability not present', () => {
    const dev = createMockDevice({ capabilities: ['onoff'] });
    dev.onTasmotaSensor({ ENERGY: { Power: 45, Total: 123.4 } });
    expect(dev.setCapabilityValueSpy).not.toHaveBeenCalled();
  });
});

describe('TasmotaSwitchDevice settings', () => {
  it('power_on_state change sends PowerOnState command', async () => {
    const device = createMockDevice();
    await device.onSettings({
      oldSettings: { power_on_state: '3' },
      newSettings: { power_on_state: '0' },
      changedKeys: ['power_on_state'],
    });
    expect(device.commands).toEqual([{ command: 'PowerOnState', payload: '0' }]);
  });
});
