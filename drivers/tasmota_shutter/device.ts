import TasmotaDeviceBase from '../TasmotaDeviceBase.js';

/**
 * Tasmota shutter/blind device.
 * Handles position, direction, and optional tilt control.
 */
export default class TasmotaShutterDevice extends TasmotaDeviceBase {
  async onInit(): Promise<void> {
    await super.onInit();

    this.registerCapabilityListener('windowcoverings_set', async (value: number) => {
      // Homey: 0=closed, 1=open; Tasmota: 0=closed, 100=open
      this.sendCommand('ShutterPosition', String(Math.round(value * 100)));
    });

    this.registerCapabilityListener('windowcoverings_state', async (value: string) => {
      if (value === 'up') this.sendCommand('ShutterOpen', '');
      else if (value === 'down') this.sendCommand('ShutterClose', '');
      else this.sendCommand('ShutterStop', '');
    });

    if (this.hasCapability('windowcoverings_tilt_set')) {
      this.registerCapabilityListener('windowcoverings_tilt_set', async (value: number) => {
        this.sendCommand('ShutterTilt', String(Math.round(value * 100)));
      });
    }
  }

  protected override onTasmotaState(data: Record<string, unknown>): void {
    super.onTasmotaState(data);

    // Shutter state: {"Shutter1":{"Position":90,"Direction":0,"Target":100,"Tilt":0}}
    const shutter = data['Shutter1'] as Record<string, unknown> | undefined;
    if (!shutter) return;

    if (typeof shutter['Position'] === 'number') {
      this.setCapabilityValueIfChanged('windowcoverings_set', shutter['Position'] / 100);
    }

    if (typeof shutter['Direction'] === 'number') {
      const dir = shutter['Direction'] as number;
      let state = 'idle';
      if (dir > 0) state = 'up';
      else if (dir < 0) state = 'down';
      this.setCapabilityValueIfChanged('windowcoverings_state', state);
    }

    if (typeof shutter['Tilt'] === 'number' && this.hasCapability('windowcoverings_tilt_set')) {
      this.setCapabilityValueIfChanged('windowcoverings_tilt_set', shutter['Tilt'] / 100);
    }
  }
}

module.exports = TasmotaShutterDevice;
