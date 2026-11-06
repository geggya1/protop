import React, { useEffect, useMemo, useRef, useState } from 'react';
import { completeFilledDoc, reopenFilledDoc } from '../../src/forms/filledDocs';
import { deleteFilledDoc, loadFilledDocs, saveFilledDoc } from '../../src/forms/filledStore';
import { formWithTokens } from '../../src/forms/tokens';
import { showSaveToast } from '../../src/ui/saveToast';
import { notifyUsers } from '../../src/utils/notifications';
import { isReviewDoc, reviewDate } from '../../src/hr/reviewForms';
import {
  applyPrepAnswers, invitationNotice, invitationPrep, lockEmployeeSign, signAsLeader, signingNotice, signingPrep,
  withdrawSigning,
} from '../../src/hr/reviewPrep';
import { deletePrep, reviewAction, savePrep, watchPrep } from '../../src/hr/reviewPrepStore';
import ReviewPrepPanel from './ReviewPrepPanel';
import { lazyScreen } from '../../src/ui/lazyScreen';
const FormFill = lazyScreen(() => import('../anbud/FormFill'), { name: 'FormFill', silent: true });

/**
 * Ett utfylt personalskjema (KS-mal) med lagring, ferdigstilling, gjenåpning og sletting.
 * Samme visning overalt: HR → Rutiner → Skjemaer (fill: full høyde) og HR → Oppfølging → Samtaler
 * og saker (inne i siden). onStored(doc, list) etter lagring, onDeleted(doc, list) etter sletting.
 *
 * Medarbeidersamtalen har i tillegg forberedelse og signering (ReviewPrepPanel, reviewPrep.js):
 * temaene sendes til den ansatte, svarene settes inn i skjemaet, lederen signerer og sender til den
 * ansatte, og skjemaet er låst til den ansatte har signert. Da ferdigstiller serveren skjemaet og
 * sender kopi på e-post, og skjemaet lastes på nytt her. employee: { id, name, personUid }.
 */
export default function HrFilledForm({
  colors, familyId, doc, onDoc, canWrite, actor, company, logo, fill = false,
  initialNote = '', onStored, onDeleted, onBack, backLabel, canDelete = true, employee = null,
}) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [noteBad, setNoteBad] = useState(false);
  const review = isReviewDoc(doc);
  const [prep, setPrep] = useState(null);
  const lastStatus = useRef('');

  const say = (text, bad = false) => {
    setNote(text);
    setNoteBad(bad);
  };

  // Den ansattes signaturfelt kan bare den ansatte signere (på Min side).
  const shown = useMemo(() => (review ? lockEmployeeSign(doc) : doc), [review, doc]);

  useEffect(() => {
    if (!review || !familyId || !doc?.id) {
      setPrep(null);
      return undefined;
    }
    return watchPrep(familyId, doc.id, setPrep);
  }, [review, familyId, doc?.id]);

  // Signert på Min side mens skjemaet er åpent: hent det ferdige skjemaet fra serveren.
  useEffect(() => {
    const status = prep?.status || '';
    const before = lastStatus.current;
    lastStatus.current = status;
    if (status !== 'signed' || doc?.status === 'ferdig' || !familyId) return;
    let live = true;
    loadFilledDocs(familyId).then((list) => {
      const fresh = (list || []).find((row) => row.id === doc.id);
      if (!live || !fresh || fresh.status !== 'ferdig') return;
      onDoc?.(fresh);
      onStored?.(fresh, list);
      if (before && before !== 'signed') showSaveToast('Medarbeidersamtalen er signert av begge');
    });
    return () => { live = false; };
  }, [prep?.status]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return res.ok ? saved : null;
  }

  async function writePrep(next, message) {
    setSaving(true);
    try {
      const saved = await savePrep(familyId, next);
      setPrep(saved);
      if (message) {
        say(message);
        showSaveToast(message);
      }
      return saved;
    } catch (err) {
      say(err?.code === 'permission-denied' ? 'Du har ikke tilgang til å endre samtalen.' : 'Kunne ikke lagre. Prøv igjen.', true);
      return null;
    } finally {
      setSaving(false);
    }
  }

  function notifyEmployee(notice) {
    if (!employee?.personUid) return;
    notifyUsers([employee.personUid], {
      eventType: 'hrReviewInvite', title: notice.title, body: notice.body, familyId, createdBy: actor?.uid,
    }).catch(() => {});
  }

  async function invite(draft) {
    // Skjemaet lagres først, så den ansatte og lederen ser samme samtale.
    const saved = await store(doc, 'Skjemaet er lagret.');
    if (!saved) return false;
    const next = invitationPrep(saved, {
      employee, leader: actor, ...draft, previous: prep,
    });
    if (!next.topics.length) {
      say('Fant ingen tema i skjemaet (tabellen «Tema»).', true);
      return false;
    }
    const written = await writePrep(next, `Temaene er sendt til ${employee?.name || 'medarbeideren'}.`);
    if (written) notifyEmployee(invitationNotice(written));
    return !!written;
  }

  function applyAnswers() {
    const res = applyPrepAnswers(doc, prep);
    if (!res.filled) {
      say(res.kept ? 'Notatene i «Før samtalen» er beholdt. Ingenting nytt å sette inn.' : 'Ingenting nytt å sette inn.');
      return;
    }
    onDoc?.(res.doc);
    store(res.doc, `Forberedelsen er satt inn for ${res.filled} tema${res.kept ? ` (${res.kept} med egne notater er beholdt)` : ''}.`);
  }

  async function signAndSend() {
    const signed = signAsLeader(formWithTokens(doc, company), { actor });
    if (!signed.ok) {
      say(signed.error, true);
      return;
    }
    // Lagre med lederens signatur, men uten flettefeltene byttet ut (de byttes ved visning).
    const leaderField = signed.doc.fields.find((f) => f.kind === 'sign' && f.value?.name);
    const withSign = leaderField
      ? { ...doc, fields: doc.fields.map((f) => (f.id === leaderField.id ? { ...f, value: leaderField.value } : f)) }
      : doc;
    const saved = await store(withSign, 'Du har signert.');
    if (!saved) return;
    const base = prep || invitationPrep(saved, { employee, leader: actor, meetingDate: reviewDate(saved) });
    const written = await writePrep(signingPrep(base, saved, { actor }), `Sendt til ${employee?.name || 'medarbeideren'} for signatur.`);
    if (written) notifyEmployee(signingNotice(written));
  }

  async function resend() {
    setSaving(true);
    const res = await reviewAction(familyId, doc.id, 'resend');
    setSaving(false);
    if (!res.ok) say(res.error, true);
    else {
      const to = res.prep?.mail?.to || [];
      say(to.length ? `Kopien er sendt til ${to.join(' og ')}.` : 'Kopien ble ikke sendt. Sjekk e-postadressene.', !to.length);
    }
  }

  const signing = review && prep?.status === 'signing';
  const aside = review ? (
    <ReviewPrepPanel
      colors={colors}
      prep={prep}
      employee={employee}
      docDate={reviewDate(doc)}
      canWrite={canWrite && doc.status !== 'ferdig'}
      busy={saving}
      onInvite={invite}
      onApply={applyAnswers}
      onSign={signAndSend}
      onWithdraw={() => writePrep(withdrawSigning(prep), 'Signeringen er trukket tilbake. Skjemaet kan endres.')}
      onRemind={() => {
        notifyEmployee(signingNotice(prep));
        say('Påminnelse er sendt.');
      }}
      onResend={resend}
    />
  ) : null;

  return (
    <FormFill
      doc={shown}
      colors={colors}
      company={company}
      logo={logo || ''}
      actor={actor}
      busy={saving}
      note={note}
      noteBad={noteBad}
      fill={fill}
      aside={aside}
      readOnly={signing}
      readOnlyNote={signing ? `Venter på signatur fra ${employee?.name || prep?.employeeName || 'medarbeideren'}. Trekk tilbake signeringen for å endre skjemaet.` : ''}
      onChange={canWrite && !signing ? onDoc : () => {}}
      onSave={() => store(doc, 'Dokumentet er lagret i HR.')}
      onComplete={() => {
        const res = completeFilledDoc(formWithTokens(doc, company), { actor });
        if (!res.ok) say(res.error, true);
        else store(res.doc, 'Dokumentet er ferdig og lagret i HR.');
      }}
      onReopen={() => store(reopenFilledDoc(doc, { actor }), 'Dokumentet er åpnet for endring.')}
      onDelete={canWrite && canDelete && !signing ? async () => {
        const res = await deleteFilledDoc(familyId, doc.id);
        say(res.ok ? 'Dokumentet er slettet.' : res.error, !res.ok);
        if (res.ok) {
          if (review && prep) deletePrep(familyId, doc.id);
          onDeleted?.(doc, res.list || null);
        }
      } : null}
      onBack={onBack}
      backLabel={backLabel}
    />
  );
}
