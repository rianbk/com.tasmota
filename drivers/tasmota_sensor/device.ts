import TasmotaDeviceBase from '../TasmotaDeviceBase.js';

/**
 * Tasmota sensor device.
 * Handles temperature, humidity, and pressure readings from SENSOR telemetry.
 */
export default class TasmotaSensorDevice extends TasmotaDeviceBase {
  private sensorKeys!: string[];

  async onInit(): Promise<void> {
    await super.onInit();
    this.sensorKeys = this.getSetting('sensor_keys') as string[] ?? [];
  }

  protected override onTasmotaSensor(data: Record<string, unknown>): void {
    for (const key of this.sensorKeys) {
      const reading = data[key] as Record<string, unknown> | undefined;
      if (!reading || typeof reading !== 'object') continue;

      if (typeof reading['Temperature'] === 'number' && this.hasCapability('measure_temperature')) {
        this.setCapabilityValueIfChanged('measure_temperature', reading['Temperature']);
      }
      if (typeof reading['Humidity'] === 'number' && this.hasCapability('measure_humidity')) {
        this.setCapabilityValueIfChanged('measure_humidity', reading['Humidity']);
      }
      if (typeof reading['Pressure'] === 'number' && this.hasCapability('measure_pressure')) {
        this.setCapabilityValueIfChanged('measure_pressure', reading['Pressure']);
      }
    }
  }
}

module.exports = TasmotaSensorDevice;
