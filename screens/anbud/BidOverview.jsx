import React, { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showSaveToast } from '../../src/ui/saveToast';
import { STAGE_LABELS } from '../../src/anbud/lifecycle';
import {
  bidTeam,
  competitionTimeline,
  countdownParts,
  fileTypeLabel,
  qaOverview,
  shortDate,
  workProgress,
} from '../../src/anbud/bidOverview';

const TYPE_COLORS = {
  PDF: '#dc2626',
  DOC: '#2563eb',
  DOCX: '#2563eb',
  XLS: '#16a34a',
  XLSX: '#16a34a',
  ZIP: '#7c3aed',
};

function openUrl(url) {
  if (url) Linking.openURL(url).catch(() => {});
}

async function shareLink(url, title) {
  if (!url) return;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showSaveToast('Lenken er kopiert.');
    } catch {
      showSaveToast('Kunne ikke kopiere lenken.');
    }
    return;
  }
  Share.share({ message: url, url, title }).catch(() => {});
}

/**
 * Oversikten i tilbudsarbeidet: frister, grunnlag, vårt tilbud, spørsmål og svar og hvem som er med.
 * Hvert kort leder videre til fanen der arbeidet gjøres.
 */
export default function BidOverview({
  bid, dossier, notice, colors, noticeUrl, source, place, groundFiles = [], busy, aiBusy,
  onRefresh, onGoStep, onSuggest, onOpenSettings,
}) {
  const stage = bid.stage || 'planlegging';
  const progress = workProgress(bid);
  const qa = qaOverview(dossier, bid);
  const team = bidTeam(bid);
  const timeline = competitionTimeline({ bid, dossier, notice });
  const facts = [
    { id: 'buyer', icon: 'business-outline', label: 'Oppdragsgiver', value: bid.buyer || dossier.buyer },
    { id: 'contact', icon: 'person-outline', label: 'Kontaktperson', value: dossier.contactName },
    { id: 'place', icon: 'location-outline', label: 'Sted', value: place },
    { id: 'reference', icon: 'pricetag-outline', label: 'Referanse', value: dossier.reference || bid.noticeId },
    { id: 'procedure', icon: 'git-branch-outline', label: 'Prosedyre', value: dossier.procedure },
    { id: 'value', icon: 'cash-outline', label: 'Anslått verdi', value: dossier.estimatedValue },
    { id: 'published', icon: 'calendar-outline', label: 'Publisert', value: dossier.published ? shortDate(dossier.published) : '' },
  ].filter((row) => row.value);
  const shortcuts = [
    noticeUrl ? { id: 'notice', icon: 'open-outline', label: `Åpne på ${source}`, onPress: () => openUrl(noticeUrl), external: true } : null,
    dossier.documentsUrl && dossier.documentsUrl !== noticeUrl
      ? { id: 'docs', icon: 'folder-open-outline', label: 'Åpne konkurransegrunnlaget', onPress: () => openUrl(dossier.documentsUrl), external: true }
      : null,
    dossier.submissionUrl && dossier.submissionUrl !== dossier.documentsUrl && dossier.submissionUrl !== noticeUrl
      ? { id: 'submit', icon: 'paper-plane-outline', label: 'Gå til innlevering', onPress: () => openUrl(dossier.submissionUrl), external: true }
      : null,
    noticeUrl ? { id: 'share', icon: 'link-outline', label: 'Del lenke', onPress: () => shareLink(noticeUrl, bid.title) } : null,
    { id: 'settings', icon: 'settings-outline', label: 'Innstillinger og ansvarlig', onPress: onOpenSettings },
  ].filter(Boolean);

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <Card colors={colors} style={styles.wide}>
          <Timeline steps={timeline} colors={colors} />
        </Card>
        <Countdown value={dossier.submissionDeadline || bid.deadline} colors={colors} />
      </View>

      <View style={styles.row}>
        <Card colors={colors}>
          <CardHead
            icon="folder-outline"
            title="Konkurransegrunnlag"
            sub={groundFiles.length === 1 ? '1 dokument' : `${groundFiles.length} dokumenter`}
            colors={colors}
            onMore={() => onGoStep('grunnlag')}
            moreLabel="Gå til konkurransegrunnlaget"
          />
          {groundFiles.length ? (
            <View>
              {groundFiles.slice(0, 4).map((file) => {
                const type = fileTypeLabel(file);
                return (
                  <View key={file.id} style={[styles.listRow, { borderColor: colors.line }]}>
                    <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[type] || '#64748b' }]}>
                      <Text style={styles.typeText} numberOfLines={1}>{type}</Text>
                    </View>
                    <Text style={[styles.grow, { color: colors.ink }]} numberOfLines={1}>{file.name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                      {[type, file.sizeLabel].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Empty
              icon="cloud-download-outline"
              title="Ingen dokumenter hentet ennå"
              text="Hent grunnlaget, så sorteres filene i mapper."
              colors={colors}
              primary={{ label: busy ? 'Henter …' : 'Hent anbudsgrunnlag', onPress: onRefresh, disabled: busy }}
            />
          )}
          {groundFiles.length ? (
            <MoreLink label={`Vis alle dokumenter (${groundFiles.length})`} onPress={() => onGoStep('grunnlag')} colors={colors} />
          ) : null}
        </Card>

        <Card colors={colors}>
          <CardHead
            icon="document-text-outline"
            title="Vårt tilbud"
            sub={bid.updatedAt ? `Sist endret ${shortDate(bid.updatedAt)}` : ''}
            colors={colors}
            badge={<StageBadge stage={stage} started={progress.started} colors={colors} />}
            onMore={() => onGoStep('arbeid')}
            moreLabel="Gå til tilbudet"
          />
          {progress.started ? (
            <View style={{ gap: 12 }}>
              <Progress label="Sjekkpunkt ferdig" done={progress.done} total={progress.items} colors={colors} />
              {progress.forms ? (
                <Progress label="Skjema ferdig" done={progress.formsDone} total={progress.forms} colors={colors} />
              ) : null}
              {progress.pending ? (
                <Text style={{ color: colors.brand, fontSize: 13 }}>
                  {progress.pending === 1 ? '1 forslag' : `${progress.pending} forslag`} fra AI venter på gjennomgang.
                </Text>
              ) : null}
              <MoreLink label="Fortsett tilbudsarbeidet" onPress={() => onGoStep('arbeid')} colors={colors} />
            </View>
          ) : (
            <Empty
              icon="sparkles-outline"
              title="Start tilbudet"
              text={progress.pending
                ? 'AI har forslag til leveranser som venter på deg.'
                : 'La AI foreslå leveranser fra grunnlaget, eller legg inn egne sjekkpunkt.'}
              colors={colors}
              primary={progress.pending
                ? { label: 'Gå gjennom forslag', onPress: () => onGoStep('arbeid') }
                : { label: aiBusy ? 'Foreslår …' : 'Foreslå leveranser', onPress: onSuggest, disabled: aiBusy }}
              secondary={{ label: 'Legg inn selv', onPress: () => onGoStep('arbeid') }}
            />
          )}
        </Card>

        <Card colors={colors}>
          <CardHead title="Nøkkelinformasjon" colors={colors} />
          {facts.length ? facts.map((row) => (
            <View key={row.id} style={[styles.listRow, { borderColor: colors.line }]}>
              <Ionicons name={row.icon} size={16} color={colors.muted} />
              <Text style={[styles.factLabel, { color: colors.muted }]}>{row.label}</Text>
              <Text style={[styles.grow, { color: colors.ink }]} numberOfLines={2}>{row.value}</Text>
            </View>
          )) : (
            <Text style={{ color: colors.muted }}>Hent anbudsgrunnlaget for å fylle inn opplysningene.</Text>
          )}
        </Card>
      </View>

      <View style={styles.row}>
        <Card colors={colors}>
          <CardHead
            icon="help-circle-outline"
            title="Spørsmål og svar"
            sub={qa.total ? `${qa.total} spørsmål · ${qa.answered} besvart` : 'Ingen spørsmål ennå'}
            colors={colors}
            action={{ label: 'Still spørsmål', onPress: () => onGoStep('qa') }}
            onMore={() => onGoStep('qa')}
            moreLabel="Gå til spørsmål og svar"
          />
          {qa.latest.length ? (
            <View>
              {qa.latest.map((row) => (
                <View key={row.id} style={[styles.listRow, { borderColor: colors.line }]}>
                  <Text style={[styles.qaNo, { color: colors.muted }]}>#{row.no}</Text>
                  <Text style={[styles.grow, { color: colors.ink }]} numberOfLines={2}>{row.question}</Text>
                  <Badge
                    text={row.answered ? 'Besvart' : 'Venter på svar'}
                    icon={row.answered ? 'checkmark-circle' : null}
                    color={row.answered ? colors.success : colors.warn}
                    background={row.answered ? colors.successSoft : `${colors.warn}1f`}
                  />
                  {row.when ? <Text style={{ color: colors.muted, fontSize: 12 }}>{row.when}</Text> : null}
                </View>
              ))}
              <MoreLink label={`Vis alle (${qa.total})`} onPress={() => onGoStep('qa')} colors={colors} />
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>
              {dossier.questionDeadline
                ? `Frist for spørsmål er ${shortDate(dossier.questionDeadline)}.`
                : 'Publiserte svar og egne spørsmål samles her.'}
            </Text>
          )}
        </Card>

        <Card colors={colors}>
          <CardHead icon="people-outline" title="Samarbeid" colors={colors} />
          {team.length ? team.map((person) => (
            <View key={person.id} style={[styles.listRow, { borderColor: colors.line }]}>
              <View style={[styles.avatar, { backgroundColor: colors.ink }]}>
                <Text style={[styles.avatarText, { color: colors.card }]}>{person.initials}</Text>
              </View>
              <Text style={[styles.grow, { color: colors.ink }]} numberOfLines={1}>{person.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{person.role}</Text>
            </View>
          )) : (
            <Empty
              icon="person-add-outline"
              title="Ingen er med ennå"
              text="Velg ansvarlig, og gi sjekkpunkt en eier i tilbudet."
              colors={colors}
              primary={{ label: 'Velg ansvarlig', onPress: onOpenSettings }}
            />
          )}
        </Card>

        <Card colors={colors}>
          <CardHead icon="link-outline" title="Snarveier" colors={colors} />
          <View style={{ gap: 8 }}>
            {shortcuts.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={row.onPress}
                accessibilityRole={row.external ? 'link' : 'button'}
                style={[styles.shortcut, { borderColor: colors.line }]}
              >
                <Ionicons name={row.icon} size={17} color={colors.ink} />
                <Text style={[styles.grow, { color: colors.ink }]}>{row.label}</Text>
                {row.external ? <Ionicons name="open-outline" size={15} color={colors.muted} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      </View>
    </View>
  );
}

function Card({ colors, style, children }) {
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }, style]}>
      {children}
    </View>
  );
}

function CardHead({ icon, title, sub, colors, action, badge, onMore, moreLabel }) {
  return (
    <View style={styles.head}>
      {icon ? (
        <View style={[styles.headIcon, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name={icon} size={18} color={colors.brand} />
        </View>
      ) : null}
      <View style={styles.grow}>
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={{ color: colors.muted, fontSize: 13 }}>{sub}</Text> : null}
      </View>
      {badge}
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          accessibilityRole="button"
          style={[styles.headBtn, { borderColor: colors.line }]}
        >
          <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
      {onMore ? (
        <TouchableOpacity
          onPress={onMore}
          accessibilityRole="button"
          accessibilityLabel={moreLabel}
          style={[styles.headMore, { borderColor: colors.line }]}
        >
          <Ionicons name="chevron-forward" size={16} color={colors.ink} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function MoreLink({ label, onPress, colors }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={styles.more}>
      <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 13 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.brand} />
    </TouchableOpacity>
  );
}

function Empty({ icon, title, text, colors, primary, secondary }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name={icon} size={22} color={colors.brand} />
      </View>
      <Text style={{ color: colors.ink, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>{text}</Text>
      <View style={styles.emptyActions}>
        {primary ? (
          <TouchableOpacity
            onPress={primary.onPress}
            disabled={primary.disabled}
            accessibilityRole="button"
            style={[styles.btn, { backgroundColor: colors.brand, opacity: primary.disabled ? 0.7 : 1 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>{primary.label}</Text>
          </TouchableOpacity>
        ) : null}
        {secondary ? (
          <TouchableOpacity
            onPress={secondary.onPress}
            accessibilityRole="button"
            style={[styles.btn, { borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.card }]}
          >
            <Text style={{ color: colors.brand, fontWeight: '600' }}>{secondary.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function Badge({ text, icon, color, background }) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

function StageBadge({ stage, started, colors }) {
  if (stage === 'planlegging' && !started) {
    return <Badge text="Ikke startet" color={colors.muted} background={colors.sunken} />;
  }
  if (stage === 'kontrakt') return <Badge text="Vunnet" icon="trophy-outline" color={colors.success} background={colors.successSoft} />;
  if (stage === 'tapt' || stage === 'trukket') {
    return <Badge text={STAGE_LABELS[stage]} color={colors.muted} background={colors.sunken} />;
  }
  if (stage === 'levert') return <Badge text="Levert" icon="checkmark-circle" color={colors.success} background={colors.successSoft} />;
  return <Badge text="Utkast" icon="ellipse" color={colors.success} background={colors.successSoft} />;
}

function Progress({ label, done, total, colors }) {
  const share = total ? Math.round((done / total) * 100) : 0;
  return (
    <View style={{ gap: 6 }} accessibilityLabel={`${label}: ${done} av ${total}`}>
      <View style={styles.progressHead}>
        <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{done} av {total}</Text>
      </View>
      <View style={[styles.bar, { backgroundColor: colors.sunken }]}>
        <View style={[styles.barFill, { width: `${share}%`, backgroundColor: colors.brand }]} />
      </View>
    </View>
  );
}

function Timeline({ steps, colors }) {
  const spoken = steps.map((row) => [row.label, row.when, row.note].filter(Boolean).join(', ')).join('. ');
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={spoken}
      style={styles.timelineScroll}
      contentContainerStyle={styles.timeline}
    >
      {steps.map((row, index) => {
        const next = steps[index + 1];
        const on = row.state === 'done';
        const current = row.state === 'current';
        return (
          <View key={row.id} style={styles.step}>
            <View style={styles.rail}>
              <View style={[styles.dot, {
                backgroundColor: on ? colors.brand : colors.card,
                borderColor: on || current ? colors.brand : colors.line,
              }]}
              >
                {on ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                {current ? <View style={[styles.dotCore, { backgroundColor: colors.brand }]} /> : null}
              </View>
              {next ? (
                <View style={[styles.line, {
                  borderColor: on && next.state !== 'todo' ? colors.brand : colors.line,
                  borderStyle: on && next.state !== 'todo' ? 'solid' : 'dashed',
                }]}
                />
              ) : null}
            </View>
            <Text style={{ color: colors.ink, fontWeight: current ? '700' : '600', fontSize: 14 }}>{row.label}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{row.when}</Text>
            {row.note ? <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '600' }}>{row.note}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

/** Tilbudsfristen som teller ned hvert sekund. */
function Countdown({ value, colors }) {
  const [now, setNow] = useState(() => new Date());
  const parts = countdownParts(value, now);
  const ticking = parts.ok && !parts.passed;

  useEffect(() => {
    if (!ticking) return undefined;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const tone = !parts.ok ? colors.muted : (parts.passed || parts.days < 1 ? colors.danger : (parts.days <= 7 ? colors.warn : colors.ink));
  const cells = [
    { id: 'd', value: parts.days, unit: 'dager' },
    { id: 't', value: parts.hours, unit: 'timer' },
    { id: 'm', value: parts.minutes, unit: 'min' },
    { id: 's', value: parts.seconds, unit: 'sek' },
  ];
  const spoken = parts.ok
    ? (parts.passed ? `Tilbudsfristen gikk ut ${parts.dateLabel}` : `Tilbudsfrist om ${parts.days} dager og ${parts.hours} timer, ${parts.dateLabel}`)
    : 'Tilbudsfristen er ikke oppgitt';

  return (
    <Card colors={colors} style={styles.countCard}>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>Tid til tilbudsfrist</Text>
      {parts.ok && !parts.passed ? (
        <View style={styles.cells} accessibilityLabel={spoken}>
          {cells.map((cell) => (
            <View key={cell.id} style={[styles.cell, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <Text style={[styles.cellValue, { color: tone }]}>{String(cell.value).padStart(2, '0')}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{cell.unit}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.cellValue, { color: tone }]} accessibilityLabel={spoken}>
          {parts.ok ? 'Fristen er ute' : '–'}
        </Text>
      )}
      <Text style={{ color: parts.ok ? colors.ink : colors.muted, fontSize: 13, textAlign: 'center' }}>
        {parts.ok ? parts.dateLabel : 'Sett fristen under innstillinger.'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 16, width: '100%' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' },
  card: { flexGrow: 1, flexShrink: 1, flexBasis: 300, minWidth: 0, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  wide: { flexGrow: 2, flexBasis: 560, justifyContent: 'center' },
  countCard: { alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  headIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  headMore: { borderWidth: 1, borderRadius: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  typeBadge: { width: 38, borderRadius: 6, paddingVertical: 3, alignItems: 'center' },
  typeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  factLabel: { width: 112, fontSize: 13 },
  qaNo: { width: 30, fontSize: 13, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700' },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingTop: 4 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 10 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 6 },
  btn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  timelineScroll: { flexGrow: 0 },
  timeline: { flexGrow: 1, flexDirection: 'row', paddingTop: 4 },
  step: { flex: 1, minWidth: 132, gap: 2, paddingRight: 8 },
  rail: { flexDirection: 'row', alignItems: 'center', height: 26, marginBottom: 8 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotCore: { width: 10, height: 10, borderRadius: 5 },
  line: { flex: 1, marginLeft: 6, borderTopWidth: 2 },
  cells: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  cell: { minWidth: 62, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' },
  cellValue: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
});
