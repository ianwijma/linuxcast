export type ShellCommand = 'show' | 'toggle' | 'quit';

/** External links navigate to the launcher; they cannot quit or execute effects. */
export function parseDeepLink(value: unknown): Exclude<ShellCommand, 'quit'> {
  if (value === 'linuxcast://launcher/show') return 'show';
  if (value === 'linuxcast://launcher/toggle') return 'toggle';
  throw new Error('Invalid Linuxcast link.');
}

export function parseArguments(args: readonly string[]): ShellCommand {
  if (args.length === 0) return 'toggle';
  if (args.length !== 1) throw new Error('Use --show, --toggle or --quit.');
  switch (args[0]) {
    case '--show': return 'show';
    case '--toggle': return 'toggle';
    case '--quit': return 'quit';
    default: return parseDeepLink(args[0]);
  }
}

export function parseInstanceRequest(value: unknown): ShellCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid instance request.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || data.protocolVersion !== 1 ||
      !Object.hasOwn(data, 'command') ||
      (data.command !== 'show' && data.command !== 'toggle' && data.command !== 'quit'))
    throw new Error('Invalid instance request.');
  return data.command;
}
