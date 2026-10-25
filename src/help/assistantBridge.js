/**
 * Åpner ProTop-assistenten fra hvor som helst (lyspæren, hjelpesenteret,
 * chat-listen). Web bruker chat-docken/skuffen; native åpner egen skjerm.
 */

import { tryOpenChatInDock } from '../utils/chatDockBridge';
import { getAppNav } from '../navigation/navRef';
import { ASSISTANT_CHAT_ID } from './assistantEngine';

export const ASSISTANT_ROUTE = 'ProtopAssistant';

export function assistantThread({ title = 'ProTop-assistent', question = '' } = {}) {
  return {
    kind: 'assistant',
    chatId: ASSISTANT_CHAT_ID,
    title,
    // Ny nonce hver gang, så samme spørsmål kan sendes igjen.
    ask: question ? { text: String(question), nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } : null,
  };
}

export function isAssistantThread(win) {
  return !!win && (win.kind === 'assistant' || win.chatId === ASSISTANT_CHAT_ID);
}

/** true hvis assistenten ble åpnet. */
export function openAssistant({ title, question = '' } = {}) {
  const thread = assistantThread({ title, question });
  if (tryOpenChatInDock(thread)) return true;
  const nav = getAppNav();
  if (nav?.navigate) {
    nav.navigate(ASSISTANT_ROUTE, { ask: thread.ask });
    return true;
  }
  return false;
}
