/** Varslingspost i samme oppsett som Mercell Tender Discovery. */

import { noticeMatch } from './model.js';

function text(value) {
  return String(value || '').trim();
}

function day(value) {
  const raw = text(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw.slice(0, 16);
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function clip(value, max = 180) {
  const raw = text(value).replace(/\s+/g, ' ');
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trim()}…`;
}

function sourceName(source) {
  if (source === 'ted') return 'TED';
  return 'Doffin';
}

function matchLine(row, watched, keywords) {
  const found = noticeMatch(row, { cpvCodes: watched, keywords });
  const parts = [];
  if (found.cpv.length) {
    const shown = found.cpv.slice(0, 1);
    const extra = found.cpv.length - shown.length;
    parts.push(`CPV: ${shown[0]}${extra > 0 ? ` (+${extra} mer)` : ''}`);
  } else if ((row?.cpvCodes || []).length) {
    parts.push(`CPV: ${row.cpvCodes[0]}`);
  } else if (!found.keywords.length) {
    parts.push('CPV-søk');
  }
  if (found.keywords.length) parts.push(found.keywords.join(', '));
  return parts.join(' · ') || 'CPV-søk';
}

export function buildTenderAlert({ companyName, cpvCodes, keywords, notices } = {}) {
  const name = text(companyName) || 'Bedriften';
  const rows = (Array.isArray(notices) ? notices : []).slice(0, 40);
  const watched = (Array.isArray(cpvCodes) ? cpvCodes : []).map((row) => text(row?.code || row)).filter(Boolean);
  const words = Array.isArray(keywords) ? keywords : [];
  const fresh = rows.filter((row) => row.isNew).length || rows.length;
  const subject = `Oppdatering fra anbudsvarsling — ${name}`;
  const lines = [
    'Hei',
    `Her er de siste treffene for ${name}:`,
    '',
    `${name} — ${fresh} ny`,
    'Konkurranser',
    '',
  ];
  for (const row of rows) {
    lines.push(`Publisert: ${day(row.publishedAt) || '—'} | ${row.noticeType || 'Kunngjøring av konkurranse'} | ${sourceName(row.source)}`);
    lines.push(`Frist: ${day(row.deadline) || 'ikke oppgitt'}`);
    lines.push(row.title || 'Kunngjøring');
    lines.push(row.buyer || 'Ukjent oppdragsgiver');
    if (row.places?.length) lines.push(row.places.join(', '));
    if (row.description) lines.push(clip(row.description));
    if (row.url) lines.push(row.url);
    lines.push(`Matcher: ${matchLine(row, watched, words)}`);
    lines.push('');
  }
  if (!rows.length) lines.push('Ingen nye treff denne gangen.');
  const textBody = lines.join('\n');
  const items = rows.map((row) => `
    <tr>
      <td style="padding:10px 8px;border-top:1px solid #e6e6e6;vertical-align:top;white-space:nowrap;">${day(row.publishedAt) || '—'}</td>
      <td style="padding:10px 8px;border-top:1px solid #e6e6e6;vertical-align:top;">${row.noticeType || 'Konkurranse'}<br><span style="color:#667;">${sourceName(row.source)}</span></td>
      <td style="padding:10px 8px;border-top:1px solid #e6e6e6;vertical-align:top;white-space:nowrap;">${day(row.deadline) || '—'}</td>
      <td style="padding:10px 8px;border-top:1px solid #e6e6e6;vertical-align:top;">
        <a href="${row.url || '#'}" style="color:#0b57d0;text-decoration:none;">${row.title || 'Kunngjøring'}</a>
        <div style="color:#333;margin-top:4px;">${row.buyer || ''}</div>
        <div style="color:#667;margin-top:4px;">${clip(row.description, 140)}</div>
        <div style="margin-top:6px;">Matcher: ${matchLine(row, watched, words)}</div>
      </td>
    </tr>`).join('');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;">
    <p>Hei</p>
    <p>Her er de siste treffene for profilen din:</p>
    <p><strong>${name}</strong> — ${fresh} ny</p>
    <p>Konkurranser</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr>
        <th align="left">Publisert</th><th align="left">Type</th><th align="left">Frist</th><th align="left">Konkurranse</th>
      </tr></thead>
      <tbody>${items || '<tr><td colspan="4">Ingen nye treff.</td></tr>'}</tbody>
    </table>
    <p style="color:#667;">Varselet er laget i ProTop ut fra CPV-kodene, søkeordene og området som er satt på anbudsvarslingen.</p>
  </body></html>`;
  return { subject, text: textBody, html, count: rows.length };
}
