#!/usr/bin/env node
/**
 * Offentlig utsending: push current HEAD to origin/offentlig.
 * GitHub Actions deploys that snapshot to protop.no — all commits not
 * yet live go out together. Ordinary pushes to main stay local.
 */
import { execSync } from 'node:child_process';
import { planOffentligPush } from './push-offentlig-plan.js';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function git(cmd) {
  return run(`git ${cmd}`);
}

const dryRun = process.argv.includes('--dry-run');

const dirty = git('status --porcelain') !== '';
const headSha = git('rev-parse HEAD');
let remoteOffentligSha = '';
try {
  git('fetch origin offentlig --prune');
} catch { /* first offentlig push — branch may not exist */ }
try {
  remoteOffentligSha = git('rev-parse origin/offentlig');
} catch {
  remoteOffentligSha = '';
}

let commitsNotLive = [];
try {
  const range = remoteOffentligSha ? 'origin/offentlig..HEAD' : 'HEAD';
  const log = git(`log --oneline --no-decorate ${range}`);
  commitsNotLive = log ? log.split('\n').filter(Boolean) : [];
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
} else {
  console.log('Første offentlige snapshot (ingen origin/offentlig å sammenligne med).');
}

if (dryRun) {
  console.log(`dry-run: git push origin ${plan.refspec}`);
  process.exit(0);
}

execSync(`git push origin ${plan.refspec}`, { stdio: 'inherit' });
console.log('Pushet. GitHub Actions deployer nå til protop.no.');
