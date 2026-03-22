import {
  describe, it, expect, vi, beforeEach, type Mock,
} from 'vitest';

/**
 * Tests for TasmotaShutterDevice logic.
 */

interface MockDevice {
  commands: Array<{ command: string; payload: string }>;
  capabilities: string[];
  setCapabilityValueSpy: Mock;
  coveringsSetListener: (value: number) => Promise<void>;
  coveringsStateListener: (value: string) => Promise<void>;
  coveringsTiltListener: (value: number) => Promise<void>;
  onTasmotaState: (data: Record<string, unknown>) => void;
}

function createMockDevice(opts?: {
  capabilities?: string[];
}): MockDevice {
  const capabilities = opts?.capabilities ?? ['windowcoverings_set', 'windowcoverings_state', 'windowcoverings_tilt_set', 'measure_signal_strength', 'measure_wifi_percent'];
  const commands: Array<{ command: string; payload: string }> = [];
  const setCapabilityValueSpy = vi.fn();

  function sendCommand(command: string, payload: string): void {
    commands.push({ command, payload });
  }

  function hasCapability(cap: string): boolean {
    return capabilities.includes(cap);
  }

  const coveringsSetListener = async (value: number): Promise<void> => {
    sendCommand('ShutterPosition', String(Math.round(value * 100)));
  };

  const coveringsStateListener = async (value: string): Promise<void> => {
    if (value === 'up') sendCommand('ShutterOpen', '');
    else if (value === 'down') sendCommand('ShutterClose', '');
    else sendCommand('ShutterStop', '');
  };

  const coveringsTiltListener = async (value: number): Promise<void> => {
    sendCommand('ShutterTilt', String(Math.round(value * 100)));
  };

  const onTasmotaState = (data: Record<string, unknown>): void => {
    const shutter = data['Shutter1'] as Record<string, unknown> | undefined;
    if (!shutter) return;

    if (typeof shutter['Position'] === 'number') {
      setCapabilityValueSpy('windowcoverings_set', shutter['Position'] / 100);
    }
    if (typeof shutter['Direction'] === 'number') {
      const dir = shutter['Direction'] as number;
      let state = 'idle';
      if (dir > 0) state = 'up';
      else if (dir < 0) state = 'down';
      setCapabilityValueSpy('windowcoverings_state', state);
    }
    if (typeof shutter['Tilt'] === 'number' && hasCapability('windowcoverings_tilt_set')) {
      setCapabilityValueSpy('windowcoverings_tilt_set', shutter['Tilt'] / 100);
    }
  };

  return {
    commands, capabilities, setCapabilityValueSpy, coveringsSetListener, coveringsStateListener, coveringsTiltListener, onTasmotaState,
  };
}

describe('TasmotaShutterDevice capability listeners', () => {
  let device: MockDevice;

  beforeEach(() => {
    device = createMockDevice();
  });

  it('windowcoverings_set 0.5 sends ShutterPosition 50', async () => {
    await device.coveringsSetListener(0.5);
    expect(device.commands).toEqual([{ command: 'ShutterPosition', payload: '50' }]);
  });

  it('windowcoverings_set 0 sends ShutterPosition 0', async () => {
    await device.coveringsSetListener(0);
    expect(device.commands).toEqual([{ command: 'ShutterPosition', payload: '0' }]);
  });

  it('windowcoverings_set 1 sends ShutterPosition 100', async () => {
    await device.coveringsSetListener(1);
    expect(device.commands).toEqual([{ command: 'ShutterPosition', payload: '100' }]);
  });

  it('windowcoverings_state up sends ShutterOpen', async () => {
    await device.coveringsStateListener('up');
    expect(device.commands).toEqual([{ command: 'ShutterOpen', payload: '' }]);
  });

  it('windowcoverings_state down sends ShutterClose', async () => {
    await device.coveringsStateListener('down');
    expect(device.commands).toEqual([{ command: 'ShutterClose', payload: '' }]);
  });

  it('windowcoverings_state idle sends ShutterStop', async () => {
    await device.coveringsStateListener('idle');
    expect(device.commands).toEqual([{ command: 'ShutterStop', payload: '' }]);
  });

  it('windowcoverings_tilt_set 0.75 sends ShutterTilt 75', async () => {
    await device.coveringsTiltListener(0.75);
    expect(device.commands).toEqual([{ command: 'ShutterTilt', payload: '75' }]);
  });
});

describe('TasmotaShutterDevice state sync', () => {
  let device: MockDevice;

  beforeEach(() => {
    device = createMockDevice();
  });

  it('Shutter1 position and idle direction', () => {
    device.onTasmotaState({ Shutter1: { Position: 90, Direction: 0 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('windowcoverings_set', 0.9);
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('windowcoverings_state', 'idle');
  });

  it('Direction 1 means opening (up)', () => {
    device.onTasmotaState({ Shutter1: { Position: 50, Direction: 1 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('windowcoverings_state', 'up');
  });

  it('Direction -1 means closing (down)', () => {
    device.onTasmotaState({ Shutter1: { Position: 50, Direction: -1 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('windowcoverings_state', 'down');
  });

  it('Tilt value is parsed when capability present', () => {
    device.onTasmotaState({ Shutter1: { Position: 0, Direction: 0, Tilt: 45 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('windowcoverings_tilt_set', 0.45);
  });

  it('Tilt is ignored when capability not present', () => {
    const dev = createMockDevice({ capabilities: ['windowcoverings_set', 'windowcoverings_state'] });
    dev.onTasmotaState({ Shutter1: { Position: 0, Direction: 0, Tilt: 45 } });
    expect(dev.setCapabilityValueSpy).not.toHaveBeenCalledWith('windowcoverings_tilt_set', expect.anything());
  });

  it('ignores state without Shutter1 key', () => {
    device.onTasmotaState({ POWER: 'ON' });
    expect(device.setCapabilityValueSpy).not.toHaveBeenCalled();
  });

  it('position 0 maps to 0, position 100 maps to 1', () => {
    device.onTasmotaState({ Shutter1: { Position: 0, Direction: 0 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('windowcoverings_set', 0);

    device.setCapabilityValueSpy.mockClear();
    device.onTasmotaState({ Shutter1: { Position: 100, Direction: 0 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('windowcoverings_set', 1);
  });
});
