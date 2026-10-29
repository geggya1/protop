/**
 * Offentlig bedriftsside: hero, moduler og nyhetskort.
 * Rekkefølgen i modules er prioriteten. Skjulte moduler ligger igjen i listen.
 * Om oss er en artikkel (article.blocks), Tjenester er seksjoner med kort (servicePage.sections).
 */
import { isActiveEmployee } from '../employees/employmentState.js';

export const PAGE_TABS = [
  { id: 'oversikt', label: 'Oversikt' },
  { id: 'nyheter', label: 'Nyheter' },
  { id: 'om-oss', label: 'Om oss' },
  { id: 'tjenester', label: 'Tjenester' },
  { id: 'ansatte', label: 'Ansatte' },
  { id: 'baerekraft', label: 'Bærekraft' },
  { id: 'kontakt', label: 'Kontakt' },
  { id: 'selskapsdata', label: 'Offentlig selskapsdata' },
];

/** Faner som redigeres der de står når «Rediger side» er på. Resten redigeres fra Oversikt. */
export const EDIT_TABS = ['oversikt', 'om-oss', 'tjenester', 'baerekraft'];

// Siden lagres på bedriftsdokumentet, som alle i bedriften leser: grensene holder det lett.
export const ARTICLE_LIMITS = { blocks: 20, text: 4000, caption: 200 };

export const IMAGE_LAYOUTS = [
  { id: 'full', label: 'Full bredde', icon: 'image-outline' },
  { id: 'left', label: 'Bilde til venstre', icon: 'arrow-back-outline' },
  { id: 'right', label: 'Bilde til høyre', icon: 'arrow-forward-outline' },
];

export const SERVICE_LIMITS = { sections: 8, items: 12, title: 80, intro: 600, text: 700 };

export const SERVICE_LAYOUTS = [
  { id: 'cards', label: 'Bildekort', icon: 'grid-outline' },
  { id: 'columns', label: 'Tekst i to kolonner', icon: 'reorder-two-outline' },
];

export const NEWS_CATEGORIES = [
  { id: 'selskap', label: 'Selskapsnytt' },
  { id: 'baerekraft', label: 'Bærekraft' },
  { id: 'kompetanse', label: 'Kompetanse' },
  { id: 'prosjekt', label: 'Prosjekt' },
  { id: 'ledelsessystem', label: 'Kvalitet, miljø og HMS' },
];

export const MODULE_CATALOG = [
  { id: 'about', column: 'main', visible: true, label: 'Om oss' },
  { id: 'news', column: 'main', visible: true, label: 'Siste nyheter' },
  { id: 'explore', column: 'main', visible: true, label: 'Utforsk mer av oss' },
  { id: 'facts', column: 'side', visible: true, label: 'Nøkkelinformasjon' },
  { id: 'hours', column: 'side', visible: true, label: 'Åpningstider' },
  { id: 'contact', column: 'side', visible: true, label: 'Kontakt oss' },
  { id: 'jobs', column: 'side', visible: true, label: 'Ledige stillinger' },
  { id: 'registers', column: 'main', visible: false, label: 'Register og status' },
  { id: 'roles', column: 'main', visible: false, label: 'Roller' },
  { id: 'units', column: 'side', visible: false, label: 'Underenheter' },
];

export const COVER_ASPECTS = [
  { id: 'banner', label: 'Banner', value: 21 / 8 },
  { id: 'wide', label: 'Bred', value: 16 / 7 },
  { id: 'photo', label: 'Foto', value: 16 / 9 },
];

export const POST_ASPECTS = [
  { id: 'card', label: 'Kort', value: 16 / 9 },
  { id: 'wide', label: 'Bred', value: 2 },
  { id: 'square', label: 'Kvadrat', value: 1 },
];

const HIGHLIGHTS = [
  { id: 'kompetanse', title: 'Kompetanse', text: 'Fagkompetanse i prosjektene', icon: 'people-outline', tone: 'blue' },
  { id: 'kvalitet', title: 'Kvalitet', text: 'Trygge og tydelige leveranser', icon: 'ribbon-outline', tone: 'violet' },
  { id: 'baerekraft', title: 'Bærekraft', text: 'Fokus på miljø, samfunn og fremtid', icon: 'leaf-outline', tone: 'green' },
];

const HOURS = [
  { id: 'weekdays', label: 'Mandag – Fredag', days: [1, 2, 3, 4, 5], open: '07:00', close: '15:00', closed: false },
  { id: 'weekend', label: 'Lørdag – Søndag', days: [6, 0], open: '', close: '', closed: true },
];

function text(value) {
  return String(value ?? '').trim();
}

function clip(value, max) {
  return text(value).slice(0, max);
}

export function safeWebUrl(value) {
  const raw = text(value);
  if (!raw || /\s/.test(raw) || /^(javascript|data|blob):/i.test(raw)) return '';
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProto);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (!url.hostname || !url.hostname.includes('.') || !/^[a-z0-9.-]+$/i.test(url.hostname)) return '';
    const href = url.toString();
    const bare = url.pathname === '/' && !url.search && !url.hash ? href.replace(/\/$/, '') : href;
    return bare.slice(0, 500);
  } catch {
    return '';
  }
}

function clock(value) {
  const match = text(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseMinutes(value) {
  const normalized = clock(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

function normalizeModules(raw) {
  const catalog = new Map(MODULE_CATALOG.map((row) => [row.id, row]));
  const seen = new Set();
  const out = [];
  const source = Array.isArray(raw) ? raw : MODULE_CATALOG;
  source.forEach((row) => {
    const id = text(row?.id);
    const spec = catalog.get(id);
    if (!spec || seen.has(id)) return;
    seen.add(id);
    const column = row?.column === 'side' || row?.column === 'main' ? row.column : spec.column;
    out.push({
      id,
      column,
      visible: typeof row?.visible === 'boolean' ? row.visible : spec.visible,
    });
  });
  MODULE_CATALOG.forEach((spec) => {
    if (seen.has(spec.id)) return;
    out.push({ id: spec.id, column: spec.column, visible: spec.visible });
  });
  return out;
}

function normalizeHighlights(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    return HIGHLIGHTS.map((row) => ({ ...row }));
  }
  return raw.slice(0, 4).map((row, index) => {
    const fallback = HIGHLIGHTS[index] || HIGHLIGHTS[0];
    const id = text(row?.id) || fallback.id;
    const known = HIGHLIGHTS.find((item) => item.id === id) || fallback;
    return {
      id,
      title: clip(row?.title, 40),
      text: clip(row?.text, 140),
      icon: known.icon,
      tone: known.tone,
    };
  });
}

function normalizeHours(raw) {
  const source = Array.isArray(raw) && raw.length ? raw.slice(0, 7) : HOURS;
  return source.map((row, index) => {
    const fallback = HOURS[index] || HOURS[0];
    const days = Array.isArray(row?.days)
      ? row.days.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6)
      : fallback.days;
    return {
      id: text(row?.id) || fallback.id || `hours-${index + 1}`,
      label: clip(row?.label, 40) || fallback.label,
      days: days.length ? days : fallback.days,
      open: clock(row?.open),
      close: clock(row?.close),
      closed: row?.closed === true,
    };
  });
}

function uniqueId(value, fallback, seen) {
  let id = clip(value, 40) || fallback;
  if (seen.has(id)) id = `${id}-${seen.size + 1}`;
  seen.add(id);
  return id;
}

/** Ny id til blokker, seksjoner og kort. Tid + tilfeldig, så to trykk i samme millisekund ikke kolliderer. */
export function pageItemId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeArticle(raw) {
  const source = Array.isArray(raw?.blocks) ? raw.blocks : [];
  const seen = new Set();
  const blocks = source.slice(0, ARTICLE_LIMITS.blocks).map((row, index) => {
    const id = uniqueId(row?.id, `blokk-${index + 1}`, seen);
    if (row?.type === 'image') {
      return {
        id,
        type: 'image',
        url: safeWebUrl(row?.url),
        caption: clip(row?.caption, ARTICLE_LIMITS.caption),
        layout: IMAGE_LAYOUTS.some((item) => item.id === row?.layout) ? row.layout : 'full',
        text: clip(row?.text, ARTICLE_LIMITS.text),
      };
    }
    return { id, type: 'text', text: clip(row?.text, ARTICLE_LIMITS.text) };
  });
  // Tomme blokker lagres ikke: et bilde uten fil, en tekst uten innhold.
  return { blocks: blocks.filter((row) => (row.type === 'image' ? row.url : row.text)) };
}

export function newArticleBlock(type) {
  if (type === 'image') {
    return { id: pageItemId('bilde'), type: 'image', url: '', caption: '', layout: 'full', text: '' };
  }
  return { id: pageItemId('tekst'), type: 'text', text: '' };
}

export function articleHasContent(page) {
  return normalizeArticle(page?.article).blocks.length > 0;
}

function normalizeServiceItems(raw, limit = SERVICE_LIMITS.items) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.slice(0, limit).map((row, index) => ({
    id: uniqueId(row?.id, `kort-${index + 1}`, seen),
    title: clip(row?.title, SERVICE_LIMITS.title),
    text: clip(row?.text, SERVICE_LIMITS.text),
    imageUrl: safeWebUrl(row?.imageUrl),
  })).filter((row) => row.title || row.text || row.imageUrl);
}

/**
 * Tjenestesiden. Eldre profiler har en flat liste (page.services); den blir én seksjon,
 * med bildekort når noen av tjenestene har bilde.
 */
function normalizeServicePage(raw, legacy) {
  if (!Array.isArray(raw?.sections)) {
    const items = normalizeServiceItems(legacy, 8);
    if (!items.length) return { sections: [] };
    const layout = items.some((row) => row.imageUrl) ? 'cards' : 'columns';
    return { sections: [{ id: 'tjenester', title: '', intro: '', layout, items }] };
  }
  const seen = new Set();
  return {
    sections: raw.sections.slice(0, SERVICE_LIMITS.sections).map((row, index) => ({
      id: uniqueId(row?.id, `seksjon-${index + 1}`, seen),
      title: clip(row?.title, SERVICE_LIMITS.title),
      intro: clip(row?.intro, SERVICE_LIMITS.intro),
      layout: SERVICE_LAYOUTS.some((item) => item.id === row?.layout) ? row.layout : 'cards',
      items: normalizeServiceItems(row?.items),
    })).filter((row) => row.title || row.intro || row.items.length),
  };
}

export function newServiceSection(layout = 'cards') {
  return {
    id: pageItemId('seksjon'),
    title: '',
    intro: '',
    layout: SERVICE_LAYOUTS.some((item) => item.id === layout) ? layout : 'cards',
    items: [newServiceItem()],
  };
}

export function newServiceItem() {
  return { id: pageItemId('kort'), title: '', text: '', imageUrl: '' };
}

export function serviceSectionsOf(page) {
  return normalizeServicePage(page?.servicePage, page?.services).sections;
}

/** Flytt et element i en liste én plass opp (-1) eller ned (1). Samme liste tilbake ved kanten. */
export function moveListItem(list, id, direction) {
  const rows = Array.isArray(list) ? list : [];
  const index = rows.findIndex((row) => row?.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= rows.length) return rows;
  const out = rows.slice();
  const [row] = out.splice(index, 1);
  out.splice(next, 0, row);
  return out;
}

/** Kolonner i et rutenett som får plass i boksen: minst min px per kort, høyst max. */
export function gridColumns(boxWidth, { min = 200, gap = 16, max = 4 } = {}) {
  const w = Number(boxWidth) || 0;
  if (w <= 0) return 1;
  return Math.max(1, Math.min(max, Math.floor((w + gap) / (min + gap))));
}

/** Bredden på ett kort når boksen deles i columns kolonner med gap mellom. */
export function gridItemWidth(boxWidth, columns, gap = 16) {
  const n = Math.max(1, Number(columns) || 1);
  const w = Number(boxWidth) || 0;
  return Math.max(0, Math.floor((w - gap * (n - 1)) / n));
}

function normalizeStaffSettings(raw) {
  const order = Array.isArray(raw?.order)
    ? [...new Set(raw.order.map((id) => clip(id, 80)).filter(Boolean))].slice(0, 300)
    : [];
  return { includeExternal: raw?.includeExternal === true, order };
}

/** Hva Bærekraft-fanen henter fra resten av bedriften. Alt er på til bedriften skrur av. */
export const SUSTAINABILITY_SOURCES = [
  { id: 'certificates', label: 'Sertifikater', hint: 'Gyldige sertifikater fra ISO' },
  { id: 'policy', label: 'Policy', hint: 'Publisert policy for kvalitet, miljø og arbeidsmiljø fra ISO' },
  { id: 'goals', label: 'Miljømål', hint: 'Aktive og nådde mål med område Miljø fra ISO' },
  { id: 'news', label: 'Nyheter', hint: 'Nyheter i kategoriene Bærekraft og Kvalitet, miljø og HMS' },
];

function normalizeSustainability(raw) {
  return Object.fromEntries(SUSTAINABILITY_SOURCES.map((row) => [row.id, raw?.[row.id] !== false]));
}

export function defaultCompanyPage() {
  return normalizeCompanyPage(null);
}

export function normalizeCompanyPage(raw) {
  const page = raw && typeof raw === 'object' ? raw : {};
  return {
    tagline: clip(page.tagline, 180),
    about: clip(page.about, 1600),
    coverUrl: safeWebUrl(page.coverUrl),
    phone: clip(page.phone, 40),
    email: clip(page.email, 120),
    website: safeWebUrl(page.website),
    address: clip(page.address, 180),
    videoUrl: safeWebUrl(page.videoUrl),
    videoTitle: clip(page.videoTitle, 80),
    showEmployees: page.showEmployees === true,
    staff: normalizeStaffSettings(page.staff),
    sustainability: clip(page.sustainability, 3000),
    sustainabilitySources: normalizeSustainability(page.sustainabilitySources),
    jobs: {
      text: clip(page.jobs?.text, 280),
      url: safeWebUrl(page.jobs?.url),
    },
    hours: normalizeHours(page.hours),
    highlights: normalizeHighlights(page.highlights),
    article: normalizeArticle(page.article),
    servicePage: normalizeServicePage(page.servicePage, page.services),
    modules: normalizeModules(page.modules),
  };
}

export function moduleLabel(id) {
  return MODULE_CATALOG.find((row) => row.id === id)?.label || id;
}

export function visibleModules(page, column) {
  return normalizeCompanyPage(page).modules.filter((row) => row.visible && row.column === column);
}

export function togglePageModule(page, id) {
  const current = normalizeCompanyPage(page);
  return {
    ...current,
    modules: current.modules.map((row) => (
      row.id === id ? { ...row, visible: !row.visible } : row
    )),
  };
}

export function movePageModule(page, id, direction) {
  const current = normalizeCompanyPage(page);
  const modules = current.modules.map((row) => ({ ...row }));
  const index = modules.findIndex((row) => row.id === id);
  if (index < 0) return current;
  const column = modules[index].column;
  const same = modules
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter((item) => item.row.column === column);
  const pos = same.findIndex((item) => item.row.id === id);
  const nextPos = pos + direction;
  if (nextPos < 0 || nextPos >= same.length) return current;
  const other = same[nextPos].rowIndex;
  const swapped = modules.slice();
  const hold = swapped[index];
  swapped[index] = swapped[other];
  swapped[other] = hold;
  return { ...current, modules: swapped };
}

export function setPageModuleColumn(page, id, column) {
  const current = normalizeCompanyPage(page);
  if (column !== 'main' && column !== 'side') return current;
  const row = current.modules.find((item) => item.id === id);
  if (!row || row.column === column) return current;
  const rest = current.modules.filter((item) => item.id !== id);
  let insertAt = rest.length;
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    if (rest[i].column === column) {
      insertAt = i + 1;
      break;
    }
  }
  const modules = rest.slice();
  modules.splice(insertAt, 0, { ...row, column });
  return { ...current, modules };
}

export function formatOrgNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 9) return text(value);
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export function formatPhone(value) {
  const raw = text(value);
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  return raw;
}

export function websiteLabel(value) {
  return text(value).replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function shortCompanyName(name) {
  const cleaned = text(name).replace(/\s+(AS|ASA|DA|ANS|BA|SA|NUF|ENK)\s*$/i, '').trim();
  return cleaned || 'bedriften';
}

export function shownTagline(page, profile) {
  if (text(page?.tagline)) return text(page.tagline);
  const industries = (profile?.naeringer || [])
    .map((row) => text(row?.beskrivelse))
    .filter(Boolean)
    .slice(0, 2);
  if (industries.length) return industries.join(' · ');
  return text(profile?.organisasjonsform);
}

export function shownAbout(page, profile) {
  if (text(page?.about)) return text(page.about);
  if (profile?.formaal?.length) return profile.formaal.join(' ');
  if (profile?.aktivitet?.length) return profile.aktivitet.join(' ');
  return '';
}

export function shownContact(page, profile, stored, address) {
  return {
    phone: text(page?.phone) || text(profile?.telefon) || text(profile?.mobil) || text(stored?.telefon),
    email: text(page?.email) || text(profile?.epostadresse) || text(stored?.epostadresse),
    website: text(page?.website) || text(profile?.hjemmeside),
    address: text(page?.address) || text(address),
  };
}

export function openingStatus(hours, now = new Date()) {
  const rows = Array.isArray(hours) ? hours : [];
  const day = now.getDay();
  const row = rows.find((item) => (item.days || []).includes(day));
  if (!row || row.closed) return { open: false, label: 'Stengt' };
  const open = parseMinutes(row.open);
  const close = parseMinutes(row.close);
  if (open == null || close == null || close <= open) return { open: false, label: 'Stengt' };
  const minutes = now.getHours() * 60 + now.getMinutes();
  const isOpen = minutes >= open && minutes < close;
  return { open: isOpen, label: isOpen ? 'Åpent nå' : 'Stengt' };
}

export function normalizeWallCategory(value) {
  const id = text(value);
  return NEWS_CATEGORIES.some((row) => row.id === id) ? id : '';
}

export function clipWallTitle(value) {
  return clip(value, 140);
}

export function categoryLabel(id) {
  return NEWS_CATEGORIES.find((row) => row.id === (id || 'selskap'))?.label || 'Selskapsnytt';
}

export function presentNewsPost(post) {
  const body = text(post?.body);
  const explicit = text(post?.title);
  const title = explicit || body.split('\n').map((line) => line.trim()).find(Boolean) || 'Oppdatering';
  let excerpt = body;
  if (explicit && body.toLowerCase().startsWith(explicit.toLowerCase())) {
    excerpt = body.slice(explicit.length).replace(/^[\s:—-]+/, '').trim();
  } else if (!explicit && body.includes('\n')) {
    excerpt = body.split('\n').slice(1).join(' ').trim();
  } else if (!explicit) {
    excerpt = '';
  }
  if (excerpt.length > 160) excerpt = `${excerpt.slice(0, 157).trim()}…`;
  return {
    title,
    excerpt,
    category: normalizeWallCategory(post?.category) || 'selskap',
    imageUrl: safeWebUrl(post?.imageUrl) || safeWebUrl(post?.imageUrls?.[0]) || '',
  };
}

export function videoPreview(url) {
  const href = safeWebUrl(url);
  if (!href) return null;
  const youtube = href.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  if (youtube) {
    return {
      href: `https://www.youtube.com/watch?v=${youtube[1]}`,
      thumb: `https://img.youtube.com/vi/${youtube[1]}/hqdefault.jpg`,
    };
  }
  return { href, thumb: '' };
}

export function publicStaff(employees) {
  return (Array.isArray(employees) ? employees : [])
    .filter((row) => isActiveEmployee(row))
    .map((row) => {
      const person = row?.person || {};
      const name = [person.firstName, person.middleName, person.lastName].map(text).filter(Boolean).join(' ');
      return {
        id: text(row?.id) || name,
        name: name || 'Ansatt',
        title: text(row?.company?.title || row?.cv?.headline),
      };
    })
    .filter((row) => row.id)
    .slice(0, 24);
}

export function companyInitials(name) {
  const parts = text(name).split(/\s+/).filter((part) => part && !/^(as|asa|da|sa)$/i.test(part));
  const letters = parts.slice(0, 2).map((part) => part[0]).join('');
  return (letters || 'B').toUpperCase();
}
