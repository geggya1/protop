import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELPDESK_SHELL, HELPDESK_TICKET_INTENT, helpdeskLinkTarget, helpdeskShellOpen } from './shellLink.js';
import { parseShellPath, shellPathFor } from '../navigation/shellPaths.js';
import { moreSubviewTitle } from '../navigation/shellHeaderTitle.js';

test('Helpdesk ligger i skallet, med egen adresse og tittel', () => {
  assert.equal(shellPathFor(HELPDESK_SHELL.tab, HELPDESK_SHELL.subView), '/hjem/apper/helpdesk');
  assert.deepEqual(parseShellPath('/hjem/apper/helpdesk'), { tab: 'more', subView: 'helpdesk' });
  assert.equal(moreSubviewTitle('helpdesk', (k) => k), 'Helpdesk');
});

test('lenker til Helpdesk og til en sak', () => {
  assert.deepEqual(helpdeskLinkTarget('/helpdesk'), { ticketId: null });
  assert.deepEqual(helpdeskLinkTarget('/helpdesk/'), { ticketId: null });
  assert.deepEqual(helpdeskLinkTarget('/helpdesk/sak/PT-1001'), { ticketId: 'PT-1001' });
  assert.deepEqual(helpdeskLinkTarget('helpdesk/sak/a%20b?x=1'), { ticketId: 'a b' });
  assert.equal(helpdeskLinkTarget('/helpdesk-demo'), null);
  assert.equal(helpdeskLinkTarget('/hjelp/sak/1'), null);
});

test('openShell-parametrene åpner saken via intent', () => {
  assert.deepEqual(helpdeskShellOpen(), { tab: 'more', subView: 'helpdesk', intent: null });
  assert.deepEqual(helpdeskShellOpen('PT-7'), {
    tab: 'more', subView: 'helpdesk', intent: { type: HELPDESK_TICKET_INTENT, ticketId: 'PT-7' },
  });
});
