import { parseAmount } from './engine.js';

function amountsIn(text) {
  const found = [];
  const pattern = /\d[\d\s.]*(?:,\d+)?/g;
  let match = pattern.exec(String(text || ''));
  while (match) {
    const number = parseAmount(match[0]);
    if (number != null) found.push(number);
    match = pattern.exec(String(text || ''));
  }
  return found;
}

export function sameAmount(text, amount) {
  const number = parseAmount(amount);
  if (number == null) return false;
  return amountsIn(text).some((value) => Math.abs(value - number) < 0.01);
}

export function vatPhrase(text) {
  const source = String(text || '');
  if (/inklusiv|inkl\.?\s*mva/i.test(source)) return 'inkl. mva';
  if (/eks\.?\s*mva|eksklusive/i.test(source)) return 'eks mva';
  return '';
}

/** Honorar-tekst som bare gjentar prisen, med eller uten «inklusiv», er ikke et eget felt. */
export function honorarPrice(draft, rate) {
  const amount = parseAmount(rate) ?? parseAmount(draft?.value) ?? parseAmount(draft?.lines?.[0]?.rate);
  const honorar = String(draft?.honorar || '').trim();
  const duplicate = !!(honorar && amount != null && sameAmount(honorar, amount));
  const phrase = vatPhrase(honorar) || (duplicate ? '' : 'eks mva');
  return {
    amount,
    description: duplicate ? '' : honorar,
    phrase,
    duplicate,
  };
}
