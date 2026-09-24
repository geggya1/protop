#!/usr/bin/env node
/**
 * Bump marketing app version (MAJOR.0.0) and scaffold a major changelog entry.
 *
 * Usage:
 *   node scripts/bump-app-version.js --major
 *   node scripts/bump-app-version.js --major --title "Ny modul" --summary "Kort beskrivelse"
 *   node scripts/bump-app-version.js --set 4.0.0
 *
 * Minor / fix entries: edit src/utils/appUpdates.js with level: 'fix' and today's date.
 * Those do not bump the marketing version and do not notify users.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');
const pkgPath = path.join(root, 'package.json');
const updatesPath = path.join(root, 'src/utils/appUpdates.js');

function parseArgs(argv) {
  const out = { major: false, set: null, title: null, summary: null, date: null, dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--major') out.major = true;
    else if (a === '--dry') out.dry = true;
    else if (a === '--set') out.set = argv[++i];
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--summary') out.summary = argv[++i];
    else if (a === '--date') out.date = argv[++i];
  }
  return out;
}

function parseSemver(version) {
  const m = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`Invalid version: ${version}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeJs(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const current = appJson?.expo?.version || pkg.version || '2.0.0';
  const parsed = parseSemver(current);

  let next;
  if (args.set) {
    next = args.set;
    parseSemver(next);
  } else if (args.major) {
    next = `${parsed.major + 1}.0.0`;
  } else {
    console.error('Specify --major or --set X.0.0');
    process.exit(1);
  }

  const nextMajor = parseSemver(next).major;
  console.log(`Version ${current} → ${next}`);

  if (!args.dry) {
    appJson.expo.version = next;
    pkg.version = next;
    fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  const date = args.date || todayIso();
  const titleNb = args.title || `ProTop ${nextMajor}.0`;
  const summaryNb = args.summary
    || 'Stor oppdatering med nye muligheter. Åpne Oppdateringer for detaljer.';
  const titleEn = args.title || `ProTop ${nextMajor}.0`;
  const summaryEn = args.summary
    || 'A major update with new capabilities. Open Updates for details.';
  const id = `${date}-v${nextMajor}`;

  const entry = `  {
    id: '${id}',
    date: '${date}',
    level: 'major',
    version: '${next}',
    title: T('${escapeJs(titleNb)}', '${escapeJs(titleEn)}'),
    summary: T(
      '${escapeJs(summaryNb)}',
      '${escapeJs(summaryEn)}',
    ),
    modules: [],
    tags: ['major', 'versjon'],
  },
`;

  let updatesSrc = fs.readFileSync(updatesPath, 'utf8');
  if (!updatesSrc.includes(`version: '${next}'`) && !updatesSrc.includes(`id: '${id}'`)) {
    updatesSrc = updatesSrc.replace(
      'export const APP_UPDATES = [\n',
      `export const APP_UPDATES = [\n${entry}`,
    );
    if (!args.dry) fs.writeFileSync(updatesPath, updatesSrc);
    console.log(`Scaffolded major changelog entry ${id}`);
  } else {
    console.log('Changelog already has this major entry — skipped scaffold');
  }

  if (args.dry) console.log('(dry run — no files written)');
}

main();
