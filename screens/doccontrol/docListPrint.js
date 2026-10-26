/** Dokumentlisten (KS C1-A-01-001) som PDF: alle styrte dokumenter med versjon og godkjenning. */
import { READ_RULES } from '../../src/doccontrol/model';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dateText(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

export function docListHtml(rows, { company = {}, logo = '', printedAt = new Date() } = {}) {
  const firma = company?.firma || '';
  const body = (rows || []).map((row) => `<tr>
  <td>${esc(row.code)}</td>
  <td>${esc(row.title)}</td>
  <td class="c">${row.version ? esc(row.version) : '–'}</td>
  <td>${esc(dateText(row.approvedAt))}</td>
  <td>${esc(row.approvedBy)}</td>
  <td>${esc(row.owner)}</td>
  <td>${esc(dateText(row.nextReview))}${row.reviewDue ? ' <b>forfalt</b>' : ''}</td>
  <td>${esc(READ_RULES.find((rule) => rule.id === row.readRule)?.label || '')}</td>
  <td class="c">${row.read ? `${row.read.done}/${row.read.total}` : ''}</td>
  <td>${esc(row.status?.label)}</td>
</tr>`).join('');
  return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8" />
<title>Dokumentliste</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { margin: 0; color: #1c2430; font: 9pt/1.4 Calibri, Carlito, "Segoe UI", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dashed #9fb3c8; padding-bottom: 6px; margin-bottom: 12px; }
  header img { max-height: 46px; max-width: 160px; object-fit: contain; }
  .system { font-size: 8pt; color: #5c6775; }
  h1 { font-size: 18pt; font-weight: 300; color: #1f3b5c; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1f3b5c; color: #fff; text-align: left; padding: 4px 5px; font-weight: 600; }
  td { border-bottom: 1px dashed #9fb3c8; padding: 3px 5px; vertical-align: top; }
  td.c { text-align: center; }
  b { color: #8a5a00; }
  .foot { margin-top: 10px; font-size: 7.5pt; color: #5c6775; }
</style>
</head>
<body>
<header><div><div class="system">${esc(firma ? `${firma} - Ledelsessystem` : '')}</div><h1>Dokumentliste</h1></div>${logo ? `<img alt="" src="${esc(logo)}" />` : ''}</header>
<table>
<thead><tr><th>Dokument-ID</th><th>Dokument</th><th>Versjon</th><th>Godkjent</th><th>Godkjent av</th><th>Eier</th><th>Neste gjennomgang</th><th>Lesekrav</th><th>Lest</th><th>Status</th></tr></thead>
<tbody>${body}</tbody>
</table>
<div class="foot">${(rows || []).length} styrte dokumenter · utskrift ${esc(printedAt.toLocaleString('nb-NO'))}</div>
</body>
</html>`;
}

export function printDocList(rows, options) {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Utskrift');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(docListHtml(rows, options));
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  }, 150);
}
