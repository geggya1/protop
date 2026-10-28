import assert from 'node:assert/strict';
import test from 'node:test';
import { sameExceptSpace, sameOrCleared, shownText, squashSpace } from './typedText.js';

test('mellomrom og linjeskift står mens man skriver selv om verdien trimmes', () => {
  assert.equal(shownText('Prosjekt- ', 'Prosjekt-'), 'Prosjekt- ');
  assert.equal(shownText('Linje 1\n', 'Linje 1'), 'Linje 1\n');
  assert.equal(shownText('Ærlighet\n\nRespekt', 'Ærlighet\nRespekt'), 'Ærlighet\n\nRespekt');
});

test('utenfor feltet eller ved annen endring vises verdien', () => {
  assert.equal(shownText(null, 'Prosjekt-'), 'Prosjekt-');
  assert.equal(shownText('Ola@Firma.no', 'ola@firma.no'), 'ola@firma.no');
  assert.equal(shownText('gammel ', 'ny verdi'), 'ny verdi');
  assert.equal(shownText(null, null), '');
});

test('tømt felt viser verdien, med mindre feltet faller tilbake til en standardtekst', () => {
  assert.equal(shownText('', 'Valgt i listen'), 'Valgt i listen');
  assert.equal(sameExceptSpace('', 'Meg'), false);
  assert.equal(shownText('', 'Andre forelder', sameOrCleared), '');
  assert.equal(sameOrCleared('  ', 'Meg'), true);
  assert.equal(shownText('Bestemor ', 'Bestemor', sameOrCleared), 'Bestemor ');
});

test('egen sammenligning, for eksempel kommaliste', () => {
  const parse = (value) => String(value).split(',').map((row) => row.trim()).filter(Boolean).join(', ');
  const same = (typed, stored) => parse(typed) === stored;
  assert.equal(shownText('J,', 'J', same), 'J,');
  assert.equal(shownText('J, N', 'J, N', same), 'J, N');
  assert.equal(squashSpace(' a \n b '), 'a b');
});
