import { DOC_INFO_FIELDS, hasDocInfo, needsInput, normalizeDocInfo, tableRows } from '../../src/anbud/formBuilder';
import { fillTokens, formWithTokens } from '../../src/forms/tokens';

/** Samme gulfarge som avtalemodulen bruker på felt som må fylles ut. */
const NEED_BG = '#fff4cc';
const NEED_BORDER = '#d4a017';
const NAVY = '#1f3b5c';
const BAR = '#dce6f1';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssString(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;
}

function signatureField(field) {
  return field?.kind === 'sign'
    || (field?.kind === 'image' && /signatur|underskrift/i.test(`${field.label || ''} ${field.review || ''}`));
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

function dateText(value) {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : raw;
}

function stampText(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} kl. ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

function optionLabel(field, id) {
  const raw = String(id || '');
  if (raw.startsWith('other:')) return raw.slice(6) || 'Annet';
  return (field.options || []).find((row) => row.id === raw)?.label || raw;
}

function shownValue(field) {
  const value = field?.value;
  if (value == null || value === '' || value === false) return '';
  if (field.kind === 'date') return dateText(value);
  if (Array.isArray(value)) return value.map((id) => optionLabel(field, id)).filter(Boolean).join(', ');
  if (typeof value === 'object') return value.name || '';
  if (field.kind === 'choice' || field.kind === 'dropdown') return optionLabel(field, value);
  return String(value);
}

/** Avsnitt med punktlister. Linjer som starter med • eller - blir punkter. */
function proseHtml(textValue) {
  const lines = String(textValue || '').split('\n');
  const out = [];
  let list = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const line of lines) {
    const bullet = line.match(/^\s*(?:[•\-–*❖]|\d+[.)])\s+(.+)$/);
    if (bullet && /^\s*[•\-–*❖]/.test(line)) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (line.trim()) out.push(`<p>${esc(line.trim())}</p>`);
  }
  flush();
  return `<div class="prose">${out.join('')}</div>`;
}

function needClass(field, ctx) {
  return ctx.highlight && needsInput(field) ? ' need' : '';
}

function tick(on) {
  return `<span class="tick">${on ? '✓' : ''}</span>`;
}

function signHtml(field, ctx) {
  const value = field.value && typeof field.value === 'object' ? field.value : null;
  const signed = field.kind === 'sign' && value?.name;
  const image = field.kind === 'image' && value?.dataUrl && String(value.dataUrl).startsWith('data:image/');
  const mark = signed
    ? `<div class="signed">Signert digitalt av ${esc(value.name)}${value.at ? ` · ${esc(stampText(value.at))}` : ''}${value.place ? ` · ${esc(value.place)}` : ''}</div>`
    : (image ? `<img class="signimg" alt="" src="${esc(value.dataUrl)}" />` : '');
  return `<div class="sign${needClass(field, ctx)}">${mark}<div class="line"></div><div class="cap">${esc(field.label)}</div>${field.help ? `<div class="help">${esc(field.help)}</div>` : ''}</div>`;
}

function tableHtml(field, ctx) {
  const columns = field.columns || [];
  if (!columns.length) return '';
  const rows = tableRows(field);
  const total = columns.reduce((sum, col) => sum + (col.type === 'mark' ? col.options.length : (col.width || 3)), 0) || 1;
  const cols = columns.flatMap((col) => (col.type === 'mark'
    ? col.options.map(() => `<col style="width:${(100 / total).toFixed(2)}%" />`)
    : [`<col style="width:${(((col.width || 3) / total) * 100).toFixed(2)}%" />`])).join('');
  const head = columns.map((col) => (col.type === 'mark'
    ? col.options.map((opt) => `<th class="mk">${esc(opt)}</th>`).join('')
    : `<th${col.type === 'check' ? ' class="mk"' : ''}>${esc(col.label)}</th>`)).join('');
  const span = columns.reduce((sum, col) => sum + (col.type === 'mark' ? col.options.length : 1), 0);
  const body = rows.map((row) => {
    if (row.group) return `<tr class="grp"><td colspan="${span}">${esc(row.group)}</td></tr>`;
    const cells = columns.map((col) => {
      const preset = row.preset?.[col.id];
      const answer = row.cells?.[col.id];
      if (col.type === 'mark') {
        return col.options.map((opt) => `<td class="mk">${tick(answer === opt)}</td>`).join('');
      }
      if (col.type === 'check') return `<td class="mk">${tick(answer === true)}</td>`;
      if (col.type === 'fixed') {
        return `<td>${esc(row.added ? (answer || '') : (preset || ''))}</td>`;
      }
      const shown = answer !== undefined && answer !== '' ? (col.type === 'date' ? dateText(answer) : answer) : (preset || '');
      return `<td class="${col.type === 'long' ? 'tall' : ''}">${esc(shown)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  const sameAsSection = String(ctx.sectionTitle || '').trim().toLocaleLowerCase('nb-NO') === String(field.label || '').trim().toLocaleLowerCase('nb-NO');
  const caption = field.label && !sameAsSection ? `<div class="tcap">${esc(field.label)}${field.required ? ' *' : ''}</div>` : '';
  const legend = field.legend ? `<div class="legend">${esc(field.legend)}</div>` : '';
  const help = field.help ? `<div class="help">${esc(field.help)}</div>` : '';
  return `<div class="tblwrap${needClass(field, ctx)}">${caption}${help}<table class="tbl"><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${legend}</div>`;
}

function optionsHtml(field) {
  const value = field.value;
  const picked = (id) => (Array.isArray(value) ? value.includes(id) : value === id);
  return (field.options || []).map((option) => {
    const on = picked(option.id);
    const mark = field.kind === 'checks' ? (on ? '☒' : '☐') : (on ? '◉' : '○');
    return `<span class="opt${on ? ' on' : ''}">${mark} ${esc(option.label)}</span>`;
  }).join('');
}

function ghostOf(field) {
  if (field.placeholder) return String(field.placeholder).replace(/^\[|\]$/g, '');
  return '';
}

function fieldHtml(field, ctx) {
  if (field.kind === 'note') return proseHtml(field.label);
  if (field.kind === 'table') return tableHtml(field, ctx);
  if (signatureField(field)) return signHtml(field, ctx);
  const need = needClass(field, ctx);
  if (field.kind === 'dropdown') {
    const shown = shownValue(field);
    const ghost = (field.options || []).map((row) => row.label).join(' / ');
    return `<div class="field${field.width === 'half' ? ' half' : ''}${need}"><div class="label">${esc(field.label)}${field.required ? ' *' : ''}</div><div class="value">${shown ? esc(shown) : `<span class="ghost">${esc(ghost)}</span>`}</div></div>`;
  }
  if (field.kind === 'checks' || field.kind === 'choice') {
    return `<div class="field${need}"><div class="label">${esc(field.label)}${field.required ? ' *' : ''}</div><div class="opts">${optionsHtml(field)}</div></div>`;
  }
  if (field.kind === 'check') {
    return `<div class="field checkrow${need}">${tick(field.value === true)}<span>${esc(field.label)}</span></div>`;
  }
  if (field.kind === 'image' && field.value?.dataUrl && String(field.value.dataUrl).startsWith('data:image/')) {
    return `<div class="field"><div class="label">${esc(field.label)}</div><img class="photo" alt="" src="${esc(field.value.dataUrl)}" /></div>`;
  }
  const shown = shownValue(field);
  const tall = field.kind === 'long' ? ' tall' : '';
  const body = shown ? esc(shown) : `<span class="ghost">${esc(ghostOf(field))}</span>`;
  return `<div class="field${field.width === 'half' ? ' half' : ''}${need}"><div class="label">${esc(field.label)}${field.required ? ' *' : ''}</div><div class="value${tall}">${body}</div>${field.help ? `<div class="help">${esc(field.help)}</div>` : ''}</div>`;
}

function sectionHtml(section, outer) {
  const ctx = { ...outer, sectionTitle: section.title };
  const rows = [];
  const items = section.items || [];
  for (let i = 0; i < items.length; i += 1) {
    const field = items[i];
    const next = items[i + 1];
    if (signatureField(field) && next && signatureField(next)) {
      rows.push(`<div class="signs">${fieldHtml(field, ctx)}${fieldHtml(next, ctx)}</div>`);
      i += 1;
      continue;
    }
    if (field.width === 'half' && next && next.width === 'half' && field.kind !== 'note' && next.kind !== 'note') {
      rows.push(`<div class="pair">${fieldHtml(field, ctx)}${fieldHtml(next, ctx)}</div>`);
      i += 1;
      continue;
    }
    rows.push(fieldHtml(field, ctx));
  }
  const heading = section.title ? `<h2>${esc(section.title)}</h2>` : '';
  return `<section>${heading}${rows.join('')}</section>`;
}

function lockedField(field) {
  return field?.editor === 'fast';
}

function checkLine(field) {
  return `<div class="checkline"><span>${esc(field.label)}</span>${tick(field.value === true)}</div>`;
}

function cellInner(field, ctx) {
  if (field.kind === 'check') return checkLine(field);
  if (field.kind === 'dropdown') {
    const shown = shownValue(field);
    const ghost = (field.options || []).map((row) => row.label).join(' / ');
    return `<div class="cellcap">${esc(field.label)}${field.required ? ' *' : ''}</div><div class="box${shown ? '' : ' ghost'}">${esc(shown || ghost)}</div>`;
  }
  if (field.kind === 'checks' || field.kind === 'choice') {
    return `<div class="cellcap">${esc(field.label)}</div><div class="opts">${optionsHtml(field)}</div>`;
  }
  if (field.kind === 'sign') {
    const value = field.value;
    return `<div class="cellcap">${esc(field.label)}</div><div class="box tall">${value?.name ? `Signert digitalt av ${esc(value.name)}${value.at ? ` · ${esc(stampText(value.at))}` : ''}` : ''}</div>`;
  }
  const locked = lockedField(field);
  const shown = shownValue(field);
  const ghost = !shown && !locked ? esc(ghostOf(field)) : '';
  const tall = field.kind === 'long' || signatureField(field) ? ' tall' : '';
  return `<div class="cellcap">${esc(field.label)}${field.required && !locked ? ' *' : ''}</div><div class="box${tall}${ghost ? ' ghost' : ''}">${shown ? esc(shown) : ghost}</div>`;
}

function cell(field, ctx, span) {
  const locked = lockedField(field) ? ' locked' : '';
  const wide = span ? ' colspan="2"' : '';
  return `<td class="cell${locked}${needClass(field, ctx)}"${wide}>${cellInner(field, ctx)}</td>`;
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

function gridRows(items, ctx) {
  const rows = [];
  for (let i = 0; i < items.length;) {
    const field = items[i];
    const next = items[i + 1];
    if (field.kind === 'note') {
      rows.push(`<tr><td class="hint" colspan="2">${proseHtml(field.label)}</td></tr>`);
      i += 1;
      continue;
    }
    if (field.kind === 'table' || (signatureField(field) && field.kind !== 'sign')) {
      rows.push(`<tr><td class="flat" colspan="2">${fieldHtml(field, ctx)}</td></tr>`);
      i += 1;
      continue;
    }
    if (field.width === 'half' && next && next.kind === 'check') {
      const run = takeChecks(items, i + 1);
      rows.push(`<tr>${cell(field, ctx)}<td>${run.run.map(checkLine).join('')}</td></tr>`);
      i = run.next;
      continue;
    }
    if (field.kind === 'check') {
      const run = takeChecks(items, i);
      rows.push(`<tr><td colspan="2">${run.run.map(checkLine).join('')}</td></tr>`);
      i = run.next;
      continue;
    }
    if (field.width === 'half' && next && next.width === 'half' && next.kind !== 'note' && next.kind !== 'table') {
      rows.push(`<tr>${cell(field, ctx)}${cell(next, ctx)}</tr>`);
      i += 2;
      continue;
    }
    rows.push(`<tr>${cell(field, ctx, true)}</tr>`);
    i += 1;
  }
  return rows.join('');
}

function gridSection(section, outer) {
  const ctx = { ...outer, sectionTitle: section.title };
  const bar = section.title ? `<tr><td class="bar" colspan="2">${esc(section.title)}</td></tr>` : '';
  return `<table class="grid">${bar}${gridRows(section.items || [], ctx)}</table>`;
}

function brandHtml(logo, name) {
  if (logo) return `<img class="logo" alt="" src="${esc(logo)}" />`;
  const word = String(name || '').replace(/\s+AS$/i, '').trim();
  return word ? `<div class="word">${esc(word)}</div>` : '<div></div>';
}

/** KS-hodet: systemnavn og dokumentinformasjon til venstre, logo til høyre. */
function docHeadHtml(draft, logo, model, ctx) {
  const info = normalizeDocInfo(draft?.doc);
  const company = ctx.company?.firma || model.company;
  const system = info.system || (company ? `${company} - Ledelsessystem` : '');
  const cells = [
    ['Dokument navn', draft?.title || ''],
    ...DOC_INFO_FIELDS.map((row) => [row.label, row.key === 'created' || row.key === 'changed' || row.key === 'approved' ? dateText(info[row.key]) : info[row.key]]),
  ];
  const pairs = [];
  // To rader à fire par, slik KS-malene har det.
  const order = [0, 5, 6, 7, 1, 2, 3, 4].map((index) => cells[index]).filter(Boolean);
  for (let i = 0; i < order.length; i += 4) pairs.push(order.slice(i, i + 4));
  const table = pairs.map((row) => `<tr>${row.map(([label, value]) => `<th>${esc(label)}</th><td>${esc(value || '')}</td>`).join('')}</tr>`).join('');
  return `<header class="dochead">
  <div class="docmeta">
    ${system ? `<div class="system">${esc(system)}</div>` : ''}
    <table class="meta">${table}</table>
  </div>
  ${brandHtml(logo, company)}
</header>`;
}

function footerText(ctx) {
  const c = ctx.company || {};
  return [
    c.firma,
    c.orgnr ? `Org. ${c.orgnr}` : '',
    c.telefon ? `Sentralbord: ${c.telefon}` : '',
    c.web ? `Web: ${c.web}` : '',
    c.epost ? `E-post: ${c.epost}` : '',
  ].filter(Boolean).join('   ');
}

function screenFooter(ctx) {
  const left = footerText(ctx);
  const printed = ctx.printedAt ? `Utskriftstidspunkt ${stampText(ctx.printedAt)}` : '';
  if (!left && !printed) return '';
  return `<footer class="pagefoot"><span>${esc(left)}</span><span>${esc(printed)}</span></footer>`;
}

function gridBody(draft, logo, model, ctx) {
  const ks = hasDocInfo(draft?.doc);
  const top = ks
    ? `${docHeadHtml(draft, logo, model, ctx)}<div class="titlerow"><h1>${esc(draft?.title || 'Skjema')}</h1>${draft?.number ? `<div class="docno"><span>Nr.</span>${esc(draft.number)}</div>` : ''}</div>`
    : `<header class="top">${brandHtml(logo, ctx.company?.firma || model.company)}<h1>${esc(draft?.title || 'Skjema')}</h1></header>`;
  const foot = model.head.map((field) => esc(field.label)).filter(Boolean).join(' · ');
  return `${top}
${draft?.intro ? `<p class="intro">${esc(draft.intro)}</p>` : ''}
${model.sections.map((section) => gridSection(section, ctx)).join('')}
${foot ? `<footer class="foot"><span>${foot}</span></footer>` : ''}`;
}

function letterBody(draft, logo, model, ctx) {
  const ks = hasDocInfo(draft?.doc);
  const company = ctx.company?.firma || model.company;
  const top = ks
    ? docHeadHtml(draft, logo, model, ctx)
    : `<header class="top">
  <div class="meta">${model.head.map((field) => `<div>${esc(field.label)}</div>`).join('')}</div>
  ${brandHtml(logo, company)}
</header>`;
  return `${top}
<h1>${esc(draft?.title || 'Uten navn')}</h1>
${draft?.intro ? `<p class="intro">${esc(draft.intro)}</p>` : ''}
${model.sections.map((section) => sectionHtml(section, ctx)).join('')}`;
}

/**
 * Dokumentet som HTML for forhåndsvisning og utskrift (Lagre som PDF).
 * options.company: flettefelt og bunntekst (se src/forms/tokens.js).
 * options.highlight: gul bakgrunn på felt som venter på utfylling (standard på).
 */
export function formPrintHtml(source, logo, options = {}) {
  const company = options.company || null;
  const draft = company ? formWithTokens(source, company) : source;
  const model = blocks(draft?.fields || [], draft?.title);
  const preview = !!options.preview;
  const grid = draft?.settings?.layout === 'skjema';
  const ctx = {
    company,
    highlight: options.highlight !== false,
    printedAt: options.printedAt || new Date().toISOString(),
  };
  const body = grid ? gridBody(draft, logo, model, ctx) : letterBody(draft, logo, model, ctx);
  const footLeft = footerText(ctx);
  const footRight = `Utskrift ${stampText(ctx.printedAt)}`;
  const title = fillTokens(draft?.title || 'Skjema', company || {});
  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 18mm; }
  @page { @bottom-left { content: ${cssString(footLeft)}; font: 7.5pt Calibri, Carlito, Arial, sans-serif; color: #3c4654; } @bottom-right { content: ${cssString(footRight)} "   Side " counter(page) " av " counter(pages); font: 7.5pt Calibri, Carlito, Arial, sans-serif; color: #3c4654; } }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1c2430; font: 10.5pt Calibri, Carlito, "Segoe UI", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-weight: 400; color: ${NAVY}; }
  .need { background: ${NEED_BG} !important; outline: 1px solid ${NEED_BORDER}; outline-offset: 1px; }
  header.top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .meta { font-size: 8.5pt; line-height: 1.35; color: #3c4654; }
  .word { font-size: 24pt; font-weight: 300; letter-spacing: -0.4px; color: ${NAVY}; }
  .logo { max-width: 170px; max-height: 52px; object-fit: contain; }
  .intro { margin: 0 0 10px; color: #3c4654; }
  .help { font-size: 8pt; color: #5c6775; margin-top: 2px; }
  .ghost { color: #8b939e; }
  .prose p { margin: 4px 0; line-height: 1.4; }
  .prose ul { margin: 4px 0 6px 18px; padding: 0; }
  .prose li { margin: 2px 0; line-height: 1.35; }
  header.dochead { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 6px; border-bottom: 1px dashed #9fb3c8; margin-bottom: 14px; }
  .docmeta { flex: 1; min-width: 0; }
  .system { font-size: 8pt; color: #5c6775; margin-bottom: 2px; }
  table.meta { border-collapse: collapse; width: 100%; font-size: 6.8pt; color: #3c4654; }
  table.meta th { text-align: left; font-weight: 400; color: #7a8696; padding: 1px 4px 1px 0; white-space: nowrap; border-bottom: 1px dashed #c5ced6; }
  table.meta td { padding: 1px 10px 1px 0; border-bottom: 1px dashed #c5ced6; white-space: nowrap; }
  .titlerow { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin: 0 0 8px; }
  .titlerow h1 { margin: 0; font-size: 17pt; }
  .docno { text-align: right; color: #7a8696; font-size: 8pt; }
  .docno span { display: block; }
  .tblwrap { margin: 6px 0 10px; }
  .tcap { font-weight: 700; font-size: 9.5pt; margin: 2px 0 4px; }
  table.tbl { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.8pt; }
  table.tbl th { background: ${NAVY}; color: #fff; text-align: left; font-weight: 600; padding: 3px 5px; border: 1px solid ${NAVY}; }
  table.tbl th.mk, table.tbl td.mk { text-align: center; padding-left: 1px; padding-right: 1px; }
  table.tbl td { border-bottom: 1px dashed #9fb3c8; padding: 3px 5px; vertical-align: top; min-height: 16px; word-wrap: break-word; }
  table.tbl td.tall { height: 34px; }
  table.tbl tr.grp td { background: ${BAR}; font-weight: 700; border-bottom: 1px solid #9fb3c8; }
  .legend { font-size: 8pt; color: #3c4654; margin-top: 4px; white-space: pre-line; }
  .tick { width: 11px; height: 11px; border: 1px solid #1c2430; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; line-height: 1; flex: none; vertical-align: middle; background: #fff; }
  .opt { margin-right: 12px; white-space: nowrap; }
  .opt.on { font-weight: 700; }
  .signs { display: flex; gap: 28px; margin-top: 10px; break-inside: avoid; }
  .signs .sign { flex: 1; }
  .sign { margin-top: 12px; max-width: 340px; break-inside: avoid; }
  .sign .line { height: 34px; border-bottom: 1px solid #1c2430; }
  .sign .signed { font-size: 8.5pt; color: ${NAVY}; margin-bottom: -26px; padding-top: 10px; position: relative; }
  .sign .signimg { max-height: 40px; max-width: 220px; display: block; margin-bottom: -38px; }
  .sign .cap { margin-top: 3px; font-size: 8.5pt; }
  .photo { max-width: 100%; max-height: 260px; margin-top: 4px; }
  .pagefoot { display: none; }
  body.brev h1 { font-size: 18pt; margin: 6px 0 10px; }
  body.brev h2 { font-size: 11.5pt; margin: 16px 0 6px; padding: 3px 6px; background: ${BAR}; color: #14283f; }
  body.brev .field { margin: 0 0 8px; break-inside: avoid; }
  body.brev .label { font-size: 8.5pt; color: #5c6775; margin-bottom: 2px; }
  body.brev .value { min-height: 18px; border-bottom: 1px solid #9aa3ae; padding: 1px 2px; }
  body.brev .value.tall { min-height: 48px; border: 1px solid #9aa3ae; padding: 4px 6px; white-space: pre-wrap; }
  body.brev .pair { display: flex; gap: 16px; }
  body.brev .pair .field { flex: 1; }
  body.brev .opts { display: flex; flex-wrap: wrap; gap: 4px 0; }
  body.brev .checkrow { display: flex; align-items: center; gap: 8px; }
  body.skjema { font-size: 9pt; color: #111; }
  body.skjema header.top { align-items: flex-end; margin-bottom: 12px; }
  body.skjema header.top h1 { margin: 0; font-size: 18pt; text-align: right; }
  body.skjema .intro { font-size: 9.5pt; margin: 0 0 10px; }
  body.skjema table.grid { width: 100%; border-collapse: collapse; margin: 0 0 10px; }
  body.skjema table.grid > tbody > tr > td, body.skjema table.grid > tr > td { border: 1px solid #1a1a1a; vertical-align: top; padding: 3px 6px 8px; }
  body.skjema td.bar { background: ${NAVY} !important; color: #fff; font-weight: 700; font-style: italic; padding: 4px 6px; }
  body.skjema td.hint { background: #f3f6f9; font-size: 8.5pt; padding: 4px 6px; }
  body.skjema td.flat { border: 0 !important; padding: 0 !important; }
  body.skjema td.locked { background: #f4f4f4; }
  body.skjema .cellcap { font-size: 8pt; line-height: 1.25; font-weight: 700; color: #14283f; }
  body.skjema .box { min-height: 16px; font-size: 10pt; white-space: pre-wrap; }
  body.skjema .box.tall { min-height: 58px; }
  body.skjema .box.ghost { color: #8b939e; }
  body.skjema .opts { display: flex; flex-wrap: wrap; gap: 4px 0; margin-top: 4px; }
  body.skjema .checkline { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 18px; }
  body.skjema .foot { display: flex; justify-content: space-between; gap: 12px; font-size: 8pt; margin-top: 4px; }
  @media screen {
    ${preview ? `html { background: #e6ebf1; } body { max-width: 760px; margin: 16px auto 32px; background: #fff; padding: 28px 32px 20px; box-shadow: 0 10px 28px rgba(16,24,40,.12); }` : ''}
    .pagefoot { display: flex; justify-content: space-between; gap: 12px; margin-top: 28px; padding-top: 6px; border-top: 1px solid #c5ced6; font-size: 7.5pt; color: #3c4654; }
  }
</style>
</head>
<body class="${grid ? 'skjema' : 'brev'}">
${body}
${screenFooter(ctx)}
</body>
</html>`;
}

export function printForm(draft, logo, options = {}) {
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
  doc.write(formPrintHtml(draft, logo, options));
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  };
  if (frame.contentWindow?.document?.readyState === 'complete') run();
  else frame.onload = run;
}
