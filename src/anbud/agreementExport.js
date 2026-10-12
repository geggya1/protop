/** Låst avtale som PDF og Word. Teksten er versjonen som er hugget, ikke arbeidskopien. */

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function answerText(field) {
  const value = field?.value;
  if (value == null || value === '') return '';
  if (field.kind === 'check') return value ? 'Ja' : 'Nei';
  if (Array.isArray(value)) {
    return value.map((id) => {
      const option = (field.options || []).find((row) => row.id === id);
      return option?.label || String(id);
    }).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') return text(value.name);
  return text(value);
}

function linesOf(row, version) {
  const locked = version || (row?.versions || []).find((item) => item.number === row?.version);
  const fields = locked?.fields || [];
  const lines = [
    row?.title || 'Avtale',
    `Versjon ${locked?.number || row?.version || 1}`,
    locked?.lockedAt ? `Låst ${locked.lockedAt}` : '',
    locked?.digest ? `Lås ${locked.digest}` : '',
    row?.sender?.name ? `Oppdragstaker: ${row.sender.name}` : '',
    row?.counterparty?.name ? `Oppdragsgiver: ${row.counterparty.name}` : '',
    '',
  ];
  for (const field of fields) {
    if (field.kind === 'title') {
      lines.push(field.label, '');
      continue;
    }
    if (field.kind === 'note') {
      lines.push(field.label, '');
      continue;
    }
    lines.push(`${field.label}: ${answerText(field) || '—'}`);
  }
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '');
}

function winAnsi(value) {
  const map = {
    'æ': '\\346', 'ø': '\\370', 'å': '\\345',
    'Æ': '\\306', 'Ø': '\\330', 'Å': '\\305',
    'é': '\\351', 'É': '\\311', 'ö': '\\366', 'Ö': '\\326',
    'ä': '\\344', 'Ä': '\\304', 'ü': '\\374',
    '—': '-', '–': '-', '«': '"', '»': '"', '’': "'", '‘': "'",
  };
  let out = '';
  const source = String(value || '').replace(/[()\\]/g, (char) => `\\${char}`);
  for (const char of source) {
    out += map[char] || (char.charCodeAt(0) < 128 ? char : '?');
  }
  return out;
}

export function agreementToPdf(row, versionNumber) {
  const version = (row?.versions || []).find((item) => item.number === (versionNumber || row?.version));
  const lines = linesOf(row, version).slice(0, 80);
  const commands = ['BT', '/F1 11 Tf', '50 800 Td', '14 TL'];
  lines.forEach((line, index) => {
    if (index) commands.push('T*');
    commands.push(`(${winAnsi(line).slice(0, 110)}) Tj`);
  });
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return body;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function agreementToWordHtml(row, versionNumber) {
  const version = (row?.versions || []).find((item) => item.number === (versionNumber || row?.version));
  const lines = linesOf(row, version);
  const body = lines.map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`).join('\n');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${escapeHtml(row?.title || 'Avtale')}</title></head>
<body>${body}</body></html>`;
}

export function agreementFileBase(row, versionNumber) {
  const version = versionNumber || row?.version || 1;
  const name = text(row?.title || 'avtale').replace(/[^\wæøåÆØÅ .-]+/g, '').slice(0, 60) || 'avtale';
  return `${name} v${version}`;
}
