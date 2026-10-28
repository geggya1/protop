/** Mottakerkontroll og AI-svar for Møter. */
import assert from 'node:assert/strict';
import { allowedRecipients } from './meetingDelivery.js';
import { normalizeAgenda, handleAiMeeting } from './meetingAi.js';
const m = { participants: [{ email: 'A@x.no' }, { email: 'b@x.no' }, { email: '' }] };
const r = allowedRecipients(m, ['a@x.no', 'evil@spam.no', 'b@x.no', 'c@x.no'], ['c@x.no']);
assert.deepEqual(r.to, ['a@x.no', 'b@x.no', 'c@x.no']);
assert.deepEqual(r.refused, ['evil@spam.no']);
const a = normalizeAgenda({ typeId: 'x', chapters: [{ title: 'A', items: [{ title: 'i', minutes: 999 }, { title: '' }] }, { title: '', items: [{ title: 'z' }] }] });
assert.equal(a.chapters.length, 1); assert.equal(a.chapters[0].items[0].minutes, 120); assert.equal(a.typeId, '');
delete process.env.PROTOP_GEMINI_KEY; delete process.env.GEMINI_API_KEY;
const res = await handleAiMeeting({ action: 'agenda', description: 'x' });
assert.equal(res.ok, false);
console.log('functions/meetingDelivery.test.mjs: ok');
