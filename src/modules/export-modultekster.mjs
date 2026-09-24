/**
 * Bygger lesbar tekstbank fra moduler.json (katalogskjemaet).
 * Kjør: node src/modules/export-modultekster.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORY_ORDER } from './moduleActivationLogic.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(DIR, 'moduler.json');
const OUT_PATH = path.join(DIR, 'alle-modultekster.txt');

function categoryTitle(categoryId) {
  return CATEGORY_ORDER.find((cat) => cat.id === categoryId)?.title || categoryId || '';
}

function asList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

export function buildAlleModultekster(catalog) {
  const defaults = catalog?.defaults && typeof catalog.defaults === 'object' ? catalog.defaults : {};
  const modules = Array.isArray(catalog?.modules) ? catalog.modules : [];
  const header = [
    'WEEKPLAN – TEKSTBANK FOR MODULAKTIVERING',
    '',
    'Teksten vises første gang en inaktiv modul åpnes.',
    'Bildet er dekorativt; verdi og funksjon skal alltid forklares i tekst.',
    '',
  ].join('\n');

  const sections = modules.map((item, index) => {
    const name = item?.name || item?.id || '';
    const back = item?.backLabel || defaults.backLabel || 'Tilbake';
    const primary = item?.activationLabel || (name ? `Aktiver ${name}` : '');
    const reassurance = item?.reassuranceText || defaults.reassuranceText || '';
    const mobileReassurance = item?.mobileReassuranceText
      || item?.reassuranceTextCompact
      || defaults.mobileReassuranceText
      || defaults.reassuranceTextCompact
      || '';
    const childReassurance = item?.childReassuranceText || defaults.childReassuranceText || '';
    return [
      `${index + 1}. ${name}`,
      `Id: ${item?.id || ''}`,
      `Kategori: ${categoryTitle(item?.category)}`,
      `Overlinje: ${item?.eyebrow || ''}`,
      `Overskrift: ${item?.headline || ''}`,
      `Introduksjon: ${item?.pitch || ''}`,
      'Fordeler:',
      ...asList(item?.benefits).map((benefit) => `- ${benefit}`),
      `Primærknapp: ${primary}`,
      `Sekundærknapp: ${back}`,
      `Trygghetstekst: ${reassurance}`,
      `Trygghetstekst mobil: ${mobileReassurance}`,
      `Trygghetstekst barn: ${childReassurance}`,
      `Illustrasjon: ${item?.illustration || ''}`,
    ].join('\n');
  });

  return `${header}${sections.join('\n\n')}\n`;
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
  const text = buildAlleModultekster(catalog);
  await fs.writeFile(OUT_PATH, text, 'utf8');
  console.log(`Eksporterte tekst for ${catalog.modules?.length || 0} moduler til ${path.relative(path.join(DIR, '../..'), OUT_PATH)}.`);
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  await main();
}
