import Homey from 'homey';
import type TasmotaMqttApp from '../app.js';
import {
  buildTopic, type TopicParts, PREFIX_CMND, PREFIX_TELE,
} from '../lib/TopicBuilder.js';

/**
 * Base class for all Tasmota devices.
 * Handles MQTT message registration, LWT availability, and command sending.
 */
export default class TasmotaDeviceBase extends Homey.Device {
  private topicParts!: TopicParts;

  async onInit(): Promise<void> {
    const settings = this.getSettings();
    this.topicParts = {
      ft: settings.ft,
      tp: settings.tp,
      t: settings.t,
      hn: settings.hn,
      mac: settings.mac,
    };

    const app = this.homey.app as TasmotaMqttApp;
    app.registerMessageHandler(settings.t, this.handleMessage.bind(this));

    // Start unavailable until we hear from the device via LWT or state response
    await this.setUnavailable('Waiting for device...');

    // Subscribe to this device's LWT topic (retained, so we get current status immediately)
    const lwtTopic = buildTopic(this.topicParts, PREFIX_TELE, 'LWT');
    app.mqttClient.subscribe(lwtTopic);

    // Request current state — if device is online it will respond and LWT will mark it available
    this.requestState();

    this.log(`Tasmota device initialized: ${this.getName()} (${settings.mac})`);
  }

  /** Send a Tasmota command via MQTT */
  protected sendCommand(command: string, payload: string): void {
    const topic = buildTopic(this.topicParts, PREFIX_CMND, command);
    const app = this.homey.app as TasmotaMqttApp;
    app.mqttClient.publish(topic, payload);
    this.log(`CMD: ${topic} = ${payload}`);
  }

  /** Request current device state */
  protected requestState(): void {
    this.sendCommand('STATE', '');
  }

  /** Handle an incoming MQTT message routed to this device */
  private handleMessage(topic: string, payload: string): void {
    // Determine suffix after the device topic
    const deviceTopic = this.topicParts.t;
    const idx = topic.indexOf(`/${deviceTopic}/`);
    if (idx === -1) return;

    const suffix = topic.slice(idx + deviceTopic.length + 2); // +2 for surrounding slashes

    // LWT handling
    if (suffix === 'LWT') {
      const settings = this.getSettings();
      const lwtPayload = payload.trim().toLowerCase();
      if (lwtPayload === (settings.ofln as string).toLowerCase()) {
        this.setUnavailable('Device offline').catch(this.error);
      } else if (lwtPayload === (settings.onln as string).toLowerCase()) {
        this.setAvailable().catch(this.error);
        this.requestState();
        this.sendCommand('PowerOnState', '');
      }
      return;
    }

    // STATE or RESULT — parse and forward to subclass
    if (suffix === 'STATE' || suffix === 'RESULT') {
      try {
        const data = JSON.parse(payload);
        this.log(`State update: ${suffix}`);
        this.onTasmotaState(data);
      } catch {
        // Ignore invalid JSON
      }
      return;
    }

    // SENSOR telemetry
    if (suffix === 'SENSOR') {
      try {
        const data = JSON.parse(payload);
        this.onTasmotaSensor(data);
      } catch {
        // Ignore invalid JSON
      }
      return;
    }

    // Forward any other messages
    this.onMqttMessage(topic, suffix, payload);
  }

  /** Override in subclass to handle STATE/RESULT data */
  protected onTasmotaState(_data: Record<string, unknown>): void {
    // Update WiFi RSSI if present
    const wifi = _data['Wifi'] as Record<string, unknown> | undefined;
    if (wifi) {
      if (typeof wifi['Signal'] === 'number') {
        this.setCapabilityValue('measure_signal_strength', wifi['Signal']).catch(this.error);
      }
      if (typeof wifi['RSSI'] === 'number' && this.hasCapability('measure_wifi_percent')) {
        this.setCapabilityValue('measure_wifi_percent', wifi['RSSI']).catch(this.error);
      }
    }

    // Sync PowerOnState from RESULT
    if (typeof _data['PowerOnState'] === 'number') {
      this.setSettings({ power_on_state: String(_data['PowerOnState']) }).catch(this.error);
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: {
    oldSettings: Record<string, unknown>;
    newSettings: Record<string, unknown>;
    changedKeys: string[];
  }): Promise<void> {
    if (changedKeys.includes('power_on_state')) {
      this.sendCommand('PowerOnState', newSettings.power_on_state as string);
    }
  }

  /** Override in subclass to handle SENSOR data */
  protected onTasmotaSensor(_data: Record<string, unknown>): void {
    // Base: no-op
  }

  /** Override in subclass to handle other MQTT messages */
  protected onMqttMessage(_topic: string, _suffix: string, _payload: string): void {
    // Base: no-op
  }

  async onUninit(): Promise<void> {
    const app = this.homey.app as TasmotaMqttApp;
    const settings = this.getSettings();
    app.unregisterMessageHandler(settings.t);
  }

  async onDeleted(): Promise<void> {
    const app = this.homey.app as TasmotaMqttApp;
    const settings = this.getSettings();
    app.unregisterMessageHandler(settings.t);
  }
}

module.exports = TasmotaDeviceBase;
