import { EventEmitter } from 'events';
import { MqttClient } from './MqttClient.js';
import { TasmotaDiscoveryPayload, type SensorsPayload } from './TasmotaDiscoveryPayload.js';

export interface DiscoveredDevice {
  config: TasmotaDiscoveryPayload;
  sensors?: SensorsPayload;
  online: boolean;
}

const DISCOVERY_TOPIC = 'tasmota/discovery/#';
const DISCOVERY_PREFIX = 'tasmota/discovery/';
const LWT_TOPIC = 'tele/+/LWT';
const LWT_PREFIX = 'tele/';
const LWT_SUFFIX = '/LWT';

/**
 * Subscribes to Tasmota native MQTT discovery and maintains a cache of discovered devices.
 */
export class DiscoveryManager extends EventEmitter {
  private devices = new Map<string, DiscoveredDevice>();
  private lwtCache = new Map<string, boolean>();
  private mqttClient: MqttClient;
  private started = false;

  constructor(mqttClient: MqttClient) {
    super();
    this.mqttClient = mqttClient;
  }

  /** Start listening for discovery and LWT messages. Call after MQTT is connected. */
  start(): void {
    this.devices.clear();
    this.lwtCache.clear();
    this.mqttClient.subscribe(DISCOVERY_TOPIC);
    this.mqttClient.subscribe(LWT_TOPIC);
    if (!this.started) {
      this.mqttClient.on('message', this.onMessage);
      this.started = true;
    }
  }

  private onMessage = (topic: string, payload: string): void => {
    if (topic.startsWith(DISCOVERY_PREFIX)) {
      // Topic format: tasmota/discovery/<MAC>/<type>
      const rest = topic.slice(DISCOVERY_PREFIX.length);
      const slashIndex = rest.indexOf('/');
      if (slashIndex === -1) return;

      const mac = rest.slice(0, slashIndex);
      const messageType = rest.slice(slashIndex + 1);

      if (messageType === 'config') {
        this.handleConfig(mac, payload);
      } else if (messageType === 'sensors') {
        this.handleSensors(mac, payload);
      }
    } else if (topic.startsWith(LWT_PREFIX) && topic.endsWith(LWT_SUFFIX)) {
      // Topic format: tele/<device_topic>/LWT
      const deviceTopic = topic.slice(LWT_PREFIX.length, -LWT_SUFFIX.length);
      this.handleLwt(deviceTopic, payload);
    }
  };

  private handleConfig(mac: string, payload: string): void {
    // Empty payload means device removed
    if (!payload || payload.trim() === '') {
      if (this.devices.has(mac)) {
        const removed = this.devices.get(mac)!;
        this.lwtCache.delete(removed.config.topic);
        this.devices.delete(mac);
        this.emit('device_removed', mac);
      }
      return;
    }

    const config = TasmotaDiscoveryPayload.parse(payload);
    if (!config) return;

    // Validate MAC in topic matches MAC in payload
    if (config.mac.toUpperCase().replace(/:/g, '') !== mac.toUpperCase().replace(/:/g, '')) {
      return;
    }

    const existing = this.devices.get(mac);
    if (existing) {
      existing.config = config;
      this.emit('device_updated', mac, config);
    } else {
      const online = this.lwtCache.get(config.topic) ?? false;
      this.devices.set(mac, { config, online });
      this.emit('device_discovered', mac, config);
    }
  }

  private handleSensors(mac: string, payload: string): void {
    if (!payload || payload.trim() === '') return;

    try {
      const sensors = JSON.parse(payload) as SensorsPayload;
      if (sensors.ver !== 1) return;

      const device = this.devices.get(mac);
      if (device) {
        device.sensors = sensors;
        this.emit('sensors_discovered', mac, sensors);
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  private handleLwt(deviceTopic: string, payload: string): void {
    const isOnline = payload.trim().toLowerCase() === 'online';
    this.lwtCache.set(deviceTopic, isOnline);
    for (const [mac, entry] of this.devices) {
      if (entry.config.topic === deviceTopic) {
        entry.online = isOnline;
        this.emit('device_lwt', mac, isOnline);
        break;
      }
    }
  }

  /** Get all discovered devices */
  getDiscoveredDevices(): Map<string, DiscoveredDevice> {
    return this.devices;
  }

  /** Get a specific device by MAC */
  getDevice(mac: string): DiscoveredDevice | undefined {
    return this.devices.get(mac);
  }
}
