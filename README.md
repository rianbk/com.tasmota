# Tasmota for Homey

Control your Tasmota-flashed devices directly from Homey using MQTT. Devices are automatically discovered via Tasmota's native MQTT discovery protocol — no manual configuration needed.

## Supported Device Types

| Type | Homey Class | Capabilities |
|------|------------|-------------|
| **Light** | light | on/off, dimming, color temperature, RGB color |
| **Switch/Relay** | socket | on/off, power monitoring, energy metering |
| **Sensor** | sensor | temperature, humidity, pressure |
| **Shutter/Blind** | blinds | position, direction, tilt |
| **Fan** (iFan) | fan | light on/off, fan speed (off/low/medium/high) |

Multi-relay devices (e.g., Sonoff Dual, 4CH) automatically create separate Homey devices per channel.

## Requirements

- **Homey Pro** with Homey firmware 12.2+
- **Tasmota v9.2+** on your devices
- **MQTT broker** on your network (e.g., Mosquitto)
- Tasmota's `SetOption19` must be `0` (native discovery — this is the default)

## Setup

1. Install the app on your Homey
2. Go to the app settings and enter your MQTT broker address and credentials
3. Add devices — your Tasmota devices will appear automatically in the pairing list

## Development

```bash
npm install            # Install dependencies
npm run build          # Compile TypeScript
npm run lint           # Run ESLint
npm test               # Run test suite
homey app run          # Deploy to Homey (requires Docker)
homey app validate     # Validate for app store
```

### Testing Without Hardware

A device simulator is included for testing all driver types without physical Tasmota devices:

```bash
npx tsx scripts/simulate-devices.ts mqtt://user:pass@broker:1883
```

This publishes discovery payloads and telemetry for 6 simulated devices (light, switch, dual-relay, sensor, shutter, fan).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[GPL-3.0](LICENSE)
