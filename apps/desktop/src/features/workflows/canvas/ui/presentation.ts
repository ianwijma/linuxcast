import type { GlyphCategory, LineIconName } from '@linuxcast/ui';
import type { WorkflowDefinition } from '@linuxcast/contracts';

/**
 * Presentation-only helpers for the Instrument workflow editor (docs/design/DESIGN.md "Workflows",
 * "States and motion"). They derive display text from the current draft and fixed controller copy;
 * they never change graph, storage, execution or permission semantics.
 */
type DraftNode = WorkflowDefinition['nodes'][number];

/** Closed glyph-tile vocabulary per current editor node type. Unknown types fall back to `system`. */
export function nodeTile(type: string): { category: GlyphCategory; icon?: LineIconName } {
  if (type === 'input.keyword') return { category: 'command', icon: 'search' };
  if (type === 'output.clipboard') return { category: 'clipboard' };
  return { category: 'system', icon: 'workflow' };
}

/** One bounded configuration line from the actual node configuration. Never executes or validates. */
export function configSummary(node: DraftNode): string {
  const config = node.config as Record<string, unknown>;
  if (node.type === 'input.keyword') {
    const keyword = typeof config.keyword === 'string' && config.keyword ? `“${config.keyword}”` : 'No keyword';
    const argument = config.argument === 'none' ? 'no argument' : config.argument === 'optional' ? 'optional text' : 'text required';
    return `${keyword} · ${argument}${config.trimQuery === true ? ' · trimmed' : ''}`;
  }
  if (node.type === 'utility.transform') return `${typeof config.operation === 'string' ? config.operation : 'No operation'}${typeof config.locale === 'string' && config.locale ? ` · ${config.locale}` : ''} · from input#/0`;
  if (node.type === 'output.clipboard') return 'Copy input#/0 · paste off · history excluded';
  return 'Not in the current editing palette';
}

/** Execution-order neutral flow description from actual edges: who feeds this node and where it goes. */
export function flowSummary(draft: WorkflowDefinition, node: DraftNode, hasInput: boolean): string {
  const name = (id: string) => { const match = draft.nodes.find(item => item.id === id); return match?.label || id; };
  const incoming = draft.edges.filter(edge => edge.to.nodeId === node.id).map(edge => name(edge.from.nodeId));
  const outgoing = draft.edges.filter(edge => edge.from.nodeId === node.id).map(edge => name(edge.to.nodeId));
  const input = !hasInput ? 'Starts the workflow' : incoming.length ? `in text from ${incoming.join(', ')}` : 'in text · not connected';
  const output = outgoing.length ? `out text to ${outgoing.join(', ')}` : 'out text · not connected';
  return `${input} · ${output}`;
}

/** Declared effects are descriptions only; a declaration never grants permission. */
export function declaredEffects(type: string): string {
  return type === 'output.clipboard' ? 'clipboard.write · declaration only, not a grant' : 'None';
}

/**
 * Fixed controller copy split into a plate title and body. The tone is derived from the exact fixed
 * strings: receipts follow an exact owner compare-and-set receipt; everything else stays unclassified
 * unless it is a validation/connection rejection produced by the real graph validator.
 */
export function splitMessage(message: string): { title: string; description: string } {
  const index = message.indexOf('. ');
  return index < 0 ? { title: message.replace(/\.$/, ''), description: '' } : { title: message.slice(0, index), description: message.slice(index + 2) };
}
const receipts = new Set(['Workflow saved.', 'Restored the last saved workflow.']);
export function isReceipt(message: string): boolean { return receipts.has(message); }
export function isValidationMessage(message: string): boolean { return message.startsWith('This graph is not valid.'); }
