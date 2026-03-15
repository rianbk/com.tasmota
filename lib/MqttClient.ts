import { EventEmitter } from 'events';
import mqtt, { type MqttClient as MqttJsClient, type IClientOptions } from 'mqtt';

export interface MqttConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: boolean;
  verifyTls?: boolean;
}

export interface MqttClientEvents {
  message: (topic: string, payload: string) => void;
  connected: () => void;
  disconnected: () => void;
  error: (err: Error) => void;
}

/**
 * Thin wrapper around mqtt.js with EventEmitter interface.
 */
export class MqttClient extends EventEmitter {
  private client: MqttJsClient | null = null;
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  connect(options: MqttConnectionOptions): void {
    if (this.client) {
      this.client.end(true);
    }

    const protocol = options.tls ? 'mqtts' : 'mqtt';
    const url = `${protocol}://${options.host}:${options.port}`;

    const mqttOptions: IClientOptions = {
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clean: true,
      clientId: `homey_tasmota_${Math.random().toString(16).slice(2, 10)}`,
    };

    if (options.username) {
      mqttOptions.username = options.username;
    }
    if (options.password) {
      mqttOptions.password = options.password;
    }
    if (options.tls) {
      mqttOptions.rejectUnauthorized = options.verifyTls ?? false;
    }

    this.client = mqtt.connect(url, mqttOptions);

    this.client.on('connect', () => {
      this._connected = true;
      this.emit('connected');
    });

    this.client.on('offline', () => {
      this._connected = false;
      this.emit('disconnected');
    });

    this.client.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      this.emit('message', topic, payload.toString('utf-8'));
    });
  }

  subscribe(topic: string | string[]): void {
    if (!this.client) return;
    this.client.subscribe(topic);
  }

  publish(topic: string, payload: string, opts?: { retain?: boolean; qos?: 0 | 1 | 2 }): void {
    if (!this.client) return;
    this.client.publish(topic, payload, {
      retain: opts?.retain ?? false,
      qos: opts?.qos ?? 0,
    });
  }

  disconnect(): void {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this._connected = false;
    }
  }
}
