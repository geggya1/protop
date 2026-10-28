import React, { useEffect, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { answerConfirm, subscribeConfirm } from '../src/ui/confirm';

/**
 * Tegner bekreftelsen skjermene ber om med useConfirm()/requestConfirm().
 * Montert én gang i skallet (AppShell). ConfirmDialog legger seg over alt
 * (portal på web, Modal i appen).
 */
export default function ConfirmHost() {
  const [request, setRequest] = useState(null);
  useEffect(() => subscribeConfirm(setRequest), []);
  if (!request) return null;
  return (
    <ConfirmDialog
      visible
      title={request.title}
      message={request.message}
      confirmText={request.confirmText}
      cancelText={request.cancelText}
      tone={request.tone}
      onConfirm={() => answerConfirm(request.id, true)}
      onCancel={() => answerConfirm(request.id, false)}
    />
  );
}
