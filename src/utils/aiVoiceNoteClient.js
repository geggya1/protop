import { guardedCallable } from './guardedCallable';

export async function summarizeVoiceNote({ transcript, familyId }) {
  return guardedCallable('aiVoiceNote', { action: 'summarize', transcript, familyId }, { timeout: 90000 });
}

export async function askVoiceNote({ transcript, summary, question, familyId }) {
  return guardedCallable('aiVoiceNote', {
    action: 'ask', transcript, summary, question, familyId,
  }, { timeout: 90000 });
}
