import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImport, existingTemplateFor, mergeCompetenceIntoCv, formTemplateIdFor, importKeyFor, parsePackage, planImport, approvalTaskFor } from './importPackage.js';
import { emptyIsoState } from './state.js';
import { isoCapabilities } from './access.js';
import { validateDiagram } from './processes.js';
import { parseMarkdown, markdownToPlain, outline } from './markdown.js';
import { codeTaken, folderLabel, nextDocumentCode, normalizeDocStructure } from './documents.js';
import { layoutSwimlanes } from './processLayout.js';

const BOSS = { uid: 'u3', name: 'Siri Leder' };
const ADMIN = isoCapabilities({ bypass: true, uid: 'u3', restricted: { uids: ['u3'] } });
const NOW = new Date('2026-10-26T10:00:00Z');

function pkg(extra = {}) {
  return {
    format: 'protop.iso.package',
    formatVersion: 1,
    id: 'test-pakke',
    title: 'Testpakke',
    source: { system: 'SharePoint' },
    system: {
      name: 'Testsystem',
      scopeText: 'Prosjektadministrative tjenester.',
      standards: ['ISO9001', 'ISO14001'],
      docStructure: [{ code: 'A', title: 'HMSK-system', folders: [{ code: 'A-01', title: 'Politikk' }] }],
      profile: { vision: 'Best i fagfeltet', values: ['Ansvar'] },
    },
    documents: [
      { key: 'A-01-001', code: 'A-01-001', folder: 'A-01', title: 'Kvalitetspolitikk', docType: 'policy', ownerName: 'Daglig leder', content: '# Kvalitetspolitikk\n\nVi skal …', readAckRequired: true, processKeys: ['B-01-002'], legacyRevisions: [{ rev: '01', date: '09.10.2025', reason: 'Utarbeidet', by: 'VSM' }] },
      { key: 'F-01-002', code: 'F-01-002', folder: 'F-01', title: 'Prosedyre vurdering', docType: 'prosedyre', ownerName: 'Daglig leder', content: '## Hensikt\n\nTest' },
    ],
    processes: [
      {
        key: 'B-01-002',
        code: 'B-01-002',
        order: 2,
        title: 'Tilbud',
        category: 'kjerne',
        ownerName: 'Daglig leder',
        documentKeys: ['F-01-002'],
        diagram: {
          lanes: [{ id: 'kunde', label: 'Kunde' }, { id: 'dl', label: 'Daglig leder', roleKey: 'top_management' }],
          nodes: [
            { id: 's', type: 'start', label: 'Henvendelse', lane: 'kunde' },
            { id: 'a', type: 'activity', label: 'Vurder henvendelse', lane: 'dl', documentKey: 'F-01-002' },
            { id: 'd', type: 'decision', label: 'Kan vi ta oppdraget?', lane: 'dl' },
            { id: 'b', type: 'activity', label: 'Utarbeid tilbud', lane: 'dl', module: 'tab:anbud/tilbud' },
            { id: 'n', type: 'activity', label: 'Send avslag', lane: 'dl' },
            { id: 'e', type: 'end', label: 'Til kontrakt', lane: 'dl', processKey: 'B-01-004' },
            { id: 'e2', type: 'end', label: 'Avslått', lane: 'kunde' },
          ],
          edges: [
            { from: 's', to: 'a' }, { from: 'a', to: 'd' },
            { from: 'd', to: 'b', condition: 'yes', label: 'Ja' }, { from: 'd', to: 'n', condition: 'no', label: 'Nei' },
            { from: 'b', to: 'e' }, { from: 'n', to: 'e2' },
          ],
        },
      },
    ],
    records: {
      rolle: [{ key: 'DL', title: 'Daglig leder', responsibilities: 'Overordnet ansvar' }, { key: 'KL', title: 'Kvalitetsleder', responsibilities: 'Kvalitetssystemet' }],
      myndighet: [{ key: 'M1', title: 'Innkjøp > 5000 NOK', category: 'Økonomi', roles: ['DL'] }, { key: 'M2', title: 'Tilgangsstyring', category: 'HMSK', roles: ['DL', 'KL'] }],
      risiko: [
        { key: 'R01', kind: 'Risiko', title: 'Uklare kontraktsvilkår', category: 'strategisk', processId: 'B-01-002', inherentL: 3, inherentC: 4, residualL: 2, residualC: 4, ownerName: 'Tilbudsansvarlig' },
        { key: 'R26', kind: 'Risiko', title: 'Effekt blir ikke avdekket', category: 'kvalitet', inherentL: 3, inherentC: 3, ownerName: 'Ikke tildelt', needsReview: true, reviewNote: 'Ansvarlig mangler i kilden' },
        { key: 'BAD', kind: 'Risiko', title: '', category: 'kvalitet' },
      ],
      kontekst: [{ key: 'S1', title: 'Fleksibilitet', scope: 'Internt', factorType: 'Styrke', description: 'Skreddersyr tjenester' }],
    },
    requirements: [{ key: 'aml', kind: 'lov', title: 'Arbeidsmiljøloven', source: 'LOV-2005-06-17-62', areaKeys: ['hazards'] }],
    assessments: [
      { key: 'gap-4.1', standard: 'ISO9001', area: 'context', status: 'under_arbeid', rationale: 'GAP: kontekst er utarbeidet, ikke godkjent.' },
      { key: 'gap-bad', standard: 'ISO9001', area: 'context', status: 'internt_verifisert', rationale: 'x' },
    ],
    forms: [{ key: 'S-03-004', title: 'Vernerunde', fields: [{ kind: 'title', label: 'Kontor' }, { id: 'p1', kind: 'choice', label: 'Rømningsveier frie?', options: ['Ja', 'Nei', 'Ikke relevant'] }] }],
    news: [{ key: 'iso-nyhet', title: 'ISO-sertifisering – hele organisasjonen er med!', body: 'Vi er i gang.' }],
    ...extra,
  };
}

test('markdown: overskrifter, lister, tabeller, lenker og avkrysning', () => {
  const md = '# Tittel\n\nTekst med **fet** og [lenke](https://protop.no).\n\n- punkt\n  - under\n1. nr\n- [x] gjort\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> Merknad\n\n---';
  const b = parseMarkdown(md);
  assert.deepEqual(b.map((x) => x.type), ['h', 'p', 'li', 'li', 'li', 'li', 'table', 'quote', 'hr']);
  assert.equal(b[1].inline.find((s) => s.href)?.href, 'https://protop.no');
  assert.equal(b[3].depth, 1);
  assert.equal(b[5].checked, true);
  assert.equal(b[6].rows[0][1][0].text, '2');
  assert.ok(markdownToPlain(md).includes('Tittel'));
  assert.equal(outline(md)[0].text, 'Tittel');
  // Usikre lenker blir tekst
  assert.equal(parseMarkdown('[x](javascript:alert(1))')[0].inline.some((s) => s.href), false);
  // Understrek i filnavn er ikke kursiv
  assert.equal(parseMarkdown('Se C1_MAL_Mappestruktur')[0].inline.some((s) => s.italic), false);
});

test('dokumentstruktur og koder', () => {
  const s = normalizeDocStructure([{ code: 'a', title: 'HMSK', folders: [{ code: 'a-01', title: 'Politikk' }, { code: 'A-01', title: 'dup' }] }]);
  assert.equal(s[0].folders.length, 1);
  assert.equal(folderLabel(s, 'A-01'), 'A-01 Politikk');
  assert.equal(nextDocumentCode('A-01', [{ code: 'A-01-001' }, { code: 'A-01-007' }, { code: 'B-01-009' }]), 'A-01-008');
  assert.equal(codeTaken('a-01-001', [{ id: 'x', code: 'A-01-001' }]), true);
  assert.equal(codeTaken('A-01-001', [{ id: 'x', code: 'A-01-001', archived: true }]), false);
});

test('autolayout: bokser havner i sin svømmebane og diagrammet er gyldig', () => {
  const d = layoutSwimlanes(pkg().processes[0].diagram);
  const lane = (id) => d.lanes.findIndex((l) => { const n = d.nodes.find((x) => x.id === id); const cy = n.y + n.h / 2; return cy >= l.y && cy < l.y + l.h; });
  assert.equal(lane('s'), 0);
  assert.equal(lane('a'), 1);
  assert.ok(d.nodes.find((n) => n.id === 'b').x > d.nodes.find((n) => n.id === 'a').x);
});

test('parsePackage avviser feil format og rapporterer duplikater', () => {
  assert.equal(parsePackage('{').ok, false);
  assert.equal(parsePackage({ format: 'x' }).ok, false);
  const p = parsePackage({ ...pkg(), documents: [...pkg().documents, { key: 'A-01-001', title: 'dup', docType: 'policy' }] });
  assert.equal(p.ok, true);
  assert.equal(p.pkg.documents.length, 2);
  assert.ok(p.warnings.some((w) => w.includes('A-01-001')));
});

test('buildImport: oppsett, dokumenter, prosesser, registre, krav, vurderinger, skjema og nyheter', () => {
  const { pkg: p } = parsePackage(pkg());
  const state = emptyIsoState();
  const built = buildImport(state, p, { actor: BOSS, caps: ADMIN, now: NOW });
  assert.equal(built.ok, true);
  const { out } = built;
  // Oppsett fylles ut og fullføres
  assert.deepEqual(out.system.standards, ['ISO9001', 'ISO14001']);
  assert.ok(out.system.setupAt);
  assert.equal(out.system.docStructure[0].folders[0].code, 'A-01');
  assert.equal(out.system.profile.vision, 'Best i fagfeltet');
  // Dokumenter sendes til godkjenning, med kode, mappe, historikk og importnøkkel
  assert.equal(out.documents.length, 2, 'nyheter blir ikke ISO-dokumenter');
  const pol = out.documents.find((d) => d.document.code === 'A-01-001').document;
  assert.equal(pol.folder, 'A-01');
  assert.equal(pol.revisions[0].state, 'til_gjennomgang');
  assert.equal(pol.importKey, importKeyFor(p, 'documents', 'A-01-001'));
  assert.equal(pol.legacyRevisions[0].by, 'VSM');
  assert.equal(pol.publishedRevision, 0);
  assert.equal(out.publishDocuments.length, 0);
  // Prosess: diagram med løste referanser, styrende dokument og koblet tilbake til dokumentet
  const proc = out.processes[0].process;
  assert.equal(proc.code, 'B-01-002');
  assert.equal(proc.order, 2);
  const docId = out.documents.find((d) => d.document.code === 'F-01-002').document.id;
  assert.deepEqual(proc.documentIds, [docId]);
  const a = proc.versions[0].diagram.nodes.find((n) => n.id === 'a');
  assert.deepEqual(a.onClick, { type: 'openDocument', ref: docId });
  assert.equal(a.roleLabel, 'Daglig leder');
  assert.equal(proc.versions[0].diagram.nodes.find((n) => n.id === 'b').onClick.ref, 'tab:anbud/tilbud');
  assert.equal(validateDiagram(proc.versions[0].diagram).ok, true);
  assert.equal(proc.versions[0].state, 'til_godkjenning');
  assert.ok(pol.processIds.includes(proc.id));
  assert.ok(built.issues.some((m) => m.includes('B-01-004')), 'manglende prosessreferanse rapporteres');
  // Registre: roller før myndighet, ref-felt løses, review-flagg, feil rapporteres
  const roles = out.records.filter((r) => r.record.register === 'rolle').map((r) => r.record);
  const m2 = out.records.find((r) => r.record.register === 'myndighet' && r.record.title === 'Tilgangsstyring').record;
  assert.deepEqual(m2.roles.sort(), roles.map((r) => r.id).sort());
  const r01 = out.records.find((r) => r.record.title === 'Uklare kontraktsvilkår').record;
  assert.equal(r01.processId, proc.id);
  const r26 = out.records.find((r) => r.record.title === 'Effekt blir ikke avdekket').record;
  assert.equal(r26.needsReview, true);
  assert.ok(built.plan.records.some((x) => x.status === 'feil' && x.key === 'risiko:BAD'));
  assert.equal(out.records.find((r) => r.record.register === 'kontekst').record.factorType, 'Styrke');
  // Krav og vurderinger (aldri internt verifisert)
  assert.equal(out.requirements.length, 1);
  assert.ok(out.assessments.some((x) => x.status === 'under_arbeid'));
  assert.ok(built.plan.assessments.some((x) => x.key === 'gap-bad' && x.status === 'feil'));
  // Skjema og nyheter
  assert.equal(out.forms[0].template.id, formTemplateIdFor(p, 'S-03-004'));
  assert.equal(out.forms[0].template.fields[1].options.length, 3);
  assert.equal(out.news.length, 1);
  assert.equal(out.news[0].title, 'ISO-sertifisering – hele organisasjonen er med!');
  // Samleoppgave til godkjenner
  assert.ok(approvalTaskFor(p, built).title.includes('2 dokumenter'));
});

test('buildImport: publiser direkte og koble dokument som bevis', () => {
  const { pkg: p } = parsePackage(pkg());
  const built = buildImport(emptyIsoState(), p, { actor: BOSS, caps: ADMIN, now: NOW, options: { publish: { documents: true, processes: true } } });
  assert.equal(built.out.publishDocuments.length, 2);
  assert.ok(built.out.publishDocuments.every((d) => d.document.publishedRevision === 1));
  assert.equal(built.out.publishProcesses.length, 1);
  assert.equal(built.out.publishProcesses[0].process.publishedVersion, 1);
  assert.ok(built.out.evidence.evidence.length >= 1);
});

test('import er idempotent: andre gang hoppes alt over', () => {
  const { pkg: p } = parsePackage(pkg());
  const first = buildImport(emptyIsoState(), p, { actor: BOSS, caps: ADMIN, now: NOW });
  const state = emptyIsoState();
  state.system = first.out.system;
  state.documents = first.out.documents.map((d) => d.document);
  state.processes = first.out.processes.map((x) => x.process);
  state.requirements = first.out.requirements.map((x) => x.requirement);
  for (const r of first.out.records) state.records[r.record.register].push(r.record);
  const plan = planImport(state, p, { actor: BOSS, caps: ADMIN, now: NOW, anbudTemplates: first.out.forms.map((f) => f.template), wallKeys: new Set(first.out.news.map((n) => n.importKey)) });
  assert.equal(plan.counts.documents.ny, 0);
  assert.equal(plan.counts.documents.finnes, 2);
  assert.equal(plan.counts.news.finnes, 1);
  assert.equal(plan.counts.processes.finnes, 1);
  assert.equal(plan.counts.records.ny, 0);
  assert.equal(plan.counts.forms.finnes, 1);
  assert.equal(plan.counts.system.ny, 0);
});

test('opphav kolliderer ikke med registerfeltet «source»', () => {
  const { pkg: p } = parsePackage(pkg({
    records: {
      kompetansekrav: [
        { key: 'k1', title: 'Varme arbeider', role: 'Prosjektleder', source: 'Forsikringskrav' },
        { key: 'k2', title: 'Førstehjelp', role: 'Alle', source: { system: 'SharePoint', ref: 'Kompetansematrise.xlsm' } },
      ],
    },
  }));
  const built = buildImport(emptyIsoState(), p, { actor: BOSS, caps: ADMIN, now: NOW, options: { sections: new Set(['records']) } });
  const recs = built.out.records.map((r) => r.record).filter((r) => r.register === 'kompetansekrav');
  const k1 = recs.find((r) => r.title === 'Varme arbeider');
  const k2 = recs.find((r) => r.title === 'Førstehjelp');
  assert.equal(k1.source, 'Forsikringskrav');
  assert.equal(k2.source, undefined);
  assert.deepEqual(k2.origin, { system: 'SharePoint', ref: 'Kompetansematrise.xlsm', url: '' });
});

test('skjema som finnes i Skjemabygger (KS-biblioteket) brukes i stedet for en kopi', () => {
  const base = pkg();
  const form = { ...base.forms[0], key: 'sja', title: 'SJA', source: { originalCode: 'C1-B-03-003' } };
  const { pkg: p } = parsePackage({ ...base, forms: [form] });
  const lib = { id: 'ks_sja', libraryKey: 'sja', title: 'Sikker jobbanalyse', doc: { ref: 'C1-B-03-003' }, fields: [{ id: 'a', kind: 'text', label: 'Hva' }] };
  assert.equal(existingTemplateFor(form, [lib]).id, 'ks_sja');
  assert.equal(existingTemplateFor({ libraryKey: 'sja' }, [{ id: 'ks_sja', title: 'SJA' }]).id, 'ks_sja');
  assert.equal(existingTemplateFor(form, [{ id: 'ks_x', title: 'SJA', doc: { docId: 'C1-B-03-003' } }]).id, 'ks_x');
  assert.equal(existingTemplateFor(form, [{ ...lib, importKey: 'x:forms:sja' }]), null);
  const built = buildImport(emptyIsoState(), p, { actor: BOSS, caps: ADMIN, now: NOW, anbudTemplates: [lib] });
  assert.equal(built.out.forms.length, 1);
  assert.equal(built.out.forms[0].existing, true);
  assert.equal(built.out.forms[0].template.id, 'ks_sja');
  // Allerede styrt skjema: ingenting å gjøre.
  const state = emptyIsoState();
  state.forms = [{ id: 'f1', templateId: 'ks_sja', publishedVersion: 1 }];
  const again = buildImport(state, p, { actor: BOSS, caps: ADMIN, now: NOW, anbudTemplates: [lib] });
  assert.equal(again.out.forms.length, 0);
});

test('gjenkjenning av bibliotekmal tåler Skjemabyggers normalisering (bare id-en er igjen)', async () => {
  const { normalizeFormTemplates } = await import('../anbud/bidLibrary.js');
  const stored = normalizeFormTemplates([{ id: 'ks_sja', libraryKey: 'sja', title: 'SJA', doc: { docId: 'C1-B-03-003' }, fields: [{ id: 'a', kind: 'text', label: 'Hva' }] }]);
  assert.equal(existingTemplateFor({ libraryKey: 'sja', source: { originalCode: 'C1-B-03-003' } }, stored)?.id, 'ks_sja');
});

test('publiser direkte: prosess som peker til et skjema i pakken kan publiseres', () => {
  const base = pkg();
  const form = { key: 'vr', title: 'Vernerunde', fields: [{ id: 'p1', kind: 'text', label: 'Funn' }] };
  const proc = {
    key: 'P-vr', title: 'Vernerunde', category: 'stotte', ownerName: 'HMS-leder',
    diagram: {
      lanes: [{ id: 'l1', label: 'HMS-leder' }],
      nodes: [{ id: 's', type: 'start', label: 'Start', lane: 'l1' }, { id: 'a', type: 'form', label: 'Fyll ut vernerunde', lane: 'l1', formKey: 'vr' }, { id: 'e', type: 'end', label: 'Slutt', lane: 'l1' }],
      edges: [{ from: 's', to: 'a' }, { from: 'a', to: 'e' }],
    },
  };
  const { pkg: p } = parsePackage({ ...base, processes: [proc], forms: [form] });
  const built = buildImport(emptyIsoState(), p, { actor: BOSS, caps: ADMIN, now: NOW, options: { publish: { documents: true, processes: true } } });
  const pr = built.out.processes.find((x) => x.process.title === 'Vernerunde');
  assert.ok(pr, 'prosessen er bygget');
  assert.ok(built.out.publishProcesses.some((x) => x.process.id === pr.process.id), built.issues.join(' | '));
  // Uten prosesseier: legges inn som utkast, og forhåndsvisningen sier hvorfor.
  const { pkg: q } = parsePackage({ ...base, processes: [{ ...proc, ownerName: '' }], forms: [form] });
  const draft = buildImport(emptyIsoState(), q, { actor: BOSS, caps: ADMIN, now: NOW });
  assert.match(draft.plan.processes.find((r) => r.key === 'P-vr').message, /utkast: Prosessen må ha en prosesseier/);
});

test('chunkForBatch deler på antall og størrelse', async () => {
  const { chunkForBatch } = await import('./core.js');
  const rows = Array.from({ length: 900 }, (_, i) => ({ i, size: i < 10 ? 2_000_000 : 100 }));
  const chunks = chunkForBatch(rows, (r) => r.size);
  assert.ok(chunks.every((c) => c.length <= 400));
  assert.ok(chunks.every((c) => c.reduce((n, r) => n + r.size, 0) <= 5_000_000 || c.length === 1));
  assert.equal(chunks.flat().length, 900);
  assert.deepEqual(chunks.flat().map((r) => r.i), rows.map((r) => r.i), 'rekkefølgen beholdes');
});

test('nyheter blir innlegg på Selskap → Nyheter, og navn kobles til ansatte', () => {
  const base = pkg();
  const { pkg: p } = parsePackage({
    ...base,
    news: [{ key: 'golive', title: 'ProTop fra 1. januar 2027', body: 'Fra nyttår er ProTop vårt ledelsessystem.', category: 'selskap' }],
    records: {
      rolle: [{ key: 'dl', title: 'Daglig leder', responsibilities: 'Leder selskapet', holders: ['Siri Leder', 'Ukjent Person'] }],
      beredskap: [{ key: 'brann', title: 'Brann', alarm: 'Ring 110', instructions: 'Evakuer', contacts: [{ role: 'Beredskapsleder', name: 'siri leder' }] }],
    },
  });
  const people = [{ id: 'e1', name: 'Siri Anne Leder', uid: 'u3', phone: '900 00 000', email: 'siri@x.no' }];
  const built = buildImport(emptyIsoState(), p, { actor: BOSS, caps: ADMIN, now: NOW, people });
  assert.equal(built.out.news.length, 1);
  assert.equal(built.out.news[0].category, 'selskap');
  assert.ok(!built.out.documents.some((d) => d.document.docType === 'nyhet'));
  const rolle = built.out.records.map((r) => r.record).find((r) => r.register === 'rolle');
  assert.deepEqual(rolle.holders.map((h) => [h.name, h.uid]), [['Siri Anne Leder', 'u3'], ['Ukjent Person', '']]);
  const ber = built.out.records.map((r) => r.record).find((r) => r.register === 'beredskap');
  assert.equal(ber.contacts[0].phone, '900 00 000');
  assert.equal(ber.contacts[0].uid, 'u3');
  assert.ok(built.issues.some((i) => i.includes('Ukjent Person')));
  // Allerede lagt ut: hoppes over.
  const again = planImport(emptyIsoState(), p, { actor: BOSS, caps: ADMIN, now: NOW, wallKeys: new Set([built.out.news[0].importKey]) });
  assert.equal(again.counts.news.ny, 0);
});

test('kompetanse legges i CV-en til den ansatte uten duplikater', () => {
  const cv = { education: [{ id: 'e1', program: 'Master bygg', school: 'NTNU' }], courses: [], certifications: [] };
  const row = { key: 'k1', name: 'Siri Leder', education: [{ program: 'master bygg', school: 'ntnu' }, { program: 'Bachelor', school: 'UiS', to: '2015' }], courses: [{ title: 'Førstehjelp', date: '2025-03' }], certifications: ['Sentral godkjenning'] };
  const m = mergeCompetenceIntoCv(cv, row);
  assert.deepEqual(m.added, { education: 1, certifications: 1, courses: 1 });
  assert.equal(m.cv.education.length, 2);
  const { pkg: p } = parsePackage({ ...pkg(), competence: [row, { key: 'k2', name: 'Ingen Ansatt', courses: ['X'] }] });
  const employees = [{ id: 'emp1', name: 'Siri Anne Leder', employee: { id: 'emp1', person: { firstName: 'Siri' }, cv } }];
  const built = buildImport(emptyIsoState(), p, { actor: BOSS, caps: ADMIN, now: NOW, employees });
  assert.equal(built.out.competence.length, 1);
  assert.equal(built.out.competence[0].employee.cv.courses[0].title, 'Førstehjelp');
  assert.equal(built.out.competence[0].employee.person.firstName, 'Siri', 'resten av ansattposten beholdes');
  assert.equal(built.plan.competence.find((r) => r.key === 'k2').status, 'feil');
  // Andre gang: ingenting nytt.
  const again = buildImport(emptyIsoState(), p, { actor: BOSS, caps: ADMIN, now: NOW, employees: [{ ...employees[0], employee: built.out.competence[0].employee }] });
  assert.equal(again.out.competence.length, 0);
});
