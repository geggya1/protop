/**
 * PDF/utskrift for medarbeidersamtale — browser print → PDF.
 */
import { formatNbDate } from './model.js';

export function reviewPrintHtml(review, { employeeName = '', companyName = '' } = {}) {
  const rows = [
    ['Dato', formatNbDate(review?.date)],
    ['Medarbeider', employeeName],
    ['Samtalepartner', review?.interviewer],
    ['Trivsel', review?.wellbeing],
    ['Sammendrag', review?.summary],
    ['Styrker', review?.strengths],
    ['Utfordringer', review?.challenges],
    ['Utvikling', review?.development],
    ['Mål', review?.goals],
    ['Oppfølging / avvik', review?.followUps],
  ].filter(([, value]) => String(value || '').trim());

  const body = rows.map(([label, value]) => (
    `<tr><th style="text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;width:28%;vertical-align:top">${escapeHtml(label)}</th>`
    + `<td style="padding:6px 10px;border-bottom:1px solid #ddd;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`
  )).join('');

  return `<!doctype html><html lang="nb"><head><meta charset="utf-8"/>
<title>Medarbeidersamtale – ${escapeHtml(employeeName || 'ansatt')}</title>
<style>
  body{font-family:Georgia,serif;color:#111;margin:32px;line-height:1.45}
  h1{font-size:22px;margin:0 0 4px}
  .meta{color:#555;margin-bottom:18px;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:14px}
</style></head><body>
<h1>Medarbeidersamtale</h1>
<div class="meta">${escapeHtml(companyName || '')}</div>
<table>${body}</table>
</body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printReview(review, options) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const html = reviewPrintHtml(review, options);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      setTimeout(() => frame.remove(), 1000);
    }
  }, 250);
  return true;
}
