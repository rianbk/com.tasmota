import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';
import { EventEmitter } from 'events';
import { DiscoveryManager } from '../lib/DiscoveryManager.js';
import { RELAY_LIGHT, LIGHT_RGBCW } from '../lib/TasmotaDiscoveryPayload.js';

function makeMockMqttClient() {
  const emitter = new EventEmitter() as EventEmitter & {
    subscribe: ReturnType<typeof vi.fn>;
  };
  emitter.subscribe = vi.fn();
  return emitter;
}

function makeConfigPayload(mac = 'AABBCCDDEEFF', topic = 'tasmota_test') {
  return JSON.stringify({
    dn: 'Test Light',
    fn: ['Test Light'],
    t: topic,
    ft: '%prefix%/%topic%/',
    tp: ['cmnd', 'stat', 'tele'],
    mac,
    ip: '192.168.1.50',
    md: 'Sonoff Basic',
    sw: '14.4.1',
    rl: [RELAY_LIGHT],
    lt_st: LIGHT_RGBCW,
    ofln: 'Offline',
    onln: 'Online',
    state: ['OFF', 'ON', 'TOGGLE', 'HOLD'],
    ver: 1,
  });
}

describe('DiscoveryManager', () => {
  let mqttClient: ReturnType<typeof makeMockMqttClient>;
  let dm: DiscoveryManager;

  beforeEach(() => {
    mqttClient = makeMockMqttClient();
    dm = new DiscoveryManager(mqttClient as unknown as import('../lib/MqttClient.js').MqttClient);
    dm.start();
  });

  it('subscribes to discovery and LWT topics on start', () => {
    expect(mqttClient.subscribe).toHaveBeenCalledWith('tasmota/discovery/#');
    expect(mqttClient.subscribe).toHaveBeenCalledWith('tele/+/LWT');
  });

  it('discovers a device from config message', () => {
    const handler = vi.fn();
    dm.on('device_discovered', handler);

    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', makeConfigPayload());

    expect(handler).toHaveBeenCalledWith('AABBCCDDEEFF', expect.anything());
    expect(dm.getDevice('AABBCCDDEEFF')).toBeDefined();
    expect(dm.getDevice('AABBCCDDEEFF')!.config.deviceName).toBe('Test Light');
  });

  it('emits device_updated on re-discovery', () => {
    const updated = vi.fn();
    dm.on('device_updated', updated);

    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', makeConfigPayload());
    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', makeConfigPayload());

    expect(updated).toHaveBeenCalledTimes(1);
  });

  it('removes device on empty payload', () => {
    const removed = vi.fn();
    dm.on('device_removed', removed);

    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', makeConfigPayload());
    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', '');

    expect(removed).toHaveBeenCalledWith('AABBCCDDEEFF');
    expect(dm.getDevice('AABBCCDDEEFF')).toBeUndefined();
  });

  it('ignores config with mismatched MAC', () => {
    const handler = vi.fn();
    dm.on('device_discovered', handler);

    mqttClient.emit('message', 'tasmota/discovery/112233445566/config', makeConfigPayload('AABBCCDDEEFF'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores invalid JSON', () => {
    const handler = vi.fn();
    dm.on('device_discovered', handler);

    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', 'not json');

    expect(handler).not.toHaveBeenCalled();
  });

  it('handles LWT online/offline', () => {
    const lwtHandler = vi.fn();
    dm.on('device_lwt', lwtHandler);

    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', makeConfigPayload());

    mqttClient.emit('message', 'tele/tasmota_test/LWT', 'Online');
    expect(lwtHandler).toHaveBeenCalledWith('AABBCCDDEEFF', true);
    expect(dm.getDevice('AABBCCDDEEFF')!.online).toBe(true);

    mqttClient.emit('message', 'tele/tasmota_test/LWT', 'Offline');
    expect(lwtHandler).toHaveBeenCalledWith('AABBCCDDEEFF', false);
    expect(dm.getDevice('AABBCCDDEEFF')!.online).toBe(false);
  });

  it('caches LWT status before device discovery', () => {
    mqttClient.emit('message', 'tele/tasmota_test/LWT', 'Online');
    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', makeConfigPayload());

    expect(dm.getDevice('AABBCCDDEEFF')!.online).toBe(true);
  });

  it('handles sensor messages', () => {
    const sensorsHandler = vi.fn();
    dm.on('sensors_discovered', sensorsHandler);

    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', makeConfigPayload());
    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/sensors', JSON.stringify({ sn: { Temperature: 22 }, ver: 1 }));

    expect(sensorsHandler).toHaveBeenCalledWith('AABBCCDDEEFF', expect.objectContaining({ ver: 1 }));
    expect(dm.getDevice('AABBCCDDEEFF')!.sensors).toBeDefined();
  });

  it('returns all discovered devices', () => {
    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', makeConfigPayload('AABBCCDDEEFF', 'light1'));
    mqttClient.emit('message', 'tasmota/discovery/112233445566/config', makeConfigPayload('112233445566', 'light2'));

    expect(dm.getDiscoveredDevices().size).toBe(2);
  });

  it('does not double-register message listener on multiple starts', () => {
    dm.start();
    dm.start();

    const handler = vi.fn();
    dm.on('device_discovered', handler);

    mqttClient.emit('message', 'tasmota/discovery/AABBCCDDEEFF/config', makeConfigPayload());

    // Should only fire once, not multiple times
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
