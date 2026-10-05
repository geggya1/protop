#!/usr/bin/env node
/**
 * Leser firebase hosting:channel:deploy --json og oppdaterer PR-kommentar.
 * Live protop.no røres ikke.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY;
const head = process.env.GITHUB_REF_NAME;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!repo || !head) {
  console.error('Missing GITHUB_REPOSITORY or GITHUB_REF_NAME');
  process.exit(1);
}

function extractUrl(text) {
  const match = String(text || '').match(/https:\/\/protop-c189c--[^\s"'<>\\]+/i);
  return match ? match[0].replace(/[.,)]+$/, '') : '';
}

function previewUrl(raw) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  if (start >= 0) {
    try {
      const json = JSON.parse(text.slice(start));
      const result = json.result || json;
      if (result.utvikling?.url) return result.utvikling.url;
      let found = '';
      const walk = (value) => {
        if (!value || typeof value !== 'object' || found) return;
        if (typeof value.url === 'string' && /web\.app/.test(value.url)) {
          found = value.url;
          return;
        }
        for (const child of Object.values(value)) walk(child);
      };
      walk(result);
      if (found) return found;
    } catch {
      // Firebase CLI kan blande logg og JSON.
    }
  }
  return extractUrl(text);
}

const parts = [];
if (existsSync('channel.json')) parts.push(readFileSync('channel.json', 'utf8'));
if (existsSync('channel.err')) parts.push(readFileSync('channel.err', 'utf8'));
const url = parts.map((part) => previewUrl(part)).find(Boolean) || '';
if (!url) {
  console.error('No preview URL in channel.json');
  process.exit(1);
}
console.log(url);

const body = [
  '<!-- protop-utvikling-preview -->',
  '## Utviklingsmiljø (ikke live)',
  '',
  'Bruk **denne** adressen — ikke https://protop.no. Live oppdateres først når du merger til main.',
  '',
  `**${url}**`,
  '',
  'Samme adresse oppdateres ved hver push til branchen. Marker i toppen av siden skal vise «Utvikling — ikke live protop.no».',
  '',
  'Første innlogging: legg adressen inn under Firebase Authentication → Authorized domains hvis nettleseren sier unauthorized-domain.',
].join('\n');
writeFileSync('preview-comment.md', body);
writeFileSync('preview-comment.json', JSON.stringify({ body }));

function gh(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: token },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `gh ${args.join(' ')} failed`);
  }
  return (result.stdout || '').trim();
}

let pr = '';
try {
  pr = gh([
    'pr', 'list',
    '--repo', repo,
    '--head', head,
    '--state', 'open',
    '--json', 'number',
    '--jq', '.[0].number',
  ]);
} catch (err) {
  console.warn(String(err.message || err));
}
if (!pr) {
  console.log(`No open PR for ${head} — preview is ${url}`);
  process.exit(0);
}

let existing = '';
try {
  existing = gh([
    'api',
    `repos/${repo}/issues/${pr}/comments`,
    '--jq',
    '.[] | select(.body | contains("protop-utvikling-preview")) | .id',
  ]).split('\n').map((row) => row.trim()).find(Boolean) || '';
} catch {
  existing = '';
}

if (existing) {
  gh(['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${existing}`, '--input', 'preview-comment.json']);
} else {
  gh(['pr', 'comment', pr, '--repo', repo, '--body-file', 'preview-comment.md']);
}
