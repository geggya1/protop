import assert from 'node:assert/strict';
import test from 'node:test';
import {
  continueList, newsPlainText, parseNewsBody, parseNewsInline, toggleBlock, toggleInline,
} from './newsFormat.js';

test('inline: fet, kursiv, understrek og kombinasjoner', () => {
  assert.deepEqual(parseNewsInline('Vi **satser** på _folk_ og __kvalitet__.'), [
    { text: 'Vi ' }, { text: 'satser', bold: true }, { text: ' på ' }, { text: 'folk', italic: true },
    { text: ' og ' }, { text: 'kvalitet', underline: true }, { text: '.' },
  ]);
  assert.deepEqual(parseNewsInline('***begge***'), [{ text: 'begge', bold: true, italic: true }]);
  assert.deepEqual(parseNewsInline('*a **b** c*'), [
    { text: 'a ', italic: true }, { text: 'b', italic: true, bold: true }, { text: ' c', italic: true },
  ]);
  // Ikke formatering: regnestykker, snake_case og escapede tegn.
  assert.deepEqual(parseNewsInline('2 * 3 * 4'), [{ text: '2 * 3 * 4' }]);
  assert.deepEqual(parseNewsInline('fil_navn_her.pdf'), [{ text: 'fil_navn_her.pdf' }]);
  assert.deepEqual(parseNewsInline('\\*\\*ikke fet\\*\\*'), [{ text: '**ikke fet**' }]);
  assert.deepEqual(parseNewsInline('** ikke**'), [{ text: '** ikke**' }]);
});

test('blokker: underoverskrift, avsnitt med linjeskift og lister', () => {
  const blocks = parseNewsBody([
    '## Mer tid til det som skaper verdi',
    'Første linje',
    'andre linje',
    '',
    '- **Prosjektstyring:** Oversikt',
    '- Personal og HR',
    '1. Én',
    '2. To',
  ].join('\n'));
  assert.deepEqual(blocks.map((b) => b.type), ['h', 'p', 'list', 'list']);
  assert.deepEqual(blocks[0].inline, [{ text: 'Mer tid til det som skaper verdi' }]);
  assert.deepEqual(blocks[1].inline, [{ text: 'Første linje' }, { text: '\n' }, { text: 'andre linje' }]);
  assert.equal(blocks[2].ordered, false);
  assert.deepEqual(blocks[2].items[0].inline, [{ text: 'Prosjektstyring:', bold: true }, { text: ' Oversikt' }]);
  assert.equal(blocks[3].ordered, true);
  assert.deepEqual(blocks[3].items.map((i) => i.number), [1, 2]);
  // **Fet linje** alene er ikke en liste.
  assert.deepEqual(parseNewsBody('**Én plattform.**').map((b) => b.type), ['p']);
  assert.deepEqual(parseNewsBody(''), []);
});

test('ren tekst uten markering til utdrag og varsler', () => {
  assert.equal(
    newsPlainText('## Nytt\n**Vi** har _flyttet_.\n\n- __Ny__ adresse\n- Nytt nummer'),
    'Nytt\n\nVi har flyttet.\n\n• Ny adresse\n• Nytt nummer',
  );
  assert.equal(newsPlainText('Bare tekst'), 'Bare tekst');
});

test('fet av og på for utvalget', () => {
  const on = toggleInline('Vi satser nå', 3, 9, 'bold');
  assert.deepEqual(on, { text: 'Vi **satser** nå', start: 5, end: 11 });
  assert.deepEqual(toggleInline(on.text, on.start, on.end, 'bold'), { text: 'Vi satser nå', start: 3, end: 9 });
  // Utvalg som tar med stjernene, fjerner dem også.
  assert.deepEqual(toggleInline('Vi **satser** nå', 3, 13, 'bold'), { text: 'Vi satser nå', start: 3, end: 9 });
  // Mellomrom i kanten (dobbeltklikk i Windows) havner utenfor stjernene.
  assert.equal(toggleInline('Vi satser nå', 3, 10, 'bold').text, 'Vi **satser** nå');
});

test('kursiv og fet kan kombineres og fjernes hver for seg', () => {
  const bold = toggleInline('ord', 0, 3, 'bold');
  const both = toggleInline(bold.text, bold.start, bold.end, 'italic');
  assert.equal(both.text, '***ord***');
  assert.deepEqual(parseNewsInline(both.text), [{ text: 'ord', bold: true, italic: true }]);
  const italicOnly = toggleInline(both.text, both.start, both.end, 'bold');
  assert.equal(italicOnly.text, '*ord*');
  assert.equal(toggleInline(italicOnly.text, italicOnly.start, italicOnly.end, 'italic').text, 'ord');
  // Kursiv skrevet med _ slås også av.
  assert.equal(toggleInline('_ord_', 1, 4, 'italic').text, 'ord');
});

test('understrek', () => {
  const on = toggleInline('Les dette', 4, 9, 'underline');
  assert.equal(on.text, 'Les __dette__');
  assert.deepEqual(parseNewsInline(on.text)[1], { text: 'dette', underline: true });
  assert.equal(toggleInline(on.text, on.start, on.end, 'underline').text, 'Les dette');
});

test('uten utvalg: ordet markøren står i, eller en plassholder', () => {
  assert.deepEqual(toggleInline('Vi satser nå', 5, 5, 'bold'), { text: 'Vi **satser** nå', start: 5, end: 11 });
  assert.equal(toggleInline('Vi **satser** nå', 7, 7, 'bold').text, 'Vi satser nå');
  const ins = toggleInline('Hei ', 4, 4, 'bold');
  assert.equal(ins.text, 'Hei **fet tekst**');
  assert.equal(ins.text.slice(ins.start, ins.end), 'fet tekst');
});

test('utvalg over flere linjer merker hver linje og hopper over listetegn', () => {
  const src = '- Én\n- To';
  const out = toggleInline(src, 0, src.length, 'bold');
  assert.equal(out.text, '- **Én**\n- **To**');
  assert.equal(toggleInline(out.text, out.start, out.end, 'bold').text, src);
});

test('underoverskrift og lister av og på', () => {
  const h = toggleBlock('Intro\nOverskrift\nTekst', 8, 8, 'heading');
  assert.equal(h.text, 'Intro\n## Overskrift\nTekst');
  assert.equal(h.start, 11);
  assert.equal(toggleBlock(h.text, h.start, h.end, 'heading').text, 'Intro\nOverskrift\nTekst');

  const list = toggleBlock('Én\nTo\n\nTre', 0, 10, 'bullet');
  assert.equal(list.text, '- Én\n- To\n\n- Tre');
  assert.equal(toggleBlock(list.text, list.start, list.end, 'bullet').text, 'Én\nTo\n\nTre');

  // Punktliste blir nummerert, og nummereringen fortsetter etter linjen over.
  assert.equal(toggleBlock('- Én\n- To', 0, 9, 'number').text, '1. Én\n2. To');
  assert.equal(toggleBlock('1. Én\nTo', 7, 7, 'number').text, '1. Én\n2. To');
  // Tom linje får tegnet, så man kan begynne å skrive.
  assert.deepEqual(toggleBlock('Tekst\n', 6, 6, 'bullet'), { text: 'Tekst\n- ', start: 8, end: 8 });
  // Utvalg som slutter rett etter et linjeskift, tar ikke med neste linje.
  assert.equal(toggleBlock('Én\nTo', 0, 3, 'bullet').text, '- Én\nTo');
});

test('Enter i en liste fortsetter listen, Enter på tomt punkt avslutter den', () => {
  assert.deepEqual(continueList('- Én', '- Én\n'), { text: '- Én\n- ', caret: 7 });
  assert.deepEqual(continueList('3. Tre', '3. Tre\n'), { text: '3. Tre\n4. ', caret: 10 });
  assert.deepEqual(continueList('- Én\n- ', '- Én\n- \n'), { text: '- Én\n', caret: 5 });
  assert.equal(continueList('Vanlig', 'Vanlig\n'), null);
  assert.equal(continueList('- Én', '- Én!'), null);
  assert.equal(continueList('-', '-\n'), null);
});
