import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import BrandToggle from '../BrandToggle';
import {
  AI_DOWNGRADE_CEILING, DEFAULT_AI_PLAN, aiMonthKey, aiUsageSummary, formatNok, normalizeAiPlan,
} from '../../src/ai/aiPlan';
import { loadAiPlan, loadAiUsage, saveAiPlan } from '../../src/ai/aiPlanStore';
import { companyAiAllowed } from '../../src/privacy/companyPrivacy';

const FILE_MB_CHOICES = [10, 20, 50, 100];
const FILES_CHOICES = [3, 5, 10];
const RETENTION_CHOICES = [30, 90, 180, 365];

function Chips({
  label, choices, value, unit, disabled, onChange, colors, nativeID,
}) {
  return (
    <View style={{ gap: 6 }} nativeID={nativeID}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <View style={styles.row}>
        {choices.map((choice) => {
          const id = typeof choice === 'object' ? choice.id : choice;
          const text = typeof choice === 'object' ? choice.label : `${choice} ${unit}`;
          const active = id === value;
          return (
            <TouchableOpacity
              key={String(id)}
              onPress={() => onChange(id)}
              disabled={disabled || active}
              style={[styles.chip, { borderColor: active ? colors.brand : colors.line, backgroundColor: active ? colors.brand : 'transparent' }, disabled && !active && styles.off]}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
            >
              <Text style={{ color: active ? '#fff' : colors.ink }}>{text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Switch({
  title, body, value, disabled, onChange, colors, nativeID,
}) {
  return (
    <View style={styles.switchRow} nativeID={nativeID}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={[styles.label, { color: colors.ink }]}>{title}</Text>
        {body ? <Text style={[styles.lead, { color: colors.muted }]}>{body}</Text> : null}
      </View>
      <BrandToggle value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}

function Kroner({
  label, hint, value, onChange, disabled, colors, nativeID,
}) {
  return (
    <View style={{ gap: 4, flex: 1, minWidth: 200 }}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <TextInput
        nativeID={nativeID}
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^\d]/g, ''))}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="0"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        accessibilityLabel={label}
      />
      {hint ? <Text style={[styles.hint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

function Card({ title, children, colors }) {
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {title ? <Text style={[styles.cardTitle, { color: colors.ink }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

/**
 * Selskapsinnstillinger → AI-abonnement. Eier, administrator eller Admin på AI-abonnement setter
 * rammene for AI-assistenten. Lese ser forbruket. Forbruket føres av serveren per kall.
 */
export default function CompanyAiSettings({
  familyId, company, uid, canEdit = false, colors, onOpenPrivacy,
}) {
  const month = useMemo(() => aiMonthKey(), []);
  const [plan, setPlan] = useState(() => normalizeAiPlan(null));
  const [budgetText, setBudgetText] = useState('');
  const [userCapText, setUserCapText] = useState('');
  const [usage, setUsage] = useState({ month: null, users: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const aiAllowed = companyAiAllowed(company);

  const load = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    setError('');
    try {
      const [{ plan: stored }, used] = await Promise.all([
        loadAiPlan(familyId),
        loadAiUsage(familyId, month).catch(() => ({ month: null, users: [] })),
      ]);
      setPlan(stored);
      setBudgetText(stored.monthlyBudgetNok ? String(stored.monthlyBudgetNok) : '');
      setUserCapText(stored.perUserMonthlyNok ? String(stored.perUserMonthlyNok) : '');
      setUsage(used);
      setDirty(false);
    } catch (e) {
      setError(e?.message || 'Kunne ikke hente AI-abonnementet.');
    } finally {
      setLoading(false);
    }
  }, [familyId, month]);

  useEffect(() => { load(); }, [load]);

  function patch(next) {
    setPlan((prev) => ({ ...prev, ...next }));
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    if (!canEdit || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await saveAiPlan(familyId, uid, {
        ...plan,
        monthlyBudgetNok: Number(budgetText) || 0,
        perUserMonthlyNok: Number(userCapText) || 0,
      });
      setPlan(next);
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre AI-abonnementet.');
    } finally {
      setBusy(false);
    }
  }

  const summary = aiUsageSummary(
    { ...plan, monthlyBudgetNok: Number(budgetText) || 0 },
    usage.month,
    usage.users,
  );
  const off = !canEdit || busy;
  const ceilingPct = Math.round(AI_DOWNGRADE_CEILING * 100);

  if (loading) {
    return <Text style={[styles.lead, { color: colors.muted }]}>Henter AI-abonnementet…</Text>;
  }

  return (
    <View style={styles.wrap} nativeID="company-ai-subscription">
      <Text style={[styles.lead, { color: colors.muted }]}>
        Rammene for AI-assistenten: en chat der ansatte kan skrive tekst og e-post og lese og lage dokumenter fra prosjektene. Bedriften betaler for det som brukes, innenfor budsjettet du setter her. Assistenten er ikke lansert ennå. Rammene gjelder fra den er det.
      </Text>

      {!aiAllowed ? (
        <View style={[styles.notice, { borderColor: colors.danger, backgroundColor: colors.dangerSoft || 'transparent' }]} nativeID="company-ai-privacy-off">
          <Text style={[styles.lead, { color: colors.dangerInk || colors.ink }]}>
            AI-funksjoner er slått av under personvern i selskapsinnstillingene. Da er AI-assistenten av uansett hva som står her.
          </Text>
          {onOpenPrivacy ? (
            <TouchableOpacity onPress={onOpenPrivacy} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Åpne selskapsinnstillinger</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <Card title="Abonnement" colors={colors}>
        <Switch
          nativeID="company-ai-enabled"
          title="Slå på AI-assistenten"
          body={plan.enabled
            ? 'På: de som har tilgang, kan bruke assistenten innenfor budsjettet.'
            : 'Av: ingen i bedriften kan bruke assistenten, og ingenting koster noe.'}
          value={plan.enabled}
          disabled={off}
          onChange={(next) => patch({ enabled: next })}
          colors={colors}
        />
        <View style={styles.row}>
          <Kroner
            nativeID="company-ai-budget"
            label="Månedsbudsjett"
            hint="Kroner per måned for hele bedriften. Må settes før assistenten kan slås på."
            value={budgetText}
            onChange={(text) => { setBudgetText(text); setDirty(true); setSaved(false); }}
            disabled={off}
            colors={colors}
          />
          <Kroner
            nativeID="company-ai-user-cap"
            label="Tak per person"
            hint="Kroner per person per måned. Tomt eller 0 betyr ingen egen grense."
            value={userCapText}
            onChange={(text) => { setUserCapText(text); setDirty(true); setSaved(false); }}
            disabled={off}
            colors={colors}
          />
        </View>
        <Chips
          nativeID="company-ai-on-limit"
          label="Når budsjettet er brukt opp"
          choices={[
            { id: 'stop', label: 'Stopp assistenten' },
            { id: 'downgrade', label: `Bytt til lett modell (til ${ceilingPct} %)` },
          ]}
          value={plan.onLimit}
          disabled={off}
          onChange={(value) => patch({ onLimit: value })}
          colors={colors}
        />
        <Text style={[styles.hint, { color: colors.muted }]}>
          Du får varsel når forbruket passerer 50, 80 og 100 % av budsjettet.
        </Text>
      </Card>

      <Card title="Hva assistenten får gjøre" colors={colors}>
        <Switch
          nativeID="company-ai-deep"
          title="Dyp analyse"
          body="Den sterkeste modellen, til lange og krevende dokumenter. Koster omtrent dobbelt så mye per svar."
          value={plan.deepModelEnabled}
          disabled={off}
          onChange={(next) => patch({ deepModelEnabled: next })}
          colors={colors}
        />
        <Switch
          nativeID="company-ai-external"
          title="Innleide og eksterne"
          body="Av: bare egne ansatte kan bruke assistenten."
          value={plan.allowInnleide}
          disabled={off}
          onChange={(next) => patch({ allowInnleide: next })}
          colors={colors}
        />
        <Switch
          nativeID="company-ai-email"
          title="E-postutkast"
          body="Assistenten kan lage utkast i Outlook. Den sender aldri selv."
          value={plan.emailDraftsEnabled}
          disabled={off}
          onChange={(next) => patch({ emailDraftsEnabled: next })}
          colors={colors}
        />
        <Chips
          nativeID="company-ai-file-mb"
          label="Største fil"
          choices={FILE_MB_CHOICES}
          unit="MB"
          value={plan.maxFileMb}
          disabled={off}
          onChange={(value) => patch({ maxFileMb: value })}
          colors={colors}
        />
        <Chips
          nativeID="company-ai-files"
          label="Filer per melding"
          choices={FILES_CHOICES}
          unit="filer"
          value={plan.maxFilesPerMessage}
          disabled={off}
          onChange={(value) => patch({ maxFilesPerMessage: value })}
          colors={colors}
        />
        <Chips
          nativeID="company-ai-retention"
          label="Samtaler slettes etter"
          choices={RETENTION_CHOICES}
          unit="dager"
          value={plan.chatRetentionDays}
          disabled={off}
          onChange={(value) => patch({ chatRetentionDays: value })}
          colors={colors}
        />
      </Card>

      {canEdit ? (
        <View style={styles.saveRow}>
          <TouchableOpacity
            nativeID="company-ai-save"
            onPress={save}
            disabled={busy || !dirty}
            style={[styles.btn, { backgroundColor: colors.brand }, (busy || !dirty) && styles.off]}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !dirty }}
          >
            <Text style={styles.btnText}>{busy ? 'Lagrer…' : 'Lagre AI-abonnement'}</Text>
          </TouchableOpacity>
          {saved ? <Text style={[styles.lead, { color: colors.muted }]}>Lagret.</Text> : null}
        </View>
      ) : (
        <Text style={[styles.lead, { color: colors.muted }]}>
          Du kan se forbruket. Eier, administrator eller den med Admin på AI-abonnement endrer rammene.
        </Text>
      )}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <Card title={`Forbruk denne måneden (${month})`} colors={colors}>
        <View nativeID="company-ai-usage" style={{ gap: 8 }}>
          <Text style={[styles.big, { color: colors.ink }]}>
            {summary.budgetNok > 0
              ? `${formatNok(summary.spentNok)} av ${formatNok(summary.budgetNok)}`
              : formatNok(summary.spentNok)}
          </Text>
          {summary.budgetNok > 0 ? (
            <View
              style={[styles.bar, { backgroundColor: colors.sunken }]}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.min(100, summary.percent) }}
            >
              <View
                style={[styles.barFill, {
                  width: `${Math.min(100, summary.percent)}%`,
                  backgroundColor: summary.percent >= 100 ? colors.danger : colors.brand,
                }]}
              />
            </View>
          ) : null}
          <Text style={[styles.hint, { color: colors.muted }]}>
            {`${summary.calls} svar · ${summary.inputTokens + summary.cachedInputTokens} tokens inn · ${summary.outputTokens} tokens ut`}
          </Text>
          {summary.users.length ? (
            <View style={{ gap: 4 }}>
              {summary.users.slice(0, 15).map((row) => (
                <View key={row.uid} style={styles.userRow}>
                  <Text style={[styles.lead, { color: colors.ink, flex: 1 }]} numberOfLines={1}>{row.name || 'Ukjent bruker'}</Text>
                  <Text style={[styles.lead, { color: colors.muted }]}>{`${row.calls} svar`}</Text>
                  <Text style={[styles.lead, { color: colors.ink, minWidth: 80, textAlign: 'right' }]}>{formatNok(row.costNok)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.lead, { color: colors.muted }]}>Ingen forbruk ennå.</Text>
          )}
        </View>
      </Card>

      <Text style={[styles.hint, { color: colors.muted }]}>
        {`Loggen lagrer bare tall per svar: hvem, modell, tokens og pris. Spørsmål, svar og filinnhold lagres ikke i loggen. Standard er ${DEFAULT_AI_PLAN.chatRetentionDays} dagers lagring av samtaler.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, maxWidth: 880 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '600' },
  lead: { fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 13, lineHeight: 18 },
  big: { fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: {
    borderWidth: 1, borderRadius: 999, minHeight: 36, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center', justifyContent: 'center',
  },
  off: { opacity: 0.5 },
  input: {
    borderWidth: 1, borderRadius: 10, minHeight: 44, paddingHorizontal: 12, fontSize: 15,
  },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: {
    alignSelf: 'flex-start', borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 8,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
