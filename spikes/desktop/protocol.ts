/** S0-02 private, provisional protocol. No Node/GI/Qt runtime dependencies. */
export class DesktopError extends Error {
  readonly action: string;
  constructor(code: string, action = 'Refresh capabilities and retry with current context') { super(code); this.action = action; }
}
export type Rect = { x: number; y: number; width: number; height: number };
export type Handle = { session: string; instance: string; generation: number; id: string };
export type CommandInput = { operation: 'geometry'; handle: Handle } | { operation: 'place'; handle: Handle; rect: Rect };
export type Command = CommandInput & { id: string; generation: number; expires: number };
export type PollResult = { kind: 'command'; command: Command; expiresInMs: number } | { kind: 'empty'; reason: string } | { kind: 'reconnect'; reason: string };
export type Handshake = { protocolVersion: 1; generation: number };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new DesktopError('INVALID_PROTOCOL_RECORD');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, expected: string[]): void {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some(key => typeof key !== 'string' || !expected.includes(key))) throw new DesktopError('INVALID_PROTOCOL_FIELDS');
}
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function boundedText(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 128 && !Array.from(value).some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127); }
function deadline(value: unknown, maximum: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= maximum; }

export function parseRect(value: unknown): Rect {
  const rect = record(value);
  fields(rect, ['x', 'y', 'width', 'height']);
  if (!Object.values(rect).every(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000)
      || Number(rect.width) <= 0 || Number(rect.height) <= 0) throw new DesktopError('INVALID_GEOMETRY');
  return { x: rect.x as number, y: rect.y as number, width: rect.width as number, height: rect.height as number };
}
export function validRect(value: unknown): void {
  try { parseRect(value); } catch { throw new DesktopError('INVALID_GEOMETRY'); }
}
export function parseHandle(value: unknown): Handle {
  const handle = record(value);
  fields(handle, ['session', 'instance', 'generation', 'id']);
  if (!boundedText(handle.session) || !boundedText(handle.id) || !positiveInteger(handle.generation)
      || typeof handle.instance !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(handle.instance)) throw new DesktopError('INVALID_WINDOW_HANDLE');
  return { session: handle.session, instance: handle.instance, generation: handle.generation, id: handle.id };
}
export function parseCommandInput(value: unknown): CommandInput {
  const command = record(value);
  const operation = command.operation;
  if (operation !== 'geometry' && operation !== 'place') throw new DesktopError('UNKNOWN_WINDOW_OPERATION');
  fields(command, operation === 'place' ? ['operation', 'handle', 'rect'] : ['operation', 'handle']);
  const handle = parseHandle(command.handle);
  return operation === 'place' ? { operation, handle, rect: parseRect(command.rect) } : { operation, handle };
}
export function parseCommand(value: unknown, generation: number): Command {
  const command = record(value);
  const operation = command.operation;
  if (operation !== 'geometry' && operation !== 'place') throw new DesktopError('UNKNOWN_WINDOW_OPERATION');
  fields(command, operation === 'place' ? ['id', 'generation', 'expires', 'operation', 'handle', 'rect'] : ['id', 'generation', 'expires', 'operation', 'handle']);
  if (!positiveInteger(command.generation) || command.generation !== generation || !deadline(command.expires, Number.MAX_SAFE_INTEGER)
      || typeof command.id !== 'string' || command.id.length > 40 || !/^[1-9][0-9]*-[1-9][0-9]*$/u.test(command.id)) throw new DesktopError('INVALID_COMMAND');
  const [epoch, serial] = command.id.split('-').map(Number);
  if (epoch !== generation || !positiveInteger(serial)) throw new DesktopError('INVALID_COMMAND_ID');
  const input = parseCommandInput(operation === 'place' ? {operation, handle: command.handle, rect: command.rect} : {operation, handle: command.handle});
  if (input.handle.generation !== generation) throw new DesktopError('STALE_WINDOW_HANDLE');
  return {...input, id: command.id, generation, expires: command.expires};
}
export function parsePollResult(value: unknown, generation: number): PollResult {
  const reply = record(value);
  if (reply.kind === 'empty' || reply.kind === 'reconnect') {
    fields(reply, ['kind', 'reason']);
    if (!boundedText(reply.reason)) throw new DesktopError('INVALID_POLL_REASON');
    return {kind: reply.kind, reason: reply.reason};
  }
  fields(reply, ['kind', 'command', 'expiresInMs']);
  if (reply.kind !== 'command' || !deadline(reply.expiresInMs, 5000)) throw new DesktopError('INVALID_POLL_REPLY');
  return {kind: 'command', command: parseCommand(reply.command, generation), expiresInMs: reply.expiresInMs};
}
export function parseHandshake(value: unknown): Handshake {
  const reply = record(value);
  fields(reply, ['protocolVersion', 'generation']);
  if (reply.protocolVersion !== 1 || !positiveInteger(reply.generation)) throw new DesktopError('INVALID_HANDSHAKE');
  return {protocolVersion: 1, generation: reply.generation};
}
export function parseAck(value: unknown): void {
  const reply = record(value);
  fields(reply, ['kind']);
  if (reply.kind !== 'ack') throw new DesktopError('ACK_REJECTED');
}
