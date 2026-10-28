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
  ['hvordan lager jeg faktura', /^okonomi\.(faktura|fakturagrunnlag)$/],
  ['hvor finner jeg kjøreboken', /^okonomi\.kjorebok$/],
  ['hvordan legger jeg til en ny ansatt', /^ansatte$/],
  ['hvorfor får jeg ingen anbudstreff', /^anbud\.(varsling|innstillinger)$/],
  ['vis meg hele flyten fra anbud til faktura', /^process:anbud-til-faktura$/],
  ['hvordan melder jeg avvik', /^iso\.avvik$/],
  ['hvordan søker jeg ferie', /^arbeid\.planlagt$/],
  ['hvordan regulerer jeg pris etter indeks', /^okonomi\.indeks$/],
  ['hvordan reserverer jeg bilen', /^utstyr$/],
  ['hvordan låser jeg timelisten', /timeliste/],
  ['hvordan kobler jeg outlook', /^(mail|plan)$/],
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
  ['How do I create an invoice?', /^okonomi\.(faktura|fakturagrunnlag)$/],
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

/**
 * Presisjon: vanlige spørsmål treffer oppgaven (eller steget) de handler om —
 * ikke en hel side. Forventet treff = oppgave-id, «page:side#steg» eller tema.
 */
const PRECISE = [
  ['Hvordan føre fravær?', 'task.fravaer'],
  ['Hvordan registrerer jeg sykdom?', 'task.fravaer'],
  ['Jeg er syk i dag, hva gjør jeg?', 'task.fravaer'],
  ['egenmelding', 'task.fravaer'],
  ['barnet mitt er sykt', 'task.fravaer'],
  ['jeg har vært hos legen', 'task.fravaer'],
  ['hvordan registrerer jeg permisjon', 'task.fravaer'],
  ['Hvordan tar jeg ut avspasering?', 'task.fravaer'],
  ['Hvordan søker jeg ferie?', 'task.ferie'],
  ['Hvordan planlegger jeg ferien?', 'task.ferie'],
  ['Hvor ser jeg hvor mye ferie jeg har igjen?', 'task.feriesaldo'],
  ['Hvordan godkjenner jeg ferie?', 'task.godkjennFerie'],
  ['Hvordan fører jeg timer?', 'task.timer'],
  ['kan jeg føre timer på mobilen', 'task.timer'],
  ['Hvordan fører jeg overtid?', 'task.overtid'],
  ['Hvordan låser jeg timene?', 'task.las'],
  ['Hvordan sender jeg timene til godkjenning?', 'task.las'],
  ['Jeg får ikke endret timene mine', 'task.lasOpp'],
  ['Hvordan låser jeg opp timelisten til en ansatt?', 'task.lasOpp'],
  ['Hvordan godkjenner jeg timer?', 'task.godkjennTimer'],
  ['Finner ikke prosjektet i timelisten', 'task.prosjektITimeliste'],
  ['Hvordan legger jeg til et prosjekt i timelisten?', 'task.prosjektITimeliste'],
  ['Hvordan flytter jeg timer til en annen dag?', 'task.flyttTimer'],
  ['Hvordan sletter jeg timer?', 'task.slettTimer'],
  ['Hvordan skriver jeg internt notat på timene?', 'task.internNotat'],
  ['Hvordan registrerer jeg et utlegg?', 'task.utlegg'],
  ['Hvordan legger jeg inn kvittering?', 'task.utlegg'],
  ['Hvordan registrerer jeg kjøring?', 'task.kjoring'],
  ['Hvordan fører jeg kilometer?', 'task.kjoring'],
  ['Hvordan registrerer jeg kilometerstand på bilen?', 'task.kilometerstand'],
  ['Hvordan registrerer jeg produktsalg?', 'task.produktsalg'],
  ['Hvordan ser jeg timesaldo?', 'task.timesaldo'],
  ['Hvordan eksporterer jeg timer til lønn?', 'task.eksportTimer'],
  ['Hvordan oppretter jeg et nytt prosjekt?', 'task.nyttProsjekt'],
  ['Hvordan legger jeg til en ansatt på prosjektet?', 'task.teamProsjekt'],
  ['Hvordan setter jeg timepris på prosjektet?', 'task.timepris'],
  ['Hvordan legger jeg til en ny kunde?', 'task.nyKunde'],
  ['Hvordan registrerer jeg en avtale?', 'task.nyAvtale'],
  ['Hvordan lager jeg en faktura?', 'task.faktura'],
  ['Hvordan fakturerer jeg timer?', 'task.faktura'],
  ['Hvordan sender jeg faktura med EHF?', 'task.sendFaktura'],
  ['Hvordan registrerer jeg betaling?', 'task.betaling'],
  ['Hvordan legger jeg til en ny ansatt?', 'task.nyAnsatt'],
  ['Hvordan inviterer jeg en bruker?', 'task.inviter'],
  ['Hvordan gir jeg en ansatt tilgang?', 'task.tilgang'],
  ['Hvordan endrer jeg tilgangsnivå?', 'task.tilgang'],
  ['hvordan endrer jeg passord', 'task.passord'],
  ['Hvordan melder jeg et avvik?', 'task.avvik'],
  ['Hvordan fyller jeg ut en sjekkliste?', 'task.skjema'],
  ['Hvordan lager jeg et nytt skjema?', 'task.nyttSkjema'],
  ['Hvordan reserverer jeg utstyr?', 'task.utstyr'],
  ['Hvordan setter jeg opp anbudsvarsling?', 'task.anbudsvarsling'],
  ['Hvordan legger jeg til CPV-koder?', 'task.anbudsvarsling'],
  ['Hvordan legger jeg til en avtale i kalenderen?', 'task.kalender'],
  ['Hvordan kobler jeg Outlook?', 'task.outlook'],
  ['Hvordan lager jeg en oppgave?', 'task.oppgave'],
  ['Hvordan endrer jeg logo?', 'task.logo'],
  ['Hvordan legger jeg til en fraværstype?', 'task.fravaerstype'],
  ['Hvordan regulerer jeg pris med indeks?', 'task.indeks'],
  ['Hvordan lager jeg CV?', 'task.cv'],
  ['Hvordan lukker jeg et avvik?', 'page:iso.avvik#3'],
  ['Hvordan godkjenner jeg utlegg?', 'page:okonomi.utlegg#2'],
  ['Hvordan bytter jeg språk?', 'page:settings#1'],
  ['Hvordan vurderer jeg et anbud?', 'page:anbud.varsling#2'],
  ['Hvordan legger jeg til en aktivitet på prosjektet?', 'page:projects#3'],
  ['Hvordan bytter jeg måned i timelisten?', 'page:arbeid.timeliste#0'],
  ['Hvor ser jeg hvem som er syk?', 'page:arbeid.fravaer'],
  ['Hvordan legger jeg til en underenhet?', 'page:selskap.underenheter'],
  ['Glemt passord', 'task.passord'],
  ['Hvordan bytter jeg til bedrift?', 'topic.switch'],
  ['How do I log sick leave?', 'task.fravaer'],
  ['How do I request holiday?', 'task.ferie'],
  ['How do I add a customer?', 'task.nyKunde'],
];
for (const [q, want] of PRECISE) {
  const lang = /^(how|where)/i.test(q) ? 'en' : 'nb';
  const a = answerQuestion(q, { lang });
  const got = `${a.matchId || a.intent}${a.focus != null ? `#${a.focus}` : ''}`;
  assert.equal(got, want, `«${q}» ga ${got}`);
  // Ingen hel arbeidsflyt uten at det er spurt om.
  assert.ok(!a.actions.some((x) => x.type === 'process'), `«${q}» foreslår ikke arbeidsflyt`);
  // Fokusert svar viser ett steg (eller to som henger sammen), ikke hele siden.
  if (a.focus != null) assert.ok(a.steps.length <= 2, `«${q}» viser bare steget`);
}

// «Hvordan føre fravær?» fra Timeliste: oppgaven, «Vis meg» fra fraværssteget på denne siden.
const absence = answerQuestion('Hvordan føre fravær?', { pageKey: 'arbeid.timeliste' });
assert.match(absence.text, /^\*\*Føre fravær/);
assert.ok(absence.steps.some((st) => /«Legg til fravær \/ ferie»/.test(st.text)));
assert.ok(absence.steps.some((st) => /7:30 er en hel dag/.test(st.text)));
assert.match(absence.after, /Planlagt fravær/);
assert.ok(!absence.steps.some((st) => st.title === 'Åpne timelisten'), 'står allerede i timelisten');
assert.equal(answerQuestion('Hvordan føre fravær?', { pageKey: 'home' }).steps[0].title, 'Åpne timelisten');
assert.deepEqual(absence.actions.map((x) => `${x.type}:${x.pageKey}@${x.step ?? ''}`), ['tour:arbeid.timeliste@3'], 'bare «Vis meg» her — ikke «Åpne siden» eller hele flyten');
assert.equal(absence.sources.length, 1);
const absenceMine = answerQuestion('Hvordan føre fravær?', { pageKey: 'timeliste' });
assert.equal(absenceMine.actions[0].pageKey, 'timeliste');
assert.equal(absenceMine.actions[0].step, 2);
const absenceAway = answerQuestion('Hvordan føre fravær?', { pageKey: 'home' });
assert.ok(absenceAway.actions.some((x) => x.type === 'open' && x.pageKey === 'timeliste'), 'fra en annen side: «Åpne Timeliste»');
assert.ok(absenceAway.followUps.includes('Hvordan søker jeg ferie?'));

// Fokusert steg: «Vis meg» fra steget, og forslag om hele siden.
const closeDeviation = answerQuestion('Hvordan lukker jeg et avvik?');
assert.equal(closeDeviation.steps.length, 1);
assert.equal(closeDeviation.steps[0].title, 'Lukk');
assert.ok(closeDeviation.actions.some((x) => x.type === 'tour' && x.step === 3));
assert.ok(closeDeviation.followUps.some((f) => /Hvordan bruker jeg Avvik og forbedring/.test(f)));

// Hele flyten bare når brukeren spør etter den.
assert.ok(answerQuestion('vis meg hele flyten fra anbud til faktura').actions.some((x) => x.type === 'process'));

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

assert.equal(starterSuggestions({ pageKey: 'kunder' })[0], 'Hvordan legger jeg til en ny kunde?', 'forslag om det folk gjør på siden');
assert.ok(starterSuggestions({ pageKey: 'kunder' }).includes('Hvordan bruker jeg Kunder?'));
assert.ok(starterSuggestions({ pageKey: 'arbeid.timeliste' }).includes('Hvordan fører jeg fravær?'));
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
const longAbsence = 'Hei, jeg var syk i går og i dag og lurer på hvordan jeg skal føre fravær i timelisten min for disse to dagene';
assert.equal(shouldAskServer(answerQuestion(longAbsence), longAbsence), false, 'kjent oppgave svares lokalt også når spørsmålet er langt');
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

console.log(`assistantEngine.test.mjs: ok (${CASES.length + PRECISE.length} spørsmål)`);
