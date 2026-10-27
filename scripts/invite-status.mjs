#!/usr/bin/env node
/**
 * Produksjonsstatus: bedriftsinvitasjoner som venter, og om personen får dem i appen.
 * Leser bare (Firestore og Firebase Auth via REST med deploy-kontoens token i GCLOUD_TOKEN).
 * E-post vises maskert. Skriver Markdown.
 */
const PROJECT = process.env.PROJECT || 'protop-c189c';
const TOKEN = process.env.GCLOUD_TOKEN || '';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function mask(email) {
  const value = String(email || '').trim().toLowerCase();
  const at = value.indexOf('@');
  if (at < 1) return '(ingen e-post)';
  const user = value.slice(0, at);
  return `${user[0]}***${user.length > 2 ? user[user.length - 1] : ''}@${value.slice(at + 1)}`;
}

function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return fields(value.mapValue.fields);
  return null;
}

function fields(raw) {
  return Object.fromEntries(Object.entries(raw || {}).map(([key, value]) => [key, decode(value)]));
}

function docOf(doc) {
  return { id: doc.name.split('/').pop(), path: doc.name.split('/documents/')[1], ...fields(doc.fields) };
}

async function api(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': PROJECT,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${json?.error?.message || ''}`.trim().slice(0, 160));
  return json;
}

async function query(parent, structuredQuery) {
  const rows = await api(`${BASE}${parent ? `/${parent}` : ''}:runQuery`, { structuredQuery });
  return rows.filter((row) => row.document).map((row) => docOf(row.document));
}

async function list(path) {
  const json = await api(`${BASE}/${path}?pageSize=300`);
  return (json.documents || []).map(docOf);
}

async function authUser(email) {
  const json = await api(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { email: [email] });
  const user = (json.users || [])[0];
  if (!user) return null;
  return {
    uid: user.localId,
    verified: user.emailVerified === true,
    providers: (user.providerUserInfo || []).map((row) => row.providerId).join(', ') || 'password',
    createdAt: user.createdAt ? new Date(Number(user.createdAt)).toISOString().slice(0, 16) : '',
  };
}

function pendingPlaceholder(row) {
  if (row.deleted === true || row.archived === true) return false;
  if (row.inviteStatus === 'accepted' || row.inviteStatus === 'declined') return false;
  return row.placeholder === true || row.inviteStatus === 'pending';
}

const out = [];
const say = (text = '') => out.push(text);

async function main() {
  say('## Bedriftsinvitasjoner som venter');
  if (!TOKEN) {
    say('❔ Mangler token (GCLOUD_TOKEN).');
    return;
  }
  const companies = await query('', {
    from: [{ collectionId: 'families' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'type' },
        op: 'IN',
        value: { arrayValue: { values: [{ stringValue: 'organization' }, { stringValue: 'company' }] } },
      },
    },
    limit: 200,
  });
  let shown = 0;
  let authDenied = '';
  for (const company of companies) {
    if (company.deleted === true || company.hiddenFromApp === true) continue;
    const invited = new Set((company.invitedEmails || []).map((row) => String(row).toLowerCase()));
    const parents = await list(`families/${company.id}/parents`).catch(() => []);
    const placeholders = parents.filter((row) => row.email && pendingPlaceholder(row));
    const emails = new Set([...invited, ...placeholders.map((row) => String(row.email).toLowerCase())]);
    if (!emails.size) continue;
    shown += 1;
    const members = new Set([...(company.members || []), ...(company.activeUsers || []), ...(company.memberIds || [])]);
    say('');
    say(`### ${company.company?.navn || company.name || company.id} (\`${company.id}\`)`);
    for (const email of emails) {
      const rows = placeholders.filter((row) => String(row.email).toLowerCase() === email);
      const holder = rows[0] || null;
      const notes = [];
      notes.push(invited.has(email) ? 'på invitasjonslisten' : '❌ ikke på invitasjonslisten (invitedEmails)');
      if (!holder) {
        notes.push('❌ ingen ventende plassholder');
        const others = parents.filter((row) => String(row.email || '').toLowerCase() === email);
        others.forEach((row) => {
          const flags = ['placeholder', 'deleted', 'archived', 'active'].filter((key) => row[key] === true);
          notes.push(`rad \`${row.id}\`: ${row.inviteStatus || 'uten status'}${row.inviteKind ? `/${row.inviteKind}` : ''}`
            + `${flags.length ? ` [${flags.join(', ')}]` : ''}${row.migratedToUid ? ' → flyttet til konto' : ''}`
            + `${row.inviteId ? ' (har inviteId)' : ''}`);
        });
        if (!others.length) notes.push('ingen rad med denne e-posten under parents');
      }
      else {
        notes.push(`plassholder \`${holder.id}\` status ${holder.inviteStatus || '–'}${holder.inviteKind ? `, ${holder.inviteKind}` : ''}`);
        if (holder.inviteKind === 'existing') notes.push('❌ merket som eksisterende bruker');
        if (holder.inviteEmailSentAt) notes.push(`e-post sendt ${String(holder.inviteEmailSentAt).slice(0, 16)}`);
        if (rows.length > 1) notes.push(`${rows.length} plassholdere`);
      }
      const staff = await query(`families/${company.id}`, {
        from: [{ collectionId: 'employees' }],
        limit: 300,
      }).catch(() => []);
      staff.filter((row) => [row.person?.email, row.company?.email, row.invite?.email]
        .some((value) => String(value || '').toLowerCase() === email))
        .forEach((row) => notes.push(`ansatt \`${row.id}\`: invitasjon ${row.invite?.status || '–'}`
          + `${row.invite?.parentKey ? `, parentKey \`${row.invite.parentKey}\`` : ', uten parentKey'}`
          + `${row.personUid ? ', knyttet til konto' : ''}`));
      const profiles = await query('', {
        from: [{ collectionId: 'users' }],
        where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: email } } },
        limit: 5,
      }).catch(() => []);
      profiles.forEach((row) => notes.push(`profil users/\`${row.id}\``));
      let user = null;
      if (!authDenied) {
        try {
          user = await authUser(email);
        } catch (error) {
          authDenied = error.message;
        }
      }
      if (authDenied && profiles[0]) user = { uid: profiles[0].id, verified: null, providers: '?', createdAt: '' };
      if (authDenied && !user) notes.push('konto: ingen tilgang');
      else if (!user) notes.push('ingen konto ennå');
      else {
        if (user.verified !== null) notes.push(`konto fra ${user.createdAt} (${user.providers}), e-post ${user.verified ? 'bekreftet' : '❌ ikke bekreftet'}`);
        if (members.has(user.uid)) notes.push('allerede medlem');
        const inbox = await list(`users/${user.uid}/familyInvites`).catch((error) => ({ error }));
        if (inbox.error) notes.push('innboks: ingen tilgang');
        else {
          const mine = inbox.filter((row) => row.familyId === company.id);
          const pending = mine.filter((row) => row.status === 'pending');
          notes.push(pending.length ? `✅ invitasjon i innboksen (${pending.length})`
            : `❌ ingen ventende invitasjon i innboksen${mine.length ? ` (${mine.map((row) => row.status).join(', ')})` : ''}`);
        }
      }
      const sent = await query(`families/${company.id}`, {
        from: [{ collectionId: 'memberInvites' }],
        where: { fieldFilter: { field: { fieldPath: 'inviteeEmail' }, op: 'EQUAL', value: { stringValue: email } } },
        limit: 20,
      }).catch(() => []);
      if (sent.length) notes.push(`memberInvites: ${sent.map((row) => `${row.status}${row.inviteeUid === user?.uid ? ' (denne kontoen)' : ''}`).join(', ')}`);
      say(`- ${mask(email)}: ${notes.join(' · ')}`);
    }
  }
  if (!shown) say('Ingen bedrifter har invitasjoner som venter.');
  if (authDenied) say(`\nKontoer: deploy-kontoen fikk ikke lese Firebase Auth (${authDenied}).`);
}

main()
  .catch((error) => say(`❔ Kunne ikke lese: ${String(error?.message || error).slice(0, 200)}`))
  .finally(() => console.log(out.join('\n')));
