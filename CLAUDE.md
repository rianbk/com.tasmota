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
- **`lib/TasmotaDiscoveryPayload.ts`** — Parses discovery JSON. Determines device capabilities from `lt_st` (light subtype: 1=dimmer, 2=CW, 3=RGB, 4=RGBW, 5=RGBCW).

### Driver Pattern

Drivers use a two-tier base class hierarchy:

- **`TasmotaDriverBase`** → concrete driver (e.g., `TasmotaLightDriver`) — handles pairing by querying DiscoveryManager's cache.
- **`TasmotaDeviceBase`** → concrete device (e.g., `TasmotaLightDevice`) — registers an MQTT message handler with the app, handles LWT availability, parses STATE/RESULT/SENSOR payloads, and delegates to subclass overrides (`onTasmotaState`, `onTasmotaSensor`, `onMqttMessage`). Implements both `onUninit()` (app stop) and `onDeleted()` (device removed) for cleanup. Handles `onSettings()` for `PowerOnState` and queries it when device comes online.

To add a new device type: create a new driver folder under `drivers/`, extend the base classes, implement `filterDevice()` on the driver and state/capability handlers on the device.

### Settings & Reconnection

MQTT connection settings are stored via `this.homey.settings`. The app debounces reconnection (1s via `this.homey.setTimeout()`) when any `mqtt_*` setting changes. Settings UI is in `settings/index.html` (vanilla JS, not a framework). Always use `this.homey.setTimeout()`/`this.homey.setInterval()` instead of native timers.

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

### Localization

English only (`en`). No other locale files.
