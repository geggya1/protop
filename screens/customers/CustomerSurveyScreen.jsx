/**
 * Kunder → Kundeundersøkelse. Bedriften lager en undersøkelse, velger mottakere fra
 * kunderegisteret, sender den på e-post, purrer, avslutter og ser resultater og utvikling over tid.
 * Kunden svarer på protop.no/svar/… uten innlogging (screens/surveys/SurveyAnswerScreen.jsx).
 *
 * All data går gjennom callable `customerSurvey` (src/surveys/customerService.js).
 * Tilgang: Kunder med Lese ser resultatene, Begrenset redigering lager og sender.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { loadCustomerList } from '../../src/anbud/storage';
import {
  CUSTOMER_GOOD_SCORE, CUSTOMER_MAX_QUESTIONS, CUSTOMER_QUESTION_BANK, DEFAULT_CUSTOMER_QUESTIONS, QUESTION_TYPES,
  customerAnalysis, customerResults, customerTrendPoints, newCustomerSurvey, normalizeCustomerQuestions,
  normalizeCustomerSurvey, previousCustomerSurvey, questionText,
} from '../../src/surveys/customerSurvey';
import { questionIdFor, surveyDeadline } from '../../src/hr/survey';
import { formatNbDate } from '../../src/hr/model';
import { customerSurveyCall } from '../../src/surveys/customerClient';
import { surveyTrend, trendSentence, uniqueSurveyTitle } from '../../src/surveys/trend';
import { csvFileName, downloadCsv, trendCsvRows } from '../../src/surveys/csv';
import { showSaveToast } from '../../src/ui/saveToast';
import { useConfirm } from '../../src/ui/useConfirm';
import { chartColorsFor } from '../../src/ui/chartColors';
import { useLayout } from '../../src/theme';
import { radius, space, type } from '../../src/ui/tokens';
import SurveyTrend from '../../components/surveys/SurveyTrend';
import SurveyAnswerForm from '../../components/surveys/SurveyAnswerForm';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle,
} from '../hr/HrShared';
import CustomerSurveyRecipients from './CustomerSurveyRecipients';
import CustomerSurveyResults from './CustomerSurveyResults';

const STATUS_LABEL = { draft: 'Utkast', open: 'Sendt, åpen for svar', closed: 'Avsluttet' };
const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, t.label]));
const AREAS = [...new Set([...DEFAULT_CUSTOMER_QUESTIONS, ...CUSTOMER_QUESTION_BANK].map((q) => q.area))];

function defaultDeadline(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function IconButton({ colors, icon, label, onPress, disabled }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconBtn, { borderColor: colors.line, opacity: disabled ? 0.35 : 1 }]}
    >
      <Ionicons name={icon} size={16} color={colors.ink} />
    </Pressable>
  );
}

/** Redigering av et utkast: tittel, innledning, anonym/navngitt, frist og spørsmål. */
function SurveyEditor({
  colors, survey, previous, companyName, busy, onSave, onDelete,
}) {
  const [draft, setDraft] = useState(() => normalizeCustomerSurvey(survey));
  const [dirty, setDirty] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [newType, setNewType] = useState('scale');
  const [newArea, setNewArea] = useState('Kvalitet');
  const [newText, setNewText] = useState('');
  const change = (patch) => {
    setDraft((d) => normalizeCustomerSurvey({ ...d, ...patch }));
    setDirty(true);
  };
  const setQuestions = (qs) => change({ questions: normalizeCustomerQuestions(qs) });
  const ids = draft.questions.map((q) => q.id);
  const hasNps = draft.questions.some((q) => q.type === 'nps');
  const bank = [...DEFAULT_CUSTOMER_QUESTIONS, ...CUSTOMER_QUESTION_BANK]
    .filter((q) => !ids.includes(q.id) && !(q.type === 'nps' && hasNps));
  const prev = new Map((previous?.questions || []).map((q) => [q.id, q.text]));
  const notComparable = previous ? draft.questions.filter((q) => prev.get(q.id) !== q.text).length : 0;
  const full = draft.questions.length >= CUSTOMER_MAX_QUESTIONS;
  const move = (i, dir) => {
    const list = [...draft.questions];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setQuestions(list);
  };
  const addOwn = () => {
    const t = newText.trim();
    if (!t || full) return;
    setQuestions([...draft.questions, { id: questionIdFor(t, ids), type: newType, area: newType === 'text' ? 'Fritekst' : newArea, text: t }]);
    setNewText('');
  };
  const previewSurvey = { questions: draft.questions.map((q) => ({ ...q, text: questionText(q, companyName) })) };

  return (
    <View style={styles.stack} nativeID="customer-survey-editor">
      <HrField colors={colors} label="Tittel" value={draft.title} onChangeText={(v) => change({ title: v })} />
      <HrField colors={colors} label="Innledning (vises for kunden over spørsmålene)" value={draft.intro} multiline onChangeText={(v) => change({ intro: v })} />
      <View style={styles.twoCol}>
        <View style={styles.col}>
          <HrField colors={colors} label="Svarfrist" value={draft.closesOn} date="iso" clearable onChangeText={(v) => change({ closesOn: v || '' })} />
        </View>
        <View style={styles.col}>
          <Text style={[styles.caption, { color: colors.muted }]}>Svarene</Text>
          <View style={styles.chips}>
            <HrChip colors={colors} label="Navngitt" active={!draft.anonymous} onPress={() => change({ anonymous: false })} nativeID="customer-survey-named" />
            <HrChip colors={colors} label="Anonym" active={draft.anonymous} onPress={() => change({ anonymous: true })} nativeID="customer-survey-anon" />
          </View>
          <Text style={[styles.caption, { color: colors.muted }]}>
            {draft.anonymous
              ? 'Svarene lagres uten kunde og tidspunkt. Resultatet vises når undersøkelsen er avsluttet og minst tre har svart. Ærligere svar, men dere kan ikke følge opp den enkelte kunden.'
              : 'Dere ser hvem som svarte, og kan følge opp misfornøyde kunder. Kunden får vite dette i e-posten.'}
          </Text>
        </View>
      </View>

      <View style={styles.headRow}>
        <Text style={[styles.bodyStrong, { color: colors.ink }]}>{`Spørsmål (${draft.questions.length})`}</Text>
        <HrChip colors={colors} label={preview ? 'Rediger spørsmål' : 'Forhåndsvis som kunde'} active={preview} onPress={() => setPreview((v) => !v)} nativeID="customer-survey-preview" />
      </View>
      {previous && notComparable ? (
        <View style={[styles.note, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
          <Ionicons name="information-circle" size={16} color={colors.muted} />
          <Text style={[styles.caption, { color: colors.ink, flex: 1 }]}>
            {`${notComparable} spørsmål er nye eller endret siden «${previous.title}». De kan ikke sammenlignes med forrige gang.`}
          </Text>
        </View>
      ) : null}
      {preview ? (
        <View style={[styles.box, { borderColor: colors.line }]}>
          <Text style={[styles.caption, { color: colors.muted }]}>Slik ser kunden undersøkelsen (svarene her lagres ikke).</Text>
          <SurveyAnswerForm colors={colors} survey={previewSurvey} disabled />
        </View>
      ) : (
        <>
          {draft.questions.map((q, i) => (
            <View key={q.id} style={[styles.qRow, { borderColor: colors.line }]}>
              <Text style={[styles.num, { color: colors.muted }]}>{`${i + 1}.`}</Text>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[styles.caption, { color: colors.muted }]}>
                  {[TYPE_LABEL[q.type], q.type === 'text' ? '' : q.area, previous && !prev.has(q.id) ? 'nytt' : ''].filter(Boolean).join(' · ')}
                </Text>
                <TextInput
                  value={q.text}
                  onChangeText={(v) => setQuestions(draft.questions.map((x) => (x.id === q.id ? { ...x, text: v } : x)))}
                  multiline
                  accessibilityLabel={`Spørsmål ${i + 1}`}
                  style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                />
              </View>
              <View style={styles.qTools}>
                <IconButton colors={colors} icon="arrow-up" label="Flytt opp" disabled={i === 0} onPress={() => move(i, -1)} />
                <IconButton colors={colors} icon="arrow-down" label="Flytt ned" disabled={i === draft.questions.length - 1} onPress={() => move(i, 1)} />
                <IconButton colors={colors} icon="trash-outline" label="Fjern spørsmålet" onPress={() => setQuestions(draft.questions.filter((x) => x.id !== q.id))} />
              </View>
            </View>
          ))}
          <Text style={[styles.caption, { color: colors.muted }]}>«{'{firma}'}» byttes med bedriftens navn når kunden ser spørsmålet.</Text>

          <View style={[styles.box, { borderColor: colors.line }]}>
            <Text style={[styles.bodyStrong, { color: colors.ink }]}>Eget spørsmål</Text>
            <View style={styles.chips}>
              {QUESTION_TYPES.filter((t) => t.id !== 'nps' || !hasNps).map((t) => (
                <HrChip key={t.id} colors={colors} label={t.label} active={newType === t.id} onPress={() => setNewType(t.id)} />
              ))}
            </View>
            {newType !== 'text' ? (
              <View style={styles.chips}>
                {AREAS.filter((a) => a !== 'Forbedring').map((a) => (
                  <HrChip key={a} colors={colors} label={a} active={newArea === a} onPress={() => setNewArea(a)} />
                ))}
              </View>
            ) : null}
            <TextInput
              value={newText}
              onChangeText={setNewText}
              placeholder={newType === 'text' ? 'Spørsmål med fritekstsvar' : 'Hvor fornøyd er du med …?'}
              placeholderTextColor={colors.muted}
              onSubmitEditing={addOwn}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <View style={styles.actions}>
              <HrButton colors={colors} icon="add" label="Legg til" onPress={addOwn} disabled={!newText.trim() || full} />
            </View>
          </View>

          <View style={[styles.box, { borderColor: colors.line }]}>
            <Pressable onPress={() => setBankOpen((v) => !v)} accessibilityRole="button" style={styles.headRow} nativeID="customer-survey-bank-toggle">
              <Text style={[styles.bodyStrong, { color: colors.ink, flex: 1 }]}>{`Spørsmålsbank (${bank.length})`}</Text>
              <Ionicons name={bankOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {bankOpen ? bank.map((q) => (
              <Pressable
                key={q.id}
                onPress={() => !full && setQuestions([...draft.questions, q])}
                accessibilityRole="button"
                accessibilityLabel={`Legg til: ${q.text}`}
                nativeID={`customer-survey-bank-${q.id}`}
                style={[styles.bankRow, { borderColor: colors.line }]}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.brandInk || colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.body, { color: colors.ink }]}>{q.text}</Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>{`${TYPE_LABEL[q.type]} · ${q.area}`}</Text>
                </View>
              </Pressable>
            )) : null}
          </View>
        </>
      )}

      <View style={styles.actions}>
        <HrButton colors={colors} primary icon="save" label={dirty ? 'Lagre utkast' : 'Lagret'} disabled={!dirty || busy || !draft.questions.length} onPress={async () => { if (await onSave(draft)) setDirty(false); }} nativeID="customer-survey-save" />
        <HrButton colors={colors} icon="refresh" label="Standardspørsmål" disabled={busy} onPress={() => setQuestions(DEFAULT_CUSTOMER_QUESTIONS)} />
        <HrButton colors={colors} icon="trash-outline" label="Slett utkast" disabled={busy} onPress={onDelete} nativeID="customer-survey-delete" />
      </View>
      {dirty ? <Text style={[styles.caption, { color: colors.muted }]}>Endringene er ikke lagret. Lagre før du sender.</Text> : null}
    </View>
  );
}

/** Én undersøkelse i detalj. */
function SurveyDetail({
  colors, familyId, survey, surveys, customers, companyName, canWrite, onBack, onChanged,
}) {
  const api = useCallback((action, data = {}) => customerSurveyCall(action, { familyId, ...data }), [familyId]);
  const [recipients, setRecipients] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editDeadline, setEditDeadline] = useState(false);
  const [deadline, setDeadline] = useState(survey.closesOn || '');
  const confirm = useConfirm();
  const chart = chartColorsFor(colors);

  const loadRecipients = useCallback(() => {
    api('recipients', { surveyId: survey.id })
      .then((r) => setRecipients(r.recipients || []))
      .catch(() => setRecipients([]));
  }, [api, survey.id]);
  const loadResults = useCallback(() => {
    if (survey.status === 'draft') return;
    api('results', { surveyId: survey.id })
      .then((r) => setRes(r))
      .catch(() => setRes({ count: 0, answers: [] }));
  }, [api, survey.id, survey.status]);
  useEffect(() => { loadRecipients(); }, [loadRecipients]);
  useEffect(() => { loadResults(); }, [loadResults]);

  const run = async (fn, ok, failText) => {
    if (busy) return false;
    setBusy(true);
    try {
      const out = await fn();
      const msg = typeof ok === 'function' ? ok(out) : ok;
      if (msg) showSaveToast?.(msg);
      onChanged?.();
      loadRecipients();
      loadResults();
      return true;
    } catch (err) {
      showSaveToast?.(err?.message || failText);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const pending = (recipients || []).filter((r) => r.status !== 'sent').length;
    if (!pending) {
      showSaveToast?.('Alle mottakerne har fått undersøkelsen.');
      return;
    }
    const ok = await confirm({
      title: survey.status === 'draft' ? 'Sende undersøkelsen?' : 'Sende til nye mottakere?',
      message: `${pending} ${pending === 1 ? 'mottaker' : 'mottakere'} får en e-post med personlig lenke. Spørsmålene kan ikke endres etter utsending.`,
      confirmText: 'Send',
    });
    if (!ok) return;
    run(() => api('send', { surveyId: survey.id }), (r) => [
      `Sendt til ${r.sent} ${r.sent === 1 ? 'mottaker' : 'mottakere'}.`,
      r.failed ? `${r.failed} feilet (se listen).` : '',
      r.left ? `${r.left} gjenstår, trykk Send igjen.` : '',
    ].filter(Boolean).join(' '), 'Kunne ikke sende undersøkelsen');
  };
  const remind = () => run(() => api('remind', { surveyId: survey.id }), (r) => (r.reminded
    ? `Påminnelse sendt til ${r.reminded}.${r.skipped ? ` ${r.skipped} er purret nylig eller fikk den i går.` : ''}`
    : r.waiting ? 'Ingen å purre nå: de har fått e-post det siste døgnet, eller er purret tre ganger.' : 'Alle har svart.'), 'Kunne ikke sende påminnelse');
  const close = async () => {
    const ok = await confirm({ title: 'Avslutte undersøkelsen?', message: 'Lenkene slutter å virke, og resultatet lagres i utviklingen over tid. Den kan ikke åpnes igjen.', confirmText: 'Avslutt', tone: 'warn' });
    if (ok) run(() => api('close', { surveyId: survey.id }), 'Undersøkelsen er avsluttet.', 'Kunne ikke avslutte');
  };
  const save = (draft) => run(() => api('save', { survey: draft }), 'Utkastet er lagret.', 'Kunne ikke lagre');
  const remove = async () => {
    const ok = await confirm({ title: 'Slette utkastet?', message: `«${survey.title}» og mottakerlisten slettes.`, confirmText: 'Slett', tone: 'danger' });
    if (ok && await run(() => api('delete', { surveyId: survey.id }), 'Utkastet er slettet.', 'Kunne ikke slette')) onBack();
  };
  const saveDeadline = () => run(async () => {
    await api('save', { survey: { ...survey, closesOn: deadline } });
    setEditDeadline(false);
  }, 'Svarfristen er endret.', 'Kunne ikke endre fristen');
  const addRecipients = (list) => run(() => api('addRecipients', { surveyId: survey.id, recipients: list }), (r) => [
    `${r.added} lagt til.`,
    r.skipped?.length ? `${r.skipped.length} hoppet over (${[...new Set(r.skipped.map((x) => x.reason.toLowerCase()))].join(', ')}).` : '',
    survey.status === 'open' && r.added ? 'Trykk «Send til nye» for å sende til dem.' : '',
  ].filter(Boolean).join(' '), 'Kunne ikke legge til mottakere');
  const removeRecipient = (r) => run(() => api('removeRecipient', { surveyId: survey.id, recipientId: r.id }), 'Mottakeren er fjernet.', 'Kunne ikke fjerne mottakeren');
  const followUp = async (answerId, data) => {
    try {
      await api('followUp', { surveyId: survey.id, answerId, ...data });
      loadResults();
    } catch (err) {
      showSaveToast?.(err?.message || 'Kunne ikke lagre oppfølgingen');
    }
  };

  const previous = previousCustomerSurvey(surveys, survey.status === 'closed' ? survey : { ...survey, closedAt: '9999' });
  const live = res?.survey ? normalizeCustomerSurvey(res.survey) : survey;
  const results = res ? customerResults(live, res.answers) : null;
  const analysis = results?.ready ? customerAnalysis(results, previous?.summary || null) : null;
  const dl = surveyDeadline(survey);
  const sentCount = survey.stats.sent;
  const pct = sentCount ? Math.min(100, Math.round((survey.stats.answered / sentCount) * 100)) : 0;
  const unsent = (recipients || []).filter((r) => r.status !== 'sent').length;

  return (
    <View style={styles.stack} nativeID={`customer-survey-${survey.id}`}>
      <Pressable onPress={onBack} accessibilityRole="link" style={styles.back} nativeID="customer-survey-back">
        <Ionicons name="chevron-back" size={16} color={colors.brandInk || colors.brand} />
        <Text style={[styles.body, { color: colors.brandInk || colors.brand }]}>Alle kundeundersøkelser</Text>
      </Pressable>
      <View style={styles.headRow}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={[styles.title, { color: colors.ink }]}>{survey.title}</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            {[
              STATUS_LABEL[survey.status],
              survey.anonymous ? 'anonym' : 'navngitt',
              survey.openedAt ? `sendt ${formatNbDate(survey.openedAt)}` : '',
              survey.status === 'open' && dl.date ? (dl.passed ? `fristen gikk ut ${formatNbDate(dl.date)}` : `frist ${formatNbDate(dl.date)}`) : '',
              survey.closedAt ? `avsluttet ${formatNbDate(survey.closedAt)}` : '',
              `${survey.questions.length} spørsmål`,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {canWrite && survey.status === 'draft' ? (
          <HrButton colors={colors} primary icon="send" label={`Send til ${(recipients || []).length} mottakere`} disabled={busy || !(recipients || []).length} onPress={send} nativeID="customer-survey-send" />
        ) : null}
        {canWrite && survey.status === 'open' ? (
          <>
            {unsent ? <HrButton colors={colors} icon="send" label={`Send til nye (${unsent})`} disabled={busy} onPress={send} nativeID="customer-survey-send-new" /> : null}
            <HrButton colors={colors} icon="notifications-outline" label="Send påminnelse" disabled={busy} onPress={remind} nativeID="customer-survey-remind" />
            <HrButton colors={colors} primary={dl.passed} icon="lock-closed" label="Avslutt" disabled={busy} onPress={close} nativeID="customer-survey-close" />
          </>
        ) : null}
      </View>

      {survey.status === 'open' ? (
        <View style={styles.stack}>
          {dl.passed && canWrite ? (
            <View style={[styles.note, { borderColor: colors.warn, backgroundColor: colors.sunken }]}>
              <Ionicons name="time-outline" size={16} color={colors.warnInk || colors.ink} />
              <Text style={[styles.caption, { color: colors.ink, flex: 1 }]}>Svarfristen er ute. Avslutt undersøkelsen for å låse resultatet og ta det med i utviklingen over tid.</Text>
            </View>
          ) : null}
          <View style={[styles.meter, { backgroundColor: chart.barTrack }]}>
            <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: chart.bar }]} />
          </View>
          <Text style={[styles.caption, { color: colors.ink }]}>{`${survey.stats.answered} av ${sentCount} har svart (${pct} %).`}</Text>
          {canWrite ? (editDeadline ? (
            <View style={styles.deadlineRow}>
              <View style={{ minWidth: 200 }}>
                <HrField colors={colors} label="Ny svarfrist" value={deadline} date="iso" onChangeText={(v) => setDeadline(v || '')} />
              </View>
              <HrButton colors={colors} primary icon="checkmark" label="Lagre frist" onPress={saveDeadline} disabled={busy} />
              <HrButton colors={colors} label="Avbryt" onPress={() => setEditDeadline(false)} />
            </View>
          ) : (
            <View style={styles.actions}>
              <HrChip colors={colors} label={dl.date ? 'Endre svarfrist' : 'Sett svarfrist'} onPress={() => setEditDeadline(true)} />
            </View>
          )) : null}
        </View>
      ) : null}

      {survey.status === 'draft' && canWrite ? (
        <SurveyEditor colors={colors} survey={survey} previous={previous} companyName={companyName} busy={busy} onSave={save} onDelete={remove} />
      ) : null}

      {survey.status !== 'draft' ? (
        <View style={styles.stack}>
          <Text style={[styles.title, { color: colors.ink }]}>Resultat</Text>
          {res === null ? <EmptyHint colors={colors} text="Henter svar …" /> : null}
          {res && !results?.ready ? (
            <EmptyHint
              colors={colors}
              text={survey.anonymous
                ? (survey.status !== 'closed'
                  ? `${res.count} har svart. I en anonym undersøkelse vises resultatet når den er avsluttet og minst tre har svart.`
                  : `Bare ${res.count} svarte. Med færre enn tre vises ingen resultater, så ingen kan kjennes igjen.`)
                : 'Ingen svar ennå. Resultatet vises her så snart den første kunden har svart.'}
            />
          ) : null}
          {analysis ? (
            <CustomerSurveyResults colors={colors} survey={live} results={results} analysis={analysis} canWrite={canWrite} onFollowUp={followUp} />
          ) : null}
        </View>
      ) : null}

      <View style={[styles.box, { borderColor: colors.line }]}>
        <CustomerSurveyRecipients
          colors={colors}
          survey={survey}
          recipients={recipients}
          customers={customers}
          canWrite={canWrite}
          busy={busy}
          onAdd={addRecipients}
          onRemove={removeRecipient}
        />
      </View>
    </View>
  );
}

function SurveyRow({ colors, survey, onOpen }) {
  const chart = chartColorsFor(colors);
  const pct = survey.stats.sent ? Math.min(100, Math.round((survey.stats.answered / survey.stats.sent) * 100)) : 0;
  const dl = surveyDeadline(survey);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" style={[styles.row, { borderColor: colors.line }]} nativeID={`customer-survey-row-${survey.id}`}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={[styles.bodyStrong, { color: colors.ink }]}>{survey.title}</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          {[
            STATUS_LABEL[survey.status],
            survey.anonymous ? 'anonym' : '',
            survey.status === 'draft' ? `${survey.stats.recipients} mottakere` : `${survey.stats.answered} av ${survey.stats.sent} svarte`,
            survey.status === 'open' && dl.date ? (dl.passed ? 'fristen er ute' : `frist ${formatNbDate(dl.date)}`) : '',
            survey.summary?.ready && survey.summary.nps != null ? `NPS ${survey.summary.nps}` : '',
            survey.summary?.ready && survey.summary.index != null ? `tilfredshet ${survey.summary.index}` : '',
          ].filter(Boolean).join(' · ')}
        </Text>
        {survey.status === 'open' ? (
          <View style={[styles.meter, { backgroundColor: chart.barTrack }]}>
            <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: chart.bar }]} />
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** familyIdOverride og companyNameOverride brukes av den lokale demoen (/kundeundersokelse-demo). */
export default function CustomerSurveyScreen({ familyIdOverride = '', companyNameOverride = '' } = {}) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const app = useApp();
  const familyId = familyIdOverride || app.familyId;
  const { family, uid } = app;
  const access = useCompanyAccess();
  // Begrenset redigering på Kunder lager og sender (som serveren).
  const canWrite = !!access?.ready && !!access.canEdit?.('customers');
  const [surveys, setSurveys] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('list');
  const [customers, setCustomers] = useState([]);
  const companyName = companyNameOverride || family?.name || '';

  const reload = useCallback(() => {
    customerSurveyCall('list', { familyId })
      .then((r) => { setSurveys((r.surveys || []).map(normalizeCustomerSurvey)); setError(''); })
      .catch((err) => { setSurveys([]); setError(err?.message || 'Kunne ikke hente kundeundersøkelsene.'); });
  }, [familyId]);
  useEffect(() => { if (familyId) reload(); }, [familyId, reload]);
  useEffect(() => {
    if (!familyId || !canWrite) return;
    loadCustomerList(familyId, { onCache: setCustomers }).then((r) => setCustomers(r?.customers || r || [])).catch(() => {});
  }, [familyId, canWrite]);

  const trend = useMemo(() => surveyTrend(customerTrendPoints(surveys)), [surveys]);
  const hasActive = (surveys || []).some((s) => s.status !== 'closed');
  const latest = (surveys || [])[0] || null;
  const current = (surveys || []).find((s) => s.id === selected) || null;

  const create = async () => {
    try {
      const template = (surveys || []).find((s) => s.status === 'closed') || latest;
      const fresh = newCustomerSurvey({ uid, template });
      const draft = { ...fresh, title: uniqueSurveyTitle(fresh.title, (surveys || []).map((s) => s.title)), closesOn: defaultDeadline() };
      const r = await customerSurveyCall('save', { familyId, survey: draft });
      showSaveToast?.(template ? 'Undersøkelsen er laget med de samme spørsmålene som sist.' : 'Undersøkelsen er laget. Se over spørsmålene og velg mottakere.');
      reload();
      setSelected(r.survey?.id || '');
    } catch (err) {
      showSaveToast?.(err?.message || 'Kunne ikke lage undersøkelsen');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[styles.page, isPhone && styles.pagePhone]}>
      <HrCard colors={colors}>
        <View style={styles.stack} nativeID="customer-survey">
          {current ? (
              <SurveyDetail
                key={`${current.id}:${current.status}`}
                colors={colors}
                familyId={familyId}
                survey={current}
                surveys={surveys}
                customers={customers}
                companyName={companyName}
                canWrite={canWrite}
                onBack={() => setSelected('')}
                onChanged={reload}
              />
          ) : (
            <>
              <HrSectionTitle
                colors={colors}
                title="Kundeundersøkelse"
                subtitle="Spør kundene hva de synes, og følg utviklingen år for år. Kundene får en personlig lenke på e-post og svarer uten innlogging. Resultatet viser NPS, tilfredshet per område, hva som må bedres og hvilke kunder som bør følges opp (ISO 9001 punkt 9.1.2)."
                right={canWrite && !hasActive ? (
                  <HrButton colors={colors} primary icon="add" label="Ny kundeundersøkelse" onPress={create} nativeID="customer-survey-new" />
                ) : null}
              />
              {trend ? (
                <View style={styles.chips}>
                  <HrChip colors={colors} label="Undersøkelser" active={tab === 'list'} onPress={() => setTab('list')} nativeID="customer-survey-tab-list" />
                  <HrChip colors={colors} label="Utvikling over tid" active={tab === 'trend'} onPress={() => setTab('trend')} nativeID="customer-survey-tab-trend" />
                  {trendSentence(trend, { key: 'nps' }) ? <Text style={[styles.caption, { color: colors.muted }]}>{`NPS: ${trendSentence(trend, { key: 'nps' }).toLowerCase()}`}</Text> : null}
                </View>
              ) : null}
              {surveys === null ? <EmptyHint colors={colors} text="Henter kundeundersøkelser …" /> : null}
              {error ? <EmptyHint colors={colors} text={error} /> : null}
              {surveys && !surveys.length && !error ? (
                <EmptyHint colors={colors} text="Ingen kundeundersøkelser ennå. Mange sender én hvert år, eller etter at et prosjekt er overlevert." />
              ) : null}
              {tab === 'trend' && trend ? (
                <SurveyTrend
                  colors={colors}
                  trend={trend}
                  metric="nps"
                  target={0}
                  indexLabel="Tilfredshet"
                  nativeID="customer-survey-trend"
                  onExport={() => downloadCsv(csvFileName('kundeundersokelse', 'utvikling'), trendCsvRows(trend, { indexLabel: 'Tilfredshet' }))}
                />
              ) : (surveys || []).map((s) => (
                <SurveyRow key={s.id} colors={colors} survey={s} onOpen={() => setSelected(s.id)} />
              ))}
              {!canWrite && access?.ready ? (
                <Text style={[styles.caption, { color: colors.muted }]}>Du kan se resultatene. For å lage og sende undersøkelser trengs Begrenset redigering på Kunder.</Text>
              ) : null}
              {trend && tab === 'list' && trend.points.length ? (
                <Text style={[styles.caption, { color: colors.muted }]}>{`Mål for tilfredshet per område: ${CUSTOMER_GOOD_SCORE} av 100.`}</Text>
              ) : null}
            </>
          )}
        </View>
      </HrCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.md, gap: space.sm, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  pagePhone: { padding: space.xs },
  stack: { gap: space.xs },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  col: { flexGrow: 1, flexBasis: 260, gap: 4 },
  title: { ...type.title },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  caption: { ...type.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.control, padding: space.xs },
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  qRow: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start', borderTopWidth: 1, paddingTop: space.xs },
  num: { ...type.body, width: 24, paddingTop: 18 },
  qTools: { flexDirection: 'row', gap: 4, paddingTop: 16 },
  iconBtn: { width: 32, height: 32, borderWidth: 1, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.xs, paddingVertical: 6, ...type.body },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, paddingVertical: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
  meter: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: radius.pill },
  deadlineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: 1, paddingVertical: space.xs },
});
