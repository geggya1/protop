/** Kall mot anbudsdisken. Lokal tolkning brukes når proxyen ikke svarer. */
import { tenderProxyUrl } from './tenderProxyUrl.js';
import { proxyAuthHeaders } from './proxyAuth.js';
import { askNotice, buildBrief, draftFromLibrary, qualifyNotice, tasksFromNotice } from './desk.js';

async function post(action, body) {
  const res = await fetch(tenderProxyUrl(), {
    method: 'POST',
    headers: await proxyAuthHeaders(),
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const error = new Error(data.error || 'Kunne ikke lese konkurransen.');
    error.data = data;
    throw error;
  }
  return data;
}

export async function readNoticeDocuments(notice) {
  const urls = [
    ...(notice?.dossier?.documents || []),
    ...(notice?.dossier?.portalFiles || []),
  ].slice(0, 3);
  try {
    return await post('read-documents', { notice, urls });
  } catch {
    const brief = buildBrief({ notice, gated: urls.map((row) => ({ title: row.title || row.name, url: row.url })) });
    return { ok: true, engine: 'rules', brief, excerpts: [], gated: brief.documents.filter((row) => row.access === 'stengt') };
  }
}

export async function qualifyNoticeRemote(notice) {
  try {
    return await post('qualify-notice', { notice });
  } catch {
    return { ok: true, engine: 'rules', answers: qualifyNotice(notice) };
  }
}

export async function askNoticeRemote(notice, question) {
  try {
    return await post('ask-notice', { notice, question });
  } catch (err) {
    const local = askNotice(notice, question);
    if (!local.ok) throw err;
    return local;
  }
}

export async function draftAnswerRemote(library, prompt) {
  try {
    return await post('draft-answer', { library, prompt });
  } catch {
    return draftFromLibrary({ library }, prompt);
  }
}

export async function planTasksRemote(notice) {
  try {
    return await post('plan-tasks', { notice });
  } catch {
    return { ok: true, tasks: tasksFromNotice(notice) };
  }
}
