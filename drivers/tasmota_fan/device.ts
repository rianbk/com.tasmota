import TasmotaDeviceBase from '../TasmotaDeviceBase.js';

const SPEED_TO_COMMAND: Record<string, string> = {
  off: '0', low: '1', medium: '2', high: '3',
};
const COMMAND_TO_SPEED: Record<number, string> = {
  0: 'off', 1: 'low', 2: 'medium', 3: 'high',
};

/**
 * Tasmota iFan device.
 * Handles fan speed control and the built-in light relay.
 */
export default class TasmotaFanDevice extends TasmotaDeviceBase {
  async onInit(): Promise<void> {
    await super.onInit();

    // Power1 controls the light on iFan devices
    this.registerCapabilityListener('onoff', async (value: boolean) => {
      this.sendCommand('Power1', value ? 'ON' : 'OFF');
    });

    this.registerCapabilityListener('fan_speed', async (value: string) => {
      this.sendCommand('FanSpeed', SPEED_TO_COMMAND[value] ?? '0');
    });
  }

  protected override onTasmotaState(data: Record<string, unknown>): void {
    super.onTasmotaState(data);

    const power = data['POWER1'] as string | undefined;
    if (power != null) {
      this.setCapabilityValueIfChanged('onoff', power === 'ON');
    }

    const fanSpeed = data['FanSpeed'] as number | undefined;
    if (fanSpeed != null) {
      const speed = COMMAND_TO_SPEED[fanSpeed] ?? 'off';
      this.setCapabilityValueIfChanged('fan_speed', speed);
    }
  }
}

module.exports = TasmotaFanDevice;
