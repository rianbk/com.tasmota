import type Homey from 'homey/lib/Homey';
import type TasmotaMqttApp from './app.js';

module.exports = {
  async getMqttStatus({ homey }: { homey: Homey }) {
    const app = homey.app as TasmotaMqttApp;
    if (!app.mqttClient) {
      return { connected: false, error: 'MQTT client not initialized' };
    }
    try {
      return { connected: app.mqttClient.connected };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { connected: false, error: message };
    }
  },
};
