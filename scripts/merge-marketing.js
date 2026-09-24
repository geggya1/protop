#!/usr/bin/env node
/**
 * Merge marketing website into Expo web export (dist/).
 * - Expo SPA becomes dist/app.html (catch-all for app routes)
 * - Marketing pages become the public site at /, /funksjoner, etc.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const website = path.join(root, 'website');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function isSpaHtml(file) {
  try {
    const html = fs.readFileSync(file, 'utf8');
    return html.includes('id="root"') || html.includes('_expo/');
  } catch {
    return false;
  }
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  fail('dist/index.html mangler — kjør expo export først');
}
if (!fs.existsSync(path.join(website, 'index.html'))) {
  fail('website/index.html mangler');
}

const spaIndex = path.join(dist, 'index.html');
const appHtml = path.join(dist, 'app.html');
if (isSpaHtml(spaIndex)) {
  fs.copyFileSync(spaIndex, appHtml);
} else if (!isSpaHtml(appHtml)) {
  fail('Fant ikke Expo SPA i dist/index.html eller dist/app.html — kjør export:web først');
}

for (const name of fs.readdirSync(website)) {
  if (name === 'pages') continue;
  copyRecursive(path.join(website, name), path.join(dist, name));
}

if (!isSpaHtml(appHtml)) {
  fail('dist/app.html mangler Expo SPA etter marketing-merge — Hosting-rewrites til /hjem ville 404');
}
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  fail('dist/index.html mangler etter marketing-merge');
}
const mergedIndex = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!mergedIndex.includes('wp-marketing')) {
  fail('dist/index.html is not the marketing homepage after merge (missing wp-marketing)');
}

console.log('Merged marketing site into dist/ (SPA → app.html)');
