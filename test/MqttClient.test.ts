import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { EventEmitter } from 'events';

import mqtt from 'mqtt';
import { MqttClient } from '../lib/MqttClient.js';

// Mock mqtt module before importing MqttClient
const mockMqttJsClient = new EventEmitter() as EventEmitter & {
  subscribe: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};
mockMqttJsClient.subscribe = vi.fn();
mockMqttJsClient.publish = vi.fn();
mockMqttJsClient.end = vi.fn();

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => mockMqttJsClient),
  },
}));

describe('MqttClient', () => {
  let client: MqttClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMqttJsClient.removeAllListeners();
    client = new MqttClient();
  });

  it('starts disconnected', () => {
    expect(client.connected).toBe(false);
  });

  it('connects with correct URL for plain MQTT', () => {
    client.connect({ host: '192.168.1.100', port: 1883 });
    expect(mqtt.connect).toHaveBeenCalledWith(
      'mqtt://192.168.1.100:1883',
      expect.objectContaining({ connectTimeout: 10000 }),
    );
  });

  it('connects with mqtts protocol when TLS enabled', () => {
    client.connect({ host: 'broker.example.com', port: 8883, tls: true });
    expect(mqtt.connect).toHaveBeenCalledWith(
      'mqtts://broker.example.com:8883',
      expect.objectContaining({ rejectUnauthorized: false }),
    );
  });

  it('sets rejectUnauthorized when verifyTls is true', () => {
    client.connect({
      host: 'broker.example.com', port: 8883, tls: true, verifyTls: true,
    });
    expect(mqtt.connect).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ rejectUnauthorized: true }),
    );
  });

  it('includes username and password when provided', () => {
    client.connect({
      host: 'broker', port: 1883, username: 'user', password: 'pass',
    });
    expect(mqtt.connect).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ username: 'user', password: 'pass' }),
    );
  });

  it('emits connected on mqtt connect event', () => {
    const handler = vi.fn();
    client.on('connected', handler);
    client.connect({ host: 'broker', port: 1883 });

    mockMqttJsClient.emit('connect');
    expect(handler).toHaveBeenCalled();
    expect(client.connected).toBe(true);
  });

  it('emits disconnected on mqtt offline event', () => {
    const handler = vi.fn();
    client.on('disconnected', handler);
    client.connect({ host: 'broker', port: 1883 });

    mockMqttJsClient.emit('offline');
    expect(handler).toHaveBeenCalled();
    expect(client.connected).toBe(false);
  });

  it('emits error on mqtt error event', () => {
    const handler = vi.fn();
    client.on('error', handler);
    client.connect({ host: 'broker', port: 1883 });

    const error = new Error('Connection refused');
    mockMqttJsClient.emit('error', error);
    expect(handler).toHaveBeenCalledWith(error);
  });

  it('forwards messages with string payload', () => {
    const handler = vi.fn();
    client.on('message', handler);
    client.connect({ host: 'broker', port: 1883 });

    mockMqttJsClient.emit('message', 'stat/test/RESULT', Buffer.from('{"POWER":"ON"}'));
    expect(handler).toHaveBeenCalledWith('stat/test/RESULT', '{"POWER":"ON"}');
  });

  it('subscribe delegates to mqtt client', () => {
    client.connect({ host: 'broker', port: 1883 });
    client.subscribe('stat/#');
    expect(mockMqttJsClient.subscribe).toHaveBeenCalledWith('stat/#');
  });

  it('publish delegates to mqtt client', () => {
    client.connect({ host: 'broker', port: 1883 });
    client.publish('cmnd/test/POWER', 'ON', { qos: 1 });
    expect(mockMqttJsClient.publish).toHaveBeenCalledWith('cmnd/test/POWER', 'ON', { retain: false, qos: 1 });
  });

  it('subscribe is no-op when not connected', () => {
    client.subscribe('stat/#');
    // Should not throw
  });

  it('publish is no-op when not connected', () => {
    client.publish('cmnd/test/POWER', 'ON');
    // Should not throw
  });

  it('disconnect cleans up', () => {
    client.connect({ host: 'broker', port: 1883 });
    client.disconnect();
    expect(mockMqttJsClient.end).toHaveBeenCalledWith(true);
    expect(client.connected).toBe(false);
  });

  it('disconnects previous client on reconnect', () => {
    client.connect({ host: 'broker', port: 1883 });
    client.connect({ host: 'broker', port: 1883 });
    expect(mockMqttJsClient.end).toHaveBeenCalledWith(true);
  });
});
