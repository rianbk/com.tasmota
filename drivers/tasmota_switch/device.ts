import TasmotaDeviceBase from '../TasmotaDeviceBase.js';

/**
 * Tasmota switch/relay device.
 * Handles on/off power control and optional energy monitoring.
 */
export default class TasmotaSwitchDevice extends TasmotaDeviceBase {
  private relayIndex!: number;
  private powerKey!: string;

  async onInit(): Promise<void> {
    await super.onInit();

    this.relayIndex = this.getSetting('relay_index') as number ?? 1;
    this.powerKey = this.relayIndex === 1 ? 'Power' : `Power${this.relayIndex}`;

    this.registerCapabilityListener('onoff', async (value: boolean) => {
      this.sendCommand(this.powerKey, value ? 'ON' : 'OFF');
    });
  }

  protected override onTasmotaState(data: Record<string, unknown>): void {
    super.onTasmotaState(data);

    // Power state — check indexed key first, then unindexed for single-relay devices
    const power = data[`POWER${this.relayIndex}`] as string | undefined
      ?? (this.relayIndex === 1 ? data['POWER'] as string | undefined : undefined);
    if (power != null) {
      this.setCapabilityValueIfChanged('onoff', power === 'ON');
    }
  }

  protected override onTasmotaSensor(data: Record<string, unknown>): void {
    const energy = data['ENERGY'] as Record<string, unknown> | undefined;
    if (!energy) return;

    if (typeof energy['Power'] === 'number' && this.hasCapability('measure_power')) {
      this.setCapabilityValueIfChanged('measure_power', energy['Power']);
    }
    if (typeof energy['Total'] === 'number' && this.hasCapability('meter_power')) {
      this.setCapabilityValueIfChanged('meter_power', energy['Total']);
    }
  }
}

module.exports = TasmotaSwitchDevice;
