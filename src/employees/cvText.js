/**
 * Leser teksten i en ProTop-CV (slik den skrives ut) til feltene på personen.
 * Brukes sammen med OCR og AI, slik at kurs og referanseprosjekter ikke faller ut.
 */

function linesOf(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line && !/^\d+\s*\/\s*\d+$/.test(line) && !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line));
}

function bullets(line) {
  return line.replace(/^[•\-*]\s*/, '').trim();
}

function isBullet(line) {
  return /^[•\-*]\s+\S/.test(line);
}

function repairEmail(value) {
  const raw = String(value || '').replace(/\s+/g, '').replace(/[,;]+$/g, '');
  if (!raw.includes('@') || !raw.includes('.')) return '';
  return raw;
}

function splitName(full) {
  const parts = String(full || '').split(' ').filter(Boolean);
  if (!parts.length) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] };
}

function fact(line, label) {
  const match = line.match(new RegExp(`^${label}\\s*:?\\s*(.*)$`, 'i'));
  if (!match) return null;
  return match[1].replace(/[,;]+$/g, '').trim();
}

function sectionAt(line) {
  const key = line.replace(/:$/, '').trim().toLowerCase();
  if (key === 'profil') return 'profile';
  if (key.startsWith('oppsummering')) return 'summary';
  if (key === 'utdanning') return 'education';
  if (key === 'sertifiseringer') return 'certifications';
  if (key === 'kurs') return 'courses';
  if (key === 'erfaringer') return 'experience';
  if (key === 'referanseprosjekter' || key === 'prosjekter') return 'projects';
  return '';
}

function educationOf(line) {
  const match = line.match(/^(\d{4})\s*[-–]\s*(\d{4})\s+(.+)$/);
  if (!match) return null;
  const rest = match[3];
  const split = rest.split(/\s+[-–]\s+/);
  return {
    from: match[1],
    to: match[2],
    school: (split[0] || '').trim(),
    program: split.slice(1).join(' - ').trim(),
  };
}

function courseOf(line) {
  const match = line.match(/^(\d{1,2})\.\s*(\d{4})\s+(.+)$/);
  if (!match) return null;
  return { date: `${match[1].padStart(2, '0')}.${match[2]}`, title: match[3].trim() };
}

function openEnded(value) {
  return !value || value === '-' || /^d\.d\.$/i.test(value);
}

function dateOf(line) {
  const match = line.match(/^(\d{4})\s*[-–]\s*(\d{4}|d\.d\.|-)?$/i);
  if (!match) return null;
  const open = openEnded(match[2]);
  return { from: match[1], to: open ? '' : match[2], current: open };
}

function employerDate(line) {
  const match = line.match(/^(.*\S)\s+(\d{4})\s*[-–]\s*(\d{4}|d\.d\.|-)?$/i);
  if (!match || match[1].length < 2) return null;
  const open = openEnded(match[3]);
  return { employer: match[1].trim(), from: match[2], to: open ? '' : match[3], current: open };
}

function looksLikeJobTitle(line) {
  return /\b(leder|formann|bas|snekker|fører|forer|koordinator|jernbinder|jerbinder|kranfører|kranforer)\b/i.test(line);
}

function looksLikeAddress(line) {
  if (/\d/.test(line) || /^postboks/i.test(line)) return true;
  if (looksLikeJobTitle(line)) return false;
  return /,/.test(line);
}

function continuesTask(line) {
  return /^[a-zæøå(]/.test(line);
}

function parseExperience(rows) {
  const jobs = [];
  let current = null;
  let mode = '';
  function finish() {
    if (!current) return;
    current.tasks = current.tasks.filter(Boolean).join('\n');
    if (current.employer || current.title || current.tasks) jobs.push(current);
    current = null;
    mode = '';
  }
  for (const line of rows) {
    if (/^arbeidsoppgaver$/i.test(line)) {
      mode = 'tasks';
      continue;
    }
    if (mode === 'tasks') {
      if (isBullet(line)) {
        current.tasks.push(bullets(line));
        continue;
      }
      if (continuesTask(line) && current.tasks.length) {
        const last = current.tasks.length - 1;
        current.tasks[last] = `${current.tasks[last]} ${line}`.replace(/\s+/g, ' ').trim();
        continue;
      }
      finish();
    }
    const dated = employerDate(line);
    if (!current) {
      current = {
        employer: dated?.employer || line,
        place: '',
        from: dated?.from || '',
        to: dated?.to || '',
        current: !!dated?.current,
        title: '',
        tasks: [],
      };
      continue;
    }
    const when = dateOf(line);
    if (when) {
      current.from = when.from;
      current.to = when.to;
      current.current = when.current;
      continue;
    }
    if (!current.place && looksLikeAddress(line)) {
      current.place = line;
      continue;
    }
    if (!current.title) {
      current.title = line;
      continue;
    }
    finish();
    const nextDated = employerDate(line);
    current = {
      employer: nextDated?.employer || line,
      place: '',
      from: nextDated?.from || '',
      to: nextDated?.to || '',
      current: !!nextDated?.current,
      title: '',
      tasks: [],
    };
  }
  finish();
  return jobs;
}

const PROJECT_FIELDS = [
  ['category', /^kategori\s*(.*)$/i],
  ['object', /^objekt\s*(.*)$/i],
  ['period', /^periode\s*(.*)$/i],
  ['cost', /^kostnad\s*(.*)$/i],
  ['client', /^kunde\s*(.*)$/i],
  ['client', /^oppdragsgiver\s*(.*)$/i],
  ['area', /^areal\s*(.*)$/i],
  ['cost', /^prosjektsum\s*(.*)$/i],
  ['buildingClass', /^tiltaksklasse\s*(.*)$/i],
  ['description', /^beskrivelse\s*(.*)$/i],
  ['contact', /^kontakt\s*(.*)$/i],
  ['phone', /^telefon\s*(.*)$/i],
  ['email', /^e-?post\s*(.*)$/i],
  ['employer', /^arbeidsgiver i perioden\s*(.*)$/i],
  ['roles', /^roller i prosjektet\s*(.*)$/i],
  ['responsibility', /^ansvar(?: i prosjektet)?\s*(.*)$/i],
];

function projectField(line) {
  for (const [key, pattern] of PROJECT_FIELDS) {
    const match = line.match(pattern);
    if (match) return [key, (match[1] || '').replace(/[,;]+$/g, '').trim()];
  }
  return null;
}

function blankProject() {
  return {
    title: '',
    address: '',
    category: '',
    object: '',
    period: '',
    cost: '',
    client: '',
    contact: '',
    phone: '',
    email: '',
    employer: '',
    roles: '',
    responsibility: '',
    area: '',
    buildingClass: '',
    description: '',
    referenceName: '',
    contactCompany: '',
    source: 'cv',
    link: { owner: 'person', companyProjectId: '' },
  };
}

function parseCourses(rows) {
  const courses = [];
  let current = null;
  for (const line of rows) {
    const course = courseOf(line);
    if (course) {
      if (current) courses.push(current);
      current = course;
      continue;
    }
    if (current) current.title = `${current.title} ${line}`.replace(/\s+/g, ' ').trim();
  }
  if (current) courses.push(current);
  return courses;
}

function addressLine(line) {
  if (postalLine(line)) return true;
  return /,/.test(line) && /\b(norge|norway)\b/i.test(line);
}

function startsNewProject(rows, index) {
  for (let cursor = index + 1; cursor < Math.min(rows.length, index + 5); cursor += 1) {
    const next = rows[cursor];
    if (projectField(next) || addressLine(next)) return true;
    if (/^[a-zæøå(/.]/.test(next)) continue;
    return false;
  }
  return false;
}

function parseProjects(rows) {
  const projects = [];
  let current = null;
  let started = false;
  let lastField = '';
  function finish() {
    if (!current?.title) {
      current = null;
      started = false;
      lastField = '';
      return;
    }
    current.email = repairEmail(current.email);
    projects.push(current);
    current = null;
    started = false;
    lastField = '';
  }
  for (let index = 0; index < rows.length; index += 1) {
    const line = rows[index];
    const field = projectField(line);
    if (!current) {
      current = blankProject();
      current.title = line;
      continue;
    }
    if (field) {
      current[field[0]] = field[1];
      lastField = field[0];
      started = true;
      continue;
    }
    if (started && !startsNewProject(rows, index)) {
      const key = ['responsibility', 'roles', 'description'].includes(lastField) ? lastField : 'responsibility';
      current[key] = `${current[key]} ${line}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    if (started) {
      finish();
      current = blankProject();
      current.title = line;
      continue;
    }
    current.address = current.address ? `${current.address}, ${line}` : line;
  }
  finish();
  return projects;
}

export function parseProtopCv(text) {
  const lines = linesOf(text);
  const sections = { profile: [], summary: [], education: [], certifications: [], courses: [], experience: [], projects: [] };
  let section = 'head';
  const head = [];
  for (const line of lines) {
    const next = sectionAt(line);
    if (next) {
      section = next;
      continue;
    }
    if (section === 'head') head.push(line);
    else sections[section].push(line);
  }
  const nameLine = head.find((line) => !/^curriculum vitae$/i.test(line)) || '';
  const headline = head.filter((line) => line !== nameLine && !/^curriculum vitae$/i.test(line)).join(' ');
  const names = splitName(nameLine);
  const profile = {};
  for (const line of sections.profile) {
    const born = fact(line, 'Født');
    const marital = fact(line, 'Sivil status');
    const nationality = fact(line, 'Nasjonalitet');
    const language = fact(line, 'Språk');
    if (born != null) profile.birthDate = born;
    if (marital != null) profile.maritalStatus = marital;
    if (nationality != null) profile.nationality = nationality;
    if (language != null) profile.language = language;
  }
  return {
    ...names,
    headline,
    summary: sections.summary.map(bullets).filter(Boolean).join('\n'),
    birthDate: profile.birthDate || '',
    maritalStatus: profile.maritalStatus || '',
    nationality: profile.nationality || '',
    language: profile.language || '',
    education: sections.education.map(educationOf).filter(Boolean),
    certifications: sections.certifications.filter(isBullet).map((line) => ({ title: bullets(line) })),
    courses: parseCourses(sections.courses),
    experience: parseExperience(sections.experience),
    projects: parseProjects(sections.projects),
  };
}

const SHEET_FACTS = [
  ['client', /^oppdragsgiver$/i],
  ['period', /^periode$/i],
  ['area', /^areal$/i],
  ['cost', /^prosjektsum$/i],
  ['buildingClass', /^tiltaksklasse$/i],
];

function sheetLabel(line) {
  const raw = String(line || '').trim();
  const bare = raw.replace(/\s*:\s*$/, '').trim();
  const contact = raw.match(/^kontaktperson hos oppdragsgiver\s*(?::\s*(.*))?$/i);
  if (contact) return contact[1] ? `contact:${contact[1].trim()}` : 'contact';
  if (/^roller i prosjektet$/i.test(bare)) return 'roles';
  for (const [key, pattern] of SHEET_FACTS) {
    if (pattern.test(bare)) return key;
  }
  const inline = raw.match(/^(oppdragsgiver|periode|areal|prosjektsum|tiltaksklasse)\s*:\s*(.+)$/i)
    || raw.match(/^(oppdragsgiver|periode|areal|prosjektsum|tiltaksklasse)\s+(.+)$/i);
  if (!inline) return '';
  const key = SHEET_FACTS.find(([, pattern]) => pattern.test(inline[1]))?.[0];
  return key ? `${key}:${inline[2].trim()}` : '';
}

function postalLine(line) {
  return /\b\d{4}\b/.test(line) && /,/.test(line);
}

function personName(line) {
  const parts = String(line || '').split(' ').filter(Boolean);
  if (parts.length < 2 || parts.length > 4 || line.length > 40 || /[.:,]/.test(line)) return false;
  return parts.every((part) => /^[A-ZÆØÅ]/.test(part));
}

function isAreaUnit(bit) {
  return /^m[2²]$/i.test(String(bit || '').replace(/\s/g, ''));
}

function factValue(key, bits) {
  if (key !== 'area') return bits.join(' ').replace(/\s+/g, ' ').trim();
  const unit = bits.find((bit) => isAreaUnit(bit));
  const number = bits.find((bit) => !isAreaUnit(bit) && /\d/.test(bit));
  const unitText = unit ? 'm2' : '';
  if (!number) return unitText;
  return /m2|m²/i.test(number) ? number : [number, unitText].filter(Boolean).join(' ');
}

function takeFact(lines, index) {
  const bits = [];
  let cursor = index;
  while (cursor < lines.length && !sheetLabel(lines[cursor])) {
    const line = lines[cursor];
    if (isAreaUnit(line)) {
      bits.push(line);
      cursor += 1;
      continue;
    }
    const started = bits.some((bit) => !isAreaUnit(bit) && (/\d/.test(bit) || bit.length > 3));
    if (started) break;
    bits.push(line);
    cursor += 1;
    if (bits.length > 3) break;
  }
  return [bits, cursor];
}

/** Ett helsides referanseark, slik det skrives ut ved siden av CV-en. */
export function parseProjectSheet(text) {
  const lines = linesOf(text);
  const hasClient = lines.some((line) => /^oppdragsgiver\b/i.test(line));
  const hasSheet = lines.some((line) => /^(prosjektsum|tiltaksklasse|areal)\b/i.test(line));
  if (!hasClient || !hasSheet) return null;
  const project = blankProject();
  const addressAt = lines.findIndex((line, index) => index > 0 && postalLine(line));
  const titleEnd = addressAt > 0 ? addressAt : 1;
  project.title = lines.slice(0, titleEnd).join(' ').replace(/\s+/g, ' ').trim();
  if (addressAt > 0) project.address = lines[addressAt];
  let index = addressAt > 0 ? addressAt + 1 : 1;
  while (index < lines.length) {
    const label = sheetLabel(lines[index]);
    if (!label || label === 'contact' || label === 'roles' || label.startsWith('contact:')) break;
    if (label.includes(':')) {
      const splitAt = label.indexOf(':');
      const key = label.slice(0, splitAt);
      const value = label.slice(splitAt + 1);
      project[key] = factValue(key, [value]);
      index += 1;
      continue;
    }
    const [bits, next] = takeFact(lines, index + 1);
    project[label] = factValue(label, bits);
    index = next;
  }
  const description = [];
  while (index < lines.length && !sheetLabel(lines[index]) && !personName(lines[index])) {
    description.push(lines[index]);
    index += 1;
  }
  project.description = description.join('\n').trim();
  if (personName(lines[index] || '')) {
    project.referenceName = lines[index];
    index += 1;
  }
  const responsibility = [];
  while (index < lines.length && !sheetLabel(lines[index])) {
    responsibility.push(lines[index]);
    index += 1;
  }
  project.responsibility = responsibility.join(' ').replace(/\s+/g, ' ').trim();
  const contactLabel = sheetLabel(lines[index] || '');
  if (contactLabel === 'contact' || contactLabel.startsWith('contact:')) {
    const block = [];
    if (contactLabel.startsWith('contact:')) block.push(contactLabel.slice('contact:'.length));
    index += 1;
    while (index < lines.length && sheetLabel(lines[index]) !== 'roles') {
      block.push(lines[index]);
      index += 1;
    }
    const rest = [];
    for (const line of block) {
      const value = line.replace(/^(firma|telefon|tlf|mobil|e-?post)\s*:\s*/i, '').trim();
      if (value.includes('@')) project.email = repairEmail(value);
      else if (/^\+?\d[\d\s]{5,}$/.test(value)) project.phone = value;
      else rest.push(value);
    }
    project.contact = rest[0] || '';
    project.contactCompany = rest[1] || '';
  }
  if (sheetLabel(lines[index] || '') === 'roles') {
    project.roles = lines.slice(index + 1).map((line) => line.replace(/^[•\-*]\s*/, '')).filter(Boolean).join('\n');
  }
  project.email = repairEmail(project.email);
  return project.title ? project : null;
}

function filled(value) {
  return String(value ?? '').trim();
}

function mergeScalar(local, extra) {
  return filled(local) || filled(extra);
}

function sameItem(left, right, keys) {
  const key = keys.map((name) => String(left?.[name] || '').trim().toLowerCase()).filter(Boolean).join('|');
  const other = keys.map((name) => String(right?.[name] || '').trim().toLowerCase()).filter(Boolean).join('|');
  return Boolean(key) && key === other;
}

function fillItem(local, extra) {
  const out = local && typeof local === 'object' ? { ...local } : {};
  for (const [key, value] of Object.entries(extra && typeof extra === 'object' ? extra : {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = fillItem(out[key], value);
      continue;
    }
    if (!filled(out[key]) && filled(value)) out[key] = value;
  }
  return out;
}

function union(local, extra, keys) {
  const out = [...(Array.isArray(local) ? local : [])];
  for (const item of Array.isArray(extra) ? extra : []) {
    const index = out.findIndex((row) => sameItem(row, item, keys));
    if (index >= 0) out[index] = fillItem(out[index], item);
    else out.push(item);
  }
  return out;
}

/** Lokal lesing beholder det den fant. AI fyller tomme felt og legger til avsnitt som mangler. */
export function mergeCvReads(local, assisted) {
  const left = local && typeof local === 'object' ? local : {};
  const right = assisted && typeof assisted === 'object' ? assisted : {};
  return {
    firstName: mergeScalar(left.firstName, right.firstName),
    middleName: mergeScalar(left.middleName, right.middleName),
    lastName: mergeScalar(left.lastName, right.lastName),
    headline: mergeScalar(left.headline, right.headline),
    summary: mergeScalar(left.summary, right.summary),
    birthDate: mergeScalar(left.birthDate, right.birthDate),
    maritalStatus: mergeScalar(left.maritalStatus, right.maritalStatus),
    nationality: mergeScalar(left.nationality, right.nationality),
    language: mergeScalar(left.language, right.language),
    education: union(left.education, right.education, ['school', 'from']),
    certifications: union(left.certifications, right.certifications, ['title']),
    courses: union(left.courses, right.courses, ['date', 'title']),
    experience: union(left.experience, right.experience, ['employer', 'from']),
    projects: union(left.projects, right.projects, ['title', 'period']),
  };
}
