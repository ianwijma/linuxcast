import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { capabilities } from '../../src/contract.ts';

const source = readFileSync(new URL('./check.ts', import.meta.url), 'utf8');
const section = (start: string, end: string) => {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  if (begin < 0 || finish < 0) throw new Error('AT_SOURCE_BOUNDARY');
  return source.slice(begin, finish);
};
const argumentsAndPlan = section('const modeArguments =', '\ntype NativeSnapshot');
it('recognizes only the fixed fresh Orca heading focus-gained receipt', () => {
  const predicate = section('const hasHeadingFocusReceipt =', '\nconst startupCompleted');
  const hasReceipt = runInNewContext(`${stripTypeScriptTypes(predicate)}\nhasHeadingFocusReceipt`) as (text: string) => boolean;
  const marker = "11:00:00.000001 - EVENT MANAGER: object:state-changed:focused for [heading: 'Launcher capabilities'] in [public synthetic app] (1, 0, None)";
  expect(hasReceipt(marker)).toBe(true);
  expect(hasReceipt(marker.replace('[heading:', '[button:'))).toBe(false);
  expect(hasReceipt(marker.replace('(1, 0,', '(0, 0,'))).toBe(false);
  expect(hasReceipt(marker.replace('Launcher capabilities', 'Private synthetic canary'))).toBe(false);
  expect(hasReceipt("SPEECH OUTPUT: Launcher capabilities")).toBe(false);
  const prior = marker + '\n';
  expect(hasReceipt((prior + 'unrelated fresh line').slice(prior.length))).toBe(false);
});
const recordReceipt = "11:00:00.000001 - EVENT MANAGER: object:state-changed:focused for [toggle button: 'Record shortcut'] in [public synthetic app] (1, 0, None)";
const recordPredicate = section('const hasRecordFocusReceipt =', '\nconst startupCompleted');
const recordReceiptMatcher = () => runInNewContext(`${stripTypeScriptTypes(recordPredicate)}\nhasRecordFocusReceipt`) as (text: string) => boolean;
type HelpFocusEvent = { receiptObserved: boolean; queuedObserved: boolean; dequeuedObserved: boolean; processingCompletedObserved: boolean };
const noHelpEvent: HelpFocusEvent = { receiptObserved: false, queuedObserved: false, dequeuedObserved: false, processingCompletedObserved: false };
const fullHelpEvent: HelpFocusEvent = { receiptObserved: true, queuedObserved: true, dequeuedObserved: true, processingCompletedObserved: true };
const helpEventMatcher = () => runInNewContext(`${stripTypeScriptTypes(section('const observeHelpFocusEvent =', '\nconst startupCompleted'))}\nobserveHelpFocusEvent`) as (fresh: string) => HelpFocusEvent;
const helpDescriptor = "object:state-changed:focused for [button: 'View activation help'] in Linuxcast (Chromium 145.0) (1, 0, None)";
const helpReceipt = `11:00:00.000001 - EVENT MANAGER: ${helpDescriptor}`;
const helpQueued = `11:00:00.000002 - EVENT MANAGER: Queued ${helpDescriptor} priority: 3, counter: 7`;
const helpDequeued = `11:00:00.000003 - EVENT MANAGER: Dequeued ${helpDescriptor} priority: 3, counter: 7`;
const helpStart = 'vvvvv START PRIORITY-3 OBJECT EVENT OBJECT:STATE-CHANGED:FOCUSED (queue size: 2) vvvvv';
const helpFinish = '^^^^^ FINISHED PRIORITY-3 OBJECT EVENT OBJECT:STATE-CHANGED:FOCUSED ^^^^^';
const helpTotal = 'TOTAL PROCESSING TIME: 0.1234';
const helpFrame = [helpDequeued, '', helpStart, '11:00:00.000004 - public synthetic processing', helpTotal, helpFinish];
const helpEventLines = [helpReceipt,
  `11:00:00.000001 - EVENT MANAGER: Queueing ${helpDescriptor}`,
  `11:00:00.000001 - EVENT MANAGER: ${helpDescriptor} has priority level: 3`,
  helpQueued, `11:00:00.000003 - EVENT MANAGER: Dequeueing ${helpDescriptor}`, ...helpFrame];

it('observes the help event receipt, actual queue insertion, dequeue and completed frame in order', () => {
  const observe = helpEventMatcher();
  expect(observe(helpReceipt)).toEqual({ ...noHelpEvent, receiptObserved: true });
  expect(observe([helpReceipt, helpQueued].join('\n'))).toEqual({ ...noHelpEvent, receiptObserved: true, queuedObserved: true });
  expect(observe([helpReceipt, helpQueued, helpDequeued].join('\n'))).toEqual({ ...fullHelpEvent, processingCompletedObserved: false });
  expect(observe(helpEventLines.join('\n'))).toEqual(fullHelpEvent);
  const obsoleted = `11:00:00.000004 - EVENT MANAGER: ${helpDescriptor} obsoleted by ${helpDescriptor} more recent duplicate`;
  expect(observe([helpReceipt, helpQueued, helpDequeued, '', helpStart, obsoleted, helpTotal, helpFinish].join('\n'))).toEqual(fullHelpEvent);
  expect(observe(helpEventLines.map(line => line.replace(/^\d{2}:\d{2}:\d{2}\.\d{6} - /, '')).join('\n'))).toEqual(fullHelpEvent);
  expect(observe(helpEventLines.join('\n').replace('EVENT MANAGER: Queued', 'EVENT MANAGER: Queueing'))).toEqual({ ...noHelpEvent, receiptObserved: true });
});

it('rejects another help event role/name/type, focus loss and private targets', () => {
  const observe = helpEventMatcher();
  const full = helpEventLines.join('\n');
  for (const invalid of [
    full.replaceAll('[button:', '[toggle button:'), full.replaceAll('[button:', '[heading:'),
    full.replaceAll('View activation help', 'View activation help extra'), full.replaceAll('View activation help', 'PRIVATE_SEED'),
    full.replaceAll('state-changed:focused', 'state-changed:pressed'), full.replaceAll('(1, 0,', '(0, 0,'),
    full.replaceAll('(1, 0, None)', '(0, 0, fake (1, 0, None))'), full.replaceAll('(1, 0,', '(1, 1,'),
    full.split('\n').map(line => 'prefix ' + line).join('\n'),
  ]) expect(observe(invalid)).toEqual(noHelpEvent);
});

it('requires one matching descriptor across receipt, queue and dequeue', () => {
  const observe = helpEventMatcher();
  for (const changed of [helpQueued.replace('Linuxcast (', 'PRIVATE_APP ('), helpQueued.replace('None)', 'PRIVATE_DATA)')]) {
    expect(observe([helpReceipt, changed, ...helpFrame].join('\n'))).toEqual({ ...noHelpEvent, receiptObserved: true });
  }
  for (const changed of [helpDequeued.replace('Linuxcast (', 'Other ('), helpDequeued.replace('None)', 'Other)')]) {
    expect(observe([helpReceipt, helpQueued, changed, ...helpFrame.slice(1)].join('\n'))).toEqual({ ...noHelpEvent, receiptObserved: true, queuedObserved: true });
  }
});

it('rejects mismatched queue identity and reordered or absent receipt/queue/dequeue', () => {
  const observe = helpEventMatcher();
  for (const changed of [helpDequeued.replace('counter: 7', 'counter: 8'), helpDequeued.replace('priority: 3', 'priority: 4')]) {
    expect(observe([helpReceipt, helpQueued, changed, ...helpFrame.slice(1)].join('\n')).dequeuedObserved).toBe(false);
  }
  expect(observe([helpQueued, helpReceipt, ...helpFrame].join('\n')).queuedObserved).toBe(false);
  expect(observe([helpReceipt, helpDequeued, helpQueued, ...helpFrame.slice(1)].join('\n')).dequeuedObserved).toBe(false);
  expect(observe([helpQueued, ...helpFrame].join('\n'))).toEqual(noHelpEvent);
  expect(observe([helpReceipt, ...helpFrame].join('\n'))).toEqual({ ...noHelpEvent, receiptObserved: true });
  expect(observe([helpReceipt, helpQueued, ...helpFrame.slice(1)].join('\n')).dequeuedObserved).toBe(false);
});

it('does not skip duplicate or malformed target records to select a favorable sequence', () => {
  const observe = helpEventMatcher();
  for (const duplicate of [helpReceipt, helpReceipt.replace('(1, 0, None)', '(1, broken)')]) {
    expect(observe([duplicate, ...helpEventLines].join('\n'))).toEqual({ ...noHelpEvent, receiptObserved: true });
  }
  for (const duplicate of [helpQueued, helpQueued.replace('counter: 7', 'counter: invalid')]) {
    expect(observe([helpReceipt, duplicate, helpQueued, ...helpFrame].join('\n')).queuedObserved).toBe(false);
  }
  for (const duplicate of [helpDequeued, helpDequeued.replace('counter: 7', 'counter: invalid')]) {
    expect(observe([helpReceipt, helpQueued, duplicate, ...helpFrame].join('\n')).dequeuedObserved).toBe(false);
  }
});

it('requires the immediately associated source-defined start frame', () => {
  const observe = helpEventMatcher();
  for (const frame of [
    [helpDequeued, helpStart, helpTotal, helpFinish],
    [helpDequeued, '', 'unrelated intervening line', helpStart, helpTotal, helpFinish],
    [helpDequeued, '', helpStart.replace('PRIORITY-3', 'PRIORITY-4'), helpTotal, helpFinish],
    [helpDequeued, '', helpStart.replace('STATE-CHANGED:FOCUSED', 'STATE-CHANGED:SHOWING'), helpTotal, helpFinish],
    [helpDequeued, '', helpStart.replace('queue size: 2', 'queue size: invalid'), helpTotal, helpFinish],
  ]) expect(observe([helpReceipt, helpQueued, ...frame].join('\n'))).toEqual({ ...fullHelpEvent, processingCompletedObserved: false });
});

it('refuses nested, interleaved or malformed boundaries rather than borrowing a later finish', () => {
  const observe = helpEventMatcher();
  for (const boundary of [
    helpStart, 'vvvvv unsupported start', '^^^^^ malformed finish',
    '11:00:00.000004 - ' + helpStart, '11:00:00.000004 - ' + helpFinish,
    'TOTAL PROCESSING TIME: invalid', helpTotal, '11:00:00.000004 - ' + helpTotal,
    helpFinish.replace('PRIORITY-3', 'PRIORITY-4'), helpFinish.replace('STATE-CHANGED:FOCUSED', 'STATE-CHANGED:SHOWING'),
    helpDequeued.replace('View activation help', 'PRIVATE_SEED'),
    helpDequeued.replace('Dequeued', 'Dequeueing').replace('View activation help', 'PRIVATE_SEED'),
  ]) expect(observe([helpReceipt, helpQueued, helpDequeued, '', helpStart, boundary, helpTotal, helpFinish].join('\n')).processingCompletedObserved).toBe(false);
});

it('requires the complete processing-time and finish lines without granting presentation success', () => {
  const observe = helpEventMatcher();
  for (const ending of [[], [helpTotal], [helpFinish], ['TOTAL PROCESSING TIME: invalid', helpFinish], [helpTotal, helpFinish + ' trailing']]) {
    expect(observe([helpReceipt, helpQueued, helpDequeued, '', helpStart, ...ending].join('\n'))).toEqual({ ...fullHelpEvent, processingCompletedObserved: false });
  }
  const prior = helpEventLines.join('\n') + '\n';
  expect(observe((prior + 'unrelated fresh line').slice(prior.length))).toEqual(noHelpEvent);
  expect(observe([helpReceipt, helpQueued, helpDequeued, '', helpStart, 'SPEECH OUTPUT: View activation help'].join('\n')).processingCompletedObserved).toBe(false);
});

for (const scenario of ['fresh', 'absent', 'stale', 'events-only', 'missing-attempt', 'other-control', 'later-ambiguity']) {
  it(`keeps help-event observations outside the unchanged fresh presentation predicate: ${scenario}`, async () => {
    const label = scenario === 'other-control' ? 'Search commands' : 'View activation help';
    const prior = helpEventLines.join('\n') + '\nPRIVATE_SEED\n';
    let poll = 0;
    const context = {
      label, helpFocusEvent: { ...noHelpEvent }, recordFocusEventReceiptObserved: false, headingFocusEventReceiptObserved: false,
      nativeFocusCheck: async () => prior.length,
      log: () => prior + [
        !['absent', 'stale'].includes(scenario) ? helpEventLines.join('\n') : '',
        scenario === 'later-ambiguity' && poll > 1 ? helpReceipt : '',
        scenario !== 'events-only' && !(scenario === 'later-ambiguity' && poll === 1) ? `SPEECH OUTPUT: '${label}'` : '',
        !['events-only', 'missing-attempt'].includes(scenario) ? `SPEECH DISPATCHER: Speaking '${label}'` : '',
      ].join('\n'),
      observeHelpFocusEvent: helpEventMatcher(), hasRecordFocusReceipt: () => false, hasHeadingFocusReceipt: () => false,
      hasLabel: (text: string, marker: string, name: string) => text.split('\n').some(line => line.includes(marker) && line.includes(name)),
      presentations: [], orcaExited: false, capture: async () => undefined,
      expect: { poll: (predicate: () => boolean, options: { timeout: number }) => ({ toBe: async (value: boolean) => {
        expect(options.timeout).toBe(10_000);
        poll += 1;
        if (scenario === 'later-ambiguity') { expect(predicate()).toBe(false); poll += 1; }
        if (predicate() !== value) throw new Error('PRESENTATION_INCOMPLETE');
      } }) },
    };
    const focus = section('  const focusCheck =', '\n  const readActivationHelp');
    const execution = runInNewContext(`(async () => { ${stripTypeScriptTypes(focus)}\nawait focusCheck(label, 'button', {}, 'Tab'); })()`, context);
    if (['events-only', 'missing-attempt'].includes(scenario)) await expect(execution).rejects.toThrow('PRESENTATION_INCOMPLETE');
    else await execution;
    expect(context.helpFocusEvent).toEqual(['absent', 'stale', 'other-control'].includes(scenario) ? noHelpEvent
      : scenario === 'later-ambiguity' ? { ...noHelpEvent, receiptObserved: true } : fullHelpEvent);
  });
}

it('recognizes only the fixed Record toggle-button focus gain, never another role/name or loss', () => {
  const hasReceipt = recordReceiptMatcher();
  expect(hasReceipt(recordReceipt)).toBe(true);
  expect(hasReceipt(recordReceipt.replace(/^.*? - /, ''))).toBe(true);
  for (const line of [
    recordReceipt.replace('(1, 0,', '(0, 0,'),
    recordReceipt.replace('[toggle button:', '[button:'),
    recordReceipt.replace('[toggle button:', '[heading:'),
    recordReceipt.replace('Record shortcut', 'Record shortcut extra'),
    recordReceipt.replace('Record shortcut', 'PRIVATE_SEED'),
    recordReceipt.replace('state-changed:focused', 'state-changed:pressed'),
    'prefix ' + recordReceipt,
    "SPEECH OUTPUT: 'Record shortcut'",
  ]) expect(hasReceipt(line)).toBe(false);
  const prior = recordReceipt + '\n';
  expect(hasReceipt((prior + 'unrelated fresh line').slice(prior.length))).toBe(false);
});

for (const scenario of ['fresh', 'absent', 'stale', 'receipt-only', 'missing-attempt', 'other-control']) {
  it(`actual focus path keeps Record receipt observational and uses its existing fresh offset: ${scenario}`, async () => {
    const label = scenario === 'other-control' ? 'Search commands' : 'Record shortcut';
    const prior = recordReceipt + '\nPRIVATE_SEED\n';
    const fresh = [
      !['absent', 'stale'].includes(scenario) ? recordReceipt : '',
      scenario !== 'receipt-only' ? `SPEECH OUTPUT: '${label}'` : '',
      !['receipt-only', 'missing-attempt'].includes(scenario) ? `SPEECH DISPATCHER: Speaking '${label}'` : '',
    ].join('\n');
    const context = {
      label, recordFocusEventReceiptObserved: false, headingFocusEventReceiptObserved: false,
      nativeFocusCheck: async () => prior.length, log: () => prior + fresh,
      hasRecordFocusReceipt: recordReceiptMatcher(),
      hasHeadingFocusReceipt: () => false,
      hasLabel: (text: string, marker: string, name: string) => text.split('\n').some(line => line.includes(marker) && line.includes(name)),
      presentations: [], orcaExited: false, capture: async () => undefined,
      expect: { poll: (predicate: () => boolean, options: { timeout: number }) => ({ toBe: async (value: boolean) => {
        expect(options.timeout).toBe(10_000);
        if (predicate() !== value) throw new Error('PRESENTATION_INCOMPLETE');
      } }) },
    };
    const focus = section('  const focusCheck =', '\n  const readActivationHelp');
    const execution = runInNewContext(`(async () => { ${stripTypeScriptTypes(focus)}\nawait focusCheck(label, 'toggle-button', {}, 'Tab'); })()`, context);
    if (['receipt-only', 'missing-attempt'].includes(scenario)) await expect(execution).rejects.toThrow('PRESENTATION_INCOMPLETE');
    else await execution;
    expect(context.recordFocusEventReceiptObserved).toBe(['fresh', 'receipt-only', 'missing-attempt'].includes(scenario));
  });
}

it('exports only the fixed Record receipt boolean in both existing Orca report paths', () => {
  for (const status of ['passed-generated-presentation', 'incomplete']) {
    const report = section(`  writeFileSync(join(evidence, 'orca.json'), JSON.stringify({ status: '${status}'`, '\n  writeFileSync');
    let serialized = '';
    runInNewContext(report, {
      writeFileSync: (_path: string, data: string) => { serialized = data; }, join: () => 'orca.json', evidence: '',
      stage: 'focus:Record shortcut', mode: 'default-nine', expectedCheckpoints: [], skippedLegacyCheckpoints: [], expectedPresentationCheckpoints: [],
      helpReading: {}, headingFocusEventReceiptObserved: false, recordFocusEventReceiptObserved: true,
      helpFocusEvent: helpEventMatcher()(helpEventLines.join('\n').replaceAll('None)', 'PRIVATE_SEED)')),
      orcaVersion: '48.1', startupCompleted: () => true, anchors: [], presentations: [],
      log: () => 'PRIVATE_SEED', hasLabel: () => false,
    });
    const value = JSON.parse(serialized) as Record<string, unknown>;
    expect(value.recordFocusEventReceiptObserved).toBe(true);
    expect(value.helpFocusEvent).toEqual(fullHelpEvent);
    expect(Object.keys(value.helpFocusEvent as Record<string, unknown>)).toEqual(Object.keys(noHelpEvent));
    expect(Object.values(value.helpFocusEvent as Record<string, unknown>).every(item => typeof item === 'boolean')).toBe(true);
    expect(Object.keys(value).filter(key => key.startsWith('record'))).toEqual(['recordFocusEventReceiptObserved']);
    expect(serialized).not.toContain('PRIVATE_SEED');
    expect(serialized).not.toContain('EVENT MANAGER:');
    expect(serialized).not.toContain('counter:');
    expect(serialized).not.toContain('Linuxcast (Chromium');
  }
});

for (const name of ['check.ts', 'xvfb-orca.ts', 'private-session.ts']) {
  it(`${name} permits only default or the fixed help flag before effects`, () => {
    const text = readFileSync(new URL(name, import.meta.url), 'utf8');
    const start = text.indexOf('const modeArguments =');
    const end = text.indexOf('\n', text.indexOf("throw new Error('Unsupported AT mode');", start));
    const guard = text.slice(start, end);
    for (const args of [[], ['--activation-help-only']]) expect(() => runInNewContext(guard, { process: { argv: ['node', 'checker', ...args] } })).not.toThrow();
    for (const args of [['--other'], ['--activation-help-only', '--activation-help-only'], ['--activation-help-only', 'private-seed']]) {
      expect(() => runInNewContext(guard, { process: { argv: ['node', 'checker', ...args] } })).toThrow('Unsupported AT mode');
    }
  });
}
for (const helpOnly of [false, true]) {
  it(`executes the actual checkpoint routing for ${helpOnly ? 'four help' : 'default nine'} checks`, async () => {
    const calls: string[] = [];
    const readingOrder: string[] = [];
    const legacy = section('  if (!activationHelpOnly) {', '  // Public synthetic activation state');
    const help = section("  await focusCheck('View activation help'", "  stage = 'complete';");
    const locator = { focus: async () => undefined, getByRole: () => locator };
    const context = {
      process: { argv: ['node', 'checker', ...(helpOnly ? ['--activation-help-only'] : [])] },
      page: { evaluate: async () => undefined, getByRole: () => locator },
      window: { linuxcast: { setAppearance: () => undefined } },
      expect: () => ({ toBeVisible: async () => undefined, toBeFocused: async () => undefined }),
      settleDismissAnchor: async () => undefined,
      focusCheck: async (label: string) => { calls.push(label); readingOrder.push(`focus:${label}`); },
      nativeFocusCheck: async (label: string) => { calls.push(label); readingOrder.push(`native:${label}`); },
      readActivationHelp: async () => { readingOrder.push('read'); },
      capture: async () => undefined,
      nativeKey: () => undefined,
      stage: '',
    };
    const plan = await runInNewContext(`(async () => { ${argumentsAndPlan}\n${legacy}\n${help}\nreturn { mode, expectedCheckpoints, skippedLegacyCheckpoints }; })()`, context) as { mode: string; expectedCheckpoints: string[]; skippedLegacyCheckpoints: string[] };
    expect(calls).toEqual(plan.expectedCheckpoints);
    expect(readingOrder.slice(-3)).toEqual(['native:Launcher capability details', 'read', 'focus:Search commands']);
    expect(calls).toEqual(helpOnly
      ? ['View activation help', 'Launcher capabilities', 'Launcher capability details', 'Search commands']
      : ['Search commands', 'Hide launcher', 'Actions Ctrl K', 'Record shortcut', 'Cancel shortcut change', 'View activation help', 'Launcher capabilities', 'Launcher capability details', 'Search commands']);
    expect(plan.skippedLegacyCheckpoints).toEqual(helpOnly ? ['Search commands', 'Hide launcher', 'Actions Ctrl K', 'Record shortcut', 'Cancel shortcut change'] : []);
    expect(plan.mode).toBe(helpOnly ? 'activation-help-only' : 'default-nine');
  });
}

const readingDefinitions = section('const helpSentences =', '\nconst anchors:');
const readingHelpers = () => runInNewContext(`${stripTypeScriptTypes(readingDefinitions)}\n({ helpSentences, helpReading, helpReadingObservation, verifyDesktopReadingSettings })`) as {
  helpSentences: string[];
  helpReadingObservation: (text: string, sentence: string) => { generated: boolean; delivered: boolean };
  verifyDesktopReadingSettings: (configuration: unknown) => boolean;
};
const requestLine = "11:00:00.000000 - DEFAULT: SayAll requested starting from [landmark: 'Launcher capability details']";
const completeLine = '11:00:00.999999 - WEB: textLines complete. Verifying SayAll status';
const generatedLine = (sentence: string) => `11:00:00.000001 - WEB SAY ALL: <Atspi.Accessible object at 0x1 (AtspiAccessible at 0x2)> '${sentence}' (0-80, current: 0)`;
const deliveredLine = (sentence: string) => `11:00:00.000002 - SPEECH DISPATCHER: Speaking '<speak><mark name="0:9"/>${sentence.replaceAll(' ', ' <mark name="10:20"/>')}</speak>' `;

it('requires the entire fixed reason and both remediation sentences from the actual help copy', () => {
  const { helpSentences } = readingHelpers();
  const activation = capabilities('x11', false, true)[0]!;
  expect(helpSentences).toHaveLength(3);
  expect(helpSentences[0]).toBe(activation.reason);
  expect(helpSentences.slice(1).join(' ')).toBe(activation.remediation);
});

it('requires ordered request, complete generated utterance, marked dispatch attempt and completion', () => {
  const { helpSentences, helpReadingObservation: observe } = readingHelpers();
  for (const sentence of helpSentences) {
    const generation = generatedLine(sentence);
    const attempt = deliveredLine(sentence);
    const full = [requestLine, generation, attempt, completeLine].join('\n');
    expect(observe(full, sentence)).toEqual({ generated: true, delivered: true });
    expect(observe([requestLine, generation, attempt].join('\n'), sentence)).toEqual({ generated: true, delivered: false });
    expect(observe([requestLine, generation, completeLine].join('\n'), sentence)).toEqual({ generated: true, delivered: false });
    expect(observe([requestLine, attempt, completeLine].join('\n'), sentence)).toEqual({ generated: false, delivered: false });
    expect(observe([requestLine, completeLine, generation, attempt].join('\n'), sentence).delivered).toBe(false);
    expect(observe([requestLine, attempt, generation, completeLine].join('\n'), sentence).delivered).toBe(false);
    expect(observe([generation, requestLine, attempt, completeLine].join('\n'), sentence).delivered).toBe(false);
    expect(observe(full + '\n' + requestLine, sentence)).toEqual({ generated: false, delivered: false });
    expect(observe(completeLine, sentence)).toEqual({ generated: false, delivered: false });
    expect(observe(`${requestLine}\nWEB SAY ALL CONTENT: ${sentence}\nSPEECH OUTPUT: '${sentence}'\n${completeLine}`, sentence)).toEqual({ generated: false, delivered: false });
    expect(observe(full.replaceAll(sentence, sentence.slice(0, -2)), sentence).generated).toBe(false);
    expect(observe(full.replace('<mark name="0:9"/>', '<unknown/>'), sentence).delivered).toBe(false);
    expect(observe(full.replaceAll(sentence, 'PRIVATE_SEED'), sentence).generated).toBe(false);
  }
});

for (const boundary of [generatedLine("The next context's unrelated content."), generatedLine(''), generatedLine('Other content.').replace('(0-80, current: 0)', '(-1--1, current: -1)'), completeLine]) {
  it(`binds the exact dispatch attempt to its own yielded context before ${boundary}`, () => {
    const { helpSentences, helpReadingObservation: observe } = readingHelpers();
    for (const sentence of helpSentences) {
      const generation = generatedLine(sentence);
      const attempt = deliveredLine(sentence);
      expect(observe([requestLine, generation, attempt, boundary].join('\n'), sentence)).toEqual({ generated: true, delivered: true });
      // A later matching dispatch must not be assigned to an earlier context,
      // even when a later exhaustion marker would satisfy the old predicate.
      expect(observe([requestLine, generation, boundary, attempt, completeLine].join('\n'), sentence)).toEqual({ generated: true, delivered: false });
      expect(observe([requestLine, generation, deliveredLine('Other content.'), boundary].join('\n'), sentence)).toEqual({ generated: true, delivered: false });
    }
  });
}

it('does not treat inspection text, ordinary speech or malformed contexts as iterator advancement', () => {
  const { helpSentences, helpReadingObservation: observe } = readingHelpers();
  const sentence = helpSentences[0]!;
  for (const falseBoundary of [
    'WEB SAY ALL CONTENT: Other content.',
    "SPEECH OUTPUT: 'Other content.'",
    deliveredLine('Other content.'),
    generatedLine('Other content.').replace('current: 0)', 'current: invalid)'),
    'prefix ' + generatedLine('Other content.'),
    completeLine + ' trailing content',
  ]) {
    expect(observe([requestLine, generatedLine(sentence), deliveredLine(sentence), falseBoundary].join('\n'), sentence)).toEqual({ generated: true, delivered: false });
  }
});

it('rejects generated utterance suffixes and ambiguous quoted object fields', () => {
  const { helpSentences, helpReadingObservation: observe } = readingHelpers();
  for (const sentence of helpSentences) {
    for (const generation of [
      generatedLine(`Unrelated prefix '${sentence}`),
      generatedLine(`Unrelated prefix ${sentence}`),
      generatedLine(sentence).replace('<Atspi.Accessible object at 0x1 (AtspiAccessible at 0x2)>', "[paragraph: 'ambiguous name']"),
    ]) {
      expect(observe([requestLine, generation, deliveredLine(sentence), completeLine].join('\n'), sentence)).toEqual({ generated: false, delivered: false });
    }
  }
});

it('fails closed at an unrecognized next context instead of skipping to a later attempt', () => {
  const { helpSentences, helpReadingObservation: observe } = readingHelpers();
  const sentence = helpSentences[0]!;
  for (const boundary of [
    generatedLine('Other content.').replace('current: 0)', 'current: invalid)'),
    generatedLine('Other\nmultiline content.'),
    completeLine + ' trailing content',
  ]) {
    for (const lines of [
      [requestLine, generatedLine(sentence), boundary, deliveredLine(sentence), completeLine],
      [requestLine, generatedLine(sentence), deliveredLine(sentence), boundary, completeLine],
    ]) expect(observe(lines.join('\n'), sentence)).toEqual({ generated: true, delivered: false });
  }
});

it('accepts only a fresh default Desktop configuration without binding or pronunciation overrides', () => {
  const { verifyDesktopReadingSettings: verify } = readingHelpers();
  const configuration = { general: { keyboardLayout: 1, sayAllStyle: 1, startingProfile: ['Default', 'default'] },
    profiles: { default: { keybindings: {}, pronunciations: {} } }, keybindings: {}, pronunciations: {} };
  expect(verify(configuration)).toBe(true);
  expect(verify({ ...configuration, general: { ...configuration.general, keyboardLayout: 2 } })).toBe(false);
  expect(verify({ ...configuration, profiles: { default: { keyboardLayout: 2, keybindings: {}, pronunciations: {} } } })).toBe(false);
  expect(verify({ ...configuration, keybindings: { sayAllHandler: ['other'] } })).toBe(false);
  expect(verify({ ...configuration, pronunciations: { PRIVATE_SEED: 'other' } })).toBe(false);
  expect(verify({ ...configuration, general: { ...configuration.general, sayAllStyle: 0 } })).toBe(false);
  expect(verify({ ...configuration, profiles: { default: { sayAllStyle: 0, keybindings: {}, pronunciations: {} } } })).toBe(false);
  expect(verify(null)).toBe(false);
});

for (const scenario of ['fresh-complete', 'next-context', 'stale', 'missing-reason', 'missing-remediation', 'missing-delivery', 'late-attempt', 'attempt-only', 'terminal-before-final', 'second-request', 'orca-exited']) {
  it(`actual reading path retains one KP_Add and strict fresh all-sentence checks: ${scenario}`, async () => {
    const { helpSentences } = readingHelpers();
    const full = requestLine + '\n' + helpSentences.map(sentence => generatedLine(sentence) + '\n' + deliveredLine(sentence)).join('\n') + '\n' + completeLine + '\n';
    let debug = full; // Everything before the command must be excluded.
    const keys: string[] = [];
    const read = section('  const readActivationHelp =', '\n  if (!activationHelpOnly)');
    const context = {
      log: () => debug,
      nativeKey: (key: string) => {
        keys.push(key);
        if (scenario === 'stale') return;
        const sentences = scenario === 'missing-reason' ? helpSentences.slice(1)
          : scenario === 'missing-remediation' ? helpSentences.slice(0, 2) : helpSentences;
        debug += requestLine + '\n' + sentences.map((sentence, index) => (scenario === 'terminal-before-final' && index === 2 ? completeLine + '\n' : '') + generatedLine(sentence)
          + (scenario === 'late-attempt' && index === 1 ? '\n' + generatedLine('Other content.') : '')
          + (scenario === 'missing-delivery' ? '' : '\n' + deliveredLine(sentence))).join('\n');
        if (scenario === 'next-context') debug += '\n' + generatedLine('Later document content that has not finished.');
        else if (!['attempt-only', 'terminal-before-final'].includes(scenario)) debug += '\n' + completeLine;
        if (scenario === 'second-request') debug += '\n' + requestLine;
      },
      orcaExited: scenario === 'orca-exited', stage: '',
      expect: { poll: (predicate: () => boolean, options: { timeout: number }) => ({ toBe: async (value: boolean) => {
        expect(options.timeout).toBe(10_000);
        if (predicate() !== value) throw new Error('READING_INCOMPLETE');
      } }) },
    };
    const execution = runInNewContext(`(async () => { ${stripTypeScriptTypes(readingDefinitions)}\n${stripTypeScriptTypes(read)}\nawait readActivationHelp(); return helpReading; })()`, context);
    if (['fresh-complete', 'next-context'].includes(scenario)) {
      const result = await execution;
      expect(result.requested).toBe(true);
      expect(result.sentences.every((item: { generatedAfterCommand: boolean; deliveredToSpeechDispatcher: boolean }) => item.generatedAfterCommand && item.deliveredToSpeechDispatcher)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(helpSentences[0]);
    } else await expect(execution).rejects.toThrow('READING_INCOMPLETE');
    expect(keys).toEqual(['KP_Add']);
  });
}
