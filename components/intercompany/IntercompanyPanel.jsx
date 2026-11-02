import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinkSettingsForm from './LinkSettingsForm';
import { useIntercompanyLinks } from '../../src/intercompany/useIntercompanyLinks';
import {
  endLinkAgreement, requestLink, respondLink, saveLinkSettings, withdrawLinkRequest,
} from '../../src/intercompany/client';
import { normalizeLinkSettings, settingsSummary } from '../../src/intercompany/model';
import { digitsOrgnr } from '../../src/project/companyRegistry';

const ROLE_OPTIONS = [
  { id: 'child', label: 'Datterselskap', hint: 'De er vårt datterselskap' },
  { id: 'parent', label: 'Morselskap', hint: 'De er vårt morselskap' },
];

function Button({ label, onPress, colors, primary = false, danger = false, disabled = false, nativeID }) {
  const bg = primary ? colors.brand : colors.sunken;
  const fg = primary ? '#fff' : (danger ? colors.danger : colors.ink);
  return (
    <Pressable
      nativeID={nativeID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.6 : 1 }]}
    >
      <Text style={{ color: fg, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

function LinkRow({ link, colors, children, badge }) {
  return (
    <View style={[styles.row, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.rowHead}>
        <Ionicons name="git-merge-outline" size={18} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{link.partner.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {[link.partnerRoleLabel, link.partner.orgnr, link.statusLabel].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: colors.brandSoft }]}>
            <Text style={{ color: colors.brand, fontSize: 12 }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{settingsSummary(link.settings)}</Text>
      {link.message ? <Text style={{ color: colors.ink, fontSize: 13 }}>«{link.message}»</Text> : null}
      {children}
    </View>
  );
}

/**
 * Tilknyttede selskaper: forespørsler som venter på oss, våre forespørsler, aktive avtaler med
 * priser, og ny forespørsel. Brukes på Bedrift → Underenheter. canEdit: Admin på underenheter.
 * legacy: selskaper som er koblet med den gamle koblingen uten godkjenning (parentCompanyId/subUnits).
 */
export default function IntercompanyPanel({ familyId, colors, canEdit, actorName = '', legacy = [] }) {
  const { groups, ready, error: loadError } = useIntercompanyLinks(familyId);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [composing, setComposing] = useState(false);
  const [orgnr, setOrgnr] = useState('');
  const [role, setRole] = useState('child');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(() => normalizeLinkSettings({}));
  const [editingId, setEditingId] = useState('');
  const [editDraft, setEditDraft] = useState(null);

  const linkedIds = useMemo(() => new Set([
    ...groups.active, ...groups.incoming, ...groups.outgoing,
  ].map((row) => row.partner.id)), [groups]);
  const unconfirmed = (legacy || []).filter((row) => row?.companyId && row.companyId !== familyId && !linkedIds.has(row.companyId));

  async function run(id, job, done = '') {
    setBusyId(id);
    setError('');
    setNote('');
    try {
      const out = await job();
      if (done) setNote(typeof done === 'function' ? done(out) : done);
      return out;
    } catch (cause) {
      setError(cause?.message || 'Noe gikk galt.');
      return null;
    } finally {
      setBusyId('');
    }
  }

  async function send() {
    const number = digitsOrgnr(orgnr);
    if (number.length !== 9) {
      setError('Oppgi organisasjonsnummeret med ni siffer.');
      return;
    }
    const out = await run('new', () => requestLink({ companyId: familyId, orgnr: number, role, settings: draft, message, actorName }), (res) => (
      res?.already
        ? 'Det finnes allerede en tilknytning eller forespørsel med dette selskapet.'
        : (res?.autoAccepted ? 'Tilknytningen er aktiv. Du er administrator i begge selskapene.' : 'Forespørselen er sendt. Det andre selskapet må godkjenne den.')
    ));
    if (out) {
      setComposing(false);
      setOrgnr('');
      setMessage('');
      setDraft(normalizeLinkSettings({}));
    }
  }

  function confirmLegacy(row) {
    return run(`legacy-${row.companyId}`, () => requestLink({
      companyId: familyId, targetCompanyId: row.companyId, role: row.role, actorName,
    }), (res) => (res?.autoAccepted ? 'Tilknytningen er bekreftet.' : 'Forespørselen er sendt til det andre selskapet.'));
  }

  const nothing = ready && !groups.incoming.length && !groups.outgoing.length && !groups.active.length && !unconfirmed.length;

  return (
    <View style={styles.block} nativeID="intercompany-panel">
      <Text style={[styles.lead, { color: colors.muted }]}>
        Tilknyttede selskaper kan tildele medarbeidere på hverandres prosjekter. Timer, produktsalg og utleie
        føres hos selskapet som leverer, godkjennes der, og går deretter til godkjenning og fakturering hos prosjekteier.
      </Text>
      {!ready ? <ActivityIndicator color={colors.brand} /> : null}
      {loadError ? <Text style={{ color: colors.danger }}>{loadError}</Text> : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}

      {groups.incoming.map((link) => (
        <LinkRow key={link.id} link={link} colors={colors} badge="Venter på dere">
          <Text style={{ color: colors.ink, fontSize: 13 }}>
            {`${link.requestedByName || link.partner.name} vil knytte selskapene sammen. «${link.partner.name}» blir ${link.partnerRole === 'parent' ? 'morselskap' : 'datterselskap'} til dere.`}
          </Text>
          {canEdit ? (
            <View style={styles.actions}>
              <Button nativeID={`ic-accept-${link.id}`} primary label="Godta" colors={colors} disabled={!!busyId} onPress={() => run(link.id, () => respondLink({ companyId: familyId, linkId: link.id, accept: true, actorName }), 'Tilknytningen er godkjent.')} />
              <Button nativeID={`ic-decline-${link.id}`} danger label="Avslå" colors={colors} disabled={!!busyId} onPress={() => run(link.id, () => respondLink({ companyId: familyId, linkId: link.id, accept: false, actorName }), 'Forespørselen er avslått.')} />
            </View>
          ) : <Text style={{ color: colors.muted, fontSize: 12 }}>En administrator må godkjenne.</Text>}
        </LinkRow>
      ))}

      {groups.outgoing.map((link) => (
        <LinkRow key={link.id} link={link} colors={colors} badge="Sendt">
          <Text style={{ color: colors.muted, fontSize: 13 }}>Venter på at «{link.partner.name}» godkjenner.</Text>
          {canEdit ? (
            <View style={styles.actions}>
              <Button label="Trekk tilbake" colors={colors} disabled={!!busyId} onPress={() => run(link.id, () => withdrawLinkRequest({ companyId: familyId, linkId: link.id }), 'Forespørselen er trukket tilbake.')} />
            </View>
          ) : null}
        </LinkRow>
      ))}

      {groups.active.map((link) => (
        <LinkRow key={link.id} link={link} colors={colors}>
          {editingId === link.id ? (
            <>
              <LinkSettingsForm value={editDraft} onChange={setEditDraft} colors={colors} disabled={busyId === link.id} ourCompanyId={familyId} />
              <View style={styles.actions}>
                <Button primary label={busyId === link.id ? 'Lagrer…' : 'Lagre priser'} colors={colors} disabled={!!busyId} onPress={async () => {
                  const out = await run(link.id, () => saveLinkSettings({ companyId: familyId, linkId: link.id, settings: editDraft }), 'Prisene er lagret. Prosjektkopiene får de nye prisene.');
                  if (out) setEditingId('');
                }} />
                <Button label="Avbryt" colors={colors} disabled={!!busyId} onPress={() => setEditingId('')} />
              </View>
            </>
          ) : canEdit ? (
            <View style={styles.actions}>
              <Button nativeID={`ic-edit-${link.id}`} label="Endre priser" colors={colors} disabled={!!busyId} onPress={() => { setEditingId(link.id); setEditDraft(link.settings); }} />
              <Button danger label="Avslutt avtalen" colors={colors} disabled={!!busyId} onPress={() => run(link.id, () => endLinkAgreement({ companyId: familyId, linkId: link.id }), 'Avtalen er avsluttet.')} />
            </View>
          ) : null}
        </LinkRow>
      ))}

      {unconfirmed.map((row) => (
        <View key={row.companyId} style={[styles.row, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={styles.rowHead}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {`${row.role === 'parent' ? 'Morselskap' : 'Datterselskap'} · koblet uten godkjenning`}
              </Text>
            </View>
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Koblingen er ikke bekreftet av det andre selskapet. Send en forespørsel for å ta i bruk felles prosjekter og fakturering.
          </Text>
          {canEdit ? (
            <View style={styles.actions}>
              <Button label="Send forespørsel" colors={colors} disabled={!!busyId} onPress={() => confirmLegacy(row)} />
            </View>
          ) : null}
        </View>
      ))}

      {nothing ? <Text style={{ color: colors.muted }}>Ingen tilknyttede selskaper ennå.</Text> : null}

      {canEdit && !composing ? (
        <View style={styles.actions}>
          <Button nativeID="ic-new" primary label="Knytt til selskap" colors={colors} onPress={() => setComposing(true)} />
        </View>
      ) : null}

      {canEdit && composing ? (
        <View style={[styles.row, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="ic-compose">
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Ny tilknytning</Text>
          <Text style={[styles.label, { color: colors.muted }]}>Organisasjonsnummer</Text>
          <TextInput
            nativeID="ic-orgnr"
            value={orgnr}
            onChangeText={setOrgnr}
            placeholder="9 siffer"
            keyboardType="number-pad"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <Text style={[styles.label, { color: colors.muted }]}>Selskapet er vårt</Text>
          <View style={styles.actions}>
            {ROLE_OPTIONS.map((row) => {
              const on = row.id === role;
              return (
                <Pressable
                  key={row.id}
                  nativeID={`ic-role-${row.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setRole(row.id)}
                  style={[styles.choice, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
                >
                  <Text style={{ color: on ? colors.brand : colors.ink }}>{row.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <LinkSettingsForm value={draft} onChange={setDraft} colors={colors} disabled={busyId === 'new'} ourCompanyId={familyId} />
          <Text style={[styles.label, { color: colors.muted }]}>Melding (valgfritt)</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="F.eks. avtalen fra styremøtet i oktober"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <View style={styles.actions}>
            <Button nativeID="ic-send" primary label={busyId === 'new' ? 'Sender…' : 'Send forespørsel'} colors={colors} disabled={!!busyId} onPress={send} />
            <Button label="Avbryt" colors={colors} disabled={!!busyId} onPress={() => setComposing(false)} />
          </View>
        </View>
      ) : null}

      {groups.closed.length ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {`Tidligere: ${groups.closed.slice(0, 5).map((row) => `${row.partner.name} (${row.statusLabel.toLowerCase()})`).join(', ')}`}
        </Text>
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  block: { gap: 10 },
  lead: { fontSize: 14, lineHeight: 20 },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { borderRadius: 12, minHeight: 38, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  label: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
