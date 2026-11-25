import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, validateSettings } from '../src/ui/utilities/settings';

describe('export option validation', () => {
  it('falls back to defaults for junk', () => {
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings('x')).toEqual(DEFAULT_SETTINGS);
  });
  it('clamps and coerces', () => {
    const s = validateSettings({ concurrency: 99, psd: { scale: 5, mode: 'weird' }, tab: 'nope' });
    expect(s.concurrency).toBe(8);
    expect(s.psd.scale).toBe(1);
    expect(s.psd.mode).toBe('fidelity');
    expect(s.tab).toBe('psd');
  });
  it('never allows a combined PDF', () => {
    expect(
      validateSettings({ illustrator: { format: 'pdf', output: 'combined' } }).illustrator.output,
    ).toBe('zip');
  });
});
