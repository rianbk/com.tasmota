import {
  describe, it, expect, vi, type Mock,
} from 'vitest';

/**
 * Tests for TasmotaSensorDevice logic.
 */

interface MockDevice {
  capabilities: string[];
  sensorKeys: string[];
  setCapabilityValueSpy: Mock;
  onTasmotaSensor: (data: Record<string, unknown>) => void;
}

function createMockDevice(opts?: {
  capabilities?: string[];
  sensorKeys?: string[];
}): MockDevice {
  const capabilities = opts?.capabilities ?? ['measure_temperature', 'measure_humidity', 'measure_pressure', 'measure_signal_strength', 'measure_wifi_percent'];
  const sensorKeys = opts?.sensorKeys ?? ['AM2301'];
  const setCapabilityValueSpy = vi.fn();

  function hasCapability(cap: string): boolean {
    return capabilities.includes(cap);
  }

  const onTasmotaSensor = (data: Record<string, unknown>): void => {
    for (const key of sensorKeys) {
      const reading = data[key] as Record<string, unknown> | undefined;
      if (!reading || typeof reading !== 'object') continue;

      if (typeof reading['Temperature'] === 'number' && hasCapability('measure_temperature')) {
        setCapabilityValueSpy('measure_temperature', reading['Temperature']);
      }
      if (typeof reading['Humidity'] === 'number' && hasCapability('measure_humidity')) {
        setCapabilityValueSpy('measure_humidity', reading['Humidity']);
      }
      if (typeof reading['Pressure'] === 'number' && hasCapability('measure_pressure')) {
        setCapabilityValueSpy('measure_pressure', reading['Pressure']);
      }
    }
  };

  return {
    capabilities, sensorKeys, setCapabilityValueSpy, onTasmotaSensor,
  };
}

describe('TasmotaSensorDevice sensor parsing', () => {
  it('AM2301 temperature and humidity', () => {
    const device = createMockDevice({ sensorKeys: ['AM2301'] });
    device.onTasmotaSensor({ AM2301: { Temperature: 24.6, Humidity: 58.2 }, TempUnit: 'C' });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_temperature', 24.6);
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_humidity', 58.2);
  });

  it('BME280 with temperature, humidity, and pressure', () => {
    const device = createMockDevice({ sensorKeys: ['BME280'] });
    device.onTasmotaSensor({ BME280: { Temperature: 21.0, Humidity: 44.1, Pressure: 952.4 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_temperature', 21.0);
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_humidity', 44.1);
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_pressure', 952.4);
  });

  it('DS18B20 temperature only — no humidity update', () => {
    const device = createMockDevice({ sensorKeys: ['DS18B20'] });
    device.onTasmotaSensor({ DS18B20: { Temperature: 22.5 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_temperature', 22.5);
    expect(device.setCapabilityValueSpy).not.toHaveBeenCalledWith('measure_humidity', expect.anything());
  });

  it('ignores unknown sensor keys', () => {
    const device = createMockDevice({ sensorKeys: ['AM2301'] });
    device.onTasmotaSensor({ UNKNOWN_SENSOR: { Temperature: 99 } });
    expect(device.setCapabilityValueSpy).not.toHaveBeenCalled();
  });

  it('reads from multiple sensor keys', () => {
    const device = createMockDevice({ sensorKeys: ['BME280', 'SHT3X'] });
    device.onTasmotaSensor({
      BME280: { Temperature: 23.1, Humidity: 21.2, Pressure: 1013.6 },
      SHT3X: { Temperature: 20.0, Humidity: 25.0 },
    });
    // Both sensors update — last one wins for overlapping fields
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_pressure', 1013.6);
    expect(device.setCapabilityValueSpy).toHaveBeenCalledTimes(5);
  });

  it('skips sensor if capability not present', () => {
    const device = createMockDevice({
      capabilities: ['measure_temperature'],
      sensorKeys: ['AM2301'],
    });
    device.onTasmotaSensor({ AM2301: { Temperature: 24.6, Humidity: 58.2 } });
    expect(device.setCapabilityValueSpy).toHaveBeenCalledWith('measure_temperature', 24.6);
    expect(device.setCapabilityValueSpy).not.toHaveBeenCalledWith('measure_humidity', expect.anything());
  });

  it('handles empty sensor data gracefully', () => {
    const device = createMockDevice({ sensorKeys: ['AM2301'] });
    device.onTasmotaSensor({});
    expect(device.setCapabilityValueSpy).not.toHaveBeenCalled();
  });
});
