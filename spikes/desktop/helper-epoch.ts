/** Trusted helper only. Never imported by the GI/Qt adapter runtime graph. */
import { randomUUID } from 'node:crypto';
export function newCompanionInstance(): string { return randomUUID(); }
