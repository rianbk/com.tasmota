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
      .filter((c) => this.hasCapability(c));

    this.registerMultipleCapabilityListener(lightCaps, async (values) => {
      const onoff = values.onoff ?? this.getCapabilityValue('onoff');

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

  async onSettings({ oldSettings, newSettings, changedKeys }: {
    oldSettings: Record<string, unknown>;
    newSettings: Record<string, unknown>;
    changedKeys: string[];
  }): Promise<void> {
    await super.onSettings({ oldSettings, newSettings, changedKeys });

    if (changedKeys.includes('fade')) {
      this.sendCommand('Fade', newSettings.fade ? '1' : '0');
    }
    if (changedKeys.includes('speed')) {
      const speed = Number(newSettings.speed);
      if (Number.isInteger(speed) && speed >= 1 && speed <= 40) {
        this.sendCommand('Speed', String(speed));
      }
    }
  }

  protected override onTasmotaState(data: Record<string, unknown>): void {
    super.onTasmotaState(data);

    const settings = this.getSettings();

    // Power state — check POWER1 first (multi-relay), fall back to POWER (single-relay)
    const power = data['POWER1'] as string | undefined ?? data['POWER'] as string | undefined;
    if (power != null) {
      this.setCapabilityValueIfChanged('onoff', power === 'ON');
    }

    // Dimmer
    const dimmer = data['Dimmer'] as number | undefined;
    if (dimmer != null && this.hasCapability('dim')) {
      this.setCapabilityValueIfChanged('dim', dimmer / 100);
    }

    // CT
    const ct = data['CT'] as number | undefined;
    if (ct != null && this.hasCapability('light_temperature')) {
      const ctMin = settings.ct_min as number ?? 153;
      const ctMax = settings.ct_max as number ?? 500;
      const normalized = (ct - ctMin) / (ctMax - ctMin);
      this.setCapabilityValueIfChanged('light_temperature', Math.max(0, Math.min(1, normalized)));
    }

    // HSBColor
    const hsbColor = data['HSBColor'] as string | undefined;
    if (hsbColor != null) {
      const parts = hsbColor.split(',').map(Number);
      if (parts.length === 3) {
        const [h, s] = parts;
        if (this.hasCapability('light_hue')) {
          this.setCapabilityValueIfChanged('light_hue', h / 360);
        }
        if (this.hasCapability('light_saturation')) {
          this.setCapabilityValueIfChanged('light_saturation', s / 100);
        }
      }
    }

    // Determine light_mode from state
    if (this.hasCapability('light_mode')) {
      const color = data['Color'] as string | undefined;
      if (color != null) {
        // If first 6 hex digits are "000000", it's in CT/white mode
        const rgbPart = color.slice(0, 6);
        const mode = rgbPart === '000000' ? 'temperature' : 'color';
        this.setCapabilityValueIfChanged('light_mode', mode);
      }
    }

    const settingsUpdate: Record<string, unknown> = {};
    if (typeof data['Fade'] === 'string') {
      const fade = data['Fade'] === 'ON';
      if (settings.fade !== fade) settingsUpdate.fade = fade;
    }
    if (typeof data['Speed'] === 'number') {
      if (settings.speed !== data['Speed']) settingsUpdate.speed = data['Speed'];
    }
    if (Object.keys(settingsUpdate).length > 0) {
      this.setSettings(settingsUpdate).catch(this.error);
    }
  }
}

module.exports = TasmotaLightDevice;
