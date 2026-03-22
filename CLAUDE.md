# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run build          # Compile TypeScript → .homeybuild/
npm run lint           # ESLint (.js and .ts files)
homey app run          # Deploy to Homey and run (requires Homey CLI)
homey app validate     # Validate app structure before publishing
```

```bash
npm test               # Run vitest test suite
```

## Rules

- **Never edit generated files** — `app.json` (root) is generated from `.homeycompose/app.json`; `.homeybuild/` is compiled output; `package-lock.json` is regenerated via `npm install`
- **Homeycompose is the source of truth** — app config in `.homeycompose/app.json`, custom capabilities in `.homeycompose/capabilities/*.json`, driver config in `drivers/<name>/driver.compose.json`
- **Use Homey timers** — `this.homey.setTimeout()` / `this.homey.setInterval()`, never native `setTimeout`/`setInterval`
- **Coupled capability listeners** — use `registerMultipleCapabilityListener()` for related capabilities (e.g. lights), not individual listeners
- **Device data vs store vs settings** — only stable identifiers (MAC, serial) in device data object; dynamic values (IP) in store; user-configurable values in settings
- **Guard state writes** — compare against current value before calling `setSettings()` or `setCapabilityValue()` to avoid unnecessary I/O on recurring telemetry
- **ES module imports require `.js` extension** — even for `.ts` source files
- **English only** — single locale (`en`), no other locale files
- **Reference** — [Homey App SDK docs](https://apps.developer.homey.app/), [SDK v3 type definitions](https://apps-sdk-v3.developer.homey.app/)

## Architecture

This is a **Homey SDK v3** app that bridges Tasmota devices to Homey via MQTT. The app uses Tasmota's native MQTT discovery protocol — no manual device configuration needed.

### Message Flow

```
Tasmota Device ←→ MQTT Broker ←→ MqttClient ←→ App (router) ←→ Device handlers
                                      ↕
                               DiscoveryManager (pairing)
```

- **`app.ts`** — Entry point. Connects to MQTT, subscribes to `stat/#` and `tele/#`, and routes incoming messages to paired devices by matching the topic's second segment (e.g., `stat/<device_topic>/RESULT`).
- **`lib/MqttClient.ts`** — Thin EventEmitter wrapper around `mqtt.js`. Handles connect/reconnect/TLS.
- **`lib/DiscoveryManager.ts`** — Subscribes to `tasmota/discovery/#` and `tele/+/LWT`. Caches discovered devices by MAC for the pairing UI. Already uses an arrow function for `onMessage`, so no `.bind(this)` needed.
- **`lib/TopicBuilder.ts`** — Constructs MQTT topics from Tasmota's `%prefix%/%topic%/` template format with three prefixes: cmnd (0), stat (1), tele (2).
- **`lib/TasmotaDiscoveryPayload.ts`** — Parses discovery JSON. Determines device type from `rl` (relay types: 0=none, 1=relay, 2=light, 3=shutter), `lt_st` (light subtype: 1=dimmer, 2=CW, 3=RGB, 4=RGBW, 5=RGBCW), and `if` (iFan flag). Provides capability getters for each device type.

### Driver Pattern

Drivers use a two-tier base class hierarchy:

- **`TasmotaDriverBase`** → concrete driver — handles pairing by querying DiscoveryManager's cache. `filterDevice()` can return a single device, an array (for multi-relay), or null.
- **`TasmotaDeviceBase`** → concrete device — registers an MQTT message handler with the app, handles LWT availability, parses STATE/RESULT/SENSOR payloads, and delegates to subclass overrides (`onTasmotaState`, `onTasmotaSensor`, `onMqttMessage`). Implements both `onUninit()` (app stop) and `onDeleted()` (device removed) for cleanup. Handles `onSettings()` for `PowerOnState` and queries it when device comes online. Multiple devices can share the same MQTT topic (multi-relay support).

### Supported Device Types

| Driver | Class | Discovery filter | Key capabilities |
|--------|-------|------------------|-----------------|
| `tasmota_light` | light | `hasLight()` (rl=2 or rl=1+so.30) | onoff, dim, light_temperature, light_hue, light_saturation |
| `tasmota_switch` | socket | `hasRelay()` (rl=1, not light) | onoff, measure_power, meter_power |
| `tasmota_sensor` | sensor | `hasSensorOnly()` (all rl=0) | measure_temperature, measure_humidity, measure_pressure |
| `tasmota_shutter` | blinds | `hasShutter()` (rl=3) | windowcoverings_set, windowcoverings_state, windowcoverings_tilt_set |
| `tasmota_fan` | fan | `isIfan` (if>0) | onoff (light), fan_speed (off/low/medium/high) |

Multi-relay devices (e.g., Sonoff Dual) create separate Homey devices per relay, each with a `relay_index` setting targeting `Power1`/`Power2`/etc.

To add a new device type: create a new driver folder under `drivers/`, extend the base classes, implement `filterDevice()` on the driver and state/capability handlers on the device.

### Settings & Reconnection

MQTT connection settings are stored via `this.homey.settings`. The app debounces reconnection (1s via `this.homey.setTimeout()`) when any `mqtt_*` setting changes. Settings UI is in `settings/index.html` (vanilla JS, not a framework).

### Homeycompose

App metadata lives in `.homeycompose/app.json` — `app.json` in the root is generated from it. Custom capabilities go in `.homeycompose/capabilities/`. Driver metadata is in each driver's `driver.compose.json`.

### API

`api.ts` exposes `GET /mqtt-status` → `{ connected: boolean }`, polled by the settings page.

### Light Capabilities

Light capabilities (`onoff`, `dim`, `light_temperature`, `light_hue`, `light_saturation`, `light_mode`) are registered via a single `registerMultipleCapabilityListener()` with 500ms debounce, following Homey's coupled-lights best practice:
- `onoff` takes precedence over all other capabilities
- `dim` to 0 turns off; `dim` from 0 turns on
- Color/temperature changes while off do NOT turn the device on
- Energy approximation is configured in `driver.compose.json` (9W on, 0.5W standby)

### Driver Settings

Driver settings are defined in `driver.compose.json` and synced from the device:
- **PowerOnState** (base class) — dropdown, synced from RESULT, sent via `PowerOnState` command
- **Fade** (light) — checkbox, synced from STATE `Fade` field, sent via `Fade 0|1`
- **Speed** (light) — number 1-40, synced from STATE `Speed` field, sent via `Speed N`
- **Device info** (mac, ip, model, firmware) — read-only labels populated during pairing

### Security

- **Topic sanitization** — `TopicBuilder.sanitizeTopicSegment()` strips `/`, `+`, `#`, and null bytes from all topic segments to prevent MQTT injection
- **Settings validation** — `PowerOnState` validated against `[0-4]`, `Speed` clamped to `1-40` before sending Tasmota commands
- **Guarded writes** — `setCapabilityValueIfChanged()` in base class compares current value before writing to avoid unnecessary I/O
- **Immutable discovery cache** — `getDiscoveredDevices()` returns a copy to prevent external mutation

### Publishing

- **App Store**: Published via GitHub Actions workflow (`publish.yml`) using `HOMEY_PAT` secret
- **Versioning**: Use the `version.yml` workflow to bump version and create GitHub releases
- **CI**: `validate.yml` runs build, lint, test, and `homey app validate` on push to main and PRs

### Localization

English only (`en`). No other locale files.
