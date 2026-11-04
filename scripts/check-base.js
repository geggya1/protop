/**
 * Sperre mot gammel kode: sier fra når mappen er bak origin/main.
 *
 * 3.11.2026 sto hovedmappen 11 dager bak main. Metro på 8081 viste gammel HR og ISO, og nytt
 * arbeid ble bygget oppå den gamle strukturen. Denne sjekken kjører når Metro starter
 * (metro.config.js) og før hver commit (.githooks/pre-commit).
 *
 *   node scripts/check-base.js            varsel
 *   node scripts/check-base.js --commit   stopper commit når main har endringer eldre enn et døgn som mangler her
 *   node scripts/check-base.js --no-fetch uten git fetch (raskere, men kan være utdatert)
 *
 * PROTOP_ALLOW_STALE=1 slipper en commit gjennom likevel. Kjører ikke i CI.
 */
const { execFileSync } = require('node:child_process');

/**
 * Timer den eldste endringen på main som mangler her, kan være gammel før en commit stoppes.
 * main får mange PR-er om dagen, så noen timer bak er vanlig; et døgn er ikke det.
 */
const BLOCK_AFTER_HOURS = 24;

function git(args, cwd, timeout = 4000) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * ok | warn | block, ut fra hvor mange commits mappen mangler fra origin/main og hvor lenge
 * siden den eldste av dem kom (missingHours).
 */
function baseVerdict({ behind = 0, missingHours = 0, branch = '' } = {}) {
  if (!(behind > 0)) return { level: 'ok', message: '' };
  const age = missingHours >= 48 ? `${Math.floor(missingHours / 24)} dager` : `${Math.round(missingHours)} timer`;
  const message = `${branch || 'Denne branchen'} er ${behind} commits bak origin/main, og mangler endringer fra ${age} tilbake. `
    + 'Det som vises og bygges her, er ikke det som er live. Hent main først: git fetch origin && git merge origin/main';
  return { level: missingHours >= BLOCK_AFTER_HOURS ? 'block' : 'warn', message };
}

/** Leser status fra git. null når mappen ikke er et git-repo med origin/main. */
function readBaseStatus({ cwd = process.cwd(), fetch = true, now = Date.now() } = {}) {
  try {
    if (fetch) {
      try {
        git(['fetch', '--quiet', 'origin', 'main'], cwd, 8000);
      } catch {
        // Uten nett: sammenlign med siste kjente origin/main.
      }
    }
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    const behind = Number(git(['rev-list', '--count', 'HEAD..origin/main'], cwd)) || 0;
    if (!behind) return { branch, behind, missingHours: 0 };
    // Eldste commit på main som mangler her (git log viser nyeste først).
    const times = git(['log', '--format=%ct', 'HEAD..origin/main'], cwd).split('\n').map(Number).filter((t) => t > 0);
    const oldest = times.length ? Math.min(...times) * 1000 : now;
    return { branch, behind, missingHours: Math.max(0, (now - oldest) / 3600000) };
  } catch {
    return null;
  }
}

function report(status, { commit = false } = {}) {
  const verdict = baseVerdict(status || {});
  if (verdict.level === 'ok') return 0;
  const line = '!'.repeat(72);
  const stop = commit && verdict.level === 'block' && process.env.PROTOP_ALLOW_STALE !== '1';
  console.error(`\n${line}\n  GAMMEL KODE: ${verdict.message}`);
  if (stop) console.error('  Commit stoppet. Oppdater mot main, eller sett PROTOP_ALLOW_STALE=1 hvis det er meningen.');
  console.error(`${line}\n`);
  return stop ? 1 : 0;
}

if (require.main === module) {
  if (process.env.CI) process.exit(0);
  const args = process.argv.slice(2);
  const status = readBaseStatus({ fetch: !args.includes('--no-fetch') });
  process.exit(status ? report(status, { commit: args.includes('--commit') }) : 0);
}

module.exports = { BLOCK_AFTER_HOURS, baseVerdict, readBaseStatus, report };
