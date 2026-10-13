function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function signatureField(field) {
  return field?.kind === 'image' && /signatur|underskrift/i.test(`${field.label || ''} ${field.review || ''}`);
}

function chromeNote(field) {
  return field?.kind === 'note' && /ledelsessystem|dokument\s*(navn|id)|dokumenteier|godkjent av|\bversjon\b|org\.\s*\d|sentralbord|utskriftstidspunkt|\bsidetall\b|\bwww\.|^web:|e-?post:/i.test(field.label || '');
}

function companyFrom(fields) {
  const line = (fields || []).find((field) => field.kind === 'note' && /ledelsessystem/i.test(field.label || ''));
  return String(line?.label || '').split(/\s+-\s+/)[0].trim();
}

function blocks(fields, title) {
  const head = [];
  const body = [];
  const same = (left, right) => String(left || '').trim().toLocaleLowerCase('nb-NO') === String(right || '').trim().toLocaleLowerCase('nb-NO');
  (fields || []).forEach((field) => {
    if (chromeNote(field)) head.push(field);
    else if (!(field.kind === 'title' && same(field.label, title))) body.push(field);
  });
  const sections = [];
  let current = { title: '', items: [] };
  body.forEach((field) => {
    if (field.kind === 'title') {
      if (current.title || current.items.length) sections.push(current);
      current = { title: field.label || '', items: [] };
      return;
    }
    current.items.push(field);
  });
  if (current.title || current.items.length) sections.push(current);
  return { head, sections, company: companyFrom(fields) };
}

function fieldHtml(field) {
  if (field.kind === 'note') {
    return `<p class="prose">${esc(field.label)}</p>`;
  }
  if (signatureField(field)) {
    return `<div class="sign"><div class="line"></div><div class="cap">${esc(field.label)}</div></div>`;
  }
  if (field.kind === 'checks' || field.kind === 'choice' || field.kind === 'dropdown') {
    const boxes = (field.options || []).map((option) => `<span class="opt">${field.kind === 'checks' ? '☐' : '○'} ${esc(option.label)}</span>`).join('');
    return `<div class="field"><div class="label">${esc(field.label)}</div><div class="opts">${boxes}</div></div>`;
  }
  if (field.kind === 'check') {
    return `<div class="field"><div class="label">☐ ${esc(field.label)}</div></div>`;
  }
  const ghost = field.placeholder ? `[${String(field.placeholder).replace(/^\[|\]$/g, '')}]` : '';
  const tall = field.kind === 'long' ? ' tall' : '';
  return `<div class="field${field.width === 'half' ? ' half' : ''}"><div class="label">${esc(field.label)}${field.required ? ' *' : ''}</div><div class="value${tall}">${esc(ghost)}</div></div>`;
}

function sectionHtml(section) {
  const rows = [];
  const items = section.items || [];
  for (let i = 0; i < items.length; i += 1) {
    const field = items[i];
    const next = items[i + 1];
    if (signatureField(field) && next && signatureField(next)) {
      rows.push(`<div class="signs">${fieldHtml(field)}${fieldHtml(next)}</div>`);
      i += 1;
      continue;
    }
    if (field.width === 'half' && next && next.width === 'half' && field.kind !== 'note' && next.kind !== 'note') {
      rows.push(`<div class="pair">${fieldHtml(field)}${fieldHtml(next)}</div>`);
      i += 1;
      continue;
    }
    rows.push(fieldHtml(field));
  }
  const heading = section.title ? `<h2>${esc(section.title)}</h2>` : '';
  return `${heading}${rows.join('')}`;
}

export function formPrintHtml(draft, logo) {
  const model = blocks(draft?.fields || [], draft?.title);
  const logoHtml = logo ? `<img class="logo" alt="" src="${esc(logo)}" />` : `<div class="word">${esc(model.company.replace(/\s+AS$/i, ''))}</div>`;
  const head = model.head.map((field) => `<div>${esc(field.label)}</div>`).join('');
  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8" />
<title>${esc(draft?.title || 'Skjema')}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1c2430; font: 11pt Calibri, Carlito, "Segoe UI", Helvetica, Arial, sans-serif; }
  header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 8px; }
  .meta { font-size: 8.5pt; line-height: 1.35; color: #3c4654; }
  .word { font-size: 22pt; font-weight: 700; letter-spacing: -0.4px; }
  .logo { max-width: 160px; max-height: 52px; }
  h1 { font-size: 18pt; margin: 14px 0 10px; }
  h2 { font-size: 12pt; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #c5ced6; }
  .intro { margin: 0 0 8px; color: #3c4654; }
  .field { margin: 0 0 8px; }
  .label { font-size: 9pt; color: #5c6775; margin-bottom: 2px; }
  .value { min-height: 18px; border-bottom: 1px solid #9aa3ae; color: #6b7684; }
  .value.tall { min-height: 48px; }
  .pair { display: flex; gap: 16px; }
  .pair .field { flex: 1; }
  .opts { display: flex; flex-wrap: wrap; gap: 12px; }
  .prose { margin: 6px 0; line-height: 1.4; }
  .signs { display: flex; gap: 24px; margin-top: 8px; }
  .sign { flex: 1; }
  .line { height: 56px; border-bottom: 1px solid #1c2430; }
  .cap { margin-top: 4px; font-size: 9pt; font-weight: 700; text-align: center; }
</style>
</head>
<body>
<header>
  <div class="meta">${head}</div>
  ${logoHtml}
</header>
<h1>${esc(draft?.title || 'Uten navn')}</h1>
${draft?.intro ? `<p class="intro">${esc(draft.intro)}</p>` : ''}
${model.sections.map(sectionHtml).join('')}
</body>
</html>`;
}

export function printForm(draft, logo) {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Utskrift');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(formPrintHtml(draft, logo));
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  };
  if (frame.contentWindow?.document?.readyState === 'complete') run();
  else frame.onload = run;
}
