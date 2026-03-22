#!/usr/bin/env npx tsx
/**
 * Simulates Tasmota devices by publishing realistic MQTT discovery and telemetry messages.
 * Usage: npx tsx scripts/simulate-devices.ts [mqtt://host:port]
 *
 * Publishes discovery payloads for 6 device types, then sends periodic telemetry.
 * Ctrl+C to stop.
 */

import mqtt from 'mqtt';

const brokerUrl = process.argv[2] || 'mqtt://localhost:1883';

const devices = [
  {
    name: 'Kitchen Light',
    mac: 'AABB01010101',
    topic: 'tasmota_kitchen_light',
    rl: [2, 0, 0, 0, 0, 0, 0, 0],
    lt_st: 5, // RGBCW
    state: () => ({
      POWER: 'ON',
      Dimmer: 80,
      CT: 327,
      HSBColor: '30,90,80',
      Color: '1E1400005A',
      Fade: 'ON',
      Speed: 4,
      Wifi: { AP: 1, SSId: 'HomeNet', RSSI: 72, Signal: -64 },
    }),
  },
  {
    name: 'Living Room Plug',
    mac: 'AABB02020202',
    topic: 'tasmota_plug',
    rl: [1, 0, 0, 0, 0, 0, 0, 0],
    lt_st: 0,
    state: () => ({
      POWER: Math.random() > 0.5 ? 'ON' : 'OFF',
      Wifi: { AP: 1, SSId: 'HomeNet', RSSI: 85, Signal: -55 },
    }),
    sensor: () => ({
      ENERGY: {
        Power: Math.round(40 + Math.random() * 20),
        Total: +(100 + Math.random()).toFixed(3),
        Voltage: Math.round(228 + Math.random() * 5),
        Current: +(0.15 + Math.random() * 0.1).toFixed(2),
      },
    }),
  },
  {
    name: 'Dual Switch',
    mac: 'AABB03030303',
    topic: 'tasmota_dual',
    rl: [1, 1, 0, 0, 0, 0, 0, 0],
    lt_st: 0,
    fn: ['Dual Relay 1', 'Dual Relay 2'],
    state: () => ({
      POWER1: 'ON',
      POWER2: 'OFF',
      Wifi: { AP: 1, SSId: 'HomeNet', RSSI: 60, Signal: -70 },
    }),
  },
  {
    name: 'Temp Sensor',
    mac: 'AABB04040404',
    topic: 'tasmota_temp',
    rl: [0, 0, 0, 0, 0, 0, 0, 0],
    lt_st: 0,
    sensorDiscovery: { sn: { Time: '', AM2301: { Temperature: '', Humidity: '' }, TempUnit: '' }, ver: 1 },
    state: () => ({
      Wifi: { AP: 1, SSId: 'HomeNet', RSSI: 65, Signal: -67 },
    }),
    sensor: () => ({
      AM2301: {
        Temperature: +(20 + Math.random() * 5).toFixed(1),
        Humidity: +(40 + Math.random() * 20).toFixed(1),
      },
      TempUnit: 'C',
    }),
  },
  {
    name: 'Roller Blind',
    mac: 'AABB05050505',
    topic: 'tasmota_blind',
    rl: [3, 3, 0, 0, 0, 0, 0, 0],
    lt_st: 0,
    sho: [0],
    state: () => ({
      Shutter1: { Position: 75, Direction: 0, Target: 75, Tilt: 0 },
      Wifi: { AP: 1, SSId: 'HomeNet', RSSI: 78, Signal: -62 },
    }),
  },
  {
    name: 'Ceiling Fan',
    mac: 'AABB06060606',
    topic: 'tasmota_fan',
    rl: [1, 0, 0, 0, 0, 0, 0, 0],
    lt_st: 0,
    if: 1,
    state: () => ({
      POWER1: 'ON',
      FanSpeed: 2,
      Wifi: { AP: 1, SSId: 'HomeNet', RSSI: 90, Signal: -50 },
    }),
  },
];

function makeDiscovery(dev: typeof devices[0]) {
  return JSON.stringify({
    dn: dev.name,
    fn: (dev as any).fn ?? [dev.name],
    t: dev.topic,
    ft: '%prefix%/%topic%/',
    tp: ['cmnd', 'stat', 'tele'],
    mac: dev.mac,
    ip: '192.168.1.' + (100 + devices.indexOf(dev)),
    hn: dev.topic,
    md: 'Simulated Device',
    sw: '14.4.1',
    rl: dev.rl,
    lt_st: dev.lt_st,
    if: (dev as any).if ?? 0,
    so: {},
    sho: (dev as any).sho,
    ofln: 'Offline',
    onln: 'Online',
    state: ['OFF', 'ON', 'TOGGLE', 'HOLD'],
    ver: 1,
  });
}

console.log(`Connecting to ${brokerUrl}...`);
const client = mqtt.connect(brokerUrl);

client.on('connect', () => {
  console.log('Connected. Publishing discovery for 6 simulated devices...\n');

  // Publish discovery + LWT for each device
  for (const dev of devices) {
    const discoveryTopic = `tasmota/discovery/${dev.mac}/config`;
    client.publish(discoveryTopic, makeDiscovery(dev), { retain: true });
    console.log(`  ✓ ${dev.name} (${dev.mac}) — ${discoveryTopic}`);

    // Publish sensors discovery if applicable
    if ((dev as any).sensorDiscovery) {
      const sensorsTopic = `tasmota/discovery/${dev.mac}/sensors`;
      client.publish(sensorsTopic, JSON.stringify((dev as any).sensorDiscovery), { retain: true });
      console.log(`    + sensors discovery`);
    }

    // LWT online
    const lwtTopic = `tele/${dev.topic}/LWT`;
    client.publish(lwtTopic, 'Online', { retain: true });
  }

  console.log('\nPublishing telemetry every 10s. Ctrl+C to stop.\n');

  // Listen for commands and log them
  client.subscribe('cmnd/#');
  client.on('message', (topic, payload) => {
    if (topic.startsWith('cmnd/')) {
      const msg = payload.toString();
      console.log(`  ← CMD: ${topic} = ${msg}`);

      // Respond to commands with RESULT
      for (const dev of devices) {
        if (topic.startsWith(`cmnd/${dev.topic}/`)) {
          const command = topic.split('/').pop()!;
          const resultTopic = `stat/${dev.topic}/RESULT`;

          if (command === 'STATE') {
            client.publish(`stat/${dev.topic}/STATE`, JSON.stringify(dev.state()));
          } else if (command === 'Power' || command.startsWith('Power')) {
            client.publish(resultTopic, JSON.stringify({ [command.toUpperCase()]: msg.toUpperCase() }));
          } else if (command === 'PowerOnState') {
            client.publish(resultTopic, JSON.stringify({ PowerOnState: parseInt(msg) || 3 }));
          } else if (command === 'FanSpeed') {
            client.publish(resultTopic, JSON.stringify({ FanSpeed: parseInt(msg) || 0 }));
          } else if (command === 'ShutterPosition') {
            const pos = parseInt(msg) || 0;
            client.publish(resultTopic, JSON.stringify({
              Shutter1: { Position: pos, Direction: 0, Target: pos, Tilt: 0 },
            }));
          } else if (command === 'Dimmer' || command === 'CT' || command === 'HSBColor') {
            client.publish(resultTopic, JSON.stringify({ [command]: msg }));
          }
        }
      }
    }
  });

  // Periodic telemetry
  const interval = setInterval(() => {
    for (const dev of devices) {
      // STATE telemetry
      client.publish(`tele/${dev.topic}/STATE`, JSON.stringify(dev.state()));

      // SENSOR telemetry
      if ((dev as any).sensor) {
        client.publish(`tele/${dev.topic}/SENSOR`, JSON.stringify((dev as any).sensor()));
      }
    }
  }, 10_000);

  process.on('SIGINT', () => {
    console.log('\n\nCleaning up — sending offline LWT and removing discovery...');
    for (const dev of devices) {
      client.publish(`tele/${dev.topic}/LWT`, 'Offline', { retain: true });
      client.publish(`tasmota/discovery/${dev.mac}/config`, '', { retain: true });
    }
    clearInterval(interval);
    setTimeout(() => {
      client.end();
      process.exit(0);
    }, 500);
  });
});

client.on('error', (err) => {
  console.error('MQTT error:', err.message);
  process.exit(1);
});
