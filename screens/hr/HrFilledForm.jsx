import React, { useState } from 'react';
import FormFill from '../anbud/FormFill';
import { completeFilledDoc, reopenFilledDoc } from '../../src/forms/filledDocs';
import { deleteFilledDoc, saveFilledDoc } from '../../src/forms/filledStore';
import { formWithTokens } from '../../src/forms/tokens';
import { showSaveToast } from '../../src/ui/saveToast';

/**
 * Ett utfylt personalskjema (KS-mal) med lagring, ferdigstilling, gjenåpning og sletting.
 * Samme visning overalt: HR → Rutiner → Skjemaer (fill: full høyde) og HR → Oppfølging → Samtaler
 * og saker (inne i siden). onStored(doc, list) etter lagring, onDeleted(doc, list) etter sletting.
 */
export default function HrFilledForm({
  colors, familyId, doc, onDoc, canWrite, actor, company, logo, fill = false,
  initialNote = '', onStored, onDeleted, onBack, backLabel, canDelete = true,
}) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [noteBad, setNoteBad] = useState(false);

  const say = (text, bad = false) => {
    setNote(text);
    setNoteBad(bad);
  };

  async function store(next, message) {
    setSaving(true);
    const res = await saveFilledDoc(familyId, next);
    setSaving(false);
    const saved = res.doc || next;
    onDoc?.(saved);
    say(res.ok ? message : res.error, !res.ok);
    if (res.ok) {
      showSaveToast(message);
      onStored?.(saved, res.list || null);
    }
  }

  return (
    <FormFill
      doc={doc}
      colors={colors}
      company={company}
      logo={logo || ''}
      actor={actor}
      busy={saving}
      note={note}
      noteBad={noteBad}
      fill={fill}
      onChange={canWrite ? onDoc : () => {}}
      onSave={() => store(doc, 'Dokumentet er lagret i HR.')}
      onComplete={() => {
        const res = completeFilledDoc(formWithTokens(doc, company), { actor });
        if (!res.ok) say(res.error, true);
        else store(res.doc, 'Dokumentet er ferdig og lagret i HR.');
      }}
      onReopen={() => store(reopenFilledDoc(doc, { actor }), 'Dokumentet er åpnet for endring.')}
      onDelete={canWrite && canDelete ? async () => {
        const res = await deleteFilledDoc(familyId, doc.id);
        say(res.ok ? 'Dokumentet er slettet.' : res.error, !res.ok);
        if (res.ok) onDeleted?.(doc, res.list || null);
      } : null}
      onBack={onBack}
      backLabel={backLabel}
    />
  );
}
