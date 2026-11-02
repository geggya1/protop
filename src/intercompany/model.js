/**
 * Konsernintegrasjon: avtaler mellom selskaper i ProTop (morselskap og datterselskap).
 *
 * Flyten, som gjelder begge veier:
 * 1. Et selskap ber om tilknytning til et annet (som mor eller datter). Det inviterte
 *    selskapet må godta. Avtalen ligger i intercompanyLinks/{linkId}, og bare serveren skriver.
 * 2. Prosjekteier (A) tildeler en ansatt fra partneren (B) på et prosjekt. B får en kopi av
 *    prosjektet med A sitt prosjektnummer og A som kunde, og den ansatte blir deltaker der.
 *    Hos A blir personen en innleid medarbeider med hjemmeselskap B.
 * 3. Timer føres som vanlig hos B på kopien og er synlige hos begge. B (arbeidsgiveren) godkjenner
 *    og fakturerer A for dem, med prisen og betingelsene som er satt på kopien, som på ethvert
 *    prosjekt. Når B har godkjent, kan A fakturere sluttkunden. Raden hos A viser at timene
 *    belastes A på faktura fra B, og hvilken faktura.
 * 4. Utlegg, produktsalg og utleie på kopien følger samme vei.
 *
 * Modulen er ren (ingen Firebase), så appen og Cloud Functions bruker de samme reglene.
 */

export const LINK_STATUS = Object.freeze({
  pending: 'pending',
  active: 'active',
  declined: 'declined',
  withdrawn: 'withdrawn',
  ended: 'ended',
});

export const LINK_STATUS_LABELS = {
  pending: 'Venter på godkjenning',
  active: 'Aktiv',
  declined: 'Avslått',
  withdrawn: 'Trukket tilbake',
  ended: 'Avsluttet',
};

export const HOUR_PRICE_MODES = [
  { id: 'discount', label: 'Rabatt på ordinær timepris' },
  { id: 'fixed', label: 'Fast avtalt timepris' },
];

export const INVOICE_DELIVERY_OPTIONS = [
  { id: 'ehf', label: 'EHF' },
  { id: 'email', label: 'E-post' },
];

/** Prosjektkopier hos leverandøren har id prjic_{linkId}_{eierens prosjekt-id}. */
export const CLONE_PREFIX = 'prjic_';
/** Speilede rader hos prosjekteier har id ic_{kildeselskap}_{kilde-id}. */
export const MIRROR_PREFIX = 'ic_';

function text(value) {
  return String(value ?? '').trim();
}

function digits(value) {
  return text(value).replace(/\D/g, '');
}

function percent(value) {
  if (value === '' || value == null) return 0;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

function money(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Id uten understrek, så kopi- og speil-id-ene kan leses tilbake. Brukes på avtale- og selskaps-id. */
export function safeId(value) {
  return text(value).replace(/[^A-Za-z0-9-]/g, '');
}

/** Id som kan stå i en dokumentsti: alt beholdes unntatt skråstrek (prosjekt- og rad-id har understrek). */
export function pathId(value) {
  return text(value).replace(/\//g, '');
}

export function linkIdFor(requesterId, targetId, at = Date.now()) {
  const pair = [safeId(requesterId), safeId(targetId)].sort().join('-');
  return `icl-${pair}-${Number(at).toString(36)}`.slice(0, 140);
}

/** Priser og hva avtalen omfatter. Gjelder begge veier: den som leverer, fakturerer den andre. */
export function normalizeLinkSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const hours = src.hours && typeof src.hours === 'object' ? src.hours : {};
  const products = src.products && typeof src.products === 'object' ? src.products : {};
  const rental = src.rental && typeof src.rental === 'object' ? src.rental : {};
  const mode = hours.mode === 'fixed' ? 'fixed' : 'discount';
  const emails = src.invoiceEmails && typeof src.invoiceEmails === 'object' ? src.invoiceEmails : {};
  return {
    hours: {
      enabled: hours.enabled !== false,
      mode,
      discountPercent: percent(hours.discountPercent),
      fixedRate: money(hours.fixedRate),
    },
    products: {
      enabled: products.enabled !== false,
      discountPercent: percent(products.discountPercent),
    },
    rental: {
      enabled: rental.enabled !== false,
      discountPercent: percent(rental.discountPercent),
    },
    invoiceDelivery: src.invoiceDelivery === 'email' ? 'email' : 'ehf',
    // Fakturaadresse per selskap (nøkkel: selskapets id), brukt når partneren fakturerer det.
    invoiceEmails: Object.fromEntries(
      Object.entries(emails)
        .map(([key, value]) => [safeId(key), text(value).slice(0, 120)])
        .filter(([key, value]) => key && value),
    ),
    note: text(src.note).slice(0, 500),
  };
}

export function settingsError(settings) {
  const s = normalizeLinkSettings(settings);
  if (s.hours.enabled && s.hours.mode === 'fixed' && !(s.hours.fixedRate > 0)) {
    return 'Fyll inn den faste timeprisen.';
  }
  return '';
}

function party(raw = {}) {
  return {
    id: text(raw.id),
    name: text(raw.name).slice(0, 160) || 'Selskapet',
    orgnr: digits(raw.orgnr).slice(0, 9),
  };
}

export function normalizeLink(raw = {}, id = '') {
  const src = raw && typeof raw === 'object' ? raw : {};
  const parent = party(src.parent);
  const child = party(src.child);
  const status = Object.values(LINK_STATUS).includes(src.status) ? src.status : LINK_STATUS.pending;
  return {
    id: text(id || src.id),
    status,
    // konsern: mor og datter (parent/child). partner: samarbeidspartner eller underentreprenør,
    // likestilte selskaper (parent/child er da bare den som spurte og den som ble spurt).
    relation: src.relation === 'partner' ? 'partner' : 'konsern',
    parent,
    child,
    companyIds: [parent.id, child.id].filter(Boolean),
    // Toppfelt for spørringer og Firestore-reglene (lesing for medlemmer i begge selskapene).
    parentCompanyId: parent.id,
    childCompanyId: child.id,
    requestedByCompanyId: text(src.requestedByCompanyId),
    requestedByUid: text(src.requestedByUid),
    requestedByName: text(src.requestedByName),
    requestedAt: text(src.requestedAt),
    respondedByUid: text(src.respondedByUid),
    respondedByName: text(src.respondedByName),
    respondedAt: text(src.respondedAt),
    endedAt: text(src.endedAt),
    endedByCompanyId: text(src.endedByCompanyId),
    message: text(src.message).slice(0, 500),
    settings: normalizeLinkSettings(src.settings),
    settingsUpdatedAt: text(src.settingsUpdatedAt),
    settingsUpdatedBy: text(src.settingsUpdatedBy),
    pendingSettings: src.pendingSettings && typeof src.pendingSettings === 'object' && text(src.pendingSettings.proposedByCompanyId)
      ? {
        settings: normalizeLinkSettings(src.pendingSettings.settings),
        proposedByCompanyId: text(src.pendingSettings.proposedByCompanyId),
        proposedByUid: text(src.pendingSettings.proposedByUid),
        proposedAt: text(src.pendingSettings.proposedAt),
      }
      : null,
    updatedAt: text(src.updatedAt),
  };
}

/** Avtalen fra ett selskaps side: hvem partneren er, og om vi er mor eller datter. */
export function linkView(link, companyId) {
  const row = normalizeLink(link, link?.id);
  const id = text(companyId);
  const weAreParent = row.parent.id === id;
  const weAreChild = row.child.id === id;
  if (!weAreParent && !weAreChild) return null;
  const partner = weAreParent ? row.child : row.parent;
  const incoming = row.status === LINK_STATUS.pending && row.requestedByCompanyId !== id;
  const isPartner = row.relation === 'partner';
  return {
    ...row,
    ourRole: isPartner ? 'partner' : (weAreParent ? 'parent' : 'child'),
    partner,
    partnerRole: isPartner ? 'partner' : (weAreParent ? 'child' : 'parent'),
    partnerRoleLabel: isPartner ? 'Samarbeidspartner' : (weAreParent ? 'Datterselskap' : 'Morselskap'),
    incoming,
    outgoing: row.status === LINK_STATUS.pending && row.requestedByCompanyId === id,
    active: row.status === LINK_STATUS.active,
    statusLabel: LINK_STATUS_LABELS[row.status] || row.status,
    settingsToAnswer: !!row.pendingSettings && row.pendingSettings.proposedByCompanyId !== id,
    settingsProposedByUs: !!row.pendingSettings && row.pendingSettings.proposedByCompanyId === id,
  };
}

/** Partnerens id i avtalen, eller tom tekst når selskapet ikke er part. */
export function partnerIdOf(link, companyId) {
  return linkView(link, companyId)?.partner.id || '';
}

/** Avtalene for selskapet, delt i innkommende, utgående, aktive og avsluttede. */
export function groupLinks(links = [], companyId = '') {
  const views = (links || []).map((row) => linkView(row, companyId)).filter(Boolean);
  const byName = (a, b) => a.partner.name.localeCompare(b.partner.name, 'nb');
  return {
    incoming: views.filter((row) => row.incoming).sort(byName),
    outgoing: views.filter((row) => row.outgoing).sort(byName),
    active: views.filter((row) => row.active).sort(byName),
    closed: views.filter((row) => [LINK_STATUS.declined, LINK_STATUS.withdrawn, LINK_STATUS.ended].includes(row.status))
      .sort((a, b) => text(b.updatedAt).localeCompare(text(a.updatedAt))),
  };
}

/** Rollen til partneren i én setning: «som datterselskap», «som samarbeidspartner». */
export function roleSentence(view) {
  if (!view) return '';
  if (view.partnerRole === 'partner') return 'som samarbeidspartner';
  return view.partnerRole === 'parent' ? 'som morselskap' : 'som datterselskap';
}

/** Selskapene i konsernet sett fra morselskapet: aktive konsernavtaler der vi er mor. */
export function konsernChildren(links = [], companyId = '') {
  return (links || [])
    .map((row) => linkView(row, companyId))
    .filter((row) => row && row.active && row.relation === 'konsern' && row.ourRole === 'parent')
    .map((row) => row.partner);
}

/** Finnes det allerede en åpen (ventende eller aktiv) avtale mellom de to? */
export function openLinkBetween(links = [], a = '', b = '') {
  return (links || []).map((row) => normalizeLink(row, row?.id)).find((row) => (
    (row.status === LINK_STATUS.pending || row.status === LINK_STATUS.active)
    && row.companyIds.includes(text(a)) && row.companyIds.includes(text(b))
  )) || null;
}

/**
 * Ny forespørsel. role er partnerens rolle sett fra den som spør:
 * 'child' = «de er vårt datterselskap», 'parent' = «de er vårt morselskap»,
 * 'partner' = samarbeidspartner eller underentreprenør (ikke i samme konsern).
 */
export function buildLinkRequest({
  id, requester, target, role = 'child', uid = '', name = '', message = '', settings = {}, at = '',
}) {
  const req = party(requester);
  const tgt = party(target);
  if (!req.id || !tgt.id) return { ok: false, error: 'Selskapet mangler.' };
  if (req.id === tgt.id) return { ok: false, error: 'Et selskap kan ikke knyttes til seg selv.' };
  const partnerLink = role === 'partner';
  const targetIsChild = role !== 'parent';
  const stamp = text(at) || new Date().toISOString();
  const error = settingsError(settings);
  if (error) return { ok: false, error };
  return {
    ok: true,
    link: normalizeLink({
      id,
      status: LINK_STATUS.pending,
      relation: partnerLink ? 'partner' : 'konsern',
      parent: targetIsChild ? req : tgt,
      child: targetIsChild ? tgt : req,
      requestedByCompanyId: req.id,
      requestedByUid: uid,
      requestedByName: name,
      requestedAt: stamp,
      message,
      settings,
      updatedAt: stamp,
    }, id),
  };
}

/** Svar fra det inviterte selskapet. Bare den andre parten kan svare. */
export function respondToLink(link, { companyId, accept, uid = '', name = '', at = '' }) {
  const row = normalizeLink(link, link?.id);
  if (row.status !== LINK_STATUS.pending) return { ok: false, error: 'Forespørselen er allerede besvart.' };
  if (!row.companyIds.includes(text(companyId))) return { ok: false, error: 'Selskapet er ikke part i avtalen.' };
  if (row.requestedByCompanyId === text(companyId)) {
    return { ok: false, error: 'Det andre selskapet må godkjenne forespørselen.' };
  }
  const stamp = text(at) || new Date().toISOString();
  return {
    ok: true,
    link: {
      ...row,
      status: accept ? LINK_STATUS.active : LINK_STATUS.declined,
      respondedByUid: uid,
      respondedByName: name,
      respondedAt: stamp,
      updatedAt: stamp,
    },
  };
}

export function withdrawLink(link, { companyId, at = '' }) {
  const row = normalizeLink(link, link?.id);
  if (row.status !== LINK_STATUS.pending) return { ok: false, error: 'Bare ventende forespørsler kan trekkes tilbake.' };
  if (row.requestedByCompanyId !== text(companyId)) return { ok: false, error: 'Bare den som spurte, kan trekke tilbake.' };
  const stamp = text(at) || new Date().toISOString();
  return { ok: true, link: { ...row, status: LINK_STATUS.withdrawn, updatedAt: stamp } };
}

export function endLink(link, { companyId, at = '' }) {
  const row = normalizeLink(link, link?.id);
  if (row.status !== LINK_STATUS.active) return { ok: false, error: 'Avtalen er ikke aktiv.' };
  if (!row.companyIds.includes(text(companyId))) return { ok: false, error: 'Selskapet er ikke part i avtalen.' };
  const stamp = text(at) || new Date().toISOString();
  return { ok: true, link: { ...row, status: LINK_STATUS.ended, endedAt: stamp, endedByCompanyId: text(companyId), updatedAt: stamp } };
}

/**
 * Nye priser i en aktiv avtale er et forslag til den andre parten godtar det (prisene er avtalt
 * mellom to selskaper, og den ene kan ikke endre dem alene). Ventende forespørsler kan justeres
 * av den som spurte, før den andre har svart.
 */
export function proposeLinkSettings(link, { companyId, settings, uid = '', at = '' }) {
  const row = normalizeLink(link, link?.id);
  const id = text(companyId);
  if (!row.companyIds.includes(id)) return { ok: false, error: 'Selskapet er ikke part i avtalen.' };
  if (row.status === LINK_STATUS.pending) {
    if (row.requestedByCompanyId !== id) return { ok: false, error: 'Godta eller avslå forespørselen først.' };
    return updateLinkSettings(row, { companyId: id, settings, uid, at });
  }
  if (row.status !== LINK_STATUS.active) return { ok: false, error: 'Avtalen er avsluttet.' };
  const error = settingsError(settings);
  if (error) return { ok: false, error };
  const stamp = text(at) || new Date().toISOString();
  return {
    ok: true,
    proposed: true,
    link: {
      ...row,
      pendingSettings: { settings: normalizeLinkSettings(settings), proposedByCompanyId: id, proposedByUid: text(uid), proposedAt: stamp },
      updatedAt: stamp,
    },
  };
}

/** Svar på prisforslaget: den andre parten godtar eller avslår, den som foreslo kan trekke det. */
export function answerLinkSettings(link, { companyId, accept, uid = '', at = '' }) {
  const row = normalizeLink(link, link?.id);
  const id = text(companyId);
  const pending = row.pendingSettings;
  if (!pending) return { ok: false, error: 'Det er ingen nye priser å svare på.' };
  if (!row.companyIds.includes(id)) return { ok: false, error: 'Selskapet er ikke part i avtalen.' };
  const stamp = text(at) || new Date().toISOString();
  if (accept) {
    if (pending.proposedByCompanyId === id) return { ok: false, error: 'Det andre selskapet må godta prisene.' };
    if (row.status !== LINK_STATUS.active) return { ok: false, error: 'Avtalen er ikke aktiv.' };
    return {
      ok: true,
      link: {
        ...row,
        settings: normalizeLinkSettings(pending.settings),
        pendingSettings: null,
        settingsUpdatedAt: stamp,
        settingsUpdatedBy: text(uid),
        updatedAt: stamp,
      },
    };
  }
  return { ok: true, link: { ...row, pendingSettings: null, updatedAt: stamp } };
}

export function updateLinkSettings(link, { companyId, settings, uid = '', at = '' }) {
  const row = normalizeLink(link, link?.id);
  if (![LINK_STATUS.pending, LINK_STATUS.active].includes(row.status)) {
    return { ok: false, error: 'Avtalen er avsluttet.' };
  }
  if (!row.companyIds.includes(text(companyId))) return { ok: false, error: 'Selskapet er ikke part i avtalen.' };
  const error = settingsError(settings);
  if (error) return { ok: false, error };
  const stamp = text(at) || new Date().toISOString();
  return {
    ok: true,
    link: {
      ...row,
      settings: normalizeLinkSettings(settings),
      settingsUpdatedAt: stamp,
      settingsUpdatedBy: text(uid),
      updatedAt: stamp,
    },
  };
}

/** Kort tekst om prisen, til lister og prosjektmerket. */
export function settingsSummary(settings) {
  const s = normalizeLinkSettings(settings);
  const parts = [];
  if (s.hours.enabled) {
    parts.push(s.hours.mode === 'fixed'
      ? `Timer: fast ${s.hours.fixedRate ?? 0} kr/t`
      : (s.hours.discountPercent ? `Timer: ${s.hours.discountPercent} % rabatt` : 'Timer: ordinær pris'));
  }
  if (s.products.enabled) parts.push(s.products.discountPercent ? `Produkter: ${s.products.discountPercent} % rabatt` : 'Produkter: ordinær pris');
  if (s.rental.enabled) parts.push(s.rental.discountPercent ? `Utleie: ${s.rental.discountPercent} % rabatt` : 'Utleie: ordinær pris');
  return parts.join(' · ') || 'Ingen områder valgt';
}

// ── Prosjektkopi hos leverandøren ─────────────────────────────────────────

/** Avtale-id har aldri understrek, så alt etter første understrek er eierens prosjekt-id slik den er. */
export function cloneProjectId(linkId, ownerProjectId) {
  return `${CLONE_PREFIX}${safeId(linkId)}_${pathId(ownerProjectId)}`;
}

export function isCloneProjectId(id) {
  return text(id).startsWith(CLONE_PREFIX);
}

export function parseCloneProjectId(id) {
  const raw = text(id);
  if (!raw.startsWith(CLONE_PREFIX)) return null;
  const rest = raw.slice(CLONE_PREFIX.length);
  const cut = rest.indexOf('_');
  if (cut <= 0 || cut === rest.length - 1) return null;
  return { linkId: rest.slice(0, cut), ownerProjectId: rest.slice(cut + 1) };
}

export function mirrorId(sourceCompanyId, sourceId) {
  return `${MIRROR_PREFIX}${safeId(sourceCompanyId)}_${pathId(sourceId)}`.slice(0, 600);
}

export function isMirrorRow(row) {
  return row?.icMirror === true || row?.intercompany?.mirror === true;
}

/** Ordinær timepris på eierens prosjekt (prosjektets timepris). */
export function ownerHourlyRate(project) {
  const rate = money(project?.pricingSettings?.hourlyRate ?? project?.hourlyRate);
  return rate == null || rate <= 0 ? null : rate;
}

/** Rabatt på ordinær pris krever at eierens prosjekt har timepris. Ellers må avtalen ha fast pris. */
export function cloneRateMissing({ settings, ownerProject }) {
  const s = normalizeLinkSettings(settings);
  return s.hours.enabled && s.hours.mode !== 'fixed' && ownerHourlyRate(ownerProject) == null;
}

/**
 * Prisen leverandøren fakturerer eieren: fast timepris, eller eierens ordinære timepris med
 * avtalt rabatt. Rabatt på produkter og utleie legges på kopiens fakturainnstillinger.
 */
export function clonePricing({ settings, ownerProject }) {
  const s = normalizeLinkSettings(settings);
  const ordinary = ownerHourlyRate(ownerProject);
  const fixed = s.hours.mode === 'fixed';
  const hourlyRate = !s.hours.enabled ? null : (fixed ? s.hours.fixedRate : ordinary);
  return {
    pricingModel: s.hours.enabled ? 'hourly' : 'not_billable',
    pricingSettings: { hourlyRate },
    invoiceSettings: {
      discountHours: s.hours.enabled && !fixed && s.hours.discountPercent ? s.hours.discountPercent : null,
      discountProducts: s.products.discountPercent || null,
    },
    rentalDiscountPercent: s.rental.discountPercent,
  };
}

/** Prosjektnummer for kopien: eierens nummer, med -IC når nummeret er brukt av et annet prosjekt. */
export function cloneNumber(ownerNumber, projects = [], cloneId = '') {
  const base = text(ownerNumber) || 'IC';
  const taken = (number) => (projects || []).some((row) => (
    row?.id !== cloneId && text(row?.number).toLowerCase() === number.toLowerCase()
  ));
  if (!taken(base)) return base;
  for (let i = 1; i < 50; i += 1) {
    const next = i === 1 ? `${base}-IC` : `${base}-IC${i}`;
    if (!taken(next)) return next;
  }
  return `${base}-IC${Date.now().toString(36)}`;
}

/**
 * Kopien av eierens prosjekt hos leverandøren. Kunden er eieren. Finnes kopien, oppdateres
 * navn, eierens nummer og prisen; leverandørens egne felt (leder, fase, notater) står.
 */
export function buildCloneProject({ link, owner, ownerProject, customer = null, existing = null, projects = [], at = '' }) {
  const row = normalizeLink(link, link?.id);
  const stamp = text(at) || new Date().toISOString();
  const id = cloneProjectId(row.id, ownerProject.id);
  const pricing = clonePricing({ settings: row.settings, ownerProject });
  const base = existing && typeof existing === 'object' ? existing : {};
  return {
    ...base,
    id,
    name: text(ownerProject.name) || text(base.name) || 'Prosjekt',
    number: cloneNumber(ownerProject.number, projects, id),
    customerId: customer?.id || base.customerId || null,
    customerNumber: text(customer?.customerNumber) || text(base.customerNumber),
    orgnr: digits(owner.orgnr) || text(base.orgnr),
    client: text(owner.name),
    manager: text(base.manager),
    phase: text(base.phase) || text(ownerProject.phase) || 'planlegging',
    status: 'aktiv',
    start: text(base.start) || text(ownerProject.start),
    end: text(base.end) || text(ownerProject.end),
    place: text(base.place) || text(ownerProject.place),
    description: text(base.description) || `Underleveranse til ${text(owner.name)}, prosjekt ${text(ownerProject.number)}.`,
    // Pris og betingelser settes på kopien som på ethvert prosjekt. Avtalens priser er bare
    // utgangspunktet når kopien lages; en kopi som finnes, beholder sine egne.
    pricingModel: existing ? base.pricingModel : pricing.pricingModel,
    pricingSettings: existing ? (base.pricingSettings || {}) : pricing.pricingSettings,
    invoiceSettings: existing ? (base.invoiceSettings || {}) : pricing.invoiceSettings,
    workSettings: base.workSettings || { requireDescription: !!ownerProject?.workSettings?.requireDescription },
    intercompany: {
      linkId: row.id,
      role: 'supplier',
      ownerCompanyId: owner.id,
      ownerCompanyName: text(owner.name),
      ownerProjectId: text(ownerProject.id),
      ownerProjectNumber: text(ownerProject.number),
      ownerProjectName: text(ownerProject.name),
      rentalDiscountPercent: existing && base.intercompany?.rentalDiscountPercent != null
        ? base.intercompany.rentalDiscountPercent
        : pricing.rentalDiscountPercent,
      rateMissing: existing
        ? (!!base.intercompany?.rateMissing && !(Number(base.pricingSettings?.hourlyRate) > 0))
        : cloneRateMissing({ settings: row.settings, ownerProject }),
      clonedAt: text(base.intercompany?.clonedAt) || stamp,
      updatedAt: stamp,
    },
  };
}

/** Merket på eierens prosjekt: hvilke selskaper som leverer inn, og kopiens id hos dem. */
export function withSupplierOnOwnerProject(project, { link, supplier, cloneId, at = '' }) {
  const current = Array.isArray(project?.intercompany?.suppliers) ? project.intercompany.suppliers : [];
  const stamp = text(at) || new Date().toISOString();
  const next = current.filter((row) => row?.companyId !== supplier.id);
  next.push({ linkId: text(link.id), companyId: supplier.id, companyName: text(supplier.name), cloneProjectId: cloneId, since: stamp });
  return { ...project, intercompany: { ...(project?.intercompany || {}), role: 'owner', suppliers: next } };
}

/** Kort tekst om prosjektets integrasjon, eller tom tekst. */
export function projectIntercompanyLabel(project) {
  const ic = project?.intercompany;
  if (!ic) return '';
  if (ic.role === 'supplier') {
    return `Integrasjon: leveranse til ${text(ic.ownerCompanyName) || 'tilknyttet selskap'}, prosjekt ${text(ic.ownerProjectNumber)}`;
  }
  const names = (ic.suppliers || []).map((row) => text(row?.companyName)).filter(Boolean);
  return names.length ? `Integrasjon: medarbeidere fra ${names.join(', ')}` : '';
}

// ── Medarbeidere ──────────────────────────────────────────────────────────

/** Id på den innleide medarbeideren hos prosjekteier. */
export function externalEmployeeId(supplierCompanyId, supplierEmployeeId) {
  return mirrorId(supplierCompanyId, supplierEmployeeId);
}

/**
 * Ansattposten hos prosjekteier for en medarbeider fra partneren: innleid, med
 * hjemmeselskapet. Personen logger inn i sitt eget selskap og fører timer der.
 */
export function externalEmployeeRecord({ link, supplier, employee, existing = null, at = '' }) {
  const stamp = text(at) || new Date().toISOString();
  const base = existing && typeof existing === 'object' ? existing : {};
  const person = employee?.person || {};
  const company = employee?.company || {};
  const name = text(person.name) || [text(person.firstName), text(person.lastName)].filter(Boolean).join(' ') || text(employee?.name) || 'Medarbeider';
  return {
    ...base,
    id: externalEmployeeId(supplier.id, employee.id),
    version: base.version || 1,
    createdAt: text(base.createdAt) || stamp,
    updatedAt: stamp,
    personUid: text(base.personUid),
    linkStatus: text(base.linkStatus) || 'none',
    person: {
      ...(base.person || {}),
      name,
      firstName: text(person.firstName) || text(base.person?.firstName),
      lastName: text(person.lastName) || text(base.person?.lastName),
      email: text(person.email || company.email) || text(base.person?.email),
      phone: text(person.phone) || text(base.person?.phone),
      photoUrl: text(person.photoUrl) || text(base.person?.photoUrl),
    },
    company: {
      ...(base.company || {}),
      personnelKind: 'innleid',
      status: 'active',
      employmentType: 'Innleid',
      accessLevel: text(base.company?.accessLevel) || 'innleie_ekstern',
      accessLevels: Array.isArray(base.company?.accessLevels) && base.company.accessLevels.length
        ? base.company.accessLevels
        : ['innleie_ekstern'],
      title: text(company.title) || text(base.company?.title),
      externalEmployeeNumber: text(company.employeeNumber || company.externalEmployeeNumber) || text(base.company?.externalEmployeeNumber),
      homeCompanyId: supplier.id,
      homeCompanyName: text(supplier.name),
      homeCompanyOrgnr: digits(supplier.orgnr),
      homeEmployeeId: text(employee.id),
      intercompanyLinkId: text(link.id),
    },
  };
}

/** Medarbeiderens navn fra ansattposten. */
export function employeeDisplayName(employee) {
  const person = employee?.person || {};
  return text(person.name)
    || [text(person.firstName), text(person.lastName)].filter(Boolean).join(' ')
    || text(employee?.name)
    || 'Medarbeider';
}

/** Aktive egne ansatte som kan lånes ut (ikke innleide eller eksterne). */
export function lendableEmployees(employees = []) {
  return (employees || [])
    .filter((row) => row && typeof row === 'object' && row.deleted !== true)
    .filter((row) => {
      const company = row.company || {};
      const status = text(company.status) || 'active';
      const kind = text(company.personnelKind) || 'staff';
      return status === 'active' && kind === 'staff' && !company.homeCompanyId;
    })
    .map((row) => ({
      id: text(row.id),
      name: employeeDisplayName(row),
      title: text(row.company?.title),
      email: text(row.person?.email || row.company?.email),
      photoUrl: text(row.person?.photoUrl),
    }))
    .filter((row) => row.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

/** Deltakerrad på prosjektet (begge sider). Eksisterende rad aktiveres igjen. */
export function memberRow({ projectId, employeeId, employeeName, role = '', photoUrl = '', intercompany, existing = null, uid = '', at = '' }) {
  const stamp = text(at) || new Date().toISOString();
  const base = existing && typeof existing === 'object' ? existing : {};
  return {
    ...base,
    id: text(base.id) || `mem${safeId(employeeId).slice(-24)}${Number(Date.parse(stamp) || Date.now()).toString(36)}`,
    projectId,
    employeeId,
    employeeName: text(employeeName) || text(base.employeeName),
    photoUrl: text(photoUrl) || text(base.photoUrl),
    role: text(role) || text(base.role) || 'Prosjektmedlem',
    active: true,
    starred: !!base.starred,
    addedAt: text(base.addedAt) || stamp,
    addedByUid: text(base.addedByUid) || text(uid),
    updatedAt: stamp,
    intercompany,
  };
}

/** Sett eller erstatt deltakeren i listen (samme prosjekt og medarbeider). */
export function upsertMember(members = [], row) {
  const list = Array.isArray(members) ? members : [];
  const at = list.findIndex((item) => item?.projectId === row.projectId && item?.employeeId === row.employeeId);
  if (at < 0) return [row, ...list];
  const next = [...list];
  next[at] = { ...list[at], ...row, id: list[at].id || row.id };
  return next;
}

export function deactivateMember(members = [], { projectId, employeeId, at = '' }) {
  const stamp = text(at) || new Date().toISOString();
  return (members || []).map((row) => (
    row?.projectId === projectId && row?.employeeId === employeeId
      ? { ...row, active: false, updatedAt: stamp }
      : row
  ));
}

export function upsertProject(projects = [], project) {
  const list = Array.isArray(projects) ? projects : [];
  const at = list.findIndex((row) => row?.id === project.id);
  if (at < 0) return [project, ...list];
  const next = [...list];
  next[at] = project;
  return next;
}

// ── Kunden hos leverandøren ──────────────────────────────────────────────

/**
 * Prosjekteieren som kunde hos leverandøren: finnes på org.nr., ellers ny kunde med neste
 * kundenummer. Leveringsmåte og fakturaadresse fra avtalen.
 */
export function ensurePartnerCustomer(customers = [], { owner, link, nextNumber = '', at = '' }) {
  const list = Array.isArray(customers) ? customers : [];
  const row = normalizeLink(link, link?.id);
  const orgnr = digits(owner.orgnr);
  const stamp = text(at) || new Date().toISOString();
  const email = row.settings.invoiceEmails[safeId(owner.id)] || '';
  const found = list.find((item) => (orgnr && digits(item?.orgnr) === orgnr) || item?.id === `cus-${safeId(owner.id)}`);
  if (found) {
    const patch = { ...found };
    let changed = false;
    if (!text(found.invoiceDelivery)) { patch.invoiceDelivery = row.settings.invoiceDelivery; changed = true; }
    if (email && !text(found.invoiceEmail)) { patch.invoiceEmail = email; changed = true; }
    if (changed) patch.updatedAt = stamp;
    return {
      customer: patch,
      customers: changed ? list.map((item) => (item === found ? patch : item)) : list,
      created: false,
      changed,
    };
  }
  const customer = {
    id: `cus-${safeId(owner.id)}`,
    name: text(owner.name) || 'Tilknyttet selskap',
    kind: 'org',
    orgnr,
    customerNumber: text(nextNumber),
    invoiceDelivery: row.settings.invoiceDelivery,
    ...(email ? { invoiceEmail: email } : {}),
    notes: 'Tilknyttet selskap i ProTop (konsernintegrasjon).',
    createdAt: stamp,
    updatedAt: stamp,
  };
  return { customer, customers: [...list, customer], created: true, changed: true };
}

// ── Speiling av timer ────────────────────────────────────────────────────

const CORE_KEYS = ['date', 'hours', 'billableHours', 'timeType'];

function sameCore(a, b) {
  return CORE_KEYS.every((key) => String(a?.[key] ?? '') === String(b?.[key] ?? ''));
}

/** Leverandørens faktura til eier for raden: id, nummer og status (null når ikke fakturert). */
export function supplierInvoiceMeta(source, invoice = null) {
  const id = text(source?.invoiceId);
  if (!id) return null;
  return {
    id,
    number: text(invoice?.invoiceNumber),
    status: text(invoice?.status) || 'draft',
    date: text(invoice?.invoiceDate),
  };
}

/**
 * Timeføringen slik prosjekteier ser den. Arbeidsgiveren (leverandøren) godkjenner; når den har
 * godkjent eller fakturert, er føringen godkjent også hos eier og kan faktureres sluttkunden.
 * Eiers fakturakobling og egne felt står. Fakturerte føringer hos eier endres ikke i kjernen;
 * da merkes avviket i stedet.
 * invoice: leverandørens faktura (families/{leverandør}/invoices/{source.invoiceId}) når den finnes.
 * Svar: { action: 'set', row } | { action: 'delete' } | { action: 'none' }.
 */
export function mirrorTimeEntry({ source, existing = null, clone, supplier, ownerEmployeeId, invoice = null, at = '' }) {
  const stamp = text(at) || new Date().toISOString();
  const ic = clone?.intercompany || {};
  if (!source) {
    if (!existing) return { action: 'none' };
    if (text(existing.invoiceId)) {
      return {
        action: 'set',
        row: { ...existing, intercompany: { ...(existing.intercompany || {}), sourceDeleted: true, sourceUpdatedAt: stamp } },
      };
    }
    return { action: 'delete' };
  }
  // Godkjent hos leverandøren, også når leverandøren har fakturert eier (da står føringen som låst med faktura).
  const supplierApproved = source.status === 'godkjent' || !!text(source.invoiceId);
  const meta = {
    mirror: true,
    linkId: text(ic.linkId),
    sourceCompanyId: supplier.id,
    sourceCompanyName: text(supplier.name),
    sourceEntryId: text(source.id),
    sourceProjectId: text(source.projectId),
    sourceStatus: text(source.status) || 'registrert',
    supplierApproved,
    supplierInvoice: supplierInvoiceMeta(source, invoice),
    sourceUpdatedAt: text(source.updatedAt) || stamp,
  };
  const core = {
    date: text(source.date),
    hours: Number(source.hours) || 0,
    billableHours: source.billableHours == null ? (Number(source.hours) || 0) : Number(source.billableHours) || 0,
    timeType: text(source.timeType) || 'ordinary',
  };
  if (existing && text(existing.invoiceId)) {
    const drift = !sameCore(existing, core);
    return {
      action: 'set',
      row: { ...existing, intercompany: { ...meta, sourceChangedAfterInvoice: drift || !!existing.intercompany?.sourceChangedAfterInvoice } },
    };
  }
  const status = supplierApproved ? 'godkjent' : 'registrert';
  const history = Array.isArray(existing?.history) ? existing.history : [];
  // Eiers egne felt (internt notat, avskriving, historikk) står; resten kommer fra kilden.
  const own = existing && typeof existing === 'object' ? existing : {};
  return {
    action: 'set',
    row: {
      ...own,
      id: mirrorId(supplier.id, source.id),
      projectId: text(ic.ownerProjectId),
      employeeId: text(ownerEmployeeId),
      employeeName: text(source.employeeName),
      employeeNumber: text(source.employeeNumber),
      projectNumber: text(ic.ownerProjectNumber),
      projectName: text(ic.ownerProjectName),
      activityId: null,
      activityName: text(source.activityName) || 'Hovedaktivitet',
      ...core,
      description: text(source.description),
      internalNote: text(own.internalNote),
      clockIn: text(source.clockIn),
      clockOut: text(source.clockOut),
      department: text(own.department),
      invoiceId: null,
      status,
      createdAt: text(existing?.createdAt) || text(source.createdAt) || stamp,
      updatedAt: stamp,
      createdByUid: text(source.createdByUid),
      ...(history.length ? { history } : {}),
      icMirror: true,
      intercompany: meta,
    },
  };
}

/** Speilet føring som ikke er godkjent hos leverandøren ennå: vises, men faktureres ikke. */
export function mirrorAwaitingSupplier(row) {
  return isMirrorRow(row) && row?.intercompany?.supplierApproved !== true;
}

// ── Speiling av salg og utleie ───────────────────────────────────────────

/**
 * Salg (produkter eller utleie) på kopien, slik eieren ser det: samme vare, mengde og
 * ordinær pris, uten rabatten leverandøren gir eieren. Eiers egne innstillinger gjelder
 * mot sluttkunden. Klar hos leverandøren = kan faktureres hos eier.
 */
export function mirrorSale({ source, existing = null, clone, supplier, invoice = null, at = '' }) {
  const stamp = text(at) || new Date().toISOString();
  const ic = clone?.intercompany || {};
  if (!source || source.status === 'rejected') {
    if (!existing) return { action: 'none' };
    if (text(existing.invoiceId) || existing.status === 'invoiced') {
      return { action: 'set', row: { ...existing, intercompany: { ...(existing.intercompany || {}), sourceDeleted: true } } };
    }
    return { action: 'delete' };
  }
  const supplierApproved = source.status === 'approved' || source.status === 'invoiced' || !!text(source.invoiceId);
  const meta = {
    mirror: true,
    linkId: text(ic.linkId),
    sourceCompanyId: supplier.id,
    sourceCompanyName: text(supplier.name),
    sourceSaleId: text(source.id),
    sourceProjectId: text(source.projectId),
    sourceStatus: text(source.status) || 'draft',
    supplierApproved,
    supplierInvoice: supplierInvoiceMeta(source, invoice),
    sourceUpdatedAt: text(source.updatedAt) || stamp,
  };
  if (existing && (text(existing.invoiceId) || existing.status === 'invoiced')) {
    return { action: 'set', row: { ...existing, intercompany: meta } };
  }
  // Som timene: klar hos arbeidsgiveren = klar til fakturering hos eier.
  const own = existing && typeof existing === 'object' ? existing : {};
  return {
    action: 'set',
    row: {
      ...own,
      id: mirrorId(supplier.id, source.id),
      date: text(source.date),
      productId: '',
      sku: text(source.sku),
      name: text(source.name),
      kind: source.kind === 'rental' ? 'rental' : 'product',
      equipmentName: text(source.equipmentName),
      quantity: Number(source.quantity) || 1,
      unit: text(source.unit) || 'stk',
      unitPrice: Number(source.unitPrice) || 0,
      vatCode: text(source.vatCode) || 'HIGH',
      account: source.kind === 'rental' ? (text(source.account) || '3600') : (text(source.account) || '3000'),
      billable: source.billable !== false,
      customerId: text(own.customerId),
      customerNumber: text(own.customerNumber),
      customerName: text(own.customerName),
      projectId: text(ic.ownerProjectId),
      projectNumber: text(ic.ownerProjectNumber),
      projectName: text(ic.ownerProjectName),
      employeeId: '',
      employeeName: text(source.employeeName),
      status: supplierApproved ? 'approved' : 'draft',
      invoiceId: '',
      createdAt: text(existing?.createdAt) || text(source.createdAt) || stamp,
      updatedAt: stamp,
      period: text(source.period),
      comment: existing ? text(own.comment) : text(source.comment),
      // Eiers rabatt og påslag mot sluttkunden; leverandørens rabatt til eier følger ikke med.
      discountPercent: existing ? (Number(own.discountPercent) || 0) : 0,
      surchargePercent: existing ? (Number(own.surchargePercent) || 0) : 0,
      purchaseUnitPrice: Number(source.unitPrice) || 0,
      externalStore: true,
      storage: 'productSales',
      icMirror: true,
      intercompany: meta,
    },
  };
}

/**
 * Utlegg på kopien slik eier ser det: samme beløp, mva og kvittering. Godkjent (eller fakturert)
 * hos arbeidsgiveren = godkjent hos eier og kan faktureres sluttkunden. Eiers påslag og notater står.
 */
export function mirrorExpense({ source, existing = null, clone, supplier, invoice = null, at = '' }) {
  const stamp = text(at) || new Date().toISOString();
  const ic = clone?.intercompany || {};
  if (!source || source.status === 'rejected') {
    if (!existing) return { action: 'none' };
    if (text(existing.invoiceId) || existing.status === 'invoiced') {
      return { action: 'set', row: { ...existing, intercompany: { ...(existing.intercompany || {}), sourceDeleted: true } } };
    }
    return { action: 'delete' };
  }
  const supplierApproved = ['approved', 'invoiced', 'reimbursed'].includes(source.status) || !!text(source.invoiceId);
  const meta = {
    mirror: true,
    linkId: text(ic.linkId),
    sourceCompanyId: supplier.id,
    sourceCompanyName: text(supplier.name),
    sourceExpenseId: text(source.id),
    sourceProjectId: text(source.projectId),
    sourceStatus: text(source.status) || 'draft',
    supplierApproved,
    supplierInvoice: supplierInvoiceMeta(source, invoice),
    sourceUpdatedAt: text(source.updatedAt) || stamp,
  };
  if (existing && (text(existing.invoiceId) || existing.status === 'invoiced')) {
    return { action: 'set', row: { ...existing, intercompany: meta } };
  }
  const own = existing && typeof existing === 'object' ? existing : {};
  return {
    action: 'set',
    row: {
      ...own,
      id: mirrorId(supplier.id, source.id),
      date: text(source.date),
      employeeId: text(source.employeeId) ? mirrorId(supplier.id, source.employeeId) : '',
      employeeName: text(source.employeeName),
      category: text(source.category),
      description: text(source.description),
      purpose: text(source.purpose),
      vendor: text(source.vendor),
      // Betalt av arbeidsgiveren; hos eier er det en kostnad som faktureres derfra, ikke et refusjonskrav.
      paidBy: 'company',
      currency: text(source.currency) || 'NOK',
      amountExVat: Number(source.amountExVat) || 0,
      vatCode: text(source.vatCode),
      vatAmount: Number(source.vatAmount) || 0,
      amountInclVat: Number(source.amountInclVat) || 0,
      vatSplit: text(source.vatSplit),
      chargeType: source.chargeType === 'outlay' ? 'outlay' : 'reinvoice',
      markupPercent: existing ? (Number(own.markupPercent) || 0) : 0,
      billable: source.billable !== false && source.billingChoice !== 'no',
      billingChoice: source.billingChoice === 'unsure' ? 'unsure' : 'yes',
      projectId: text(ic.ownerProjectId),
      projectNumber: text(ic.ownerProjectNumber),
      projectName: text(ic.ownerProjectName),
      customerId: text(own.customerId),
      customerNumber: text(own.customerNumber),
      customerName: text(own.customerName),
      receiptUri: text(source.receiptUri),
      receiptName: text(source.receiptName),
      attachments: Array.isArray(source.attachments) ? source.attachments : [],
      activityName: text(source.activityName),
      status: supplierApproved ? 'approved' : 'draft',
      invoiceId: '',
      notes: text(own.notes),
      createdAt: text(own.createdAt) || text(source.createdAt) || stamp,
      updatedAt: stamp,
      externalStore: true,
      storage: 'projectExpenses',
      icMirror: true,
      intercompany: meta,
    },
  };
}

/** Utlegg som skal speiles: alle utlegg på en prosjektkopi. */
export function expensesToMirror(expenses = []) {
  return (expenses || []).filter((row) => row && isCloneProjectId(row.projectId));
}

/**
 * Kort tekst på en speilet rad hos eier: hvor den er ført, om arbeidsgiveren har godkjent, og
 * hvilken faktura den belastes på. Tom tekst for vanlige rader.
 */
export function mirrorStatusText(row) {
  if (!isMirrorRow(row)) return '';
  const ic = row.intercompany || {};
  const from = text(ic.sourceCompanyName) || 'tilknyttet selskap';
  const inv = ic.supplierInvoice;
  if (ic.sourceDeleted) return `Slettet i ${from} etter at den ble fakturert her`;
  if (inv?.id) {
    const number = text(inv.number);
    if (number) return `Ført i ${from} · belastes dere på faktura ${number} fra ${from}`;
    return `Ført i ${from} · på fakturautkast fra ${from} til dere`;
  }
  if (ic.supplierApproved) return `Ført i ${from} · godkjent der, faktureres dere fra ${from}`;
  return `Ført i ${from} · venter på godkjenning der`;
}

/**
 * Kort merke for en speilet rad: selskapet og hvor langt den har kommet hos arbeidsgiveren.
 * tone: 'wait' (venter på godkjenning der) eller 'ok'. Null for vanlige rader.
 */
export function mirrorTag(row) {
  if (!isMirrorRow(row)) return null;
  const ic = row.intercompany || {};
  const from = text(ic.sourceCompanyName) || 'Tilknyttet selskap';
  const inv = ic.supplierInvoice;
  let label = `${from} · venter på godkjenning`;
  let tone = 'wait';
  if (ic.sourceDeleted) label = `${from} · slettet der`;
  else if (inv?.id) {
    label = text(inv.number) ? `${from} · faktura ${text(inv.number)}` : `${from} · fakturautkast`;
    tone = 'ok';
  } else if (ic.supplierApproved) {
    label = `${from} · godkjent`;
    tone = 'ok';
  }
  return { label, tone, title: mirrorStatusText(row) };
}

/** Salg som skal speiles: på en prosjektkopi, med områdene avtalen omfatter. */
export function salesToMirror(sales = [], settings = {}) {
  const s = normalizeLinkSettings(settings);
  return (sales || []).filter((row) => {
    if (!row || !isCloneProjectId(row.projectId)) return false;
    if (row.kind === 'rental') return s.rental.enabled;
    return s.products.enabled;
  });
}

/** Endrede og fjernede rader (salg, utlegg) på prosjektkopier mellom to versjoner av listen. */
export function diffCloneSales(before = [], after = []) {
  const prev = new Map((before || []).filter((row) => row?.id && isCloneProjectId(row.projectId)).map((row) => [row.id, row]));
  const next = new Map((after || []).filter((row) => row?.id && isCloneProjectId(row.projectId)).map((row) => [row.id, row]));
  const changed = [];
  const removed = [];
  for (const [id, row] of next) {
    const old = prev.get(id);
    if (!old || JSON.stringify(old) !== JSON.stringify(row)) changed.push(row);
  }
  for (const [id, row] of prev) {
    if (!next.has(id)) removed.push(row);
  }
  return { changed, removed };
}

// ── Utstyrsutleie ────────────────────────────────────────────────────────

export const RENTAL_UNITS = [
  { id: 'time', label: 'time' },
  { id: 'dag', label: 'dag' },
  { id: 'uke', label: 'uke' },
  { id: 'mnd', label: 'måned' },
];

export function normalizeRental(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const unit = RENTAL_UNITS.some((row) => row.id === src.unit) ? src.unit : 'dag';
  return {
    enabled: src.enabled === true,
    price: money(src.price),
    unit,
    account: text(src.account) || '3600',
    // Fra denne datoen faktureres reservasjoner. Eldre reservasjoner blir ikke utleie i ettertid.
    since: /^\d{4}-\d{2}-\d{2}$/.test(text(src.since)) ? text(src.since) : '',
  };
}

function dayCount(from, through) {
  const a = Date.parse(`${text(from)}T00:00:00Z`);
  const b = Date.parse(`${text(through || from)}T00:00:00Z`);
  if (!Number.isFinite(a)) return 1;
  if (!Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

function clockMinutes(value) {
  const m = /T?(\d{2}):(\d{2})/.exec(text(value).slice(-5));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Timer per dag fra klokkeslettene (start og slutt ligger på første dag i bookingen). */
function hoursPerDay(start, end) {
  const a = clockMinutes(start);
  const b = clockMinutes(end);
  if (a == null || b == null || b <= a) return 8;
  return Math.max(0.5, Math.round(((b - a) / 60) * 2) / 2);
}

/** Mengde for bookingen i utstyrets prisenhet. Timepris: timer per dag ganger antall dager. */
export function rentalQuantity(booking, unit = 'dag') {
  const days = dayCount(booking?.date, booking?.endDate);
  if (unit === 'time') return Math.round(hoursPerDay(booking?.start, booking?.end) * days * 100) / 100;
  if (unit === 'uke') return Math.round((days / 7) * 100) / 100;
  if (unit === 'mnd') return Math.round((days / 30) * 100) / 100;
  return days;
}

export function rentalSaleId(bookingId) {
  return `rent-${safeId(bookingId)}`;
}

/**
 * Salgsraden for utleie av utstyr på et prosjekt. Utstyret må ha utleiepris, og bookingen
 * må stå på et prosjekt. Rabatten fra konsernavtalen gjelder når prosjektet er en kopi.
 * Svar: rad, eller null når bookingen ikke skal faktureres.
 */
export function rentalSaleFromBooking({ booking, equipment, project = null, existing = null, at = '' }) {
  const rental = normalizeRental(equipment?.rental);
  // Bare bekreftede enkeltreservasjoner på prosjekt. Faste serier og ventende forespørsler faktureres ikke automatisk.
  if (!booking || booking.status === 'cancelled' || booking.status === 'pending' || !text(booking.projectId)) return null;
  if (booking.recurring) return null;
  if (booking.billable === false || !rental.enabled || !(rental.price > 0)) return null;
  if (rental.since && text(booking.date) < rental.since) return null;
  const stamp = text(at) || new Date().toISOString();
  const quantity = rentalQuantity(booking, rental.unit);
  const unitLabel = RENTAL_UNITS.find((row) => row.id === rental.unit)?.label || 'dag';
  const discount = percent(project?.intercompany?.role === 'supplier' ? project?.intercompany?.rentalDiscountPercent : 0);
  const base = existing && typeof existing === 'object' ? existing : {};
  if (text(base.invoiceId) || base.status === 'invoiced') return base;
  const span = text(booking.endDate) && booking.endDate !== booking.date ? `${booking.date} – ${booking.endDate}` : text(booking.date);
  return {
    ...base,
    id: rentalSaleId(booking.id),
    kind: 'rental',
    bookingId: text(booking.id),
    equipmentId: text(equipment.id),
    equipmentName: text(equipment.name),
    date: text(booking.endDate) || text(booking.date),
    period: span,
    sku: '',
    name: `Utleie: ${text(equipment.name) || 'utstyr'}`,
    quantity,
    unit: unitLabel,
    unitPrice: rental.price,
    vatCode: 'HIGH',
    account: rental.account,
    billable: true,
    projectId: text(booking.projectId),
    projectNumber: text(project?.number),
    projectName: text(project?.name) || text(booking.projectName),
    employeeId: text(booking.employeeId),
    employeeName: text(booking.employeeName),
    status: text(base.status) || 'draft',
    discountPercent: discount,
    comment: text(booking.purpose),
    createdAt: text(base.createdAt) || stamp,
    updatedAt: stamp,
  };
}

/** Oppdater salgslisten etter utstyrsbookingene: nye, endrede og avlyste utleier. */
export function syncRentalSales({ sales = [], bookings = [], equipment = [], projects = [], at = '' }) {
  const byEquipment = new Map((equipment || []).map((row) => [row?.id, row]));
  const byProject = new Map((projects || []).map((row) => [row?.id, row]));
  const current = Array.isArray(sales) ? sales : [];
  const byId = new Map(current.map((row) => [row?.id, row]));
  const wanted = new Map();
  for (const booking of bookings || []) {
    const id = rentalSaleId(booking?.id);
    const row = rentalSaleFromBooking({
      booking,
      equipment: byEquipment.get(booking?.equipmentId),
      project: byProject.get(booking?.projectId),
      existing: byId.get(id),
      at,
    });
    if (row) wanted.set(id, row);
  }
  let changed = false;
  const next = [];
  for (const row of current) {
    if (row?.kind !== 'rental' || !text(row.bookingId)) {
      next.push(row);
      continue;
    }
    const want = wanted.get(row.id);
    wanted.delete(row.id);
    if (!want) {
      // Avlyst eller uten pris: fjern utkast, behold det som er klart eller fakturert.
      if (row.status === 'draft' && !text(row.invoiceId)) { changed = true; continue; }
      next.push(row);
      continue;
    }
    const same = ['quantity', 'unitPrice', 'projectId', 'date', 'discountPercent', 'name'].every((key) => String(row[key]) === String(want[key]));
    if (!same) changed = true;
    next.push(same ? row : { ...want, status: row.status === 'approved' ? 'draft' : row.status });
  }
  for (const row of wanted.values()) {
    next.push(row);
    changed = true;
  }
  return { sales: changed ? next : current, changed };
}

export function rentalAmount(row) {
  const base = round2((Number(row?.quantity) || 0) * (Number(row?.unitPrice) || 0));
  return round2(base * (1 - percent(row?.discountPercent) / 100));
}
