/**
 * Kobler bilder fra en CV til prosjektene de står ved.
 * Selve utklippet fra PDF-en skjer i funksjonen. Denne delen kan testes uten fil.
 */

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titlesMatch(left, right) {
  const a = norm(left);
  const b = norm(right);
  if (a.length < 8 || b.length < 8) return false;
  const size = Math.min(18, a.length, b.length);
  if (a.slice(0, size) === b.slice(0, size)) return true;
  const short = Math.min(12, a.length, b.length);
  if (a.startsWith(b.slice(0, short)) || b.startsWith(a.slice(0, short))) return true;
  // Avkuttet PDF-hint midt i tittelen skal fortsatt treffe prosjektet.
  const needle = a.length <= b.length ? a.slice(0, Math.min(20, a.length)) : b.slice(0, Math.min(20, b.length));
  const hay = a.length <= b.length ? b : a;
  return needle.length >= 10 && hay.includes(needle);
}

function isInline(url) {
  return String(url || '').startsWith('data:');
}

/** Antall data-URL-bilder som må lastes opp før lagring. */
export function countInlineCvImages(employee) {
  const row = employee && typeof employee === 'object' ? employee : {};
  let total = 0;
  if (isInline(row.person?.photoUrl)) total += 1;
  for (const project of row.cv?.projects || []) {
    for (const image of project?.images || []) {
      if (isInline(image)) total += 1;
    }
  }
  return total;
}

async function runPool(items, limit, task) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await task(items[index], index);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

/**
 * Laster data-URL-er opp før lagring, så dokumentet ikke blir for stort.
 * @param {(path: string, dataUrl: string) => Promise<string>} upload
 * @param {{ onProgress?: (info: { done: number, total: number, label: string, lastError?: string }) => void }} [options]
 */
export async function storeCvImages(employee, upload, options = {}) {
  const row = employee && typeof employee === 'object' ? employee : {};
  const id = row.id || 'cv';
  const total = countInlineCvImages(row);
  let done = 0;
  let lastError = '';
  const report = (label) => {
    if (typeof options.onProgress === 'function') {
      options.onProgress({ done, total, label, lastError });
    }
  };
  report(total ? 'Laster opp bilder…' : 'Ingen bilder å laste opp');

  const bump = async (path, dataUrl) => {
    const stored = await upload(path, dataUrl);
    done += 1;
    report(total ? `Laster opp bilde ${done} av ${total}…` : 'Laster opp bilder…');
    return stored;
  };

  let photoUrl = row.person?.photoUrl || '';
  if (isInline(photoUrl)) {
    try {
      const stored = await bump(`employees/${id}/photo`, photoUrl);
      if (stored && !isInline(stored)) photoUrl = stored;
    } catch (err) {
      lastError = String(err?.message || err || lastError);
      done += 1;
      report(total ? `Laster opp bilde ${done} av ${total}…` : 'Laster opp bilder…');
    }
  }
  const projects = await runPool(row.cv?.projects || [], 4, async (project, index) => {
    const images = [];
    const source = Array.isArray(project?.images) ? project.images : [];
    for (let imageIndex = 0; imageIndex < source.length; imageIndex += 1) {
      const image = source[imageIndex];
      if (!isInline(image)) {
        if (image) images.push(image);
        continue;
      }
      try {
        const stored = await bump(`employees/${id}/projects/${project?.id || index}/${imageIndex}`, image);
        images.push(stored && !isInline(stored) ? stored : image);
      } catch (err) {
        lastError = String(err?.message || err || lastError);
        done += 1;
        report(total ? `Laster opp bilde ${done} av ${total}…` : 'Laster opp bilder…');
        images.push(image);
      }
    }
    return { ...project, images };
  });
  if (total) report(`Lastet opp ${done} av ${total} bilder`);
  return {
    ...row,
    person: { ...(row.person || {}), photoUrl },
    cv: { ...(row.cv || {}), projects },
  };
}

export function cvDocumentFits(employee, limit = 800000) {
  try {
    return JSON.stringify(employee || {}).length <= limit;
  } catch {
    return false;
  }
}

/**
 * Tar bort bilder som fortsatt ligger som data-URL, så teksten kan lagres.
 * Profilbildet beholdes når keepPhoto er satt, og prosjektbildene ryddes først.
 */
export function withoutInlineImages(employee, options = {}) {
  const keepPhoto = options.keepPhoto === true;
  const row = employee && typeof employee === 'object' ? employee : {};
  let dropped = 0;
  let photoUrl = row.person?.photoUrl || '';
  if (isInline(photoUrl) && !keepPhoto) {
    photoUrl = '';
    dropped += 1;
  }
  const projects = (row.cv?.projects || []).map((project) => {
    const images = (project.images || []).filter((image) => {
      if (!isInline(image)) return true;
      dropped += 1;
      return false;
    });
    return { ...project, images };
  });
  return {
    dropped,
    keptPhoto: keepPhoto && isInline(photoUrl),
    employee: {
      ...row,
      person: { ...(row.person || {}), photoUrl },
      cv: { ...(row.cv || {}), projects },
    },
  };
}

/** Slipper prosjektbilder først, slik at portrettet på profilen blir igjen. */
export function slimCvDocument(employee, limit = 800000) {
  if (cvDocumentFits(employee, limit)) return { employee, dropped: 0, keptPhoto: false };
  const kept = withoutInlineImages(employee, { keepPhoto: true });
  if (cvDocumentFits(kept.employee, limit)) {
    return { employee: kept.employee, dropped: kept.dropped, keptPhoto: !!kept.keptPhoto };
  }
  const bare = withoutInlineImages(kept.employee);
  return {
    employee: bare.employee,
    dropped: kept.dropped + bare.dropped,
    keptPhoto: false,
  };
}

/** Ett bilde per prosjekt, bare når tittelen ved bildet treffer prosjektet. */
export function assignProjectImages(projects, shots) {
  const rows = Array.isArray(projects) ? projects : [];
  const pictures = (Array.isArray(shots) ? shots : []).filter((shot) => shot?.dataUrl);
  const used = new Set();
  return rows.map((project) => {
    const current = Array.isArray(project?.images) ? project.images.filter(Boolean) : [];
    if (current.length) return { ...project, images: current };
    const index = pictures.findIndex((shot, shotIndex) => (
      !used.has(shotIndex) && titlesMatch(project?.title, shot.titleHint)
    ));
    if (index < 0) return { ...project, images: [] };
    used.add(index);
    return { ...project, images: [pictures[index].dataUrl] };
  });
}
