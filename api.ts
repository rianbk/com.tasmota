import mqtt from 'mqtt';
import type Homey from 'homey/lib/Homey';
import type TasmotaMqttApp from './app.js';

module.exports = {
  async getMqttStatus({ homey }: { homey: Homey }) {
    const app = homey.app as TasmotaMqttApp;
    if (!app.mqttClient) {
      return { connected: false, error: 'MQTT client not initialized' };
    }
    try {
      return {
        connected: app.mqttClient.connected,
        error: app.mqttClient.connected ? null : app.lastMqttError,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { connected: false, error: message };
    }
  },

  async testMqttConnection({ homey }: { homey: Homey }) {
    const app = homey.app as TasmotaMqttApp;
    const host = app.homey.settings.get('mqtt_host') as string;
    if (!host) {
      return { success: false, message: 'MQTT host not configured' };
    }

    const port = (app.homey.settings.get('mqtt_port') as number) || 1883;
    const username = app.homey.settings.get('mqtt_username') as string | undefined;
    const password = app.homey.settings.get('mqtt_password') as string | undefined;
    const tls = (app.homey.settings.get('mqtt_tls') as boolean) || false;
    const verifyTls = (app.homey.settings.get('mqtt_verify_tls') as boolean) || false;

    const protocol = tls ? 'mqtts' : 'mqtt';
    const url = `${protocol}://${host}:${port}`;

    return new Promise<{ success: boolean; message?: string }>((resolve) => {
      const client = mqtt.connect(url, {
        reconnectPeriod: 0, // Don't auto-reconnect for a test
        connectTimeout: 10000,
        clean: true,
        clientId: `homey_tasmota_test_${Math.random().toString(16).slice(2, 10)}`,
        username: username || undefined,
        password: password || undefined,
        rejectUnauthorized: tls ? (verifyTls ?? false) : undefined,
      });

      // eslint-disable-next-line homey-app/global-timers
      const timeout = setTimeout(() => {
        client.end(true);
        resolve({ success: false, message: `Connection timed out after 10 seconds (${host}:${port})` });
      }, 10000);

      client.on('connect', () => {
        clearTimeout(timeout);
        client.end(true);
        resolve({ success: true });
      });

      client.on('error', (err: Error) => {
        clearTimeout(timeout);
        client.end(true);
        resolve({ success: false, message: err.message });
      });
    });
  },
};
