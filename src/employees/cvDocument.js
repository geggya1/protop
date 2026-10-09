/**
 * Eksporter hele CV-en som PDF i samme stil som papir-CV-en:
 * logo, profilbilde, blå overskrifter, kursiv oppsummering, prosjektbilder.
 */
import { fitLogoBox, logoForDocument } from '../project/companyLogo.js';
import { plainFormatted, sortByStartDesc, sortCoursesDesc } from './cvFormat.js';

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BRAND = { r: 0.30, g: 0.38, b: 0.50 }; // blågrå overskrifter
const INK = { r: 0.15, g: 0.18, b: 0.22 };
const MUTED = { r: 0.45, g: 0.48, b: 0.52 };
const LINE = { r: 0.82, g: 0.84, b: 0.87 };

function filled(value) {
  return String(value ?? '').trim();
}

function filenameBase(cv) {
  const slug = filled(cv?.name)
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return slug ? `${stamp}_CV_${slug}` : `${stamp}_CV`;
}

function bytesOf(text) {
  const source = String(text ?? '');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(source);
  const out = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i += 1) out[i] = source.charCodeAt(i) & 0xff;
  return out;
}

function pdfEscape(text) {
  let out = '';
  const source = String(text ?? '')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00d7/g, 'x')
    .replace(/[•●◦]/g, '\u00B7')
    .replace(/\u00A0/g, ' ');
  for (const ch of source) {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '(' || ch === ')') out += `\\${ch}`;
    else if (code >= 32 && code <= 126) out += ch;
    else if (code > 126 && code <= 255) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return out;
}

function wrapLine(text, widthChars) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > widthChars && current) {
      lines.push(current);
      current = word;
    } else current = next;
  });
  if (current) lines.push(current);
  return lines;
}

function charsFor(widthPt, size) {
  return Math.max(8, Math.floor(widthPt / (size * 0.48)));
}

function textWidth(text, size) {
  return String(text || '').length * size * 0.48;
}

function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function rgb(ops, color, fill = true) {
  ops.push(`${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} ${fill ? 'rg' : 'RG'}`);
}

function paintText(ops, text, x, y, size, font, color = INK) {
  rgb(ops, color);
  ops.push('BT');
  ops.push(`/${font} ${size} Tf`);
  ops.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
  ops.push(`(${pdfEscape(text)}) Tj`);
  ops.push('ET');
}

/** Fylt prikk via bezier (WinAnsi mangler •). */
function paintDot(ops, x, y, r = 1.6) {
  rgb(ops, INK);
  const k = 0.552284749831 * r;
  ops.push(`${(x + r).toFixed(2)} ${y.toFixed(2)} m`);
  ops.push(`${(x + r).toFixed(2)} ${(y + k).toFixed(2)} ${(x + k).toFixed(2)} ${(y + r).toFixed(2)} ${x.toFixed(2)} ${(y + r).toFixed(2)} c`);
  ops.push(`${(x - k).toFixed(2)} ${(y + r).toFixed(2)} ${(x - r).toFixed(2)} ${(y + k).toFixed(2)} ${(x - r).toFixed(2)} ${y.toFixed(2)} c`);
  ops.push(`${(x - r).toFixed(2)} ${(y - k).toFixed(2)} ${(x - k).toFixed(2)} ${(y - r).toFixed(2)} ${x.toFixed(2)} ${(y - r).toFixed(2)} c`);
  ops.push(`${(x + k).toFixed(2)} ${(y - r).toFixed(2)} ${(x + r).toFixed(2)} ${(y - k).toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)} c`);
  ops.push('f');
}

function drawImage(ops, name, x, y, w, h) {
  ops.push('q');
  ops.push(`${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`);
  ops.push(`/${name} Do`);
  ops.push('Q');
}

function rule(ops, x, y, w) {
  rgb(ops, LINE, false);
  ops.push('0.6 w');
  ops.push(`${x.toFixed(2)} ${y.toFixed(2)} m`);
  ops.push(`${(x + w).toFixed(2)} ${y.toFixed(2)} l`);
  ops.push('S');
}

function summaryParagraphs(text) {
  const raw = plainFormatted(text);
  if (!raw) return [];
  const parts = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!parts.length) return [];
  if (parts.some((line) => /^[•\-\u00B7]/.test(line))) {
    return parts.map((line) => line.replace(/^[•\-\u00B7]\s*/, ''));
  }
  // Lange avsnitt uten linjeskift: del på setninger i ~blokker
  const joined = parts.join(' ');
  const sentences = joined.split(/(?<=\.)\s+(?=[A-ZÆØÅ])/);
  if (sentences.length <= 1) return [joined];
  const blocks = [];
  let buf = '';
  sentences.forEach((sentence) => {
    const next = buf ? `${buf} ${sentence}` : sentence;
    if (next.length > 420 && buf) {
      blocks.push(buf);
      buf = sentence;
    } else buf = next;
  });
  if (buf) blocks.push(buf);
  return blocks;
}

function educationRows(cv) {
  return sortByStartDesc(cv?.education || [], (row) => {
    const match = String(row.when || row.from || '').match(/(19|20)\d{2}/);
    return match ? match[0] : '';
  }).map((row) => ({
    when: filled(row.when).replace(/\u2013/g, '-') || [filled(row.from), filled(row.to)].filter(Boolean).join(' - '),
    school: filled(row.school),
    program: filled(row.program),
  }));
}

function courseRows(cv) {
  return sortCoursesDesc((cv?.courses || []).map((row) => ({ ...row, date: row.when || row.date }))).map((row) => ({
    when: filled(row.when || row.date),
    title: filled(row.title),
  }));
}

function experienceRows(cv) {
  return sortByStartDesc(cv?.experience || [], (row) => {
    const match = String(row.when || row.from || '').match(/(19|20)\d{2}/);
    return match ? match[0] : '';
  });
}

function projectFactPairs(row) {
  const left = [
    ['Kategori', row.category],
    ['Objekt', row.object],
    ['Periode', row.period],
    ['Kostnad', row.cost],
  ].filter(([, v]) => filled(v));
  const right = [
    ['Kunde', row.client],
    ['Kontakt', row.contact],
    ['Telefon', row.phone],
    ['Epost', row.email],
  ].filter(([, v]) => filled(v));
  return { left, right };
}

/** Linjer til tester / forhåndsvisning (uten PDF-grafikk). */
export function cvDocumentLines(cv) {
  const lines = ['CURRICULUM VITAE'];
  if (filled(cv?.name)) lines.push(filled(cv.name));
  if (filled(cv?.title)) lines.push(filled(cv.title));
  lines.push('Profil');
  for (const [label, value] of cv?.facts || []) {
    if (filled(value)) lines.push(`${label} ${filled(value)}`);
  }
  lines.push('Oppsummering og nøkkelkvalifikasjoner');
  summaryParagraphs(cv?.summary).forEach((block) => lines.push(`- ${block}`));
  lines.push('Utdanning');
  educationRows(cv).forEach((row) => {
    lines.push([row.when, [row.school, row.program].filter(Boolean).join(' - ')].filter(Boolean).join(' '));
  });
  lines.push('Sertifiseringer');
  for (const title of cv?.certifications || []) {
    if (filled(title)) lines.push(`- ${filled(title)}`);
  }
  lines.push('Kurs');
  courseRows(cv).forEach((row) => lines.push([row.when, row.title].filter(Boolean).join(' ')));
  lines.push('Erfaringer');
  for (const row of experienceRows(cv)) {
    if (filled(row.employer)) lines.push(filled(row.employer));
    if (filled(row.place)) lines.push(filled(row.place));
    if (filled(row.title)) lines.push(filled(row.title));
    if (filled(row.when)) lines.push(filled(row.when).replace(/\u2013/g, '-'));
    const tasks = row.tasks || [];
    if (tasks.length) {
      lines.push('Arbeidsoppgaver');
      tasks.forEach((task) => lines.push(`- ${filled(task).replace(/^[-•]\s*/, '')}`));
    }
  }
  lines.push('Referanseprosjekter');
  for (const row of cv?.projects || []) {
    lines.push(filled(row.title) || 'Prosjekt');
    if (filled(row.address)) lines.push(filled(row.address));
    const { left, right } = projectFactPairs(row);
    left.forEach(([l, v]) => lines.push(`${l} ${filled(v)}`));
    right.forEach(([l, v]) => lines.push(`${l} ${filled(v)}`));
    if (filled(row.employer)) lines.push(`Arbeidsgiver i perioden ${filled(row.employer)}`);
    if (filled(row.roles)) {
      const roles = filled(row.roles).split(/\n/).map((s) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
      lines.push(`Roller i prosjektet ${roles.join(', ')}`);
    }
    if (filled(row.responsibility)) lines.push(`Ansvar i prosjektet ${plainFormatted(row.responsibility)}`);
    lines.push('');
  }
  return lines.filter((line, index, all) => !(line === '' && all[index - 1] === ''));
}

async function defaultLoadImage(url) {
  const { loadImageAsJpeg } = await import('./cvPdfImages.js');
  return loadImageAsJpeg(url);
}

export async function loadCvAssets(cv, options = {}) {
  const loadImage = options.loadImage || defaultLoadImage;
  const logo = options.logo ? logoForDocument(options.logo) : null;
  const photoUrl = cv?.photoUrl || options.photoUrl || '';
  const photo = photoUrl ? await loadImage(photoUrl) : null;
  const projects = {};
  const rows = Array.isArray(cv?.projects) ? cv.projects : [];
  await Promise.all(rows.map(async (row, index) => {
    const key = row.id || `p${index}`;
    const url = (row.images || []).find((item) => filled(item));
    if (!url) return;
    const image = await loadImage(url);
    if (image) projects[key] = image;
  }));
  const wanted = (photoUrl ? 1 : 0) + rows.filter((row) => (row.images || []).some((item) => filled(item))).length;
  const got = (photo ? 1 : 0) + Object.keys(projects).length;
  return { logo, photo, projects, wanted, got };
}

function fitBox(width, height, maxW, maxH) {
  return fitLogoBox(width, height, maxW, maxH);
}

function assemblePdf(pages, images) {
  const imageEntries = Object.entries(images);
  const objects = [
    null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    null, // Pages – fylles når page-id-ene er kjent
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>',
  ];

  const pageIds = [];
  pages.forEach((stream) => {
    pageIds.push(objects.length);
    objects.push(null);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  const imageIds = {};
  imageEntries.forEach(([name, image]) => {
    imageIds[name] = objects.length;
    const hex = `${bytesToHex(image.bytes)}>`;
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hex.length} >>\nstream\n${hex}\nendstream`);
  });

  const xobjectDict = imageEntries.length
    ? ` /XObject << ${imageEntries.map(([name]) => `/${name} ${imageIds[name]} 0 R`).join(' ')} >>`
    : '';

  pageIds.forEach((pageId, index) => {
    const contentId = pageId + 1;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xobjectDict} >> /Contents ${contentId} 0 R >>`;
  });

  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  const maxId = objects.length - 1;
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let id = 1; id <= maxId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return bytesOf(pdf);
}

function renderCvPdf(cv, assets = {}) {
  const images = {};
  if (assets.logo?.bytes) images.Logo = assets.logo;
  if (assets.photo?.bytes) images.Photo = assets.photo;
  Object.entries(assets.projects || {}).forEach(([key, image]) => {
    if (image?.bytes) images[`Prj${key}`] = image;
  });

  const pages = [[]];
  let y = PAGE_H - MARGIN;

  function ops() {
    return pages[pages.length - 1];
  }

  function newPage() {
    pages.push([]);
    y = PAGE_H - MARGIN;
  }

  function ensure(height) {
    if (y - height < MARGIN + 28) newPage();
  }

  function gap(amount) {
    y -= amount;
  }

  function sectionTitle(text) {
    ensure(22);
    paintText(ops(), text, MARGIN, y - 12, 12, 'F2', BRAND);
    y -= 18;
  }

  // --- Header ---
  paintText(ops(), 'CURRICULUM VITAE', MARGIN, y - 10, 9, 'F1', MUTED);
  if (images.Logo) {
    const box = fitBox(assets.logo.width, assets.logo.height, 130, 42);
    drawImage(ops(), 'Logo', PAGE_W - MARGIN - box.width, y - box.height, box.width, box.height);
  }
  y -= 28;

  paintText(ops(), filled(cv?.name) || 'Navn', MARGIN, y - 18, 20, 'F2', INK);
  y -= 24;
  if (filled(cv?.title)) {
    paintText(ops(), filled(cv.title), MARGIN, y - 11, 11, 'F1', MUTED);
    y -= 18;
  }
  gap(6);

  // --- Profil + foto ---
  sectionTitle('Profil');
  const facts = (cv?.facts || []).filter(([, v]) => filled(v));
  const photoBox = images.Photo
    ? fitBox(assets.photo.width, assets.photo.height, 92, 112)
    : null;
  const factBlockH = Math.max(facts.length * 14, photoBox ? photoBox.height : 0);
  ensure(factBlockH + 8);
  const factTop = y;
  facts.forEach(([label, value], index) => {
    const rowY = factTop - 11 - index * 14;
    paintText(ops(), label, MARGIN, rowY, 9, 'F1', MUTED);
    paintText(ops(), filled(value), MARGIN + 100, rowY, 9, 'F1', INK);
  });
  if (photoBox) {
    drawImage(ops(), 'Photo', PAGE_W - MARGIN - photoBox.width, factTop - photoBox.height, photoBox.width, photoBox.height);
  }
  y = factTop - factBlockH - 10;

  // --- Oppsummering ---
  sectionTitle('Oppsummering og nøkkelkvalifikasjoner');
  const summary = summaryParagraphs(cv?.summary);
  summary.forEach((block) => {
    const wrapped = wrapLine(block, charsFor(CONTENT_W - 14, 9));
    ensure(wrapped.length * 11 + 8);
    paintDot(ops(), MARGIN + 3, y - 6, 1.5);
    wrapped.forEach((line, index) => {
      paintText(ops(), line, MARGIN + 12, y - 10, 9, 'F3', INK);
      y -= 11;
      if (index === 0) { /* bullet only on first */ }
    });
    gap(4);
  });
  gap(4);

  // --- Utdanning ---
  sectionTitle('Utdanning');
  educationRows(cv).forEach((row) => {
    const right = [row.school, row.program].filter(Boolean).join(' - ');
    const whenW = 78;
    const wrapped = wrapLine(right, charsFor(CONTENT_W - whenW - 8, 9));
    ensure(wrapped.length * 11 + 2);
    paintText(ops(), row.when, MARGIN, y - 10, 9, 'F1', INK);
    wrapped.forEach((line, index) => {
      if (index === 0) paintText(ops(), line, MARGIN + whenW, y - 10, 9, 'F2', INK);
      else paintText(ops(), line, MARGIN + whenW, y - 10, 9, 'F1', MUTED);
      y -= 11;
    });
  });
  gap(6);

  // --- Sertifiseringer ---
  sectionTitle('Sertifiseringer');
  for (const title of cv?.certifications || []) {
    if (!filled(title)) continue;
    ensure(12);
    paintDot(ops(), MARGIN + 3, y - 6, 1.5);
    paintText(ops(), filled(title), MARGIN + 12, y - 10, 9, 'F1', INK);
    y -= 12;
  }
  gap(6);

  // --- Kurs ---
  sectionTitle('Kurs');
  courseRows(cv).forEach((row) => {
    const whenW = 70;
    const wrapped = wrapLine(row.title, charsFor(CONTENT_W - whenW - 8, 9));
    ensure(wrapped.length * 11 + 1);
    paintText(ops(), row.when, MARGIN, y - 10, 9, 'F1', INK);
    wrapped.forEach((line) => {
      paintText(ops(), line, MARGIN + whenW, y - 10, 9, 'F1', INK);
      y -= 11;
    });
  });
  gap(8);

  // --- Erfaringer ---
  sectionTitle('Erfaringer');
  experienceRows(cv).forEach((row) => {
    const tasks = (row.tasks || []).map((task) => filled(task).replace(/^[-•]\s*/, '')).filter(Boolean);
    const blockH = 40 + tasks.length * 11;
    ensure(Math.min(blockH, 80));
    if (filled(row.employer)) {
      paintText(ops(), filled(row.employer), MARGIN, y - 11, 11, 'F2', INK);
      y -= 14;
    }
    if (filled(row.place)) {
      paintText(ops(), filled(row.place), MARGIN, y - 9, 9, 'F1', MUTED);
      y -= 12;
    }
    if (filled(row.title)) {
      paintText(ops(), filled(row.title), MARGIN, y - 9, 9, 'F1', INK);
      y -= 12;
    }
    if (filled(row.when)) {
      paintText(ops(), filled(row.when).replace(/\u2013/g, '-'), MARGIN, y - 9, 9, 'F1', MUTED);
      y -= 12;
    }
    if (tasks.length) {
      paintText(ops(), 'Arbeidsoppgaver', MARGIN, y - 9, 9, 'F2', MUTED);
      y -= 12;
      tasks.forEach((task) => {
        const wrapped = wrapLine(task, charsFor(CONTENT_W - 14, 9));
        ensure(wrapped.length * 11 + 2);
        paintDot(ops(), MARGIN + 3, y - 6, 1.5);
        wrapped.forEach((line) => {
          paintText(ops(), line, MARGIN + 12, y - 10, 9, 'F1', INK);
          y -= 11;
        });
      });
    }
    gap(10);
  });

  // --- Referanseprosjekter ---
  sectionTitle('Referanseprosjekter');
  const projects = Array.isArray(cv?.projects) ? cv.projects : [];
  projects.forEach((row, index) => {
    const key = row.id || `p${index}`;
    const image = images[`Prj${key}`] ? assets.projects[key] : null;
    const imgBox = image ? fitBox(image.width, image.height, 168, 112) : null;
    const { left, right } = projectFactPairs(row);
    const roles = filled(row.roles).split(/\n/).map((s) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
    const responsibility = plainFormatted(row.responsibility);
    const textWidthPt = imgBox ? CONTENT_W - imgBox.width - 14 : CONTENT_W;
    const textX = imgBox ? MARGIN + imgBox.width + 14 : MARGIN;

    const titleLines = wrapLine(filled(row.title) || 'Prosjekt', charsFor(textWidthPt, 11));
    const addrLines = filled(row.address) ? wrapLine(filled(row.address), charsFor(textWidthPt, 8)) : [];
    const factRows = Math.max(left.length, right.length);
    const roleLines = roles.length
      ? wrapLine(roles.join(', '), charsFor(textWidthPt - 110, 8))
      : [];
    const respLines = responsibility
      ? wrapLine(responsibility, charsFor(textWidthPt - 110, 8))
      : [];
    const textH = titleLines.length * 13 + addrLines.length * 10 + factRows * 11
      + (filled(row.employer) ? 12 : 0) + (roleLines.length ? 4 + roleLines.length * 10 : 0)
      + (respLines.length ? 4 + respLines.length * 10 : 0) + 8;
    const blockH = Math.max(imgBox ? imgBox.height : 0, textH);

    ensure(blockH + 14);
    const top = y;
    if (imgBox) {
      drawImage(ops(), `Prj${key}`, MARGIN, top - imgBox.height, imgBox.width, imgBox.height);
    }
    let ty = top;
    titleLines.forEach((line) => {
      paintText(ops(), line, textX, ty - 11, 11, 'F2', INK);
      ty -= 13;
    });
    addrLines.forEach((line) => {
      paintText(ops(), line, textX, ty - 9, 8, 'F1', MUTED);
      ty -= 10;
    });
    gap(2);
    ty -= 2;
    const col2 = textX + Math.floor(textWidthPt / 2);
    const labelW = 48;
    for (let i = 0; i < factRows; i += 1) {
      if (left[i]) {
        paintText(ops(), left[i][0], textX, ty - 9, 8, 'F2', MUTED);
        paintText(ops(), filled(left[i][1]), textX + labelW, ty - 9, 8, 'F1', INK);
      }
      if (right[i]) {
        paintText(ops(), right[i][0], col2, ty - 9, 8, 'F2', MUTED);
        paintText(ops(), filled(right[i][1]), col2 + labelW, ty - 9, 8, 'F1', INK);
      }
      ty -= 11;
    }
    if (filled(row.employer)) {
      paintText(ops(), 'Arbeidsgiver i perioden', textX, ty - 9, 8, 'F2', MUTED);
      paintText(ops(), filled(row.employer), textX + 118, ty - 9, 8, 'F1', INK);
      ty -= 12;
    }
    if (roleLines.length) {
      paintText(ops(), 'Roller i prosjektet', textX, ty - 9, 8, 'F2', MUTED);
      roleLines.forEach((line, i) => {
        paintText(ops(), line, textX + (i === 0 ? 100 : 0), ty - 9, 8, 'F1', INK);
        ty -= 10;
      });
    }
    if (respLines.length) {
      paintText(ops(), 'Ansvar i prosjektet', textX, ty - 9, 8, 'F2', MUTED);
      respLines.forEach((line, i) => {
        paintText(ops(), line, textX + (i === 0 ? 100 : 0), ty - 9, 8, 'F1', INK);
        ty -= 10;
      });
    }
    y = top - blockH - 16;
    if (index < projects.length - 1) {
      rule(ops(), MARGIN, y + 8, CONTENT_W);
    }
  });

  // Page numbers
  const streams = pages.map((commands, index) => {
    const all = [...commands];
    const label = `${index + 1} / ${pages.length}`;
    paintText(all, label, PAGE_W - MARGIN - textWidth(label, 8), 22, 8, 'F1', MUTED);
    return all.join('\n');
  });

  return assemblePdf(streams, images);
}

export function cvPdf(cv, assets = {}) {
  return renderCvPdf(cv, assets);
}

export async function cvDocumentFile(cv, options = {}) {
  const assets = options.assets || await loadCvAssets(cv, options);
  return {
    filename: `${filenameBase(cv)}.pdf`,
    mime: 'application/pdf',
    bytes: renderCvPdf(cv, assets),
    wanted: assets.wanted ?? 0,
    got: assets.got ?? 0,
  };
}

/** Synkron eksport uten nettbilder — brukes i tester. */
export function cvDocumentFileSync(cv, assets = {}) {
  return {
    filename: `${filenameBase(cv)}.pdf`,
    mime: 'application/pdf',
    bytes: renderCvPdf(cv, assets),
  };
}
