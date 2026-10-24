import { expect, test } from 'vitest';
import { contactReferenceSchema, ContractError, parseContract, parseUrlReference, resourceReferenceSchema, urlReferenceSchema } from '../src/index.ts';
const schemes = new Set(['https:', 'http:', 'mailto:', 'tel:']);
test.each(['https://example.invalid/search?q=C%2B%2B%20%26%20caf%C3%A9', 'http://example.invalid/', 'mailto:synthetic@example.invalid?subject=Synthetic', 'tel:+12025550123'])('typed URL preserves encoded inert data %s', url => {
  const reference = { kind: 'url', url };
  expect(parseUrlReference(reference, schemes)).toEqual(reference);
  expect(parseContract(resourceReferenceSchema, reference)).toEqual(reference);
  expect(() => parseUrlReference(reference, new Set())).toThrow(ContractError);
});
test.each(['javascript:alert(1)', 'data:text/html,synthetic', 'file:///synthetic', 'custom:synthetic',
  'https://synthetic:synthetic@example.invalid', 'https:example.invalid', '/relative', ' https://example.invalid',
  'https://example.invalid/a\nb', 'mailto:', 'tel:'])('unsafe or ambiguous URL fails typed: %s', url => {
  expect(() => parseContract(urlReferenceSchema, { kind: 'url', url })).toThrow(ContractError);
});
test('contact references bind explicit opaque source and record identities, never infer authorization from text', () => {
  const contact = { kind: 'contact', sourceId: 'synthetic-address-book', contactId: 'synthetic-contact', displayName: 'Synthetic contact' };
  expect(parseContract(contactReferenceSchema, contact)).toEqual(contact);
  expect(parseContract(resourceReferenceSchema, contact)).toEqual(contact);
  for (const value of ['Synthetic contact', { kind: 'contact', displayName: 'Synthetic contact' },
    { ...contact, sourceId: '' }, { ...contact, contactId: '' }, { ...contact, granted: true }, { ...contact, email: 'synthetic@example.invalid' }]) {
    expect(() => parseContract(contactReferenceSchema, value)).toThrow(ContractError);
  }
});
test('resource reference discriminators are mandatory and extra execution/permission fields reject', () => {
  for (const value of ['https://example.invalid', { url: 'https://example.invalid' },
    { kind: 'url', url: 'https://example.invalid', open: true }, { kind: 'url', url: 'https://example.invalid', granted: true },
    { kind: 'url', url: 'https://example.invalid/' + 'x'.repeat(65536) }]) {
    expect(() => parseContract(resourceReferenceSchema, value)).toThrow(ContractError);
  }
});
