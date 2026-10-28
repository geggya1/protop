/**
 * Én tittel per side (AGENTS.md). Skallet viser sidetittelen: toppfeltet på telefon,
 * tittelraden med brødsmule (ModuleTitleRow) eller modulbåndet (ModuleHero).
 * En sideoverskrift med samme tekst vises ikke igjen; forklaring og knapper står.
 * Ren logikk, så node-testene og sidegjennomgangen (scripts/e2e/crawl.mjs) bruker samme regel.
 */

/** Tekst til sammenligning: uten ekstra mellomrom, avsluttende tegn og forskjell på store/små bokstaver. */
export function normalizeTitle(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.:!…]+$/, '')
    .toLocaleLowerCase('nb');
}

/** En skalltittel og leddene i den: «HR · Personell» gir også «Personell». */
export function titleVariants(text) {
  const full = normalizeTitle(text);
  if (!full) return [];
  const parts = full.split(/\s+[·›|]\s+/).map(normalizeTitle).filter(Boolean);
  return [...new Set([full, ...parts])];
}

/** Sant når sidens egen overskrift sier det samme som en tittel skallet allerede viser. */
export function repeatsShellTitle(title, shellTitles = []) {
  if (typeof title !== 'string') return false;
  const own = normalizeTitle(title);
  if (!own || !shellTitles?.length) return false;
  return shellTitles.some((shell) => titleVariants(shell).includes(own));
}

/**
 * Sidegjennomgangen: hva som står dobbelt på en side.
 * shell: titlene skallet viser ({ text, where }: toppfelt, tittelrad, bånd).
 * content: overskrifter og stor, halvfet tekst i innholdet ({ text, kind, level }).
 * doubles: innhold som gjentar skallets tittel. shellDouble: skallet viser samme tittel
 * to steder (toppfelt og tittelrad/bånd). near: innhold som starter med skallets tittel
 * («Risiko» › «Risiko og muligheter»), bare til opplysning.
 */
export function titleDoubles({ shell = [], content = [] } = {}) {
  const shellTexts = shell.map((row) => row.text);
  const doubles = content
    .filter((row) => repeatsShellTitle(row.text, shellTexts))
    .map((row) => `${row.text} (${row.kind} ${row.level})`);
  const shellDouble = [];
  shell.forEach((a, i) => {
    shell.slice(i + 1).forEach((b) => {
      if (a.where === b.where && a.where !== 'bånd') return;
      if (repeatsShellTitle(a.text, [b.text]) || repeatsShellTitle(b.text, [a.text])) {
        shellDouble.push(`${normalizeTitle(b.text)} (${a.where}/${b.where})`);
      }
    });
  });
  const near = content
    .filter((row) => !repeatsShellTitle(row.text, shellTexts))
    .filter((row) => {
      const own = normalizeTitle(row.text);
      return shellTexts.some((text) => titleVariants(text).some((v) => v.length > 2 && own.startsWith(`${v} `)));
    })
    .map((row) => row.text);
  return { doubles, shellDouble: [...new Set(shellDouble)], near: [...new Set(near)] };
}
