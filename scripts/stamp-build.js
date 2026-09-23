const fs = require('fs');
const path = require('path');

const ICON_VERSION = '4';

function upsertHeadTags(html, tags) {
  let out = html;
  for (const tag of tags) {
    const relMatch = tag.match(/rel="([^"]+)"/);
    const sizesMatch = tag.match(/sizes="([^"]+)"/);
    if (!relMatch) continue;
    const rel = relMatch[1];
    const sizes = sizesMatch ? sizesMatch[1] : null;
    const pattern = sizes
      ? new RegExp(`<link[^>]*rel="${rel}"[^>]*sizes="${sizes}"[^>]*>`, 'g')
      : new RegExp(`<link[^>]*rel="${rel}"[^>]*(?!sizes=)[^>]*>`, 'g');
    if (pattern.test(out)) {
      out = out.replace(pattern, tag);
    } else {
      out = out.replace('</head>', `${tag}\n  </head>`);
    }
  }
  return out;
}

const constantsPath = path.join(__dirname, '..', 'src', 'constants', 'build.js');
let buildId = process.env.APP_BUILD_ID || 'dev';
if (!process.env.APP_BUILD_ID) {
  try {
    const src = fs.readFileSync(constantsPath, 'utf8');
    const match = src.match(/APP_BUILD_ID\s*=\s*['"]([^'"]+)['"]/);
    if (match) buildId = match[1];
  } catch {}
}

// Expo export writes dist/index.html. Hosting rewrites ** to that file.
const distDirEarly = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDirEarly, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('dist/index.html not found — run export:web first');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/<title>.*?<\/title>/, `<title>ProTop (${buildId})</title>`);
// Lås skala på mobil: iOS Safari zoomer ellers inn på input < 16px og «sprenger» bredden.
html = html.replace(
  /content="width=device-width,[^"]*"/,
  'content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"',
);

if (/name="protop-build-id"/.test(html)) {
  html = html.replace(/name="protop-build-id"\s+content="[^"]*"/, `name="protop-build-id" content="${buildId}"`);
} else {
  html = html.replace('</head>', `  <meta name="protop-build-id" content="${buildId}" />\n  </head>`);
}

const v = ICON_VERSION;
const iconTags = [
  `  <link rel="icon" href="/favicon.ico?v=${v}" />`,
  `  <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png?v=${v}" />`,
  `  <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png?v=${v}" />`,
  `  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png?v=${v}" />`,
  `  <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png?v=${v}" />`,
  `  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=${v}" />`,
  `  <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png?v=${v}" />`,
  `  <link rel="manifest" href="/manifest.webmanifest" />`,
];

html = upsertHeadTags(html, iconTags);

const pwaMeta = [
  ['mobile-web-app-capable', 'yes'],
  ['apple-mobile-web-app-capable', 'yes'],
  ['apple-mobile-web-app-title', 'ProTop'],
  ['apple-mobile-web-app-status-bar-style', 'default'],
  ['theme-color', '#2563eb'],
];
for (const [name, content] of pwaMeta) {
  html = html.replace(new RegExp(`<meta name="${name}"[^>]*>`, 'g'), `<meta name="${name}" content="${content}" />`);
  if (!new RegExp(`name="${name}"`).test(html)) {
    html = html.replace('</head>', `  <meta name="${name}" content="${content}" />\n  </head>`);
  }
}

fs.writeFileSync(indexPath, html);
// Hosting SPA catch-all rewrites to /app.html — keep Expo exports working without marketing merge.
try {
  const appHtmlPath = path.join(path.dirname(indexPath), 'app.html');
  if (path.basename(indexPath) !== 'app.html') {
    fs.copyFileSync(indexPath, appHtmlPath);
    console.log('Copied index.html → app.html for SPA rewrites');
  }
} catch (e) {
  console.warn('app.html copy skipped', e.message);
}

console.log(`Stamped ${path.basename(indexPath)} with build id: ${buildId}`);

/**
 * Bake the deploy build id into the JS bundle so App.jsx hard-reloads PWAs
 * when a new Hosting revision goes live. Expo export leaves the source
 * constant unchanged unless we rewrite it here.
 */
function stampJsBuildIds(rootDir, nextId) {
  const fromConst = (() => {
    try {
      const src = fs.readFileSync(constantsPath, 'utf8');
      const match = src.match(/APP_BUILD_ID\s*=\s*['"]([^'"]+)['"]/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  })();
  if (!fromConst || fromConst === nextId) return 0;
  let patched = 0;
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|html)$/.test(name)) continue;
      let text = fs.readFileSync(full, 'utf8');
      if (!text.includes(fromConst)) continue;
      const next = text.split(fromConst).join(nextId);
      if (next === text) continue;
      fs.writeFileSync(full, next);
      patched += 1;
    }
  };
  walk(rootDir);
  return patched;
}

const jsPatched = stampJsBuildIds(path.dirname(indexPath), buildId);
if (jsPatched) console.log(`Rewrote APP_BUILD_ID in ${jsPatched} dist file(s) → ${buildId}`);

const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(__dirname, '..', 'dist');
for (const file of ['push-sw.js', 'firebase-messaging-sw.js', 'manifest.webmanifest', 'favicon.png', 'favicon-48.png', 'favicon.ico']) {
  const src = path.join(publicDir, file);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(distDir, file));
  console.log(`Copied ${file} to dist/`);
}

const addFriendHtml = path.join(__dirname, '..', 'website', 'add-friend.html');
if (fs.existsSync(addFriendHtml)) {
  fs.copyFileSync(addFriendHtml, path.join(distDir, 'add-friend.html'));
  console.log('Copied add-friend.html to dist/');
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) n += copyDirSync(from, to);
    else {
      fs.copyFileSync(from, to);
      n += 1;
    }
  }
  return n;
}

/** Universal Links / App Links for iOS + Android store apps */
const wellKnownCopied = copyDirSync(
  path.join(publicDir, '.well-known'),
  path.join(distDir, '.well-known'),
);
if (wellKnownCopied) console.log(`Copied ${wellKnownCopied} files to dist/.well-known/`);

const iconSrc = path.join(publicDir, 'icons', 'catalog');
const iconDest = path.join(distDir, 'icons', 'catalog');
const copiedIcons = copyDirSync(iconSrc, iconDest);
if (copiedIcons) console.log(`Copied ${copiedIcons} icons to dist/icons/catalog/`);

/** PWA / home-screen icons (must be real PNGs — SPA rewrite used to serve HTML here). */
const pwaIconFiles = ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
fs.mkdirSync(path.join(distDir, 'icons'), { recursive: true });
for (const name of pwaIconFiles) {
  const src = path.join(publicDir, 'icons', name);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(distDir, 'icons', name));
  console.log(`Copied icons/${name} to dist/`);
}

/** Hero-bilder til mobil/nettbrett-hjem (/heroes/…) */
const heroesCopied = copyDirSync(
  path.join(publicDir, 'heroes'),
  path.join(distDir, 'heroes'),
);
if (heroesCopied) console.log(`Copied ${heroesCopied} heroes to dist/heroes/`);

/** Module / help / activation illustrations (/assets/module-activation/…). */
const activationCopied = copyDirSync(
  path.join(publicDir, 'assets', 'module-activation'),
  path.join(distDir, 'assets', 'module-activation'),
);
if (activationCopied) console.log(`Copied ${activationCopied} illustrations to dist/assets/module-activation/`);

/** Barnetegninger room mockups (/assets/child-drawings/…). */
const childDrawingsCopied = copyDirSync(
  path.join(publicDir, 'assets', 'child-drawings'),
  path.join(distDir, 'assets', 'child-drawings'),
);
if (childDrawingsCopied) console.log(`Copied ${childDrawingsCopied} child-drawings to dist/assets/child-drawings/`);
