import { bodyBlocks, placeholderParts } from '../../src/hr/handbook';
import { fillTokens } from '../../src/forms/tokens';

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

function line(value, company) {
  return placeholderParts(fillTokens(value, company)).map((part) => (part.mark ? `<mark>${esc(part.text)}</mark>` : esc(part.text))).join('');
}

function dateText(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function cell(label, value) {
  return `<th>${esc(label)}</th><td>${esc(value || '')}</td>`;
}

/**
 * Personalhåndboken som HTML for utskrift og Lagre som PDF.
 * header er dokumenthodet fra dokumentstyringen (docHeader), log er revisjonsloggen (revisionLog).
 */
export function handbookPrintHtml({ title = 'Personalhåndbok', chapters = [], header = null, log = [] }, { company = {}, logo = '' } = {}) {
  const firma = company?.firma || '';
  const h = header || {};
  const toc = chapters.map((row, index) => `<li><span>${index + 1}.</span> ${line(row.title, company)}</li>`).join('');
  const body = chapters.map((row, index) => {
    const blocks = bodyBlocks(row.body).map((block) => {
      if (block.kind === 'h') return `<h3>${line(block.text, company)}</h3>`;
      if (block.kind === 'ul') return `<ul>${block.items.map((item) => `<li>${line(item, company)}</li>`).join('')}</ul>`;
      return `<p>${line(block.text, company)}</p>`;
    }).join('');
    return `<section><h2>${index + 1}. ${line(row.title, company)}</h2>${blocks}</section>`;
  }).join('');
  const revisions = log.length
    ? `<h2>Revisjonslogg</h2><table class="rev"><thead><tr><th>Versjon</th><th>Godkjent</th><th>Endring</th><th>Endret av</th><th>Godkjent av</th></tr></thead><tbody>${log.map((row) => `<tr><td>${esc(row.revision)}</td><td>${esc(dateText(row.approvedAt))}</td><td>${esc(row.reason)}</td><td>${esc(row.changedBy)}</td><td>${esc(row.approvedBy)}</td></tr>`).join('')}</tbody></table>`
    : '';
  const system = firma ? `${firma} - Ledelsessystem` : '';
  const meta = `<table class="meta"><tr>${cell('Dokument navn', title)}${cell('Opprettet', h.created)}${cell('Sist endret', h.changed)}${cell('Godkjent', h.approved)}</tr><tr>${cell('Dokument-ID', h.docId)}${cell('Dokumenteier', h.owner)}${cell('Versjon', h.version || 'Utkast')}${cell('Godkjent av', h.approvedBy)}</tr></table>`;
  const foot = [firma, company?.orgnr ? `Org. ${company.orgnr}` : '', company?.telefon ? `Sentralbord: ${company.telefon}` : '', company?.web ? `Web: ${company.web}` : '', company?.epost ? `E-post: ${company.epost}` : ''].filter(Boolean).join('   ');
  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 18mm; @bottom-left { content: ${cssString(foot)}; font: 7.5pt Calibri, Carlito, Arial, sans-serif; color: #3c4654; } @bottom-right { content: "Side " counter(page) " av " counter(pages); font: 7.5pt Calibri, Carlito, Arial, sans-serif; color: #3c4654; } }
  body { margin: 0; color: #1c2430; font: 10.5pt/1.45 Calibri, Carlito, "Segoe UI", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 1px dashed #9fb3c8; padding-bottom: 6px; margin-bottom: 18px; }
  header img { max-height: 52px; max-width: 170px; object-fit: contain; }
  .docmeta { flex: 1; min-width: 0; }
  .system { font-size: 8pt; color: #5c6775; margin-bottom: 2px; }
  .word { font-size: 24pt; font-weight: 300; color: #1f3b5c; }
  table.meta { border-collapse: collapse; width: 100%; font-size: 6.8pt; color: #3c4654; }
  table.meta th { text-align: left; font-weight: 400; color: #7a8696; padding: 1px 4px 1px 0; white-space: nowrap; border-bottom: 1px dashed #c5ced6; }
  table.meta td { padding: 1px 10px 1px 0; border-bottom: 1px dashed #c5ced6; white-space: nowrap; }
  h1 { font-size: 26pt; font-weight: 300; color: #1f3b5c; margin: 40px 0 4px; }
  .sub { color: #5c6775; margin: 0 0 24px; }
  h2 { font-size: 14pt; color: #fff; background: #1f3b5c; padding: 4px 8px; margin: 22px 0 8px; break-after: avoid; }
  h3 { font-size: 11pt; color: #14283f; margin: 12px 0 4px; break-after: avoid; }
  p { margin: 4px 0; }
  ul { margin: 4px 0 8px 18px; padding: 0; }
  li { margin: 2px 0; }
  ol.toc { list-style: none; padding: 0; columns: 2; }
  ol.toc li span { color: #7a8696; display: inline-block; width: 22px; }
  mark { background: #fff4cc; color: #8a5a00; }
  table.rev { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 8px 0 18px; }
  table.rev th { background: #1f3b5c; color: #fff; text-align: left; padding: 3px 5px; }
  table.rev td { border-bottom: 1px dashed #9fb3c8; padding: 3px 5px; }
  section { break-inside: auto; }
</style>
</head>
<body>
<header><div class="docmeta">${system ? `<div class="system">${esc(system)}</div>` : ''}${meta}</div>${logo ? `<img alt="" src="${esc(logo)}" />` : `<div class="word">${esc(firma.replace(/\s+AS$/i, ''))}</div>`}</header>
<h1>${esc(title)}</h1>
<p class="sub">${esc(firma ? `For ansatte i ${firma}` : '')}${h.version && !/^Utkast/.test(h.version) ? ` · versjon ${esc(h.version)}` : ' · utkast, ikke godkjent'}</p>
${revisions}
<h2>Innhold</h2>
<ol class="toc">${toc}</ol>
${body}
</body>
</html>`;
}

export function printHandbook(handbook, options) {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Utskrift');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(handbookPrintHtml(handbook, options));
  doc.close();
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  };
  if (frame.contentWindow?.document?.readyState === 'complete') run();
  else frame.onload = run;
}
