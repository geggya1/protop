/**
 * Helpdesk-portalen ligger i ProTop-skallet (/hjem/apper/helpdesk), med samme
 * topplinje, meny og rammeverk som resten av appen. Lenker til en sak
 * (/helpdesk/sak/:id) åpner saken der via en intent.
 */
export const HELPDESK_SHELL = { tab: 'more', subView: 'helpdesk' };
export const HELPDESK_TICKET_INTENT = 'helpdeskAgentTicket';

/** openShell-parametrene til Home for Helpdesk, eventuelt med en sak åpen. */
export function helpdeskShellOpen(ticketId = null) {
  const id = ticketId == null ? '' : String(ticketId).trim();
  return {
    ...HELPDESK_SHELL,
    intent: id ? { type: HELPDESK_TICKET_INTENT, ticketId: id } : null,
  };
}

/** /helpdesk eller /helpdesk/sak/:id → { ticketId } (null for andre stier). */
export function helpdeskLinkTarget(path) {
  const pathOnly = String(path || '').split(/[?#]/)[0].replace(/\/+$/, '');
  if (/^\/?helpdesk$/i.test(pathOnly)) return { ticketId: null };
  const m = pathOnly.match(/^\/?helpdesk\/sak\/([^/]+)$/i);
  if (!m) return null;
  let id = m[1];
  try { id = decodeURIComponent(id); } catch { /* behold rå id */ }
  return { ticketId: id };
}
