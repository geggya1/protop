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

function lockedField(field) {
  return field?.editor === 'fast';
}

function shownValue(field) {
  const value = field?.value;
  if (value == null || value === '' || value === false) return '';
  if (Array.isArray(value)) {
    return value.map((id) => (field.options || []).find((row) => row.id === id)?.label || String(id).replace(/^other:/, '')).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') return value.name || '';
  return String(value);
}

function tick(on) {
  return `<span class="tick">${on ? '✓' : ''}</span>`;
}

function checkLine(field) {
  return `<div class="checkline"><span>${esc(field.label)}</span>${tick(!!field.value)}</div>`;
}

function cellInner(field) {
  if (field.kind === 'check') return checkLine(field);
  if (field.kind === 'checks' || field.kind === 'choice' || field.kind === 'dropdown') {
    const mark = field.kind === 'choice' ? '○' : '☐';
    const boxes = (field.options || []).map((option) => `<span class="opt">${mark} ${esc(option.label)}</span>`).join('');
    return `<div class="cellcap">${esc(field.label)}</div><div class="opts">${boxes}</div>`;
  }
  const locked = lockedField(field);
  const ghost = !locked && field.placeholder ? esc(String(field.placeholder).replace(/^\[|\]$/g, '')) : '';
  const body = locked ? esc(shownValue(field)) : ghost;
  const tall = field.kind === 'long' || signatureField(field) ? ' tall' : '';
  return `<div class="cellcap">${esc(field.label)}${field.required && !locked ? ' *' : ''}</div><div class="box${tall}${ghost && !locked ? ' ghost' : ''}">${body}</div>`;
}

function cell(field, span) {
  const locked = lockedField(field) ? ' locked' : '';
  const wide = span ? ' colspan="2"' : '';
  return `<td class="cell${locked}"${wide}>${cellInner(field)}</td>`;
}

function takeChecks(items, start) {
  const run = [];
  let index = start;
  while (index < items.length && items[index].kind === 'check' && run.length < 4) {
    run.push(items[index]);
    index += 1;
  }
  return { run, next: index };
}

function gridRows(items) {
  const rows = [];
  for (let i = 0; i < items.length;) {
    const field = items[i];
    const next = items[i + 1];
    if (field.kind === 'note') {
      rows.push(`<tr><td class="hint" colspan="2">${esc(field.label)}</td></tr>`);
      i += 1;
      continue;
    }
    if (field.width === 'half' && next && next.kind === 'check') {
      const run = takeChecks(items, i + 1);
      rows.push(`<tr>${cell(field)}<td>${run.run.map(checkLine).join('')}</td></tr>`);
      i = run.next;
      continue;
    }
    if (field.kind === 'check') {
      const run = takeChecks(items, i);
      rows.push(`<tr><td colspan="2">${run.run.map(checkLine).join('')}</td></tr>`);
      i = run.next;
      continue;
    }
    if (field.width === 'half' && next && next.width === 'half' && next.kind !== 'note') {
      rows.push(`<tr>${cell(field)}${cell(next)}</tr>`);
      i += 2;
      continue;
    }
    rows.push(`<tr>${cell(field, true)}</tr>`);
    i += 1;
  }
  return rows.join('');
}

function gridSection(section) {
  const bar = section.title ? `<tr><td class="bar" colspan="2">${esc(section.title)}</td></tr>` : '';
  return `<table class="grid">${bar}${gridRows(section.items || [])}</table>`;
}

function gridBody(draft, logo, model) {
  const brand = logo
    ? `<img class="logo" alt="" src="${esc(logo)}" />`
    : (model.company ? `<div class="word">${esc(model.company.replace(/\s+AS$/i, ''))}</div>` : '<div></div>');
  const foot = model.head.map((field) => esc(field.label)).filter(Boolean).join(' · ');
  return `<header class="top">${brand}<h1>${esc(draft?.title || 'Skjema')}</h1></header>
${draft?.intro ? `<p class="intro">${esc(draft.intro)}</p>` : ''}
${model.sections.map(gridSection).join('')}
${foot ? `<footer class="foot"><span>${foot}</span></footer>` : ''}`;
}

function letterBody(draft, logo, model) {
  const logoHtml = logo ? `<img class="logo" alt="" src="${esc(logo)}" />` : `<div class="word">${esc(model.company.replace(/\s+AS$/i, ''))}</div>`;
  const head = model.head.map((field) => `<div>${esc(field.label)}</div>`).join('');
  return `<header>
  <div class="meta">${head}</div>
  ${logoHtml}
</header>
<h1>${esc(draft?.title || 'Uten navn')}</h1>
${draft?.intro ? `<p class="intro">${esc(draft.intro)}</p>` : ''}
${model.sections.map(sectionHtml).join('')}`;
}

export function formPrintHtml(draft, logo, options = {}) {
  const model = blocks(draft?.fields || [], draft?.title);
  const preview = !!options.preview;
  const grid = draft?.settings?.layout === 'skjema';
  const body = grid ? gridBody(draft, logo, model) : letterBody(draft, logo, model);
  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8" />
<title>${esc(draft?.title || 'Skjema')}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1c2430; font: 11pt Calibri, Carlito, "Segoe UI", Helvetica, Arial, sans-serif; }
  header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .meta { font-size: 8.5pt; line-height: 1.35; color: #3c4654; }
  .word { font-size: 22pt; font-weight: 700; letter-spacing: -0.4px; }
  .logo { max-width: 160px; max-height: 48px; }
  .intro { margin: 0 0 8px; color: #3c4654; }
  body.brev h1 { font-size: 18pt; margin: 14px 0 10px; }
  body.brev h2 { font-size: 12pt; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #c5ced6; }
  body.brev .field { margin: 0 0 8px; }
  body.brev .label { font-size: 9pt; color: #5c6775; margin-bottom: 2px; }
  body.brev .value { min-height: 18px; border-bottom: 1px solid #9aa3ae; color: #6b7684; }
  body.brev .value.tall { min-height: 48px; }
  body.brev .pair { display: flex; gap: 16px; }
  body.brev .pair .field { flex: 1; }
  body.brev .opts { display: flex; flex-wrap: wrap; gap: 12px; }
  body.brev .prose { margin: 6px 0; line-height: 1.4; }
  body.brev .signs { display: flex; gap: 24px; margin-top: 8px; }
  body.brev .sign { flex: 1; }
  body.brev .line { height: 56px; border-bottom: 1px solid #1c2430; }
  body.brev .cap { margin-top: 4px; font-size: 9pt; font-weight: 700; text-align: center; }
  body.skjema { font-size: 9pt; color: #111; }
  body.skjema header { align-items: flex-end; margin-bottom: 12px; }
  body.skjema h1 { margin: 0; font-size: 18pt; text-align: right; }
  body.skjema .word { font-size: 16pt; }
  body.skjema .intro { font-size: 9.5pt; margin: 0 0 10px; }
  body.skjema table.grid { width: 100%; border-collapse: collapse; margin: 0 0 10px; }
  body.skjema td { border: 1px solid #1a1a1a; vertical-align: top; padding: 3px 6px 8px; background: #fff; }
  body.skjema td.bar { background: #e6e6e6; font-weight: 700; padding: 4px 6px; }
  body.skjema td.hint { background: #f3f3f3; font-size: 8.5pt; padding: 4px 6px; }
  body.skjema td.locked { background: #f4f4f4; }
  body.skjema .cellcap { font-size: 8pt; line-height: 1.25; }
  body.skjema .box { min-height: 16px; font-size: 10pt; }
  body.skjema .box.tall { min-height: 58px; }
  body.skjema .box.ghost { color: #8b939e; }
  body.skjema .opts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
  body.skjema .checkline { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 18px; }
  body.skjema .tick { width: 12px; height: 12px; border: 1px solid #111; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; line-height: 1; flex: none; }
  body.skjema .foot { display: flex; justify-content: space-between; gap: 12px; font-size: 8pt; margin-top: 4px; }
  ${preview ? 'html { background: #e6ebf1; } body { max-width: 720px; margin: 16px auto 32px; background: #fff; padding: 28px 32px 36px; box-shadow: 0 10px 28px rgba(16,24,40,.12); }' : ''}
</style>
</head>
<body class="${grid ? 'skjema' : 'brev'}">
${body}
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
