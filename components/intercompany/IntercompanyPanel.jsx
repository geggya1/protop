import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinkSettingsForm from './LinkSettingsForm';
import { useIntercompanyLinks } from '../../src/intercompany/useIntercompanyLinks';
import {
  answerLinkSettings, endLinkAgreement, requestLink, respondLink, saveLinkSettings, withdrawLinkRequest,
} from '../../src/intercompany/client';
import {
  isSameCompany, konsernChildren, normalizeLinkSettings, roleSentence, settingsSummary,
} from '../../src/intercompany/model';
import NumberSeriesPanel from './NumberSeriesPanel';
import { digitsOrgnr } from '../../src/project/companyRegistry';
import { findCompanyByOrgnr } from '../../src/project/companyLookupClient';

const ROLE_OPTIONS = [
  { id: 'partner', label: 'Samarbeidspartner / underentreprenør', hint: 'Et annet selskap dere jobber sammen med på prosjekter' },
  { id: 'child', label: 'Datterselskap', hint: 'De er vårt datterselskap i konsernet' },
  { id: 'parent', label: 'Morselskap', hint: 'De er vårt morselskap i konsernet' },
];

function Button({ label, onPress, colors, primary = false, danger = false, disabled = false, nativeID, icon = null }) {
  const bg = primary ? colors.brand : colors.card;
  const fg = primary ? colors.onBrand : (danger ? colors.danger : colors.ink);
  return (
    <Pressable
      nativeID={nativeID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, {
        backgroundColor: bg,
        borderColor: primary ? colors.brand : colors.line,
        opacity: disabled ? 0.55 : (pressed ? 0.85 : 1),
      }]}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function initials(name) {
  const words = String(name || '').replace(/\b(AS|ASA|ANS|DA|SA|BA)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
}

const STATUS_TONE = {
  active: 'success',
  pending: 'warn',
  declined: 'muted',
  withdrawn: 'muted',
  ended: 'muted',
};

function Pill({ text, tone, colors }) {
  const fg = tone === 'success' ? colors.successInk : tone === 'warn' ? colors.warnInk : tone === 'brand' ? colors.brandInk : colors.muted;
  const bg = tone === 'success' ? colors.successSoft : tone === 'warn' ? `${colors.warn}22` : tone === 'brand' ? colors.brandSoft : colors.sunken;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

function LinkRow({ link, colors, children, badge }) {
  return (
    <View style={[styles.row, { borderColor: link.incoming || link.settingsToAnswer ? colors.brand : colors.line, backgroundColor: colors.card }]}>
      <View style={styles.rowHead}>
        <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
          <Text style={{ color: colors.brandInk, fontWeight: '700', fontSize: 14 }}>{initials(link.partner.name)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{link.partner.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {[link.partnerRoleLabel, link.partner.orgnr ? `Org.nr. ${link.partner.orgnr}` : ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.pills}>
          {badge ? <Pill text={badge} tone="brand" colors={colors} /> : null}
          <Pill text={link.statusLabel} tone={STATUS_TONE[link.status] || 'muted'} colors={colors} />
        </View>
      </View>
      <View style={[styles.summary, { backgroundColor: colors.sunken }]}>
        <Ionicons name="pricetags-outline" size={14} color={colors.muted} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 13 }}>{`Omfatter: ${settingsSummary(link.settings)}`}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Prisen settes på hvert prosjekt.</Text>
        </View>
      </View>
      {link.message ? <Text style={{ color: colors.ink, fontSize: 13, fontStyle: 'italic' }}>«{link.message}»</Text> : null}
      {children}
    </View>
  );
}

/**
 * Tilknyttede selskaper: forespørsler som venter på oss, våre forespørsler, aktive avtaler med
 * priser, og ny forespørsel. Brukes på Bedrift → Underenheter. canEdit: Admin på underenheter.
 * legacy: selskaper som er koblet med den gamle koblingen uten godkjenning (parentCompanyId/subUnits).
 */
export default function IntercompanyPanel({ familyId, family = null, colors, canEdit, actorName = '', legacy = [] }) {
  const { links, groups, ready, error: loadError } = useIntercompanyLinks(familyId, family);
  const own = useMemo(() => ({ ...(family || {}), id: familyId }), [family, familyId]);
  const konsern = useMemo(() => {
    const children = konsernChildren(links, familyId, family);
    if (!children.length) return [];
    return [{ id: familyId, name: family?.company?.navn || family?.name || 'Vårt selskap' }, ...children];
  }, [links, familyId, family]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [composing, setComposing] = useState(false);
  const [orgnr, setOrgnr] = useState('');
  const [role, setRole] = useState('partner');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(() => normalizeLinkSettings({}));
  const [editingId, setEditingId] = useState('');
  const [editDraft, setEditDraft] = useState(null);
  const [found, setFound] = useState(null);

  // Slå opp org.nr. mens det skrives, så brukeren ser hvilket selskap forespørselen går til.
  useEffect(() => {
    const number = digitsOrgnr(orgnr);
    setFound(null);
    if (number.length !== 9) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      findCompanyByOrgnr(number)
        .then((company) => { if (alive) setFound(company ? { ...company, orgnr: number } : { missing: true, orgnr: number }); })
        .catch(() => { if (alive) setFound(null); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [orgnr]);

  const linkedIds = useMemo(() => new Set([
    ...groups.active, ...groups.incoming, ...groups.outgoing,
  ].map((row) => row.partner.id)), [groups]);
  // Selskapet selv (samme org.nr. eller en underenhet av oss) skal aldri bli bedt om å knyttes til.
  const unconfirmed = (legacy || []).filter((row) => (
    row?.companyId && !isSameCompany(own, row) && !linkedIds.has(row.companyId)
  ));
  const foundIsUs = !!found && isSameCompany(own, { orgnr: found.orgnr, name: found.name });

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
    if (isSameCompany(own, { orgnr: number })) {
      setError('Det er organisasjonsnummeret til dette selskapet. Et selskap kan ikke knyttes til seg selv.');
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

  function removeSelfLink(link) {
    const job = link.status === 'active'
      ? () => endLinkAgreement({ companyId: familyId, linkId: link.id })
      : link.outgoing
        ? () => withdrawLinkRequest({ companyId: familyId, linkId: link.id })
        : () => respondLink({ companyId: familyId, linkId: link.id, accept: false, actorName });
    return run(link.id, job, 'Koblingen er fjernet.');
  }

  const nothing = ready && !groups.self.length && !groups.incoming.length && !groups.outgoing.length && !groups.active.length && !unconfirmed.length;

  return (
    <View style={styles.block} nativeID="intercompany-panel">
      <View style={[styles.intro, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name="git-network-outline" size={20} color={colors.brandInk} />
        <Text style={[styles.lead, { color: colors.ink, flex: 1 }]}>
          Del folk og prosjekter med samarbeidspartnere, underentreprenører og selskaper i konsernet. Timer og utlegg føres
          hos arbeidsgiveren og vises hos begge. Arbeidsgiveren godkjenner og fakturerer prosjekteier, som fakturerer sluttkunden.
        </Text>
      </View>
      {!ready ? <ActivityIndicator color={colors.brand} /> : null}
      {loadError ? <Text style={{ color: colors.danger }}>{loadError}</Text> : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}

      {groups.self.map((link) => (
        <View key={link.id} nativeID={`ic-self-${link.id}`} style={[styles.row, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={styles.rowHead}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.warnInk} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{link.partner.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {[link.partner.orgnr ? `Org.nr. ${link.partner.orgnr}` : '', 'Samme selskap som dere'].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Dette er dere selv, så det er ingen avtale å ha. Fjern koblingen.
          </Text>
          {canEdit ? (
            <View style={styles.actions}>
              <Button nativeID={`ic-self-remove-${link.id}`} danger label="Fjern koblingen" colors={colors} disabled={!!busyId} onPress={() => removeSelfLink(link)} />
            </View>
          ) : null}
        </View>
      ))}

      {groups.incoming.map((link) => (
        <LinkRow key={link.id} link={link} colors={colors} badge="Svar trengs">
          <Text style={{ color: colors.ink, fontSize: 13 }}>
            {`«${link.partner.name}» vil knyttes til dere ${roleSentence(link)}${link.requestedByName ? ` (sendt av ${link.requestedByName})` : ''}.`}
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
        <LinkRow key={link.id} link={link} colors={colors} badge="Sendt av dere">
          <Text style={{ color: colors.muted, fontSize: 13 }}>Venter på at «{link.partner.name}» godkjenner.</Text>
          {canEdit ? (
            <View style={styles.actions}>
              <Button label="Trekk tilbake" colors={colors} disabled={!!busyId} onPress={() => run(link.id, () => withdrawLinkRequest({ companyId: familyId, linkId: link.id }), 'Forespørselen er trukket tilbake.')} />
            </View>
          ) : null}
        </LinkRow>
      ))}

      {groups.active.map((link) => (
        <LinkRow key={link.id} link={link} colors={colors} badge={link.settingsToAnswer ? 'Endring foreslått' : null}>
          {link.pendingSettings ? (
            <View style={[styles.proposal, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontSize: 13 }}>
                {link.settingsProposedByUs
                  ? `Dere har foreslått en endring i avtalen: ${settingsSummary(link.pendingSettings.settings)}. Venter på «${link.partner.name}».`
                  : `«${link.partner.name}» foreslår en endring i avtalen: ${settingsSummary(link.pendingSettings.settings)}.`}
              </Text>
              {canEdit ? (
                <View style={styles.actions}>
                  {link.settingsToAnswer ? (
                    <Button nativeID={`ic-prices-accept-${link.id}`} primary label="Godta endringen" colors={colors} disabled={!!busyId} onPress={() => run(link.id, () => answerLinkSettings({ companyId: familyId, linkId: link.id, accept: true }), 'Endringen i avtalen er godtatt.')} />
                  ) : null}
                  <Button label={link.settingsToAnswer ? 'Avslå' : 'Trekk forslaget'} colors={colors} disabled={!!busyId} onPress={() => run(link.id, () => answerLinkSettings({ companyId: familyId, linkId: link.id, accept: false }), 'Avtalen står som før.')} />
                </View>
              ) : null}
            </View>
          ) : null}
          {editingId === link.id ? (
            <>
              <LinkSettingsForm value={editDraft} onChange={setEditDraft} colors={colors} disabled={busyId === link.id} ourCompanyId={familyId} />
              <View style={styles.actions}>
                <Button primary label={busyId === link.id ? 'Sender…' : 'Foreslå endring'} colors={colors} disabled={!!busyId} onPress={async () => {
                  const out = await run(link.id, () => saveLinkSettings({ companyId: familyId, linkId: link.id, settings: editDraft }), `Forslaget er sendt. Endringen gjelder når «${link.partner.name}» har godtatt den.`);
                  if (out) setEditingId('');
                }} />
                <Button label="Avbryt" colors={colors} disabled={!!busyId} onPress={() => setEditingId('')} />
              </View>
            </>
          ) : canEdit ? (
            <View style={styles.actions}>
              <Button nativeID={`ic-edit-${link.id}`} label="Endre avtalen" colors={colors} disabled={!!busyId} onPress={() => { setEditingId(link.id); setEditDraft(link.settings); }} />
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
          <Button nativeID="ic-new" primary icon="add" label="Knytt til selskap" colors={colors} onPress={() => setComposing(true)} />
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
          {foundIsUs ? (
            <View style={styles.found} nativeID="ic-found-self">
              <Ionicons name="alert-circle-outline" size={16} color={colors.warnInk} />
              <Text style={{ color: colors.muted, fontSize: 13 }}>Det er dette selskapet. Et selskap kan ikke knyttes til seg selv.</Text>
            </View>
          ) : found?.name ? (
            <View style={styles.found} nativeID="ic-found">
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={{ color: colors.ink, fontSize: 13 }}>{`${found.name} finnes i ProTop`}</Text>
            </View>
          ) : null}
          {found?.missing ? (
            <View style={styles.found}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warnInk} />
              <Text style={{ color: colors.muted, fontSize: 13 }}>Selskapet er ikke registrert i ProTop ennå. Det må opprettes før det kan knyttes til.</Text>
            </View>
          ) : null}
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
            <Button nativeID="ic-send" primary icon="paper-plane-outline" label={busyId === 'new' ? 'Sender…' : 'Send forespørsel'} colors={colors} disabled={!!busyId || !!found?.missing || foundIsUs} onPress={send} />
            <Button label="Avbryt" colors={colors} disabled={!!busyId} onPress={() => setComposing(false)} />
          </View>
        </View>
      ) : null}

      <NumberSeriesPanel familyId={familyId} family={family} companies={konsern} canEdit={canEdit} colors={colors} />

      {groups.closed.length ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {`Tidligere: ${groups.closed.slice(0, 5).map((row) => `${row.partner.name} (${row.statusLabel.toLowerCase()})`).join(', ')}`}
        </Text>
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  block: { gap: 12, maxWidth: 920 },
  intro: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, padding: 14 },
  lead: { fontSize: 14, lineHeight: 20 },
  row: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  found: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', gap: 6, borderWidth: 1, borderRadius: 12, minHeight: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  proposal: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  label: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
