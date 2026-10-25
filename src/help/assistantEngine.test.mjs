import assert from 'node:assert/strict';
import {
  SUPPORT_BODY_MAX, answerQuestion, buildKnowledge, detectIntent, fold, greeting, knowledgeForServer,
  searchKnowledge, starterSuggestions, supportTicketBody, tokenize, transcriptText,
} from './assistantEngine.js';
import { shouldAskServer } from './assistantPolicy.js';
import { evaluateHelpAccess, lockedParts, processStepNeed } from './helpAccess.js';
import { allows, standardGrants } from '../access/companyAccess.js';

assert.equal(fold('Kjørebok Åpne Æble'), 'kjorebok apne aeble');
assert.ok(tokenize('Hvordan fører jeg timer?').includes('#timer'));
assert.ok(tokenize('timelisten').includes('#timer'));
assert.ok(!tokenize('hvordan gjør jeg det').length, 'bare stoppord gir ingen ord');

const kb = buildKnowledge('nb');
assert.ok(kb.filter((k) => k.kind === 'page').length >= 75);
assert.ok(kb.some((k) => k.kind === 'process'));
assert.ok(kb.some((k) => k.kind === 'topic'));

/** Spørsmål → forventet kilde (side, flyt eller tema). */
const CASES = [
  ['Hvordan fører jeg timer?', /timeliste/],
  ['hvordan lager jeg faktura', /^okonomi\.faktura$/],
  ['hvor finner jeg kjøreboken', /^okonomi\.kjorebok$/],
  ['hvordan legger jeg til en ny ansatt', /^ansatte$/],
  ['hvorfor får jeg ingen anbudstreff', /^anbud\.varsling$/],
  ['vis meg hele flyten fra anbud til faktura', /^process:anbud-til-faktura$/],
  ['hvordan melder jeg avvik', /^iso\.avvik$/],
  ['hvordan søker jeg ferie', /^arbeid\.planlagt$/],
  ['hvordan regulerer jeg pris etter indeks', /^okonomi\.indeks$/],
  ['hvordan reserverer jeg bilen', /^utstyr$/],
  ['hvordan låser jeg timelisten', /timeliste/],
  ['hvordan kobler jeg outlook', /^mail$/],
  ['hvordan endrer jeg logoen', /^selskap\.innstillinger$/],
  ['hvor ser jeg hvem som er syk', /^arbeid\.fravaer$/],
  ['hvordan lager jeg et skjema for befaring', /^skjema$/],
  ['hvordan setter jeg opp iso', /^iso\./],
  ['hvordan gir jeg en ansatt tilgang til anbud', /^selskap\.tilgang$/],
  ['hvordan oppretter jeg prosjekt fra avtale', /^(kontrakt|projects)$/],
  ['hvordan godkjenner jeg timer', /^arbeid\.godkjenning$/],
  ['hvordan registrerer jeg en ny kunde', /^kunder$/],
  ['hvordan importerer jeg kunder fra excel', /^(kunder|topic\.import)$/],
  ['hvordan sender jeg faktura med ehf', /^okonomi\.faktura$/],
  ['hvordan publiserer jeg en stillingsannonse', /^hr\.rekruttering$/],
  ['hvordan holder jeg medarbeidersamtale', /^hr\.oppfolging$/],
  ['hvordan ser jeg ledig kapasitet', /^arbeid\.produktivitet$/],
  ['hvor er lyspæren', /lightbulb|topic\.lightbulb|home/],
  ['How do I approve hours?', /^arbeid\.godkjenning$/],
  ['How do I create an invoice?', /^okonomi\.faktura$/],
  ['Where is the mileage log?', /^okonomi\.kjorebok$/],
];
for (const [q, rx] of CASES) {
  const lang = /^(how|where)/i.test(q) ? 'en' : 'nb';
  const a = answerQuestion(q, { lang });
  const src = a.sources[0];
  const id = src ? (src.pageKey || (src.processId ? `process:${src.processId}` : src.id)) : '';
  assert.match(id, rx, `«${q}» ga ${id} (${a.intent})`);
  assert.ok(a.text.length > 20, `«${q}» har tekst`);
  if (src?.pageKey) {
    assert.ok(a.steps.length >= 1, `«${q}» har steg`);
    assert.ok(a.actions.some((x) => x.type === 'tour' && x.pageKey === src.pageKey), `«${q}» har «Vis meg»`);
    assert.ok(a.actions.some((x) => x.type === 'open' && x.nav?.tab), `«${q}» har «Åpne siden»`);
  }
}

// Konteksten: «denne siden» peker på siden brukeren står på.
const here = answerQuestion('hvordan bruker jeg denne siden?', { pageKey: 'okonomi.kjorebok' });
assert.equal(here.sources[0].pageKey, 'okonomi.kjorebok');

// Lojal: avslår andre tema, anbefaler ikke konkurrenter.
const weather = answerQuestion('hva blir været i morgen?');
assert.equal(weather.intent, 'offTopic');
assert.match(weather.text, /bare om ProTop/);
for (const q of ['skriv et dikt om bygg', 'fortell en vits', 'hva er bitcoin verdt']) {
  assert.equal(answerQuestion(q).intent, 'offTopic', q);
}
const rival = answerQuestion('er tripletex bedre enn protop?');
assert.match(rival.text, /ProTop/);
assert.doesNotMatch(rival.text, /anbefaler (deg )?(å bruke )?tripletex/i);
const rivalHow = answerQuestion('hvordan fakturerer jeg i stedet for tripletex, er dere bedre?');
assert.match(rivalHow.text, /vise deg hvordan du gjør dette i ProTop/);

// Feil og menneske gir alltid vei til support.
const bug = answerQuestion('appen viser hvit skjerm');
assert.equal(bug.intent, 'bug');
assert.ok(bug.steps.length >= 3);
assert.ok(bug.actions.some((x) => x.type === 'support'));
const bugPage = answerQuestion('faktura virker ikke');
assert.equal(bugPage.sources[0].pageKey, 'okonomi.faktura');
assert.ok(bugPage.actions.some((x) => x.type === 'support'));
const human = answerQuestion('kan jeg snakke med et menneske?');
assert.equal(human.intent, 'human');
assert.ok(human.actions.some((x) => x.type === 'support'));

// Usikker → spør igjen, så foreslå support etter to bom.
const vague1 = answerQuestion('blæh', { unresolved: 0 });
assert.equal(vague1.intent, 'unknown');
assert.ok(!vague1.actions.some((x) => x.type === 'support'));
const vague2 = answerQuestion('blæh', { unresolved: 1 });
assert.ok(vague2.actions.some((x) => x.type === 'support'));

// Hilsen og takk.
const hi = greeting({ pageKey: 'anbud.varsling' });
assert.match(hi.text, /1\.1 Anbudsvarsling/);
assert.ok(hi.followUps.length >= 2);
assert.equal(answerQuestion('hei').intent, 'greeting');
assert.equal(answerQuestion('tusen takk!').intent, 'thanks');
assert.equal(detectIntent('hei').greeting, true);
assert.equal(detectIntent('hvordan gjør jeg det her').thisPage, true);

assert.ok(starterSuggestions({ pageKey: 'kunder' })[0].includes('Kunder'));
assert.equal(starterSuggestions({ company: false }).length >= 3, true);

// Kunnskap til AI-motoren: relevante sider med steg og hvor de ligger.
const forServer = knowledgeForServer('hvordan lager jeg faktura', { pageKey: 'kunder' });
assert.ok(forServer.some((k) => k.moduleId === 'okonomi.faktura'));
assert.ok(forServer.some((k) => k.moduleId === 'kunder'), 'siden brukeren står på er med');
assert.ok(forServer.every((k) => k.title && k.summary && Array.isArray(k.steps)));
assert.ok(searchKnowledge('faktura', { limit: 3 }).length === 3);

// Lokale svar er gode nok uten AI; vage spørsmål går til AI.
assert.equal(shouldAskServer(answerQuestion('hvordan lager jeg faktura'), 'hvordan lager jeg faktura'), false);
assert.equal(shouldAskServer(answerQuestion('blæh'), 'blæh'), true);
assert.equal(shouldAskServer(answerQuestion('hva blir været'), 'hva blir været'), false);

const transcript = transcriptText([
  { role: 'user', text: 'Hvordan fører jeg timer?' },
  answerQuestion('Hvordan fører jeg timer?'),
]);
assert.match(transcript, /^Du: Hvordan fører jeg timer\?/);
assert.match(transcript, /Assistent: /);
assert.match(transcript, /1\. /);

// Supportsaken holder seg under serverens grense, også med lang samtale.
const longTalk = Array.from({ length: 80 }, (_, i) => `Du: spørsmål ${i}\n\nAssistent: ${'svar '.repeat(30)}`).join('\n\n') + '\n\nDu: SISTE';
const body = supportTicketBody({ note: 'Fakturaen sendes ikke', transcript: longTalk });
assert.ok(body.length <= SUPPORT_BODY_MAX, `for lang supportsak: ${body.length}`);
assert.match(body, /^Fakturaen sendes ikke/, 'egen beskrivelse først');
assert.match(body, /kortet ned/);
assert.match(body, /SISTE$/, 'det nyeste i samtalen beholdes');
assert.equal(supportTicketBody({ note: 'Kort', transcript: 'Du: hei' }), 'Kort\n\nSamtale med assistenten:\nDu: hei');
assert.equal(supportTicketBody({ note: 'Bare tekst' }), 'Bare tekst');

// Tilgang: assistenten følger brukerens nivå og peker på hvem som kan hjelpe.
function accessFor(levelId) {
  const grants = standardGrants(levelId);
  const contacts = [{ name: 'Kari Nordmann', level: 'Administrator' }];
  const describe = (r, pageKey) => {
    if (r.ok) return { ok: true };
    const { head, who } = lockedParts({ need: r.need, page: r.page, pageLabel: pageKey, level: levelId, contacts });
    return { ...r, text: `${head} ${who}`, head, who };
  };
  const check = (pageKey, stepIndex = null) => describe(evaluateHelpAccess({ grants, pageKey, stepIndex }), pageKey);
  return {
    check,
    checkNeed: (need) => (allows(grants, need.resource, need.action) ? { ok: true } : describe({ ok: false, need, page: false }, null)),
    checkProcessStep: (processId, index, pageKey) => {
      const page = check(pageKey);
      if (!page.ok) return page;
      const need = processStepNeed(processId, index);
      return need ? describe(evaluateHelpAccess({ grants, pageKey, need }), pageKey) : { ok: true };
    },
  };
}
const ansattAccess = accessFor('ansatt');
const lederAccess = accessFor('avdelingsleder');

const invoice = answerQuestion('hvordan lager jeg faktura', { lang: 'nb', access: ansattAccess });
assert.equal(invoice.intent, 'locked', 'ansatt har ikke økonomi');
assert.equal(invoice.actions.length, 0, 'ingen «Vis meg» til en stengt side');
assert.equal(invoice.steps.length, 0);
assert.match(invoice.text, /ikke tilgang/);
assert.match(invoice.text, /Kari Nordmann \(Administrator\)/);

const importCustomers = answerQuestion('hvordan importerer jeg kunder fra excel', { lang: 'nb', access: lederAccess });
assert.notEqual(importCustomers.intent, 'locked', 'avdelingsleder ser kundesiden');
assert.match(importCustomers.text, /^🔒 \*\*Kunder:\*\* Dette krever «Admin» på «Kunder»/);
assert.ok(importCustomers.steps.some((st) => st.locked), 'import-steget er merket låst');
const importTour = importCustomers.actions.find((a) => a.type === 'tour');
assert.equal(importTour?.pageKey, 'kunder', 'rundturen på Kunder tilbys (låste steg vises med lås)');
assert.equal(importTour?.step, 3, 'rundturen starter på Importer-steget');

assert.equal(importCustomers.locked, true);
// Kort lås per steg; hvem som kan hjelpe står én gang i teksten.
assert.ok(importCustomers.steps.filter((st) => st.locked).every((st) => !/Spør/.test(st.locked)), 'ingen gjentatt «Spør …» per steg');
assert.equal((importCustomers.text.match(/Spør Kari Nordmann/g) || []).length, 1);
assert.equal(shouldAskServer(importCustomers, 'hvordan importerer jeg kunder fra excel'), false, 'låst svar går ikke til AI');
assert.equal(shouldAskServer(invoice, 'hvordan lager jeg faktura'), false);

const fullAccess = answerQuestion('hvordan importerer jeg kunder fra excel', { lang: 'nb', access: accessFor('administrator') });
assert.ok(!fullAccess.text.startsWith('🔒'));
assert.ok(fullAccess.steps.every((st) => !st.locked));

const flowAnsatt = answerQuestion('vis meg hele flyten fra anbud til faktura', { lang: 'nb', access: ansattAccess });
assert.equal(flowAnsatt.intent, 'workflow');
assert.ok(flowAnsatt.steps.filter((st) => st.locked).length >= 5, 'ansatt kan ikke det meste av flyten');
assert.match(flowAnsatt.text, /merket med en lås\. Ditt nivå: ansatt\. Spør Kari Nordmann \(Administrator\)/);

const ansattStarters = starterSuggestions({ lang: 'nb', company: true, access: ansattAccess });
assert.ok(!ansattStarters.some((q) => /faktura/i.test(q)), 'ingen fakturaforslag til ansatt');
assert.ok(ansattStarters.some((q) => /timer/i.test(q)));

// Låst modul: ansatt får vite hvem som kan slå den på, og ingen «Åpne siden» til innstillingene.
const lockedModule = answerQuestion('hvorfor ser jeg ikke modulen, den er låst', { lang: 'nb', access: ansattAccess });
assert.equal(lockedModule.matchId, 'topic.locked');
assert.ok(lockedModule.steps.filter((st) => st.locked).length >= 2, 'innstillingsstegene er låst');
assert.match(lockedModule.steps[1].locked, /«Admin» på «.*Tilgangsstyring»/);
assert.ok(!lockedModule.actions.some((a) => a.type === 'open'), 'ingen «Åpne siden» til Modulinnstillinger');
const lockedAdmin = answerQuestion('hvorfor ser jeg ikke modulen, den er låst', { lang: 'nb', access: accessFor('administrator') });
assert.ok(lockedAdmin.actions.some((a) => a.type === 'open' && a.pageKey === 'selskap.moduler'));

const serverKnowledge = knowledgeForServer('hvordan lager jeg faktura', { lang: 'nb', access: ansattAccess });
assert.ok(serverKnowledge.some((k) => k.locked && /LÅST FOR BRUKEREN/.test(k.summary)), 'AI-motoren får vite om sperren');

console.log(`assistantEngine.test.mjs: ok (${CASES.length} spørsmål)`);
