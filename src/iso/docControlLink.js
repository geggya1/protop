/**
 * Kobling til dokumentstyringen i Skjemabygger og HR (families/{id}/docControl).
 * Maler fra KS-biblioteket (ks_*) og personalhåndboka godkjennes der. ISO viser status og bruker
 * godkjent versjon, så ingenting godkjennes to steder. ISO-maler (iso_*) styres fortsatt i ISO.
 */

const text = (v, max = 200) => String(v ?? '').trim().slice(0, max);

/** Maler som styres i Skjemabygger → Dokumentstyring (ikke i ISO). */
export function isDocControlledTemplate(templateId) {
  return /^ks_/.test(String(templateId || ''));
}

export function normalizeDocControls(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.id && !r.archived).map((r) => ({
    id: text(r.id, 100),
    kind: r.kind === 'handbook' ? 'handbook' : 'template',
    refId: text(r.refId, 100),
    title: text(r.title, 160),
    code: text(r.code, 40),
    owner: r.owner || {},
    readRule: text(r.readRule, 20) || 'ingen',
    nextReview: text(r.nextReview, 10),
    publishedRevision: Math.max(0, Math.round(Number(r.publishedRevision) || 0)),
    revisions: Array.isArray(r.revisions) ? r.revisions : [],
  }));
}

function published(c) {
  return (c.revisions || []).find((r) => Number(r.revision) === c.publishedRevision && r.state === 'publisert') || null;
}

function working(c) {
  return (c.revisions || []).find((r) => ['utkast', 'til_gjennomgang', 'avvist'].includes(r.state)) || null;
}

/**
 * Godkjente maler i dokumentstyringen som styrte skjema i ISO (skrivebeskyttet).
 * Feltene er øyeblikksbildet fra godkjenningen, ellers malen slik den er i Skjemabygger.
 */
export function externalFormControls(controls, templates = []) {
  const out = [];
  for (const c of normalizeDocControls(controls)) {
    if (c.kind !== 'template' || !c.refId) continue;
    const rev = published(c);
    if (!rev) continue;
    const tpl = (templates || []).find((t) => t.id === c.refId);
    const fields = (rev.snapshot?.fields || tpl?.fields || []).map((f) => ({ ...f, value: undefined }));
    if (!fields.length) continue;
    out.push({
      id: `dc_${c.id}`,
      templateId: c.refId,
      title: c.title || tpl?.title || '',
      external: 'docControl',
      publishedVersion: Number(rev.revision) || 1,
      versions: [{
        version: Number(rev.revision) || 1,
        hash: text(rev.contentHash, 40),
        title: c.title || tpl?.title || '',
        fields,
        approvedAt: text(rev.approvedAt, 40),
        approvedBy: text(rev.approvedBy, 120),
        note: 'Godkjent i Skjemabygger → Dokumentstyring',
      }],
    });
  }
  return out;
}

/** ISO-skjemaene pluss de eksterne, uten å dekke over en ISO-kontroll for samme mal. */
export function mergeForms(isoForms, external) {
  const own = new Set((isoForms || []).filter((f) => !f.archived).map((f) => f.templateId));
  return [...(isoForms || []), ...(external || []).filter((e) => !own.has(e.templateId))];
}

const STATE_LABEL = { utkast: 'Utkast', til_gjennomgang: 'Til godkjenning', avvist: 'Avvist' };

/** Dokumenter som styres i andre moduler, til dokumentlisten i ISO (ISO 7.5). */
export function externalDocumentRows(controls) {
  return normalizeDocControls(controls).map((c) => {
    const rev = published(c);
    const work = working(c);
    return {
      id: c.id,
      kind: c.kind,
      title: c.title,
      code: c.code,
      revision: rev ? Number(rev.revision) : 0,
      approvedBy: text(rev?.approvedBy, 120),
      approvedAt: text(rev?.approvedAt, 40),
      status: rev ? `Gjeldende rev. ${rev.revision}${work ? ` · ${STATE_LABEL[work.state] || work.state} rev. ${work.revision}` : ''}` : (STATE_LABEL[work?.state] || 'Utkast'),
      waiting: work?.state === 'til_gjennomgang',
      nextReview: c.nextReview,
      readRule: c.readRule,
      where: c.kind === 'handbook' ? 'HR → Personalhåndbok' : 'Skjemabygger → Dokumentstyring',
      link: c.kind === 'handbook' ? { tab: 'hr', subView: 'handbok' } : { tab: 'skjema', subView: '' },
    };
  }).sort((a, b) => String(a.code || a.title).localeCompare(String(b.code || b.title), 'nb', { numeric: true }));
}
