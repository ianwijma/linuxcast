import { describe, expect, it } from 'vitest';
import { parseArguments, parseDeepLink, parseInstanceRequest } from './commands.ts';

describe('resident invocation boundary', () => {
  it('defaults to toggle and supports explicit show, toggle and Quit', () => {
    expect(parseArguments([])).toBe('toggle');
    for (const command of ['show', 'toggle', 'quit'])
      expect(parseArguments([`--${command}`])).toBe(command);
    expect(parseArguments(['linuxcast://launcher/show'])).toBe('show');
    expect(parseDeepLink('linuxcast://launcher/toggle')).toBe('toggle');
  });
  it.each([
    'linuxcast://launcher/quit', 'linuxcast://launcher/show?token=SYNTHETIC_PRIVATE',
    'linuxcast://launcher/show#fragment', 'linuxcast://user:password@launcher/show',
    'linuxcast://launcher:123/show', 'linuxcast://launcher/%73how',
    'linuxcast://launcher/../launcher/show', 'linuxcast://other/show',
    'linuxcast-app://shell/index.html', 'file:///etc/passwd', 'javascript:alert(1)',
    'https://example.com', 'linuxcast://launcher/show\n', '', 'x'.repeat(4096),
  ])('rejects unrecognized links without reflecting their content', value => {
    expect(() => parseDeepLink(value)).toThrow('Invalid Linuxcast link.');
  });
  it('rejects extra arguments and malformed instance envelopes', () => {
    expect(() => parseArguments(['--show', '--quit'])).toThrow();
    for (const command of ['show', 'toggle', 'quit'])
      expect(parseInstanceRequest({ protocolVersion: 1, command })).toBe(command);
    for (const value of [null, [], {}, { protocolVersion: 2, command: 'show' },
      { protocolVersion: 1, command: 'exec' }, { protocolVersion: 1, command: 'show', path: 'private' }])
      expect(() => parseInstanceRequest(value)).toThrow('Invalid instance request.');
  });
});
