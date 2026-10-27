/**
 * Sidegjennomgang: logger inn som eier i testbedriften og åpner alle sidene
 * i hjelpekatalogen (src/help/protopPages.js) på mobil, nettbrett og PC.
 * For hver side tas skjermbilde, og boten sjekker automatisk:
 *  - JS-feil og feilende funksjonskall
 *  - vannrett rulling på skjermen (innhold bredere enn telefonen)
 *  - «undefined», «NaN», «[object Object]» og rå i18n-nøkler i synlig tekst
 *  - engelske ord som har sluppet gjennom i norsk visning
 *  - knapper og lenker uten tilgjengelig navn
 *
 *   node scripts/e2e/crawl.mjs --views=phone,desktop --out=e2e-out/crawl
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROTOP_PAGES } from '../../src/help/protopPages.js';
import { BOT_USER, seed } from '../help-bot/seed.mjs';
import { Bot, closeBrowser } from './lib/bot.mjs';

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const OUT = arg('out', 'e2e-out/crawl');
const VIEW_LIST = arg('views', 'phone,desktop').split(',');
const FILTER = arg('pages', '');
// Chat åpnes som dokk på web og blir liggende over sidene etter; den tas sist.
const keys = Object.keys(PROTOP_PAGES)
  .filter((k) => !FILTER || FILTER.split(',').includes(k))
  .sort((a, b) => (a === 'chat') - (b === 'chat'));

const ENGLISH = /\b(Loading|Save|Cancel|Delete|Settings|Submit|Search|Error|Unknown|Close|Back|Next|Edit|Add new|No data|Something went wrong)\b/;

async function inspect(page) {
  return page.evaluate((englishSrc) => {
    const english = new RegExp(englishSrc);
    const vw = window.innerWidth;
    const text = document.body.innerText || '';
    const bad = [];
    for (const m of text.matchAll(/(undefined|NaN|\[object Object\]|Invalid Date)/g)) bad.push(m[0]);
    const rawKeys = [...text.matchAll(/\b[a-z][a-zA-Z]+(\.[a-z][a-zA-Z0-9]+){2,}\b/g)].map((m) => m[0])
      .filter((k) => !/protop\.no|\.(no|com|pdf|png|jpg|xlsx|docx)$/.test(k));
    const englishHits = [...new Set(text.split('\n').filter((l) => english.test(l)).map((l) => l.trim().slice(0, 80)))].slice(0, 8);
    // Elementer som stikker ut til høyre (vannrett rulling).
    const overflow = [];
    if (document.documentElement.scrollWidth > vw + 2) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 4 && r.left < vw && getComputedStyle(el).position !== 'fixed') {
          overflow.push(`${el.tagName.toLowerCase()} ${(el.innerText || '').trim().slice(0, 40)} (${Math.round(r.right)}px)`);
          if (overflow.length > 5) break;
        }
      }
    }
    // Ikonknapper uten navn (skjermleser).
    const unnamed = [];
    for (const el of document.querySelectorAll('[role=button],button,a[href]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right < 0 || r.left > vw) continue;
      const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '').trim();
      if (!name) unnamed.push(`${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // Små trykkflater på berøringsskjerm (< 32px i begge retninger).
    let tiny = 0;
    if (vw < 700) {
      for (const el of document.querySelectorAll('[role=button],button,a[href],input,[tabindex="0"]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.right < 0 || r.left > vw) continue;
        if (r.width < 32 && r.height < 32) tiny += 1;
      }
    }
    return {
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      vw,
      bad: [...new Set(bad)],
      rawKeys: [...new Set(rawKeys)].slice(0, 8),
      englishHits,
      overflow,
      unnamed: unnamed.length,
      unnamedSample: unnamed.slice(0, 5),
      tiny,
    };
  }, ENGLISH.source);
}

async function crawlView(view) {
  const dir = join(OUT, view);
  mkdirSync(dir, { recursive: true });
  const bot = await new Bot('eier', { ...BOT_USER, view, outDir: dir }).start();
  await bot.login();
  const rows = [];
  for (const key of keys) {
    const def = PROTOP_PAGES[key];
    const errBefore = bot.errors.length;
    const callsBefore = bot.failedCalls.length;
    const missBefore = (bot.missing || []).length;
    const row = { key, label: def.label?.nb || key };
    try {
      await bot.page.keyboard.press('Escape').catch(() => {});
      await bot.open(def.nav.tab, def.nav.subView || null, 2600);
      await bot.dismissTours();
      Object.assign(row, await inspect(bot.page));
      await bot.page.screenshot({ path: join(dir, `${key}.png`) });
      row.shot = `${view}/${key}.png`;
    } catch (err) {
      row.error = String(err?.message || err).slice(0, 300);
    }
    row.jsErrors = bot.errors.slice(errBefore).map((e) => e.message);
    row.failedCalls = bot.failedCalls.slice(callsBefore);
    row.missing = (bot.missing || []).slice(missBefore);
    rows.push(row);
    const flags = [
      row.error && 'FEIL',
      row.jsErrors.length && `js:${row.jsErrors.length}`,
      row.failedCalls.length && `kall:${row.failedCalls.length}`,
      row.overflow?.length && 'overflow',
      row.bad?.length && `tekst:${row.bad.join('/')}`,
      row.rawKeys?.length && 'nøkler',
      row.englishHits?.length && 'engelsk',
    ].filter(Boolean);
    console.log(`[${view}] ${key} ${flags.join(' ') || 'ok'}`);
  }
  await bot.stop();
  return rows;
}

await seed();
const report = { startedAt: new Date().toISOString(), views: {} };
for (const view of VIEW_LIST) report.views[view] = await crawlView(view);
await closeBrowser();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'crawl.json'), JSON.stringify(report, null, 2));
console.log('Ferdig:', join(OUT, 'crawl.json'));
