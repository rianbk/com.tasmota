import TasmotaDeviceBase from '../TasmotaDeviceBase.js';

/**
 * Tasmota light device.
 * Handles dimmer, CT, HSBColor control and state parsing.
 */
export default class TasmotaLightDevice extends TasmotaDeviceBase {
  async onInit(): Promise<void> {
    await super.onInit();

    // All light capabilities in one debounced listener (Homey best practice: coupled & debounced)
    const lightCaps = ['onoff', 'dim', 'light_temperature', 'light_hue', 'light_saturation', 'light_mode']
      .filter(c => this.hasCapability(c));

    this.registerMultipleCapabilityListener(lightCaps, async (values) => {
      const onoff = values.onoff ?? this.getCapabilityValue('onoff');
      const dim = values.dim ?? this.getCapabilityValue('dim');

      // onoff takes precedence
      if ('onoff' in values) {
        if (!values.onoff) {
          this.sendCommand('Power', 'OFF');
          return;
        }
        this.sendCommand('Power', 'ON');
      }

      // If device is off and only color/temp/mode changed (no onoff/dim), don't turn on
      if (!onoff && !('onoff' in values) && !('dim' in values)) {
        return;
      }

      // dim to 0 = off, dim from 0 = on
      if ('dim' in values) {
        if (values.dim === 0) {
          this.sendCommand('Power', 'OFF');
          return;
        }
        if (!onoff) {
          this.sendCommand('Power', 'ON');
        }
        this.sendCommand('Dimmer', String(Math.round(values.dim * 100)));
      }

      // CT
      if ('light_temperature' in values) {
        const settings = this.getSettings();
        const ctMin = settings.ct_min as number ?? 153;
        const ctMax = settings.ct_max as number ?? 500;
        const ct = Math.round(ctMin + values.light_temperature * (ctMax - ctMin));
        this.sendCommand('CT', String(ct));
      }

      // HSBColor
      if ('light_hue' in values || 'light_saturation' in values) {
        const hue = values.light_hue ?? this.getCapabilityValue('light_hue') ?? 0;
        const sat = values.light_saturation ?? this.getCapabilityValue('light_saturation') ?? 0;
        const d = values.dim ?? this.getCapabilityValue('dim') ?? 1;
        this.sendCommand('HSBColor', `${Math.round(hue * 360)},${Math.round(sat * 100)},${Math.round(d * 100)}`);
      }

      // light_mode: no command needed — mode is implicit from the last CT or HSBColor sent
    }, 500);
  }

  protected override onTasmotaState(data: Record<string, unknown>): void {
    super.onTasmotaState(data);

    // Power state
    const power = data['POWER'] as string | undefined ?? data['POWER1'] as string | undefined;
    if (power != null) {
      this.setCapabilityValue('onoff', power === 'ON').catch(this.error);
    }

    // Dimmer
    const dimmer = data['Dimmer'] as number | undefined;
    if (dimmer != null && this.hasCapability('dim')) {
      this.setCapabilityValue('dim', dimmer / 100).catch(this.error);
    }

    // CT
    const ct = data['CT'] as number | undefined;
    if (ct != null && this.hasCapability('light_temperature')) {
      const settings = this.getSettings();
      const ctMin = settings.ct_min as number ?? 153;
      const ctMax = settings.ct_max as number ?? 500;
      const normalized = (ct - ctMin) / (ctMax - ctMin);
      this.setCapabilityValue('light_temperature', Math.max(0, Math.min(1, normalized))).catch(this.error);
    }

    // HSBColor
    const hsbColor = data['HSBColor'] as string | undefined;
    if (hsbColor != null) {
      const parts = hsbColor.split(',').map(Number);
      if (parts.length === 3) {
        const [h, s] = parts;
        if (this.hasCapability('light_hue')) {
          this.setCapabilityValue('light_hue', h / 360).catch(this.error);
        }
        if (this.hasCapability('light_saturation')) {
          this.setCapabilityValue('light_saturation', s / 100).catch(this.error);
        }
      }
    }

    // Determine light_mode from state
    if (this.hasCapability('light_mode')) {
      const color = data['Color'] as string | undefined;
      if (color != null) {
        // Tasmota Color format: RRGGBBWWCC or RRGGBB
        // If first 6 hex digits are "000000", it's in CT/white mode
        const rgbPart = color.slice(0, 6);
        const mode = rgbPart === '000000' ? 'temperature' : 'color';
        this.setCapabilityValue('light_mode', mode).catch(this.error);
      }
    }

    // WiFi RSSI is handled by the base class
  }
}

module.exports = TasmotaLightDevice;
