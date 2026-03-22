# Contributing

Thanks for your interest in contributing to Tasmota for Homey!

## Getting Started

1. Fork the repository
2. Clone your fork and run `npm install`
3. Create a feature branch from `main`
4. Make your changes
5. Run `npm run build && npm run lint && npm test` to verify
6. Submit a pull request

## Adding a New Device Type

1. Create a new driver folder under `drivers/`
2. Extend `TasmotaDriverBase` (driver) and `TasmotaDeviceBase` (device)
3. Add discovery filtering via a method on `TasmotaDiscoveryPayload`
4. Add a `driver.compose.json` with capabilities and settings
5. Write tests following the existing mock pattern in `test/`
6. Update `CLAUDE.md` with the new driver details

See the existing drivers for reference — `tasmota_switch` is the simplest example.

## Code Style

- TypeScript with ES module imports (`.js` extension required)
- ESLint config extends `athom/homey-app`
- Use `setCapabilityValueIfChanged()` for telemetry updates
- Use `registerMultipleCapabilityListener()` for coupled capabilities
- Use Homey timers (`this.homey.setTimeout`), never native timers

## Testing

All tests use vitest with a mock-based pattern — no real hardware needed. Each test file creates a `MockDevice` that replicates the production logic for isolated testing.

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
```

## Reporting Bugs

Please include your Tasmota firmware version, device model, and relevant app logs from `homey app run`.
