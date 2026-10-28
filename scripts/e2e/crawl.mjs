/**
 * Sidegjennomgang: logger inn som eier i testbedriften og åpner alle sidene
 * i hjelpekatalogen (src/help/protopPages.js) på mobil, nettbrett og PC.
 * For hver side tas skjermbilde, og boten sjekker automatisk:
 *  - JS-feil og feilende funksjonskall
 *  - vannrett rulling på skjermen (innhold bredere enn telefonen)
 *  - «undefined», «NaN», «[object Object]» og rå i18n-nøkler i synlig tekst
 *  - rå ISO-datoer (2026-09-30) der appen skal vise norsk dato
 *  - engelske ord som har sluppet gjennom i norsk visning
 *  - knapper og lenker uten tilgjengelig navn
 *  - dobbel tittel: en overskrift i innholdet sier det samme som skallets
 *    sidetittel (toppfeltet, tittelraden med brødsmule eller modulbåndet), og
 *    skallet som viser samme tittel to ganger (toppfelt + tittelrad)
 *
 *   node scripts/e2e/crawl.mjs --views=phone,desktop --out=e2e-out/crawl
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROTOP_PAGES } from '../../src/help/protopPages.js';
import { titleDoubles } from '../../src/ui/pageTitle.js';
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
    // Rå ISO-datoer i visningstekst (skal være 30.09.2026 eller 30. sep.).
    const isoDates = [...new Set(text.split('\n').filter((l) => /\b(19|20)\d{2}-\d{2}-\d{2}\b/.test(l)).map((l) => l.trim().slice(0, 80)))].slice(0, 8);
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
    // Titler i skallet og overskrifter i innholdet (dobbel tittel, AGENTS.md). Sammenlignes i node.
    const seen = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= vw || r.bottom <= 0) return false;
      return el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
    };
    const own = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
    const main = document.getElementById('shell-scroll');
    const shellBits = '#module-title-row, #module-hero, #module-hero-slot';
    const shellTitles = [];
    for (const el of document.querySelectorAll('[role=heading], h1, h2, h3')) {
      if (!seen(el) || (main && main.contains(el) && !el.closest(shellBits)) || el.closest('[role=dialog]')) continue;
      if (el.closest('#module-hero')) continue;
      shellTitles.push({ text: own(el), where: el.closest('#module-title-row') ? 'tittelrad' : 'toppfelt' });
    }
    // Modulbåndet: navn (overlinje) og overskrift er hver sin tekst.
    for (const hero of document.querySelectorAll('#module-hero')) {
      if (!seen(hero)) continue;
      const title = hero.querySelector('#module-hero-title');
      const lines = title
        ? [...hero.querySelectorAll('div, span')].filter((el) => !el.children.length && seen(el)).map(own).filter(Boolean)
        : (hero.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const titleAt = title ? Math.max(0, lines.indexOf(own(title))) : 1;
      for (const line of lines.slice(0, titleAt + 1)) shellTitles.push({ text: line, where: 'bånd' });
    }
    const contentHeadings = [];
    if (main) {
      const skip = `${shellBits}, [role=dialog], [role=tab], [role=tablist], [role=navigation], [role=button], [role=link], button, a`;
      for (const el of main.querySelectorAll('[role=heading], h1, h2, h3')) {
        if (!seen(el) || el.closest(skip)) continue;
        contentHeadings.push({ text: own(el), kind: 'overskrift', level: el.getAttribute('aria-level') || el.tagName.toLowerCase() });
      }
      // Stor, halvfet tekst som ser ut som en tittel uten å være merket som overskrift.
      for (const el of main.querySelectorAll('div, span')) {
        if (el.children.length || !seen(el) || el.closest(skip) || el.closest('[role=heading]')) continue;
        const cs = getComputedStyle(el);
        if (parseFloat(cs.fontSize) >= 17 && Number(cs.fontWeight) >= 600) {
          contentHeadings.push({ text: own(el), kind: 'stor tekst', level: cs.fontSize });
        }
      }
    }
    return {
      shellTitles,
      contentHeadings,
      title: document.title,
      scrollWidth: document.documentElement.scrollWidth,
      vw,
      bad: [...new Set(bad)],
      rawKeys: [...new Set(rawKeys)].slice(0, 8),
      englishHits,
      isoDates,
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
    if (row.shellTitles) {
      const found = titleDoubles({ shell: row.shellTitles, content: row.contentHeadings });
      row.doubleTitles = found.doubles;
      row.shellDouble = found.shellDouble;
      row.nearTitles = found.near;
    }
    rows.push(row);
    const flags = [
      row.error && 'FEIL',
      row.jsErrors.length && `js:${row.jsErrors.length}`,
      row.failedCalls.length && `kall:${row.failedCalls.length}`,
      row.overflow?.length && 'overflow',
      row.bad?.length && `tekst:${row.bad.join('/')}`,
      row.rawKeys?.length && 'nøkler',
      row.englishHits?.length && 'engelsk',
      row.isoDates?.length && 'iso-dato',
      row.doubleTitles?.length && `dobbel-tittel:${row.doubleTitles.join('/')}`,
      row.shellDouble?.length && `skall-dobbel:${row.shellDouble.join('/')}`,
      row.nearTitles?.length && `nesten-lik-tittel:${row.nearTitles.join('/')}`,
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
// Oppsummering: sider med dobbel tittel per visning.
report.doubleTitles = {};
for (const [view, rows] of Object.entries(report.views)) {
  const pages = rows.filter((r) => r.doubleTitles?.length).map((r) => r.key);
  const shell = rows.filter((r) => r.shellDouble?.length).map((r) => r.key);
  const near = rows.filter((r) => r.nearTitles?.length).map((r) => r.key);
  report.doubleTitles[view] = {
    pages: pages.length, shellPages: shell.length, nearPages: near.length, keys: pages, shellKeys: shell, nearKeys: near,
  };
  console.log(`[${view}] dobbel tittel på ${pages.length} sider, i skallet på ${shell.length}, nesten lik på ${near.length}`);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'crawl.json'), JSON.stringify(report, null, 2));
console.log('Ferdig:', join(OUT, 'crawl.json'));
