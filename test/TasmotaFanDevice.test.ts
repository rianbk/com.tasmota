import {
  describe, it, expect, vi, beforeEach, type Mock,
} from 'vitest';

/**
 * Tests for TasmotaFanDevice logic.
 */

interface MockDevice {
  commands: Array<{ command: string; payload: string }>;
  setCapabilityValueSpy: Mock;
  onoffListener: (value: boolean) => Promise<void>;
  fanSpeedListener: (value: string) => Promise<void>;
  onTasmotaState: (data: Record<string, unknown>) => void;
}

const SPEED_TO_COMMAND: Record<string, string> = {
  off: '0', low: '1', medium: '2', high: '3',
};
const COMMAND_TO_SPEED: Record<number, string> = {
  0: 'off', 1: 'low', 2: 'medium', 3: 'high',
};

function createMockDevice(): MockDevice {
  const commands: Array<{ command: string; payload: string }> = [];
  const setCapabilityValueSpy = vi.fn();

  function sendCommand(command: string, payload: string): void {
    commands.push({ command, payload });
  }

  const onoffListener = async (value: boolean): Promise<void> => {
    sendCommand('Power1', value ? 'ON' : 'OFF');
  };

  const fanSpeedListener = async (value: string): Promise<void> => {
    sendCommand('FanSpeed', SPEED_TO_COMMAND[value] ?? '0');
  };

  const onTasmotaState = (data: Record<string, unknown>): void => {
    const power = data['POWER1'] as string | undefined;
    if (power != null) {
      setCapabilityValueSpy('onoff', power === 'ON');
    }

    const fanSpeed = data['FanSpeed'] as number | undefined;
    if (fanSpeed != null) {
      const speed = COMMAND_TO_SPEED[fanSpeed] ?? 'off';
      setCapabilityValueSpy('fan_speed', speed);
    }
  };

  return {
    commands, setCapabilityValueSpy, onoffListener, fanSpeedListener, onTasmotaState,
  };
}

describe('TasmotaFanDevice capability listeners', () => {
  let device: MockDevice;

  beforeEach(() => {
    device = createMockDevice();
  });

  it('onoff true sends Power1 ON', async () => {
    await device.onoffListener(true);
    expect(device.commands).toEqual([{ command: 'Power1', payload: 'ON' }]);
  });

  it('onoff false sends Power1 OFF', async () => {
    await device.onoffListener(false);
    expect(device.commands).toEqual([{ command: 'Power1', payload: 'OFF' }]);
  });

  it('fan_speed off sends FanSpeed 0', async () => {
    await device.fanSpeedListener('off');
    expect(device.commands).toEqual([{ command: 'FanSpeed', payload: '0' }]);
  });

  it('fan_speed low sends FanSpeed 1', async () => {
    await device.fanSpeedListener('low');
    expect(device.commands).toEqual([{ command: 'FanSpeed', payload: '1' }]);
  });

  it('fan_speed medium sends FanSpeed 2', async () => {
    await device.fanSpeedListener('medium');
    expect(device.commands).toEqual([{ command: 'FanSpeed', payload: '2' }]);
  });

  it('fan_speed high sends FanSpeed 3', async () => {
    await device.fanSpeedListener('high');
    expect(device.commands).toEqual([{ command: 'FanSpeed', payload: '3' }]);
  });
});

describe('TasmotaFanDevice state sync', () => {
  let device: MockDevice;

  beforeEach(() => {
    device = createMockDevice();
  });

  it('STATE with POWER1 ON and FanSpeed 2', () => {
    device.onTasmotaState({ POWER1: 'ON', FanSpeed: 2 });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('onoff', true);
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('fan_speed', 'medium');
  });

  it('STATE with POWER1 OFF and FanSpeed 0', () => {
    device.onTasmotaState({ POWER1: 'OFF', FanSpeed: 0 });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('onoff', false);
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('fan_speed', 'off');
  });

  it('STATE with only FanSpeed 3', () => {
    device.onTasmotaState({ FanSpeed: 3 });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('fan_speed', 'high');
    expect(device.setCapabilityValueSpy).not.toHaveBeenCalledWith('onoff', expect.anything());
  });

  it('STATE with only POWER1', () => {
    device.onTasmotaState({ POWER1: 'ON' });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('onoff', true);
    expect(device.setCapabilityValueSpy).toHaveBeenCalledTimes(1);
  });

  it('STATE with FanSpeed 1 maps to low', () => {
    device.onTasmotaState({ FanSpeed: 1 });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('fan_speed', 'low');
  });

  it('STATE without POWER1 or FanSpeed does nothing', () => {
    device.onTasmotaState({ Uptime: '10:00:00' });
    expect(device.setCapabilityValueSpy).not.toHaveBeenCalled();
  });
});
