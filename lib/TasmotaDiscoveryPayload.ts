import {
  type TopicParts, buildTopic,
} from './TopicBuilder.js';

/** Light subtype values */
export const LIGHT_DIMMER = 1;
export const LIGHT_CW = 2;
export const LIGHT_RGB = 3;
export const LIGHT_RGBW = 4;
export const LIGHT_RGBCW = 5;

/** WiFi monitoring capabilities shared by all device types */
const WIFI_CAPABILITIES = ['measure_signal_strength', 'measure_wifi_percent'];

/** Relay type values */
export const RELAY_NONE = 0;
export const RELAY_RELAY = 1;
export const RELAY_LIGHT = 2;
export const RELAY_SHUTTER = 3;

export interface TasmotaConfigRaw {
  dn: string; // Device name
  fn: string[]; // Friendly names
  t: string; // MQTT topic
  ft: string; // Full topic template
  tp: [string, string, string]; // Prefixes [cmnd, stat, tele]
  mac: string; // MAC address
  ip: string; // IP address
  hn?: string; // Hostname
  md: string; // Model name
  sw: string; // Firmware version
  rl: number[]; // Relay types
  lt_st?: number; /* eslint-disable-line camelcase */ // Light subtype
  lk?: number; // Link RGB+CT
  if?: number; // iFan flag
  so?: Record<string, number>; // SetOptions
  sho?: number[]; // Shutter options
  sht?: number[][]; // Shutter tilt config
  ofln: string; // LWT offline payload
  onln: string; // LWT online payload
  state: string[]; // State strings [OFF, ON, TOGGLE, HOLD]
  ver: number; // Protocol version
}

export interface SensorsPayload {
  sn: Record<string, unknown>;
  ver: number;
}

/**
 * Parsed Tasmota discovery config with typed accessors.
 */
export class TasmotaDiscoveryPayload {
  readonly raw: TasmotaConfigRaw;

  constructor(raw: TasmotaConfigRaw) {
    this.raw = raw;
  }

  get deviceName(): string {
    return this.raw.dn;
  }

  get friendlyNames(): string[] {
    return this.raw.fn;
  }

  get topic(): string {
    return this.raw.t;
  }

  get mac(): string {
    return this.raw.mac;
  }

  get ip(): string {
    return this.raw.ip;
  }

  get model(): string {
    return this.raw.md;
  }

  get firmware(): string {
    return this.raw.sw;
  }

  get relays(): number[] {
    return this.raw.rl;
  }

  get lightSubtype(): number {
    return this.raw.lt_st ?? 0;
  }

  get isIfan(): boolean {
    return (this.raw.if ?? 0) > 0;
  }

  get setOptions(): Record<string, number> {
    return this.raw.so ?? {};
  }

  get offlinePayload(): string {
    return this.raw.ofln;
  }

  get onlinePayload(): string {
    return this.raw.onln;
  }

  get stateStrings(): string[] {
    return this.raw.state;
  }

  get version(): number {
    return this.raw.ver;
  }

  get topicParts(): TopicParts {
    return {
      ft: this.raw.ft,
      tp: this.raw.tp,
      t: this.raw.t,
      hn: this.raw.hn,
      mac: this.raw.mac,
    };
  }

  /** Build an MQTT topic for a given prefix index and command */
  buildTopic(prefixIndex: number, command: string): string {
    return buildTopic(this.topicParts, prefixIndex, command);
  }

  /** Common settings shared by all device types during pairing */
  getBaseSettings(): Record<string, unknown> {
    return {
      t: this.raw.t,
      ft: this.raw.ft,
      tp: this.raw.tp,
      mac: this.raw.mac,
      hn: this.raw.hn ?? '',
      ip: this.raw.ip,
      model: this.raw.md,
      firmware: this.raw.sw,
      ofln: this.raw.ofln,
      onln: this.raw.onln,
    };
  }

  /** Display name: first friendly name or device name */
  get displayName(): string {
    return this.raw.fn[0] || this.raw.dn;
  }

  /** Whether relay at given index is a light (type 2, or type 1 with so.30 set) */
  isLight(relayIndex: number = 0): boolean {
    const rl = this.relays[relayIndex];
    if (rl === RELAY_LIGHT) return true;
    if (rl === RELAY_RELAY && this.setOptions['30'] === 1) return true;
    return false;
  }

  /** Whether any relay is a light */
  hasLight(): boolean {
    return this.relays.some((_, i) => this.isLight(i));
  }

  /** Whether any relay is a plain relay (not a light, shutter, or iFan) */
  hasRelay(): boolean {
    return !this.isIfan && this.relays.some((r, i) => r === RELAY_RELAY && !this.isLight(i));
  }

  /** Count of plain relays (not lights or shutters) */
  get relayCount(): number {
    return this.relays.filter((r, i) => r === RELAY_RELAY && !this.isLight(i)).length;
  }

  /** Whether any relay is a shutter */
  hasShutter(): boolean {
    return this.relays.some((r) => r === RELAY_SHUTTER);
  }

  /** Whether this is a sensor-only device (no relays, no lights) */
  hasSensorOnly(): boolean {
    return this.relays.every((r) => r === RELAY_NONE) && this.lightSubtype === 0 && !this.isIfan;
  }

  /** Whether CT range is non-standard (so.82 set) */
  get hasNarrowCtRange(): boolean {
    return this.setOptions['82'] === 1;
  }

  /** CT range min/max based on so.82 */
  get ctRange(): { min: number; max: number } {
    return this.hasNarrowCtRange
      ? { min: 200, max: 380 }
      : { min: 153, max: 500 };
  }

  /** Get capabilities list for this light based on lt_st */
  getLightCapabilities(): string[] {
    const caps = ['onoff', 'dim'];
    const lt = this.lightSubtype;
    if (lt >= LIGHT_CW) caps.push('light_temperature');
    if (lt >= LIGHT_RGB) caps.push('light_hue', 'light_saturation', 'light_mode');
    // RGBCW has both temperature and hue/sat (already added)
    caps.push(...WIFI_CAPABILITIES);
    return caps;
  }

  /** Get capabilities list for a relay/switch device */
  getRelayCapabilities(): string[] {
    return ['onoff', 'measure_power', 'meter_power', ...WIFI_CAPABILITIES];
  }

  /** Get capabilities list for a shutter device */
  getShutterCapabilities(): string[] {
    const caps = ['windowcoverings_set', 'windowcoverings_state'];
    if (this.raw.sht && this.raw.sht.length > 0) {
      caps.push('windowcoverings_tilt_set');
    }
    caps.push(...WIFI_CAPABILITIES);
    return caps;
  }

  /** Get capabilities list for an iFan device */
  getFanCapabilities(): string[] {
    return ['onoff', 'fan_speed', ...WIFI_CAPABILITIES];
  }

  /**
   * Get capabilities list for a sensor device based on the sensors discovery payload.
   * The `sn` field contains keys like "AM2301": {"Temperature":"","Humidity":""}.
   */
  static getSensorCapabilities(sensors: SensorsPayload | null): string[] {
    const caps: string[] = [];
    if (!sensors?.sn) return [...WIFI_CAPABILITIES];

    let hasTemp = false;
    let hasHumidity = false;
    let hasPressure = false;

    for (const [key, value] of Object.entries(sensors.sn)) {
      if (key === 'Time' || key === 'TempUnit' || key === 'PressureUnit') continue;
      if (typeof value === 'object' && value !== null) {
        const fields = value as Record<string, unknown>;
        if ('Temperature' in fields) hasTemp = true;
        if ('Humidity' in fields) hasHumidity = true;
        if ('Pressure' in fields) hasPressure = true;
      }
    }

    if (hasTemp) caps.push('measure_temperature');
    if (hasHumidity) caps.push('measure_humidity');
    if (hasPressure) caps.push('measure_pressure');
    caps.push(...WIFI_CAPABILITIES);
    return caps;
  }

  /**
   * Extract sensor keys from a sensors discovery payload (e.g. ["AM2301", "BME280"]).
   * These are the keys to look for in SENSOR telemetry messages.
   */
  static getSensorKeys(sensors: SensorsPayload | null): string[] {
    if (!sensors?.sn) return [];
    const skipKeys = new Set(['Time', 'TempUnit', 'PressureUnit', 'Switch1', 'Switch2']);
    return Object.keys(sensors.sn).filter(
      (k) => !skipKeys.has(k) && typeof sensors.sn[k] === 'object' && sensors.sn[k] !== null,
    );
  }

  /** Validate this payload */
  isValid(): boolean {
    return (
      this.version === 1
      && typeof this.raw.mac === 'string'
      && this.raw.mac.length > 0
      && typeof this.raw.t === 'string'
      && typeof this.raw.ft === 'string'
      && Array.isArray(this.raw.tp)
      && this.raw.tp.length === 3
    );
  }

  static parse(json: string): TasmotaDiscoveryPayload | null {
    try {
      const raw = JSON.parse(json) as TasmotaConfigRaw;
      const payload = new TasmotaDiscoveryPayload(raw);
      return payload.isValid() ? payload : null;
    } catch {
      return null;
    }
  }
}
