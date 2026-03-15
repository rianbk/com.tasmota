import { describe, it, expect } from 'vitest';
import {
  buildTopic, buildLwtTopic, PREFIX_CMND, PREFIX_STAT, PREFIX_TELE, type TopicParts,
} from '../lib/TopicBuilder.js';

const defaultParts: TopicParts = {
  ft: '%prefix%/%topic%/',
  tp: ['cmnd', 'stat', 'tele'],
  t: 'my_light',
};

describe('buildTopic', () => {
  it('builds a cmnd topic', () => {
    expect(buildTopic(defaultParts, PREFIX_CMND, 'POWER')).toBe('cmnd/my_light/POWER');
  });

  it('builds a stat topic', () => {
    expect(buildTopic(defaultParts, PREFIX_STAT, 'RESULT')).toBe('stat/my_light/RESULT');
  });

  it('builds a tele topic', () => {
    expect(buildTopic(defaultParts, PREFIX_TELE, 'STATE')).toBe('tele/my_light/STATE');
  });

  it('replaces %hostname% placeholder', () => {
    const parts: TopicParts = {
      ft: '%prefix%/%hostname%/',
      tp: ['cmnd', 'stat', 'tele'],
      t: 'unused',
      hn: 'tasmota-ABCD',
    };
    expect(buildTopic(parts, PREFIX_CMND, 'POWER')).toBe('cmnd/tasmota-ABCD/POWER');
  });

  it('replaces %id% with last 6 chars of MAC', () => {
    const parts: TopicParts = {
      ft: '%prefix%/%id%/',
      tp: ['cmnd', 'stat', 'tele'],
      t: 'unused',
      mac: 'AABBCCDDEEFF',
    };
    expect(buildTopic(parts, PREFIX_CMND, 'POWER')).toBe('cmnd/DDEEFF/POWER');
  });

  it('handles custom prefix names', () => {
    const parts: TopicParts = {
      ft: '%prefix%/%topic%/',
      tp: ['cmd', 'status', 'telemetry'],
      t: 'device1',
    };
    expect(buildTopic(parts, PREFIX_TELE, 'LWT')).toBe('telemetry/device1/LWT');
  });
});

describe('buildLwtTopic', () => {
  it('builds LWT topic on tele prefix', () => {
    expect(buildLwtTopic(defaultParts)).toBe('tele/my_light/LWT');
  });
});
