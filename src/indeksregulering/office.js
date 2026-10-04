import { workbookSheets } from './letter.js';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function concat(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let cursor = 0;
  parts.forEach((part) => {
    out.set(part, cursor);
    cursor += part.length;
  });
  return out;
}

function bytesOf(text) {
  return new TextEncoder().encode(String(text ?? ''));
}

export function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  files.forEach((file) => {
    const name = bytesOf(file.name);
    const data = file.data instanceof Uint8Array ? file.data : bytesOf(file.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  });
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end]);
}

export function readZip(bytes) {
  const files = {};
  let offset = 0;
  while (offset + 30 <= bytes.length && u32(bytes, offset) === 0x04034b50) {
    const method = u16(bytes, offset + 8);
    const size = u32(bytes, offset + 18);
    const nameLen = u16(bytes, offset + 26);
    const extraLen = u16(bytes, offset + 28);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const start = offset + 30 + nameLen + extraLen;
    if (method !== 0) throw new Error(`Filen ${name} er komprimert.`);
    files[name] = bytes.subarray(start, start + size);
    offset = start + size;
  }
  return files;
}

function xml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraph(text, bold = false, size = 22) {
  const run = `<w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
  return `<w:p><w:r>${run}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}

function docxBorders() {
  return ['top', 'left', 'bottom', 'right'].map((edge) => (
    `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="222222"/>`
  )).join('');
}

function docxNoticeTable(section) {
  const columns = section.columns || 4;
  const grid = Array.from({ length: columns }, () => '<w:gridCol w:w="1500"/>').join('');
  const body = section.rows.map((row) => {
    const cells = row.map((item) => {
      const span = item.span > 1 ? `<w:gridSpan w:val="${item.span}"/>` : '';
      const bold = item.label ? '<w:b/>' : '';
      return `<w:tc><w:tcPr>${span}<w:tcBorders>${docxBorders()}</w:tcBorders></w:tcPr><w:p><w:r><w:rPr>${bold}<w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${xml(item.text)}</w:t></w:r></w:p></w:tc>`;
    }).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${docxBorders()}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function docxCalcTable(result) {
  const header = ['Post', 'Grunnlag', 'Indeks', 'Tillegg', 'Nytt beløp', 'Ny sats'];
  const rows = [
    header,
    ...result.rows.map((row) => [
      row.text,
      String(row.base),
      String(row.index),
      String(row.addition),
      String(row.regulated),
      String(row.newRate),
    ]),
  ];
  const body = rows.map((row, index) => {
    const cells = row.map((value) => (
      `<w:tc><w:tcPr><w:tcBorders>${docxBorders()}</w:tcBorders></w:tcPr><w:p><w:r>${index === 0 ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p></w:tc>`
    )).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${body}</w:tbl>`;
}

export function buildDocx(letter, result) {
  const blocks = [];
  if (letter.notice) {
    blocks.push(paragraph(letter.notice.brand, true, 32));
    blocks.push(paragraph(letter.notice.title, true, 28));
    blocks.push(paragraph(letter.notice.intro, false, 21));
    letter.notice.sections.forEach((section) => {
      blocks.push(paragraph(section.heading, true, 24));
      if (section.lead) blocks.push(paragraph(section.lead, false, 21));
      blocks.push(docxNoticeTable(section));
      blocks.push(paragraph(''));
    });
    letter.notice.notes.forEach((line) => blocks.push(paragraph(line, false, 20)));
    blocks.push(paragraph('Med vennlig hilsen', true, 24));
    if (letter.notice.signoff.place) blocks.push(paragraph(`Sted: ${letter.notice.signoff.place}`));
    blocks.push(paragraph(`Dato: ${letter.notice.signoff.date}`));
    blocks.push(paragraph('Underskrift', true, 22));
    blocks.push(paragraph(''));
    if (letter.notice.signoff.name) blocks.push(paragraph(letter.notice.signoff.name, true, 22));
    blocks.push(paragraph(letter.notice.signoff.company));
    blocks.push(paragraph(letter.notice.footer.join('   |   '), false, 16));
    if (result?.rows?.length) {
      blocks.push(paragraph('Beregning', true, 24));
      blocks.push(docxCalcTable(result));
    }
  } else {
    letter.paragraphs.forEach((part) => {
      if (part.heading) blocks.push(paragraph(part.heading, true));
      part.lines.forEach((line) => blocks.push(paragraph(line)));
      blocks.push(paragraph(''));
    });
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${blocks.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: document },
  ]);
}

function columnName(index) {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, column) => {
      const ref = `${columnName(column)}${rowIndex + 1}`;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"><v>${value}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value ?? '')}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${body}</sheetData>
</worksheet>`;
}

export function buildXlsx(sheets) {
  const used = sheets.length ? sheets : [{ name: 'Brev', rows: [['Ingen data']] }];
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${used.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${used.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${used.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
</Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    ...used.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet.rows) })),
  ]);
}

function pdfEscape(text) {
  let out = '';
  const source = String(text ?? '')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00d7/g, 'x');
  for (const ch of source) {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '(' || ch === ')') out += `\\${ch}`;
    else if (code >= 32 && code <= 126) out += ch;
    else if (code > 126 && code <= 255) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return out;
}

function wrapLine(text, width) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function pdfDocument(streams) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${streams.length} /Kids [${streams.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  streams.forEach((stream, index) => {
    const contentId = 6 + index * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return bytesOf(pdf);
}

function textWidth(text, size) {
  return String(text || '').length * size * 0.48;
}

function paintText(ops, text, x, y, size, font) {
  ops.push('BT');
  ops.push(`/${font} ${size} Tf`);
  ops.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
  ops.push(`(${pdfEscape(text)}) Tj`);
  ops.push('ET');
}

function noticeStreams(letter) {
  const notice = letter.notice;
  const pageH = 842;
  const margin = 40;
  const pages = [[]];
  let y = 46;

  function ensure(height) {
    if (y + height <= pageH - 36) return;
    pages.push([]);
    y = 46;
  }

  function ops() {
    return pages[pages.length - 1];
  }

  function gap(amount) {
    y += amount;
  }

  function heading(text, size) {
    ensure(size + 8);
    paintText(ops(), text, margin, pageH - y - size, size, 'F2');
    y += size + 8;
  }

  function paragraphAt(text, size) {
    const width = Math.max(20, Math.floor((515) / (size * 0.48)));
    wrapLine(text, width).forEach((line) => {
      ensure(size + 4);
      paintText(ops(), line, margin, pageH - y - size, size, 'F1');
      y += size + 4;
    });
  }

  function table(section) {
    const widths = section.widths && section.widths.reduce((sum, value) => sum + value, 0) === 515
      ? section.widths
      : Array.from({ length: section.columns }, () => 515 / section.columns);
    section.rows.forEach((row) => {
      let lines = 1;
      let col = 0;
      row.forEach((item) => {
        const span = item.span || 1;
        const w = widths.slice(col, col + span).reduce((sum, value) => sum + value, 0);
        const wrapped = wrapLine(item.text, Math.max(8, Math.floor((w - 8) / 4)));
        lines = Math.max(lines, wrapped.length);
        col += span;
      });
      const height = 8 + lines * 11;
      ensure(height);
      let x = margin;
      col = 0;
      const top = pageH - y;
      row.forEach((item) => {
        const span = item.span || 1;
        const w = widths.slice(col, col + span).reduce((sum, value) => sum + value, 0);
        ops().push('0.4 w');
        ops().push(`${x.toFixed(2)} ${(top - height).toFixed(2)} ${w.toFixed(2)} ${height.toFixed(2)} re S`);
        const wrapped = wrapLine(item.text, Math.max(8, Math.floor((w - 8) / 4)));
        wrapped.forEach((line, index) => {
          paintText(ops(), line, x + 4, top - 13 - index * 11, 8, item.label ? 'F2' : 'F1');
        });
        x += w;
        col += span;
      });
      y += height;
    });
  }

  const brandWidth = textWidth(notice.brand, 16);
  paintText(ops(), notice.brand, 555 - brandWidth, pageH - y - 16, 16, 'F2');
  y += 28;
  heading(notice.title, 13);
  paragraphAt(notice.intro, 9);
  gap(10);
  notice.sections.forEach((section) => {
    heading(section.heading, 11);
    if (section.lead) {
      paragraphAt(section.lead, 9);
      gap(4);
    }
    table(section);
    gap(12);
  });
  notice.notes.forEach((line) => paragraphAt(line, 8));
  gap(8);
  heading('Med vennlig hilsen', 11);
  if (notice.signoff.place) paragraphAt(`Sted: ${notice.signoff.place}`, 9);
  paragraphAt(`Dato: ${notice.signoff.date}`, 9);
  gap(8);
  heading('Underskrift', 10);
  gap(46);
  if (notice.signoff.name) heading(notice.signoff.name, 10);
  paragraphAt(notice.signoff.company, 9);
  gap(16);
  paragraphAt(notice.footer.join('   |   '), 8);

  return pages.map((commands, index) => {
    const footer = `side ${index + 1} av ${pages.length}`;
    const all = [
      ...commands,
    ];
    paintText(all, footer, 555 - textWidth(footer, 8), 24, 8, 'F1');
    return all.join('\n');
  });
}

export function buildPdf(letter) {
  if (letter.notice) return pdfDocument(noticeStreams(letter));
  const lines = [];
  letter.paragraphs.forEach((part) => {
    if (part.heading) {
      lines.push('');
      lines.push(part.heading.toUpperCase());
    }
    part.lines.forEach((line) => wrapLine(line, 92).forEach((row) => lines.push(row)));
  });
  const pageSize = 46;
  const pages = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += pageSize) pages.push(lines.slice(i, i + pageSize));
  const streams = pages.map((page) => {
    const commands = [
      'BT',
      '/F1 10 Tf',
      '48 790 Td',
      '14 TL',
    ];
    page.forEach((line) => {
      commands.push(`(${pdfEscape(line)}) Tj`);
      commands.push('T*');
    });
    commands.push('ET');
    return commands.join('\n');
  });
  return pdfDocument(streams);
}

export function exportFiles(draft, result, letter, seriesList) {
  const sheets = workbookSheets(draft, result, letter, seriesList);
  const base = letter.filenameBase;
  return [
    { kind: 'pdf', filename: `${base}.pdf`, mime: 'application/pdf', bytes: buildPdf(letter) },
    {
      kind: 'docx',
      filename: `${base}.docx`,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: buildDocx(letter, result),
    },
    {
      kind: 'xlsx',
      filename: `${base}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: buildXlsx(sheets),
    },
  ];
}

export function downloadBytes(filename, bytes, mime) {
  if (typeof document === 'undefined') {
    throw new Error('PDF, Word og Excel lastes ned i nettleseren.');
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
