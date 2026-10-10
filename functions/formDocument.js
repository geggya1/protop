/**
 * Leser et skjema slik CV-importen leser et dokument.
 * Tekstlag, innebygde sidebilder, OCR og PDF-utfyllingsfelt sendes sammen.
 */
import { formFromPlainText, formFromWidgets, mergeFormReads, technicalFieldName } from './anbud/formBuilder.js';
import { extractPdfLines } from './documentText.js';
import { pagePartsFromPdf } from './importPages.js';

const MAX_PAGES = 8;

function widgetLine(field) {
  const options = (field.options || []).map((row) => (typeof row === 'string' ? row : row?.label)).filter(Boolean);
  const bits = [field.kind, field.required ? 'obligatorisk' : '', field.width === 'half' ? 'halv bredde' : '']
    .filter(Boolean)
    .join(', ');
  return `- ${field.label} (${bits})${options.length ? `: ${options.join(' | ')}` : ''}`;
}

export async function widgetsFromPdf(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (buf.length < 100) return [];
  let doc;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    doc = await getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch {
    return [];
  }
  const widgets = [];
  try {
    const limit = Math.min(doc.numPages || 0, MAX_PAGES);
    for (let pageNo = 1; pageNo <= limit; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1 });
      const annotations = await page.getAnnotations().catch(() => []);
      for (const ann of annotations || []) {
        if (ann?.subtype !== 'Widget') continue;
        widgets.push({ ...ann, pageWidth: viewport?.width || 0 });
      }
    }
  } catch {
    return widgets;
  } finally {
    try {
      await doc.destroy?.();
    } catch {
      // ignore
    }
  }
  return widgets;
}

function localForm(text, widgets) {
  const fromText = text ? formFromPlainText(text, '') : null;
  const fromWidgets = widgets.length ? formFromWidgets(widgets, widgets[0]?.pageWidth || 0) : null;
  const named = (fromWidgets?.form?.fields || []).filter((field) => field.label && !technicalFieldName(field.label) && field.label !== 'Felt uten etikett');
  const widgetForm = named.length ? { ...fromWidgets.form, fields: named } : null;
  return mergeFormReads(fromText?.ok ? fromText.form : null, widgetForm) || fromText?.form || widgetForm;
}

export async function formDocumentParts(dataUrl, fileName) {
  const cleaned = String(dataUrl || '').replace(/^data:[^;]+;base64,/, '');
  const mime = (String(dataUrl || '').match(/^data:([^;]+);base64,/i) || [])[1] || '';
  const name = String(fileName || '').toLowerCase();
  if (cleaned.length < 40) {
    return { parts: [], localForm: null, usedOcr: false, error: 'Last opp et bilde eller et dokument.' };
  }
  const buffer = Buffer.from(cleaned, 'base64');
  const pdf = mime === 'application/pdf' || name.endsWith('.pdf');
  const docx = /wordprocessingml/.test(mime) || name.endsWith('.docx');
  const plain = mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md');
  if (docx) {
    const { extractDocxText } = await import('./documentText.js');
    const text = String(extractDocxText(buffer) || '').slice(0, 20000);
    const read = formFromPlainText(text, '');
    return {
      parts: [{ text: 'Les dokumentet og bygg skjemaet.' }, { text: `Dokumenttekst:\n${text}` }],
      localForm: read.ok ? read.form : null,
      usedOcr: false,
      error: '',
    };
  }
  if (plain) {
    const { decodePlainText } = await import('./documentText.js');
    const text = decodePlainText(cleaned).slice(0, 20000);
    const read = formFromPlainText(text, '');
    return {
      parts: [{ text: 'Les dokumentet og bygg skjemaet.' }, { text: `Dokumenttekst:\n${text}` }],
      localForm: read.ok ? read.form : null,
      usedOcr: false,
      error: '',
    };
  }
  if (!pdf) {
    return {
      parts: [
        { text: 'Les dette bildet av skjemaet. Se bokser, avkrysninger, streker, kolonner og bilder.' },
        { inline_data: { mime_type: mime || 'image/jpeg', data: cleaned } },
      ],
      localForm: null,
      usedOcr: true,
      error: '',
    };
  }
  const text = String(await extractPdfLines(buffer, { maxPages: MAX_PAGES }).catch(() => '') || '').slice(0, 20000);
  const widgets = await widgetsFromPdf(buffer).catch(() => []);
  const read = localForm(text, widgets);
  const parts = [{ text: 'Les dette skjemaet. Se bokser, avkrysninger, streker, kolonner, logo og bilder.' }];
  if (text) parts.push({ text: `Dokumenttekst:\n${text}` });
  const widgetFields = read?.fields?.length && widgets.length
    ? (formFromWidgets(widgets, widgets[0]?.pageWidth || 0).form?.fields || [])
    : [];
  if (widgetFields.length) {
    parts.push({ text: `Utfyllingsfelter i PDF-en:\n${widgetFields.map(widgetLine).join('\n')}` });
  }
  const images = pagePartsFromPdf(buffer, 3);
  let usedOcr = false;
  if (images.length) {
    parts.push(...images);
    usedOcr = true;
  } else if (text.length < 80) {
    try {
      const { ocrPdfPages } = await import('./ocrPdf.js');
      const ocr = await ocrPdfPages(buffer).catch(() => ({ text: '', images: [] }));
      if (ocr.text) parts.push({ text: `OCR-tekst:\n${String(ocr.text).slice(0, 20000)}` });
      for (const image of (ocr.images || []).slice(0, 3)) {
        parts.push({
          inline_data: { mime_type: image.mime || 'image/png', data: image.buffer.toString('base64') },
        });
      }
      usedOcr = Boolean(ocr.text || (ocr.images || []).length);
    } catch {
      usedOcr = false;
    }
  }
  if (parts.length === 1 && cleaned.length <= 1_500_000) {
    parts.push({ inline_data: { mime_type: 'application/pdf', data: cleaned } });
    usedOcr = true;
  }
  return { parts, localForm: read, usedOcr, error: '' };
}
