/**
 * Kontroll og kalibrering på utstyr (ISO 9001 7.1.5, sakkyndig kontroll og EU-kontroll).
 * ControlsEditor ligger i registreringsskjemaet. ControlStatus vises på utstyrskortet med frist,
 * sertifikat, siste kontroller og «Registrer kontroll». Når fristen er passert, kan utstyret ikke reserveres.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CONTROL_KINDS, controlKind } from '../../src/equipment/catalog';
import { addMonthsKey, controlBlocking, gearControls } from '../../src/equipment/model';
import { createId } from '../../src/project/engine';
import { radius, type } from '../../src/ui/tokens';
import DateInput from '../../components/DateInput';

const STATE_TEXT = { forfalt: 'Forfalt', snart: 'Forfaller snart', ok: 'OK', mangler: 'Mangler frist' };

function pretty(key) {
  const [y, m, d] = String(key || '').split('-');
  return d ? `${d}.${m}.${y}` : '';
}

function Input({ label, value, onChange, colors, placeholder, keyboardType, nativeID, date, clearable }) {
  return (
    <View style={{ minWidth: 120, flexGrow: 1, flexBasis: 140 }}>
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>{label}</Text>
      {date ? (
        <DateInput value={value} onChange={onChange} format="iso" placeholder={placeholder} clearable={clearable} nativeID={nativeID} accessibilityLabel={label} />
      ) : (
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType || 'default'}
          nativeID={nativeID}
          accessibilityLabel={label}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
      )}
    </View>
  );
}

function Chip({ label, active, onPress, colors }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={[styles.chip, { borderColor: active ? colors.brand : colors.line, backgroundColor: active ? `${colors.brand}18` : colors.card }]}>
      <Text style={[type.caption, { color: colors.ink }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Kontrollene i registreringsskjemaet. Neste frist regnes fra sist kontrollert + intervall, og kan overstyres. */
export function ControlsEditor({ gear, setGear, colors }) {
  const controls = Array.isArray(gear.controls) ? gear.controls : [];
  const patch = (id, change) => setGear((row) => ({
    ...row,
    controls: (row.controls || []).map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, ...change };
      if (('last' in change || 'intervalMonths' in change) && next.last && Number(next.intervalMonths) > 0) {
        next.next = addMonthsKey(next.last, Number(next.intervalMonths)) || next.next;
      }
      return next;
    }),
  }));
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>Kontroll og kalibrering</Text>
      <TouchableOpacity
        onPress={() => setGear((row) => ({ ...row, measuring: !row.measuring }))}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!gear.measuring }}
      >
        <Text style={{ color: colors.ink }}>{gear.measuring ? '☑' : '☐'} Måleutstyr som må kalibreres (ISO 9001 7.1.5)</Text>
      </TouchableOpacity>
      {controls.map((c) => (
        <View key={c.id} style={[styles.box, { borderColor: colors.line }]}>
          <View style={styles.row}>
            {CONTROL_KINDS.map((k) => <Chip key={k.id} label={k.label} active={c.kind === k.id} onPress={() => patch(c.id, { kind: k.id })} colors={colors} />)}
          </View>
          <Text style={{ color: colors.muted, fontSize: 11 }}>{controlKind(c.kind).hint}</Text>
          <View style={styles.row}>
            <Input label="Intervall (måneder)" value={c.intervalMonths ? String(c.intervalMonths) : ''} onChange={(v) => patch(c.id, { intervalMonths: v.replace(/[^0-9]/g, '') })} colors={colors} placeholder="12" keyboardType="number-pad" />
            <Input label="Sist kontrollert" value={c.last || ''} onChange={(v) => patch(c.id, { last: v })} colors={colors} date clearable />
            <Input label="Neste frist" value={c.next || ''} onChange={(v) => patch(c.id, { next: v })} colors={colors} placeholder="Regnes ut" date clearable />
          </View>
          <View style={styles.row}>
            <Input label="Sertifikat (nr. eller lenke)" value={c.certificate || ''} onChange={(v) => patch(c.id, { certificate: v })} colors={colors} placeholder="https:// eller nr." />
            <Input label="Kontrollert av" value={c.by || ''} onChange={(v) => patch(c.id, { by: v })} colors={colors} placeholder="Firma eller person" />
          </View>
          <TouchableOpacity onPress={() => setGear((row) => ({ ...row, controls: (row.controls || []).filter((x) => x.id !== c.id) }))} accessibilityRole="button">
            <Text style={{ color: colors.dangerInk || colors.danger, fontSize: 12 }}>Fjern kontrollen</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        onPress={() => setGear((row) => ({ ...row, controls: [...(row.controls || []), { id: createId('ktr'), kind: row.measuring ? 'kalibrering' : 'sakkyndig', intervalMonths: 12, last: '', next: '', certificate: '', by: '' }] }))}
        style={[styles.btnGhost, { borderColor: colors.line, alignSelf: 'flex-start' }]}
        accessibilityRole="button"
        nativeID="equipment-add-control"
      >
        <Text style={{ color: colors.ink }}>Legg til kontroll</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Status på utstyrskortet. onRecord(controlId, input) registrerer en gjennomført kontroll; med resultat
 * «Avvik» meldes en sak koblet til utstyret.
 */
export function ControlStatus({ gear, colors, canManage, onRecord, busy = false }) {
  const [form, setForm] = useState(null);
  const controls = gearControls(gear);
  const blocked = controlBlocking(gear);
  if (!controls.length && !gear.measuring) return null;
  const tone = (s) => (s === 'forfalt' ? (colors.dangerInk || colors.danger) : (s === 'snart' ? (colors.warnInk || colors.warn) : colors.muted));
  return (
    <View style={{ gap: 4 }}>
      {gear.measuring && !controls.length ? <Text style={{ color: colors.warnInk || colors.warn, fontSize: 12 }}>Måleutstyr uten kalibrering registrert.</Text> : null}
      {blocked ? <Text style={{ color: colors.dangerInk || colors.danger, fontSize: 12, fontWeight: '700' }}>Sperret for reservasjon: {blocked.label.toLowerCase()} forfalt {pretty(blocked.next)}.</Text> : null}
      {controls.map((c) => {
        const last = c.log.at(-1);
        return (
          <View key={c.id} style={{ gap: 2 }}>
            <Text style={{ color: tone(c.state), fontSize: 12 }}>
              {c.label}: {c.next ? `neste ${pretty(c.next)}` : 'ingen frist'} · {STATE_TEXT[c.state]}
              {c.last ? ` · sist ${pretty(c.last)}` : ''}{c.certificate ? ` · sertifikat ${c.certificate}` : ''}
            </Text>
            {last?.result === 'avvik' ? (
              <Text style={{ color: colors.dangerInk || colors.danger, fontSize: 12 }}>Avvik {pretty(last.date)}: {last.note}{last.findingNumber ? ` · sak ${last.findingNumber}` : ''}</Text>
            ) : null}
            {canManage && form?.controlId !== c.id ? (
              <TouchableOpacity onPress={() => setForm({ controlId: c.id, date: new Date().toISOString().slice(0, 10), result: 'godkjent', certificate: '', by: '', note: '' })} accessibilityRole="button">
                <Text style={[type.caption, { color: colors.brand }]}>Registrer {c.label.toLowerCase()}</Text>
              </TouchableOpacity>
            ) : null}
            {form?.controlId === c.id ? (
              <View style={[styles.box, { borderColor: colors.line }]}>
                <View style={styles.row}>
                  <Input label="Dato" value={form.date} onChange={(v) => setForm({ ...form, date: v })} colors={colors} date />
                  <Input label="Sertifikat (nr. eller lenke)" value={form.certificate} onChange={(v) => setForm({ ...form, certificate: v })} colors={colors} />
                  <Input label="Kontrollert av" value={form.by} onChange={(v) => setForm({ ...form, by: v })} colors={colors} />
                </View>
                <View style={styles.row}>
                  <Chip label="Godkjent" active={form.result === 'godkjent'} onPress={() => setForm({ ...form, result: 'godkjent' })} colors={colors} />
                  <Chip label="Avvik" active={form.result === 'avvik'} onPress={() => setForm({ ...form, result: 'avvik' })} colors={colors} />
                </View>
                {form.result === 'avvik' ? (
                  <>
                    <Input label="Hva var feil?" value={form.note} onChange={(v) => setForm({ ...form, note: v })} colors={colors} placeholder="F.eks. måler 4 mm feil på 50 m" />
                    <Text style={[type.caption, { color: colors.muted }]}>Avviket meldes som sak i ISO, koblet til utstyret, så målinger siden forrige kontroll kan vurderes.</Text>
                  </>
                ) : null}
                <View style={styles.row}>
                  <TouchableOpacity
                    onPress={async () => { const ok = await onRecord(c.id, form); if (ok) setForm(null); }}
                    disabled={busy}
                    style={[styles.btn, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.onBrand, fontWeight: '600' }}>{form.result === 'avvik' ? 'Lagre og meld avvik' : 'Lagre kontroll'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setForm(null)} style={[styles.btnGhost, { borderColor: colors.line }]} accessibilityRole="button">
                    <Text style={{ color: colors.ink }}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  chip: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  btn: { borderRadius: radius.control, paddingHorizontal: 14, paddingVertical: 10 },
  btnGhost: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 9 },
  box: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
});
