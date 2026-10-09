/**
 * Ende-til-ende: last inn ekte JPEG-er, bygg CV-PDF, verifiser at foto og
 * prosjektbilder faktisk tegnes (ikke bare XObject-referanser i rå PDF).
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cvDocumentFileSync, loadCvAssets } from './cvDocument.js';
import { jpegFromBytes } from './cvPdfJpeg.js';

const require = createRequire(import.meta.url);

function loadJpeg(path) {
  const bytes = new Uint8Array(readFileSync(path));
  const image = jpegFromBytes(bytes);
  assert.ok(image, `ugyldig jpeg: ${path}`);
  return image;
}

const photoPath = '/opt/cursor/artifacts/sample-photo.jpg';
const projectPath = '/opt/cursor/artifacts/sample-project.jpg';
const logoPath = '/opt/cursor/artifacts/sample-logo.jpg';

if (!existsSync(photoPath) || !existsSync(projectPath)) {
  console.log('cvPdfExport.e2e.test.mjs: skip (mangler sample-bilder)');
  process.exit(0);
}

const photo = loadJpeg(photoPath);
const projectImg = loadJpeg(projectPath);
const logo = existsSync(logoPath) ? loadJpeg(logoPath) : null;

const projects = Array.from({ length: 3 }, (_, i) => ({
  id: `p${i}`,
  title: i === 0 ? 'Kvitsøy skole (nybygg)' : `Prosjekt ${i + 1}`,
  address: 'Kommunehusveien 6, 4180 Kvitsøy',
  category: 'Offentlig næring',
  object: 'Skole',
  period: 'jan. 23 - mars 27',
  cost: '150 mill',
  client: 'Kvitsøy kommune',
  contact: 'Mona Svela',
  phone: '41559344',
  email: 'mona@example.no',
  employer: 'CONSULT1 AS',
  roles: 'Prosjektleder',
  responsibility: 'Prosjekteringsledelse.',
  images: [`https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/families%2Fx%2Fp${i}.jpg?alt=media&token=t`],
}));

const cv = {
  name: 'Geir Ove Andersen',
  title: 'Partner | Prosjekt- og prosjekteringsleder',
  photoUrl: 'https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/families%2Fx%2Fphoto.jpg?alt=media&token=t',
  facts: [
    ['Født', '29.12.1986'],
    ['Sivil status', 'Ugift'],
    ['Nasjonalitet', 'Norsk'],
    ['Språk', 'Norsk'],
    ['Arbeidsgiver', 'CONSULT1 AS'],
  ],
  summary: 'Andersen er en erfaren prosjektleder med 21 års bransjeerfaring.',
  education: [{ when: '2022 - 2025', school: 'UiS', program: 'EMBA', from: '2022' }],
  certifications: ['Lift kurs'],
  courses: [{ when: '06. 2026', title: 'Samspill' }],
  experience: [{
    employer: 'Consult1 AS', place: 'Sandnes', title: 'Partner', when: '2016 - d.d.',
    tasks: ['Prosjekteringsleder'],
  }],
  projects,
};

const assets = await loadCvAssets(cv, {
  loadImage: async (url) => {
    if (String(url).includes('photo.jpg')) return photo;
    return projectImg;
  },
  logo: logo ? {
    dataUrl: `data:image/jpeg;base64,${Buffer.from(logo.bytes).toString('base64')}`,
    width: logo.width,
    height: logo.height,
  } : null,
});

assert.equal(assets.wanted, 4); // photo + 3 projects
assert.equal(assets.got, 4);
assert.ok(assets.photo);
assert.equal(Object.keys(assets.projects).length, 3);

const file = cvDocumentFileSync(cv, {
  logo: assets.logo,
  photo: assets.photo,
  projects: assets.projects,
});
assert.equal(String.fromCharCode(...file.bytes.slice(0, 4)), '%PDF');
const raw = new TextDecoder('latin1').decode(file.bytes);
assert.match(raw, /\/Photo Do/);
assert.match(raw, /\/Prjp0 Do/);
assert.match(raw, /\/Prjp1 Do/);
assert.ok(file.bytes.length > 20000, `PDF for liten (${file.bytes.length})`);

const out = '/opt/cursor/artifacts/e2e-cv-with-images.pdf';
writeFileSync(out, file.bytes);

// Visuell sjekk: render side 1 og siste side, mål ikke-hvite piksler i bildeområder
let pdfium;
try {
  pdfium = require('pypdfium2');
} catch {
  // pypdfium2 er Python — bruk child_process
  pdfium = null;
}

const { spawnSync } = await import('node:child_process');
const py = `
import pypdfium2 as pdfium
from PIL import Image
pdf=pdfium.PdfDocument(${JSON.stringify(out)})
assert len(pdf) >= 1
p1=pdf[0].render(scale=1.5).to_pil()
p1.save('/opt/cursor/artifacts/e2e-cv-page-1.png', optimize=True)
# foto øvre høyre
region=p1.crop((p1.width-220, 100, p1.width-40, 340))
non=sum(c for c,px in region.getcolors(250000) if not (px[0]>245 and px[1]>245 and px[2]>245))
print('photo_nonwhite', non)
assert non > 500, non
# prosjektbilde: finn side med Referanse / siste sider
last=pdf[len(pdf)-1].render(scale=1.5).to_pil()
last.save('/opt/cursor/artifacts/e2e-cv-page-last.png', optimize=True)
left=last.crop((40, 40, 280, 220))
non2=sum(c for c,px in left.getcolors(250000) if not (px[0]>245 and px[1]>245 and px[2]>245))
print('project_nonwhite', non2)
# prosjekt kan ligge på side 1 hvis kort CV
if non2 < 500:
  mid=pdf[min(1,len(pdf)-1)].render(scale=1.5).to_pil()
  mid.save('/opt/cursor/artifacts/e2e-cv-page-2.png', optimize=True)
  left=mid.crop((40, 200, 280, 420))
  non2=sum(c for c,px in left.getcolors(250000) if not (px[0]>245 and px[1]>245 and px[2]>245))
  print('project_nonwhite_p2', non2)
assert non2 > 500, non2
print('pages', len(pdf))
print('ok')
`;
const result = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  assert.fail('visuell PDF-sjekk feilet');
}
console.log(result.stdout.trim());

const imagesSrc = readFileSync(new URL('./cvPdfImages.js', import.meta.url), 'utf8');
assert.match(imagesSrc, /downloadStorageFile/);
assert.match(imagesSrc, /bytesViaPlainFetch/);
assert.match(imagesSrc, /credentials: 'omit'/);
assert.equal(/Authorization\s*:/.test(imagesSrc), false);

console.log('cvPdfExport.e2e.test.mjs: ok');
