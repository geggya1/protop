import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { controlMeasuresSummary } from '../../src/hr/controlMeasures';
import { loadControlMeasures, saveControlMeasures } from '../../src/hr/controlMeasuresStorage';
import { formatNbDate, localIsoDate } from '../../src/hr/model';
import { showSaveToast } from '../../src/ui/saveToast';
import { type } from '../../src/ui/tokens';
import { lazyScreen } from '../../src/ui/lazyScreen';
const HrButton = lazyScreen(() => import('./HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrCard = lazyScreen(() => import('./HrShared'), { name: 'HrCard', pick: 'HrCard', silent: true });
const HrChip = lazyScreen(() => import('./HrShared'), { name: 'HrChip', pick: 'HrChip', silent: true });
const HrField = lazyScreen(() => import('./HrShared'), { name: 'HrField', pick: 'HrField', silent: true });
const HrSectionTitle = lazyScreen(() => import('./HrShared'), { name: 'HrSectionTitle', pick: 'HrSectionTitle', silent: true });

/** Register over kontrolltiltak etter aml kap. 9 (brukslogg, produktivitet, AI-kontroll). HR → Lovpålagt. */
export default function ControlMeasuresCard({ colors, familyId, canWrite }) {
  const [settings, setSettings] = useState(null);
  const [openId, setOpenId] = useState('');
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    let live = true;
    loadControlMeasures(familyId).then((next) => { if (live) setSettings(next); });
    return () => { live = false; };
  }, [familyId]);

  if (!settings) return null;
  const summary = controlMeasuresSummary(settings, { today: localIsoDate() });

  function open(row) {
    setOpenId(row.id);
    setDraft({ ...settings.measures[row.id] });
  }

  async function save() {
    const next = { ...settings, measures: { ...settings.measures, [openId]: draft } };
    try {
      const saved = await saveControlMeasures(familyId, next);
      setSettings(saved);
      setOpenId('');
      showSaveToast?.('Kontrolltiltaket er lagret.');
    } catch {
      showSaveToast?.('Kunne ikke lagre kontrolltiltaket.');
    }
  }

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-kontrolltiltak" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Kontrolltiltak"
          subtitle="Brukslogg, produktivitet og AI-kontroll av timelister er kontrolltiltak (arbeidsmiljøloven kap. 9). De krever saklig grunn, drøfting med tillitsvalgte, informasjon til de ansatte før start og jevnlig evaluering."
        />
        {summary.rows.map((row) => (
          <View key={row.id} style={[styles.item, { borderTopColor: colors.line }]}>
            <Text style={[styles.label, { color: colors.ink }]}>{`${row.label}${row.enabled ? '' : ' (ikke i bruk)'}`}</Text>
            <Text style={[styles.line, { color: colors.muted }]}>{row.collects}</Text>
            {row.gaps.map((gap) => (
              <Text key={gap} style={[styles.line, { color: colors.warnInk || colors.warn }]}>{gap}</Text>
            ))}
            {!row.gaps.length && row.enabled ? (
              <Text style={[styles.line, { color: colors.successInk || colors.muted }]}>
                {`Drøftet ${formatNbDate(row.discussedAt)} · informert ${formatNbDate(row.informedAt)}${row.evaluatedAt ? ` · evaluert ${formatNbDate(row.evaluatedAt)}` : ''}`}
              </Text>
            ) : null}
            {canWrite && openId !== row.id ? (
              <View style={styles.row}>
                <HrButton colors={colors} label="Dokumenter" icon="create-outline" onPress={() => open(row)} />
              </View>
            ) : null}
            {openId === row.id && draft ? (
              <View style={styles.stack}>
                {row.id === 'usage' ? (
                  <Text style={[styles.line, { color: colors.muted }]}>{`Loggen slettes etter ${row.retentionDays} dager. Den slås av og på under Selskapsinnstillinger → Personvern.`}</Text>
                ) : (
                  <View style={styles.row}>
                    <HrChip colors={colors} label="I bruk" active={draft.enabled} onPress={() => set({ enabled: true })} />
                    <HrChip colors={colors} label="Ikke i bruk" active={!draft.enabled} onPress={() => set({ enabled: false })} />
                  </View>
                )}
                <HrField colors={colors} label="Formål" value={draft.purpose} onChangeText={(purpose) => set({ purpose })} multiline />
                <HrField colors={colors} label="Saklig grunn, og hvorfor belastningen er forholdsmessig (§ 9-1)" value={draft.justification} onChangeText={(justification) => set({ justification })} multiline />
                <View style={styles.row}>
                  <View style={styles.field}><HrField colors={colors} label="Drøftet med tillitsvalgte" date="iso" clearable value={draft.discussedAt} onChangeText={(discussedAt) => set({ discussedAt })} /></View>
                  <View style={styles.field}><HrField colors={colors} label="Drøftet med" value={draft.discussedWith} onChangeText={(discussedWith) => set({ discussedWith })} /></View>
                </View>
                <View style={styles.row}>
                  <View style={styles.field}><HrField colors={colors} label="Ansatte informert" date="iso" clearable value={draft.informedAt} onChangeText={(informedAt) => set({ informedAt })} /></View>
                  <View style={styles.field}><HrField colors={colors} label="Sist evaluert" date="iso" clearable value={draft.evaluatedAt} onChangeText={(evaluatedAt) => set({ evaluatedAt })} /></View>
                </View>
                <View style={styles.row}>
                  <HrButton colors={colors} label="Lagre" primary onPress={save} />
                  <HrButton colors={colors} label="Avbryt" onPress={() => setOpenId('')} />
                </View>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  label: { ...type.bodyStrong },
  line: { ...type.label, fontWeight: '400' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, flexBasis: 180 },
});

/** Informasjonsplikten i aml § 9-2 (2): den ansatte ser hva som registreres og hvorfor. Min side. */
export function EmployeeControlMeasures({ colors, companyId }) {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let live = true;
    if (!companyId) return undefined;
    loadControlMeasures(companyId).then((next) => { if (live) setSettings(next); });
    return () => { live = false; };
  }, [companyId]);

  const active = settings ? controlMeasuresSummary(settings).rows.filter((row) => row.enabled) : [];
  if (!active.length) return null;
  return (
    <HrCard colors={colors}>
      <View nativeID="employee-kontrolltiltak" style={styles.stack}>
        <HrSectionTitle colors={colors} title="Dette registreres om deg" subtitle="Kontrolltiltak etter arbeidsmiljøloven kapittel 9" />
        {active.map((row) => (
          <View key={row.id} style={{ gap: 2 }}>
            <Text style={[styles.label, { color: colors.ink }]}>{row.label}</Text>
            <Text style={[styles.line, { color: colors.muted }]}>
              {`${row.collects} Formål: ${row.purpose}${row.retentionDays ? ` Slettes etter ${row.retentionDays} dager.` : ''}`}
            </Text>
          </View>
        ))}
      </View>
    </HrCard>
  );
}
