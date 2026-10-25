import assert from 'node:assert/strict';
import { ASSISTANT_TASKS, getTask } from './assistantTasks.js';
import { PROTOP_PAGES } from './protopPages.js';
import { answerQuestion } from './assistantEngine.js';

const ids = new Set();
for (const tk of ASSISTANT_TASKS) {
  assert.ok(/^task\.[a-zA-Z]+$/.test(tk.id), `${tk.id}: id`);
  assert.ok(!ids.has(tk.id), `${tk.id}: dobbel id`);
  ids.add(tk.id);
  for (const lang of ['nb', 'en']) {
    assert.ok(tk.q?.[lang], `${tk.id}: spørsmål (${lang})`);
    assert.ok(tk.title?.[lang], `${tk.id}: tittel (${lang})`);
    assert.ok(tk.intro?.[lang], `${tk.id}: svar (${lang})`);
    assert.ok(tk.ask?.[lang]?.length, `${tk.id}: formuleringer (${lang})`);
  }
  assert.ok(tk.steps.length >= 2, `${tk.id}: minst to steg`);
  for (const st of tk.steps) {
    assert.ok(st.title?.nb && st.title?.en && st.nb && st.en, `${tk.id}: steg mangler tekst`);
    const ref = st.access;
    if (ref?.page) {
      assert.ok(PROTOP_PAGES[ref.page], `${tk.id}: ukjent side ${ref.page}`);
      assert.ok(ref.index < PROTOP_PAGES[ref.page].steps.length, `${tk.id}: ${ref.page} har ikke steg ${ref.index + 1}`);
    }
  }
  // «Vis meg» peker på et steg som finnes.
  assert.ok(tk.show.length, `${tk.id}: «Vis meg» mangler`);
  for (const sh of tk.show) {
    assert.ok(PROTOP_PAGES[sh.page], `${tk.id}: ukjent side ${sh.page}`);
    assert.ok(sh.step < PROTOP_PAGES[sh.page].steps.length, `${tk.id}: ${sh.page} har ikke steg ${sh.step + 1}`);
  }
}
for (const tk of ASSISTANT_TASKS) {
  for (const id of tk.related) assert.ok(getTask(id), `${tk.id}: ukjent relatert oppgave ${id}`);
}

// Hver oppgaves eget spørsmål treffer oppgaven — på norsk og engelsk.
for (const tk of ASSISTANT_TASKS) {
  for (const lang of ['nb', 'en']) {
    const a = answerQuestion(tk.q[lang], { lang });
    assert.equal(a.matchId, tk.id, `«${tk.q[lang]}» ga ${a.matchId || a.intent}`);
    assert.ok(a.steps.length >= 1, `«${tk.q[lang]}» har steg`);
    assert.ok(a.actions.some((x) => x.type === 'tour'), `«${tk.q[lang]}» har «Vis meg»`);
  }
}

console.log(`assistantTasks.test.mjs: ok (${ASSISTANT_TASKS.length} oppgaver)`);
