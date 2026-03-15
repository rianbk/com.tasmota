/**
 * Constructs MQTT topics from Tasmota discovery config fields.
 *
 * Full topic template (`ft`) uses placeholders:
 *   %prefix% → tp[prefixIndex]
 *   %topic%  → t
 *   %hostname% → hn
 *   %id%     → last 6 chars of mac
 */

export interface TopicParts {
  /** Full topic template, e.g. "%prefix%/%topic%/" */
  ft: string;
  /** Prefix list: [cmnd, stat, tele] */
  tp: [string, string, string];
  /** Device topic slug */
  t: string;
  /** Hostname (optional, for %hostname% replacement) */
  hn?: string;
  /** MAC address (for %id% replacement — uses last 6 chars) */
  mac?: string;
}

export const PREFIX_CMND = 0;
export const PREFIX_STAT = 1;
export const PREFIX_TELE = 2;

/**
 * Build an MQTT topic for a given prefix index and command.
 *
 * @example
 * buildTopic({ ft: '%prefix%/%topic%/', tp: ['cmnd','stat','tele'], t: 'my_light' }, 0, 'POWER')
 * // → 'cmnd/my_light/POWER'
 */
export function buildTopic(parts: TopicParts, prefixIndex: number, command: string): string {
  let topic = parts.ft;
  topic = topic.replace('%prefix%', parts.tp[prefixIndex]);
  topic = topic.replace('%topic%', parts.t);
  if (parts.hn != null) {
    topic = topic.replace('%hostname%', parts.hn);
  }
  if (parts.mac != null) {
    topic = topic.replace('%id%', parts.mac.slice(-6));
  }
  return topic + command;
}

/**
 * Build the LWT (Last Will and Testament) topic for a device.
 * LWT is published on the tele prefix with suffix "LWT".
 */
export function buildLwtTopic(parts: TopicParts): string {
  return buildTopic(parts, PREFIX_TELE, 'LWT');
}
