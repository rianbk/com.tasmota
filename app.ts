import Homey from 'homey';
import { MqttClient, type MqttConnectionOptions } from './lib/MqttClient.js';
import { DiscoveryManager } from './lib/DiscoveryManager.js';

export default class TasmotaMqttApp extends Homey.App {
  mqttClient!: MqttClient;
  discoveryManager!: DiscoveryManager;

  async onInit(): Promise<void> {
    this.mqttClient = new MqttClient();
    this.discoveryManager = new DiscoveryManager(this.mqttClient);

    this.mqttClient.on('connected', () => {
      this.log('MQTT connected');
      this.discoveryManager.start();
      // Subscribe to stat/tele wildcards for all devices
      // Default Tasmota ft is "%prefix%/%topic%/" → stat/<topic>/RESULT, tele/<topic>/STATE
      this.mqttClient.subscribe(['stat/#', 'tele/#']);
    });

    this.mqttClient.on('disconnected', () => {
      this.log('MQTT disconnected');
    });

    this.mqttClient.on('error', (err: Error) => {
      this.error('MQTT error:', err.message);
    });

    // Route incoming messages to paired devices
    this.mqttClient.on('message', (topic: string, payload: string) => {
      this.routeMessage(topic, payload);
    });

    this.discoveryManager.on('device_discovered', (mac: string) => {
      this.log(`Discovered Tasmota device: ${mac}`);
    });

    this.discoveryManager.on('device_removed', (mac: string) => {
      this.log(`Tasmota device removed: ${mac}`);
    });

    // Connect using saved settings
    this.connectFromSettings();

    // Re-connect when settings change (debounced to avoid spam from multiple fields saving)
    let reconnectTimer: NodeJS.Timeout | null = null;
    this.homey.settings.on('set', (key: string) => {
      if (key.startsWith('mqtt_')) {
        if (reconnectTimer) this.homey.clearTimeout(reconnectTimer);
        reconnectTimer = this.homey.setTimeout(() => {
          this.log('MQTT settings changed, reconnecting...');
          this.connectFromSettings();
          reconnectTimer = null;
        }, 1000);
      }
    });

    this.log('Tasmota MQTT app initialized');
  }

  private connectFromSettings(): void {
    const host = this.homey.settings.get('mqtt_host') as string;
    if (!host) {
      this.log('MQTT host not configured — skipping connection');
      return;
    }

    const options: MqttConnectionOptions = {
      host,
      port: (this.homey.settings.get('mqtt_port') as number) || 1883,
      username: this.homey.settings.get('mqtt_username') as string | undefined,
      password: this.homey.settings.get('mqtt_password') as string | undefined,
      tls: (this.homey.settings.get('mqtt_tls') as boolean) || false,
      verifyTls: (this.homey.settings.get('mqtt_verify_tls') as boolean) || false,
    };

    this.mqttClient.connect(options);
  }

  /**
   * Route stat/tele messages to the matching paired device.
   * Devices register themselves via `registerMessageHandler`.
   */
  // eslint-disable-next-line no-spaced-func, func-call-spacing
  private messageHandlers = new Map<string, (topic: string, payload: string) => void>();

  registerMessageHandler(deviceTopic: string, handler: (topic: string, payload: string) => void): void {
    this.messageHandlers.set(deviceTopic, handler);
  }

  unregisterMessageHandler(deviceTopic: string): void {
    this.messageHandlers.delete(deviceTopic);
  }

  private routeMessage(topic: string, payload: string): void {
    for (const [deviceTopic, handler] of this.messageHandlers) {
      const parts = topic.split('/');
      if (parts.length >= 3 && parts[1] === deviceTopic) {
        handler(topic, payload);
      }
    }
  }

  async onUninit(): Promise<void> {
    this.mqttClient.disconnect();
  }
}

module.exports = TasmotaMqttApp;
