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
      orcaVersion: '48.1', startupCompleted: () => true, anchors: [], presentations: [],
      log: () => 'PRIVATE_SEED', hasLabel: () => false,
    });
    const value = JSON.parse(serialized) as Record<string, unknown>;
    expect(value.recordFocusEventReceiptObserved).toBe(true);
    expect(Object.keys(value).filter(key => key.startsWith('record'))).toEqual(['recordFocusEventReceiptObserved']);
    expect(serialized).not.toContain('PRIVATE_SEED');
    expect(serialized).not.toContain('EVENT MANAGER:');
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
