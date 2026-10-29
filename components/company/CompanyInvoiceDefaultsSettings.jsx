import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  DELIVERY_OPTIONS,
  DUE_DATE_MODE_OPTIONS,
  GROUP_HOURS_OPTIONS,
  INVOICE_LANGUAGE_OPTIONS,
  KID_FORMAT_OPTIONS,
  KID_METHOD_OPTIONS,
  OUR_REFERENCE_OPTIONS,
  REMINDER_FEE_MAX,
  resolveCompanyInvoiceDefaults,
} from '../../src/economy/companyInvoiceDefaults.js';
import { saveCompanyInvoiceDefaults } from '../../src/company/setupState.js';
import { peekInvoiceNumbers } from '../../src/economy/invoiceStorage.js';
import {
  formatNumberRange,
  isJumpDocumented,
  numberJumpEntry,
  numberJumpError,
  plannedNumberJump,
} from '../../src/economy/invoiceNumberSeries.js';
import { useApp } from '../../src/context/AppContext';
import { loadPowerOfficeStatus } from '../../src/economy/powerOfficeClient.js';
import { SetupFrame } from './SetupFrame';
import { useCompanyProject } from './useCompanyProject';

/** grow: feltet deler bredden med naboene i et rutenett. */
function Field({ label, hint, children, grow = false }) {
  return (
    <View style={[styles.field, grow ? styles.grow : null]}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function Chips({ options, value, onChange, canEdit, colors, nativeID }) {
  return (
    <View style={styles.chipRow} nativeID={nativeID}>
      {options.map((row) => {
        const on = value === row.id;
        return (
          <TouchableOpacity
            key={row.id}
            disabled={!canEdit}
            onPress={() => onChange(row.id)}
            style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : 'transparent' }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={{ color: colors.ink, fontSize: 13 }}>{row.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Radios({ options, value, onChange, canEdit, colors }) {
  return options.map((row) => {
    const on = value === row.id;
    return (
      <TouchableOpacity
        key={row.id}
        disabled={!canEdit}
        onPress={() => onChange(row.id)}
        style={styles.radio}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
      >
        <Text style={{ color: on ? colors.brand : colors.ink }}>{on ? '●' : '○'} {row.label}</Text>
      </TouchableOpacity>
    );
  });
}

function Toggle({ label, hint, value, onChange, canEdit, colors, nativeID }) {
  return (
    <TouchableOpacity
      disabled={!canEdit}
      onPress={() => onChange(!value)}
      style={styles.check}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!value }}
      nativeID={nativeID}
    >
      <Text style={{ color: colors.ink }}>{value ? '☑' : '☐'} {label}</Text>
      {hint ? <Text style={[styles.hint, { color: colors.ink, marginLeft: 22 }]}>{hint}</Text> : null}
    </TouchableOpacity>
  );
}

function wholeNumber(value) {
  const n = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Feil som stopper lagring. numbers er { last, highest } i serien. Et startnummer som hopper
 * over nummer, krever begrunnelse (bokføringsforskriften § 5-1-1 nr. 1).
 */
export function invoiceDefaultsErrors(draft, { numbers = null, jumpReason = '' } = {}) {
  const errors = [];
  const start = wholeNumber(draft.invoiceNumberStart || 0);
  if (!Number.isInteger(start) || start < 0) errors.push('Startnummeret må være et helt tall.');
  else if (numbers) {
    const jump = plannedNumberJump({ last: numbers.last, highest: numbers.highest, start });
    const why = numberJumpError(jump, jumpReason, draft.numberJumps);
    if (why) errors.push(why);
  }
  const fee = wholeNumber(draft.reminderFee || 0);
  if (!Number.isFinite(fee) || fee < 0) errors.push('Purregebyret må være et beløp.');
  else if (fee > REMINDER_FEE_MAX) errors.push(`Purregebyret kan ikke være over ${REMINDER_FEE_MAX} kr (inkassoforskriften § 1-1).`);
  const days = wholeNumber(draft.reminderDays || 0);
  if (!Number.isInteger(days) || days < 0) errors.push('Dager før purring må være et helt tall.');
  else if (fee > 0 && days < 14) errors.push('Med purregebyr kan purringen tidligst sendes 14 dager etter forfall.');
  const deadline = wholeNumber(draft.collectionDeadlineDays ?? 14);
  if (!Number.isInteger(deadline) || deadline < 14) errors.push('Fristen i purring og inkassovarsel må være minst 14 dager (inkassoloven § 9).');
  const friendly = wholeNumber(draft.friendlyReminderDays ?? 0);
  if (!Number.isInteger(friendly) || friendly < 0) errors.push('Dager før påminnelse må være et helt tall (0 slår den av).');
  if (draft.collectionAutoDebt && !String(draft.collectionAgencyEmail || '').includes('@')) {
    errors.push('Automatisk inkasso trenger e-postadressen til inkassobyrået.');
  }
  const credit = wholeNumber(draft.creditDays ?? '');
  if (!Number.isInteger(credit) || credit < 0) errors.push('Kredittiden må være et helt antall dager.');
  return errors;
}

/**
 * Økonomi → Innstillinger → Faktura- og økonomistandarder.
 * Disse verdiene arves av alle prosjekter med mindre prosjektet overstyrer.
 * Nummerserie, KID, godkjenning, forsendelse og purring gjelder hele selskapet.
 */
export default function CompanyInvoiceDefaultsSettings({ familyId, colors, canEdit }) {
  const project = useCompanyProject(familyId);
  const [draft, setDraft] = useState(() => resolveCompanyInvoiceDefaults(project.state));
  const [dirty, setDirty] = useState(false);
  const [numbers, setNumbers] = useState(null);
  const [poStatus, setPoStatus] = useState(null);
  const [errors, setErrors] = useState([]);
  const [jumpReason, setJumpReason] = useState('');
  const { uid, activeProfile } = useApp();

  useEffect(() => {
    if (!dirty) setDraft(resolveCompanyInvoiceDefaults(project.state));
  }, [project.state, dirty]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    peekInvoiceNumbers(familyId).then((next) => { if (live) setNumbers(next); }).catch(() => {});
    loadPowerOfficeStatus(familyId).then((next) => { if (live) setPoStatus(next); }).catch(() => {});
    return () => { live = false; };
  }, [familyId]);

  function setKey(key, value) {
    setDirty(true);
    setErrors([]);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    const found = invoiceDefaultsErrors(draft, { numbers, jumpReason });
    setErrors(found);
    if (found.length) return;
    const entry = jump && !isJumpDocumented(draft.numberJumps, jump)
      ? numberJumpEntry(jump, { reason: jumpReason, actor: { byUid: uid || '', byName: activeProfile?.name || '' } })
      : null;
    const ok = await project.commit(
      saveCompanyInvoiceDefaults(project.state, draft, { numberJump: entry }),
      entry
        ? `Fakturastandarder er lagret. Hoppet over ${formatNumberRange(entry)} er logget med begrunnelse.`
        : 'Fakturastandarder er lagret. Prosjekter arver verdiene.',
    );
    if (ok) {
      setDirty(false);
      setJumpReason('');
    }
  }

  function reset() {
    setDraft(resolveCompanyInvoiceDefaults(project.state));
    setDirty(false);
    setErrors([]);
    setJumpReason('');
    project.setError('');
  }

  const input = {
    borderColor: colors.line,
    color: colors.ink,
    backgroundColor: colors.card,
  };
  const props = { canEdit, colors };
  const start = Math.max(0, Math.floor(wholeNumber(draft.invoiceNumberStart || 0)) || 0);
  const nextNumber = numbers ? Math.max(numbers.last + 1, numbers.highest + 1, start || 1) : null;
  const jump = numbers ? plannedNumberJump({ last: numbers.last, highest: numbers.highest, start }) : null;
  const jumpOpen = !!jump && !isJumpDocumented(draft.numberJumps, jump);
  const jumpLog = (draft.numberJumps || []).slice().reverse();
  const poweroffice = !!poStatus?.connected;

  return (
    <SetupFrame
      colors={colors}
      nativeID="company-invoice-defaults"
      crumbs={[
        { label: 'Økonomi', tab: 'okonomi', page: 'oversikt' },
        { label: 'Innstillinger', tab: 'okonomi', page: 'innstillinger' },
        { label: 'Fakturastandarder' },
      ]}
      title="Faktura- og økonomistandarder"
      note={project.note}
      error={project.error || errors.join(' ')}
    >
      <View
        nativeID="company-invoice-inherit-banner"
        style={[styles.banner, { backgroundColor: colors.brandSoft || '#e8f1ff', borderColor: colors.brand }]}
      >
        <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>
          Disse verdiene er selskapets standard. Alle prosjekter åpner med dem under Faktureringsvalg.
          Prosjektet kan overstyre enkeltfelt; tomme prosjektfelt arver alltid hitfra. Endringer gjelder nye fakturaer.
        </Text>
      </View>

      <View nativeID="company-invoice-mode" style={[styles.banner, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 4 }}>
          {poweroffice ? 'Fakturaene utstedes i PowerOffice Go' : 'ProTop utsteder fakturaene'}
        </Text>
        <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>
          {poweroffice
            ? 'PowerOffice er koblet til. Utkastene lages og godkjennes i ProTop og overføres til PowerOffice, som setter fakturanummer og KID og sender fakturaen. Nummerserie og KID under gjelder bare hvis koblingen fjernes.'
            : 'Utkastene lages og godkjennes i ProTop. Ved ferdigstilling får fakturaen neste nummer i serien og KID, PDF-en arkiveres og fakturaen sendes som EHF eller e-post.'}
        </Text>
      </View>

      <Text style={[styles.section, { color: colors.ink }]}>Nummerserie og KID</Text>
      <Field
        label="Første fakturanummer"
        hint="Fakturaen får neste ledige nummer: høyeste nummer i listen + 1, men aldri lavere enn dette. Hull i serien fylles ikke."
      >
        <TextInput
          editable={canEdit}
          keyboardType="number-pad"
          value={String(draft.invoiceNumberStart || '')}
          onChangeText={(v) => setKey('invoiceNumberStart', v.replace(/\D/g, ''))}
          placeholder="For eksempel 10001"
          placeholderTextColor={colors.muted}
          style={[styles.input, input, styles.short]}
          nativeID="company-invoice-number-start"
        />
        {nextNumber ? (
          <Text style={[styles.hint, { color: colors.ink }]} nativeID="company-invoice-next-number">
            {`Neste faktura får nummer ${nextNumber}.`}
          </Text>
        ) : null}
        {jumpOpen ? (
          <View nativeID="company-invoice-number-jump" style={[styles.banner, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>
              {`Nummer ${formatNumberRange(jump)} blir ikke brukt. Nummerserien skal kunne kontrolleres, så hoppet logges med begrunnelse (bokføringsforskriften § 5-1-1).`}
            </Text>
            <TextInput
              editable={canEdit}
              multiline
              value={jumpReason}
              onChangeText={(v) => { setJumpReason(v); setErrors([]); }}
              placeholder="Hvorfor hopper serien? For eksempel: nummer 10001–10050 er brukt i forrige fakturasystem."
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.area, input]}
              accessibilityLabel="Begrunnelse for hopp i nummerserien"
              nativeID="company-invoice-number-jump-reason"
            />
          </View>
        ) : null}
        {jumpLog.length ? (
          <View nativeID="company-invoice-number-jump-log" style={{ gap: 4, marginTop: 6 }}>
            <Text style={[styles.label, { color: colors.ink }]}>Logg over hopp i nummerserien</Text>
            {jumpLog.map((row) => (
              <Text key={row.id} style={[styles.hint, { color: colors.ink }]}>
                {`${row.at.slice(0, 10).split('-').reverse().join('.')} · nummer ${formatNumberRange(row)} hoppet over${row.byName ? ` av ${row.byName}` : ''}: ${row.reason}`}
              </Text>
            ))}
          </View>
        ) : null}
      </Field>
      <Field label="KID" hint="KID gjør at innbetalingen kan avstemmes automatisk mot fakturaen.">
        <Radios options={KID_FORMAT_OPTIONS} value={draft.kidFormat} onChange={(id) => setKey('kidFormat', id)} {...props} />
      </Field>
      {draft.kidFormat !== 'none' ? (
        <Field label="Kontrollsiffer">
          <Chips options={KID_METHOD_OPTIONS} value={draft.kidMethod} onChange={(id) => setKey('kidMethod', id)} {...props} />
        </Field>
      ) : null}

      <Text style={[styles.section, { color: colors.ink }]}>Utkast og godkjenning</Text>
      <Toggle
        label="Utkast må godkjennes før ferdigstilling"
        hint="Alle med redigeringstilgang til Faktura kan godkjenne. En endring etter godkjenning fjerner godkjenningen."
        value={draft.requireDraftApproval}
        onChange={(v) => setKey('requireDraftApproval', v)}
        nativeID="company-invoice-require-approval"
        {...props}
      />

      <Text style={[styles.section, { color: colors.ink }]}>Generelle fakturavalg</Text>
      <Field label="Kredittid (dager)" hint="Standardverdi brukt når prosjektet ikke overstyrer.">
        <TextInput
          editable={canEdit}
          keyboardType="numeric"
          value={String(draft.creditDays ?? '')}
          onChangeText={(v) => setKey('creditDays', v)}
          style={[styles.input, input, styles.short]}
          nativeID="company-invoice-credit-days"
        />
      </Field>
      <Field label="Fakturaspråk">
        <Chips options={INVOICE_LANGUAGE_OPTIONS} value={draft.invoiceLanguage} onChange={(id) => setKey('invoiceLanguage', id)} {...props} />
      </Field>
      <Field label="Beregn forfallsdato">
        <Radios options={DUE_DATE_MODE_OPTIONS} value={draft.dueDateMode} onChange={(id) => setKey('dueDateMode', id)} {...props} />
      </Field>
      <Field label="Vår referanse">
        <Chips options={OUR_REFERENCE_OPTIONS} value={draft.ourReferenceMode} onChange={(id) => setKey('ourReferenceMode', id)} {...props} />
      </Field>
      <Field label="Timer på fakturaen">
        <Chips options={GROUP_HOURS_OPTIONS} value={draft.groupHoursBy} onChange={(id) => setKey('groupHoursBy', id)} {...props} />
      </Field>
      <Toggle label="Vis periode på linjene" value={draft.showPeriod} onChange={(v) => setKey('showPeriod', v)} {...props} />
      <Toggle label="Legg ved timespesifikasjon" value={draft.attachTimeSpec} onChange={(v) => setKey('attachTimeSpec', v)} {...props} />
      <Toggle label="Legg ved kvitteringer for utlegg" value={draft.copyExpenseAttachments} onChange={(v) => setKey('copyExpenseAttachments', v)} {...props} />

      <Text style={[styles.section, { color: colors.ink }]}>Standardtekster</Text>
      <Field label="Standard innledende tekst">
        <TextInput
          editable={canEdit}
          multiline
          value={draft.introText}
          onChangeText={(v) => setKey('introText', v)}
          style={[styles.input, styles.area, input]}
        />
      </Field>
      <Field label="Standard bunntekst">
        <TextInput
          editable={canEdit}
          multiline
          value={draft.footerText}
          onChangeText={(v) => setKey('footerText', v)}
          style={[styles.input, styles.area, input]}
        />
      </Field>

      <Text style={[styles.section, { color: colors.ink }]}>Påslag og rabatter</Text>
      <View style={styles.grid}>
        {[
          ['markupHourly', 'Påslag timepris %'],
          ['markupFixed', 'Påslag fastpris %'],
          ['markupExpenseHourly', 'Påslag utlegg (timepris) %'],
          ['markupExpenseFixed', 'Påslag utlegg (fastpris) %'],
          ['discountHours', 'Rabatt timer %'],
          ['discountProducts', 'Rabatt produkter %'],
          ['adminMarkupPercent', 'Adm.kostnader %'],
          ['adminAmount', 'Adm.kostnader beløp (NOK)'],
        ].map(([key, label]) => (
          <Field grow key={key} label={label}>
            <TextInput
              editable={canEdit}
              keyboardType="numeric"
              value={String(draft[key] ?? '')}
              onChangeText={(v) => setKey(key, v)}
              style={[styles.input, input]}
            />
          </Field>
        ))}
      </View>

      <Text style={[styles.section, { color: colors.ink }]}>Forsendelse</Text>
      <Field
        label="Standard forsendelse"
        hint={poweroffice ? 'Med PowerOffice koblet til sender PowerOffice fakturaen etter kundens oppsett der.' : 'Kunden slås opp i Peppol-katalogen ved sending. Offentlige kunder skal ha EHF.'}
      >
        <Radios options={DELIVERY_OPTIONS} value={draft.defaultDelivery} onChange={(id) => setKey('defaultDelivery', id)} {...props} />
      </Field>
      {[
        ['ehfAttachPdf', 'Legg PDF-versjon ved EHF-faktura'],
        ['ehfMergePdf', 'Slå sammen PDF-faktura og PDF-vedlegg'],
        ['ehfAlsoEmail', 'Send faktura både som EHF og e-post'],
      ].map(([key, label]) => (
        <Toggle key={key} label={label} value={draft[key]} onChange={(v) => setKey(key, v)} {...props} />
      ))}

      <Text style={[styles.section, { color: colors.ink }]}>E-post</Text>
      <View style={styles.grid}>
        <Field grow label="Svar til" hint="Kundens svar går hit. Tomt: selskapets e-post.">
          <TextInput
            editable={canEdit}
            keyboardType="email-address"
            autoCapitalize="none"
            value={draft.emailReplyTo}
            onChangeText={(v) => setKey('emailReplyTo', v.trim())}
            placeholder="faktura@firma.no"
            placeholderTextColor={colors.muted}
            style={[styles.input, input]}
            nativeID="company-invoice-reply-to"
          />
        </Field>
        <Field grow label="Kopi til" hint="Flere adresser skilles med komma.">
          <TextInput
            editable={canEdit}
            keyboardType="email-address"
            autoCapitalize="none"
            value={draft.emailCc}
            onChangeText={(v) => setKey('emailCc', v)}
            style={[styles.input, input]}
          />
        </Field>
      </View>
      <Field label="Emne, faktura">
        <TextInput editable={canEdit} value={draft.emailSubject} onChangeText={(v) => setKey('emailSubject', v)} style={[styles.input, input]} nativeID="company-invoice-email-subject" />
      </Field>
      <Field label="Melding, faktura">
        <TextInput editable={canEdit} multiline value={draft.emailBodyText} onChangeText={(v) => setKey('emailBodyText', v)} style={[styles.input, styles.areaTall, input]} />
      </Field>
      <Field label="Emne, kreditnota">
        <TextInput editable={canEdit} value={draft.creditEmailSubject} onChangeText={(v) => setKey('creditEmailSubject', v)} style={[styles.input, input]} />
      </Field>
      <Field label="Melding, kreditnota">
        <TextInput editable={canEdit} multiline value={draft.creditEmailBodyText} onChangeText={(v) => setKey('creditEmailBodyText', v)} style={[styles.input, styles.areaTall, input]} />
      </Field>
      <Text style={[styles.hint, { color: colors.ink, marginBottom: 8 }]}>
        Flettefelt: @invoiceNumber, @company, @amount, @dueDate, @kid, @customer, @project, @replyTo og @creditedInvoice (kreditnota).
      </Text>
      <Toggle label="Legg ved PDF av fakturaen" value={draft.emailIncludePdf} onChange={(v) => setKey('emailIncludePdf', v)} {...props} />
      <Toggle label="Legg ved vedlegg (kvitteringer og timespesifikasjon)" value={draft.emailIncludeAttachments} onChange={(v) => setKey('emailIncludeAttachments', v)} {...props} />

      <Text style={[styles.section, { color: colors.ink }]}>Purring og inkasso</Text>
      <Text style={[styles.hint, { color: colors.ink }]}>
        Stegene følger loven: påminnelse (valgfri, uten gebyr), purring, inkassovarsel (purring 2) og inkasso. Neste steg
        kan først sendes dagen etter at fristen i forrige er ute. Fristen i purring og inkassovarsel er minst 14 dager.
      </Text>
      <View style={styles.grid}>
        <Field grow label="Påminnelse, dager etter forfall" hint="Vennlig påminnelse uten gebyr. 0 slår den av.">
          <TextInput
            editable={canEdit}
            keyboardType="number-pad"
            value={String(draft.friendlyReminderDays ?? '')}
            onChangeText={(v) => setKey('friendlyReminderDays', v.replace(/\D/g, ''))}
            style={[styles.input, input]}
            nativeID="company-invoice-friendly-days"
          />
        </Field>
        <Field grow label="Purring, dager etter forfall" hint="Med purregebyr minst 14 dager.">
          <TextInput
            editable={canEdit}
            keyboardType="number-pad"
            value={String(draft.reminderDays ?? '')}
            onChangeText={(v) => setKey('reminderDays', v.replace(/\D/g, ''))}
            style={[styles.input, input]}
            nativeID="company-invoice-reminder-days"
          />
        </Field>
        <Field grow label="Purregebyr (kr)" hint={`Maks ${REMINDER_FEE_MAX} kr, for høyst to brev (purring og inkassovarsel).`}>
          <TextInput
            editable={canEdit}
            keyboardType="decimal-pad"
            value={String(draft.reminderFee ?? '')}
            onChangeText={(v) => setKey('reminderFee', v)}
            style={[styles.input, input]}
            nativeID="company-invoice-reminder-fee"
          />
        </Field>
      </View>
      <View style={styles.grid}>
        <Field grow label="Frist i purring og varsel (dager)" hint="Minst 14 dager.">
          <TextInput
            editable={canEdit}
            keyboardType="number-pad"
            value={String(draft.collectionDeadlineDays ?? '')}
            onChangeText={(v) => setKey('collectionDeadlineDays', v.replace(/\D/g, ''))}
            style={[styles.input, input]}
            nativeID="company-invoice-collection-deadline"
          />
        </Field>
        <Field grow label="Inkassovarsel, dager etter purrefristen" hint="1 = dagen etter at fristen i purringen er ute.">
          <TextInput
            editable={canEdit}
            keyboardType="number-pad"
            value={String(draft.noticeDaysAfterDeadline ?? '')}
            onChangeText={(v) => setKey('noticeDaysAfterDeadline', v.replace(/\D/g, ''))}
            style={[styles.input, input]}
            nativeID="company-invoice-notice-days"
          />
        </Field>
        <Field grow label="Inkasso, dager etter varselfristen" hint="1 = dagen etter at fristen i inkassovarselet er ute.">
          <TextInput
            editable={canEdit}
            keyboardType="number-pad"
            value={String(draft.debtDaysAfterDeadline ?? '')}
            onChangeText={(v) => setKey('debtDaysAfterDeadline', v.replace(/\D/g, ''))}
            style={[styles.input, input]}
            nativeID="company-invoice-debt-days"
          />
        </Field>
      </View>
      <Field label="E-post til inkassobyrå" hint="Kravsoppstillingen og fakturaen sendes hit når saken går til inkasso.">
        <TextInput
          editable={canEdit}
          keyboardType="email-address"
          autoCapitalize="none"
          value={String(draft.collectionAgencyEmail ?? '')}
          onChangeText={(v) => setKey('collectionAgencyEmail', v.trim())}
          placeholder="For eksempel: oppdrag@inkassobyra.no"
          style={[styles.input, input]}
          nativeID="company-invoice-collection-agency"
        />
      </Field>
      <Text style={[styles.hint, { color: colors.ink }]}>
        Automatisk utsending: ProTop sjekker morgen og ettermiddag og sender steget når dagen er kommet. Det gjelder bare
        fakturaer der betalingen hentes fra PowerOffice. Feiler hentingen, sendes ingenting den dagen.
      </Text>
      <Toggle label="Send påminnelse automatisk" value={draft.collectionAutoFriendly} onChange={(v) => setKey('collectionAutoFriendly', v)} nativeID="company-invoice-auto-friendly" {...props} />
      <Toggle label="Send purring automatisk" value={draft.collectionAutoReminder} onChange={(v) => setKey('collectionAutoReminder', v)} nativeID="company-invoice-auto-reminder" {...props} />
      <Toggle label="Send inkassovarsel automatisk" value={draft.collectionAutoNotice} onChange={(v) => setKey('collectionAutoNotice', v)} nativeID="company-invoice-auto-notice" {...props} />
      <Toggle
        label="Send til inkasso automatisk"
        hint="Kravsoppstillingen går til inkassobyrået uten at noen godkjenner den."
        value={draft.collectionAutoDebt}
        onChange={(v) => setKey('collectionAutoDebt', v)}
        nativeID="company-invoice-auto-debt"
        {...props}
      />

      {canEdit ? (
        <View style={styles.actions}>
          <TouchableOpacity onPress={reset} style={[styles.ghost, { borderColor: colors.line }]} disabled={!dirty}>
            <Text style={{ color: colors.ink }}>Avbryt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={save}
            style={[styles.primary, { backgroundColor: colors.brand, opacity: dirty ? 1 : 0.5 }]}
            disabled={!dirty}
            nativeID="company-invoice-defaults-save"
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 18, marginBottom: 10 },
  field: { marginBottom: 12, gap: 4 },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 },
  label: { fontWeight: '600', fontSize: 13 },
  hint: { fontSize: 12, opacity: 0.7, marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  short: { maxWidth: 220 },
  area: { minHeight: 80, textAlignVertical: 'top' },
  areaTall: { minHeight: 150, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  radio: { paddingVertical: 6 },
  check: { paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  ghost: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  primary: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
