#!/usr/bin/env node
/**
 * Offentlig utsending: push current HEAD to origin/offentlig.
 * GitHub Actions deploys that snapshot to protop.no — all commits not
 * yet live go out together. Ordinary pushes to main stay local.
 */
import { execSync } from 'node:child_process';
import { planOffentligPush } from './push-offentlig-plan.js';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function git(cmd) {
  return run(`git ${cmd}`);
}

function resolveOffentligSha() {
  try {
    git('fetch origin offentlig --prune');
  } catch { /* first offentlig push */ }
  try {
    return git('rev-parse origin/offentlig');
  } catch {
    return '';
  }
}

function resolveMainSha() {
  try {
    git('fetch origin main --prune');
  } catch { /* offline */ }
  try {
    return git('rev-parse origin/main');
  } catch {
    return '';
  }
}

const dryRun = process.argv.includes('--dry-run');

const dirty = git('status --porcelain') !== '';
const headSha = git('rev-parse HEAD');
const remoteOffentligSha = resolveOffentligSha();
const liveSha = remoteOffentligSha || resolveMainSha();

let commitsNotLive = [];
try {
  if (liveSha) {
    const log = git(`log --oneline --no-decorate ${liveSha}..${headSha}`);
    commitsNotLive = log ? log.split('\n').filter(Boolean) : [];
  }
} catch {
  commitsNotLive = [];
}

const plan = planOffentligPush({
  dirty,
  headSha,
  remoteOffentligSha,
  commitsNotLive,
});

if (!plan.ok) {
  console.error(plan.error);
  process.exit(1);
}

console.log(`Offentlig snapshot ${headSha.slice(0, 7)} → origin/offentlig`);
if (plan.commitsNotLive.length) {
  console.log(`${plan.commitsNotLive.length} commit(s) som ikke er live ennå går ut nå:`);
  for (const line of plan.commitsNotLive.slice(0, 40)) console.log(`  ${line}`);
  if (plan.commitsNotLive.length > 40) {
    console.log(`  … og ${plan.commitsNotLive.length - 40} til`);
  }
} else if (!remoteOffentligSha) {
  console.log('Første offentlige snapshot. Alt som ligger i HEAD går live.');
} else {
  console.log('Ingen nye commits å liste, men snapshotet sendes likevel.');
}

if (dryRun) {
  console.log(`dry-run: git push origin ${plan.refspec}`);
  process.exit(0);
}

execSync(`git push origin ${plan.refspec}`, { stdio: 'inherit' });
console.log('Pushet. GitHub Actions deployer nå til protop.no.');
