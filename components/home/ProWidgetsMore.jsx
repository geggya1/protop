/**
 * Flere ProTop-widgets på Hjem, i samme kort (ProCard) og palett som ProWidgets.
 *
 * Privat (personlig arbeidsdag): Fokusøkt, Fri om (nedtelling) og Mva-regner.
 * Bedrift: Borte i dag, Jubileer og nye, Anbud, Til godkjenning og Mine RUH.
 * Hver widget henter bare det den viser, og bare når den står på Hjem.
 * I forhåndsvisningen (model.preview) brukes eksempeldata i stedet for lytterne.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useHomePalette } from './homeGlass';
import {
  ProCard, Pill, EmptyLine, Bar, IconDisc,
} from './ProWidgets';
import { useNow } from '../../src/hooks/useNow';
import {
  FOCUS_PRESETS, focusState, countdowns, VAT_RATES, parseAmount, vatSplit, moneyLabel,
} from '../../src/utils/proHomeMore';
import { hoursLabel } from '../../src/utils/proHome';
import {
  useAwayToday, useCelebrations, useTenderPeek, useApprovals, useMyReports,
} from '../../src/hooks/useProHomeData';
import QuickReportButton from '../../screens/iso/QuickReport';

const FONT = Platform.OS === 'web' ? 'Inter, system-ui, -apple-system, sans-serif' : undefined;

function gridSize(widget) {
  return { gw: Number(widget?.gw) || 5, gh: Number(widget?.gh) || 2 };
}

function Avatar({ initials, size = 30, ring, tone }) {
  const pal = useHomePalette();
  return (
    <View
      style={[
        st.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tone || pal.chip,
          borderColor: ring || pal.line,
        },
      ]}
    >
      <Text style={[st.avatarTxt, { color: pal.ink, fontSize: size >= 30 ? 11 : 10 }]}>{initials}</Text>
    </View>
  );
}

function Seg({ options, value, onChange, testID }) {
  const pal = useHomePalette();
  return (
    <View style={[st.seg, { backgroundColor: pal.chip, borderColor: pal.line }]} testID={testID}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <TouchableOpacity
            key={o.id}
            style={[st.segItem, on && { backgroundColor: pal.glass ? 'rgba(255,255,255,0.9)' : pal.accentInk }]}
            onPress={() => onChange(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[st.segTxt, { color: on ? (pal.glass ? '#0B2236' : pal.onAccent) : pal.muted }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Fokusøkt                                                            */
/* ------------------------------------------------------------------ */

const FOCUS_KEY = 'protop.home.focus.v1';

/**
 * Fokusøkt: 25, 50 eller 90 minutter uten avbrudd. Økten huskes på enheten, så den
 * fortsetter når man går fra Hjem og tilbake.
 */
export function FocusWidget({ widget }) {
  const pal = useHomePalette();
  const { gw, gh } = gridSize(widget);
  const [session, setSession] = useState(null);
  const [preset, setPreset] = useState(25);
  const now = useNow(session && session.pausedLeftMs == null ? 1000 : 60000);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(FOCUS_KEY)
      .then((raw) => {
        if (!live || !raw) return;
        const saved = JSON.parse(raw);
        if (saved?.minutes) {
          setSession(saved);
          setPreset(saved.minutes);
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const save = (next) => {
    setSession(next);
    if (next) AsyncStorage.setItem(FOCUS_KEY, JSON.stringify(next)).catch(() => {});
    else AsyncStorage.removeItem(FOCUS_KEY).catch(() => {});
  };

  const state = focusState(session, now.getTime());
  const start = (minutes = preset) => save({ startedAt: Date.now(), minutes });
  const pause = () => save({ ...session, pausedLeftMs: state.leftMs });
  const resume = () => save({ minutes: session.minutes, startedAt: Date.now() - (session.minutes * 60000 - session.pausedLeftMs) });
  const stop = () => save(null);

  const idle = !session;
  const big = idle ? `${preset}:00` : (state.done ? 'Ferdig' : state.label);
  const sub = idle
    ? 'Klar for en økt uten avbrudd'
    : (state.done ? 'Ta en pause på fem minutter' : (state.paused ? 'På pause' : `Fokus · ${session.minutes} min`));
  const compact = gh <= 1;

  const mainBtn = idle || state.done
    ? { icon: 'play', label: state.done ? 'Ny økt' : 'Start', onPress: () => start(preset) }
    : (state.paused ? { icon: 'play', label: 'Fortsett', onPress: resume } : { icon: 'pause', label: 'Pause', onPress: pause });

  const ctaInk = pal.glass ? '#0B2236' : pal.onAccent;
  const controls = (
    <View style={st.focusBtns}>
      <TouchableOpacity
        style={[st.cta, { backgroundColor: pal.glass ? 'rgba(255,255,255,0.9)' : pal.accentInk }]}
        onPress={mainBtn.onPress}
        accessibilityRole="button"
        testID="pro-focus-main"
      >
        <Ionicons name={mainBtn.icon} size={13} color={ctaInk} />
        <Text style={[st.ctaTxt, { color: ctaInk }]}>{mainBtn.label}</Text>
      </TouchableOpacity>
      {!idle ? (
        <TouchableOpacity style={[st.iconBtn, { backgroundColor: pal.chip, borderColor: pal.line }]} onPress={stop} accessibilityRole="button" accessibilityLabel="Avslutt økten" testID="pro-focus-stop">
          <Ionicons name="stop" size={12} color={pal.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (compact) {
    return (
      <ProCard pad={8} testID="pro-focus">
        <View style={st.rowCenter}>
          <IconDisc icon="hourglass" size={22} />
          <Text style={[st.focusBigCompact, { color: pal.ink }]}>{big}</Text>
          <View style={{ flex: 1 }}>
            {!idle ? <Bar ratio={state.ratio} color={state.done ? pal.success : pal.accent} track={pal.track} height={5} /> : null}
          </View>
          {controls}
        </View>
      </ProCard>
    );
  }

  return (
    <ProCard title="Fokusøkt" icon="hourglass" iconColor={pal.glass ? '#7C3AED' : null} testID="pro-focus">
      <View style={st.focusBody}>
        <Text style={[st.focusBig, { color: pal.ink }, gw <= 2 && { fontSize: 26, lineHeight: 30 }]} accessibilityLiveRegion="polite">{big}</Text>
        <Text style={[st.sub, { color: pal.muted }]} numberOfLines={1}>{sub}</Text>
        <View style={{ marginTop: 6 }}>
          <Bar ratio={idle ? 0 : state.ratio} color={state.done ? pal.success : pal.accent} track={pal.track} height={5} />
        </View>
      </View>
      <View style={st.focusFoot}>
        {idle && gw >= 3 ? (
          <Seg
            options={FOCUS_PRESETS.map((m) => ({ id: m, label: `${m}` }))}
            value={preset}
            onChange={setPreset}
            testID="pro-focus-presets"
          />
        ) : <View />}
        {controls}
      </View>
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Fri om                                                              */
/* ------------------------------------------------------------------ */

/** Nedtelling: arbeidsdagen, helgen og neste røde dag. */
export function CountdownWidget({ widget }) {
  const pal = useHomePalette();
  const { gh, gw } = gridSize(widget);
  const now = useNow(60000);
  const cd = useMemo(() => countdowns(now), [now]);
  const rows = [];
  if (cd.workday) {
    rows.push({ id: 'day', icon: 'briefcase', label: 'Arbeidsdagen', value: `ferdig om ${cd.workday.label}`, ratio: cd.workday.ratio });
  }
  rows.push({
    id: 'weekend',
    icon: 'beer',
    label: 'Helg',
    value: cd.weekend.now ? 'nå – god helg!' : `om ${cd.weekend.label}`,
    ratio: cd.weekend.ratio,
  });
  if (cd.holiday) {
    rows.push({
      id: 'holiday',
      icon: 'flag',
      label: cd.holiday.name,
      value: cd.holiday.days === 1 ? `i morgen (${cd.holiday.weekday})` : `om ${cd.holiday.days} dager · ${cd.holiday.weekday}`,
      ratio: null,
    });
  }
  const max = gh <= 1 ? 1 : (gh === 2 ? 2 : 3);
  if (gw <= 2) {
    // Smal: kort etikett over, verdien stort under.
    return (
      <ProCard title={gh <= 1 ? null : 'Fri om'} icon="time" iconColor={pal.glass ? '#1F8A4C' : null} pad={gh <= 1 ? 8 : 12} testID="pro-countdown">
        {rows.slice(0, max).map((r, i) => (
          <View key={r.id} style={[i > 0 && { marginTop: 6 }]}>
            <Text style={[st.cdLabel, { color: pal.muted }]} numberOfLines={1}>{r.label}</Text>
            <Text style={[st.cdValueNarrow, { color: pal.ink }]} numberOfLines={1}>
              {r.id === 'holiday'
                ? (cd.holiday.days === 1 ? 'i morgen' : `${cd.holiday.days} dager`)
                : r.value.replace(/^(ferdig )?om /, '')}
            </Text>
            {r.ratio != null ? <Bar ratio={r.ratio} color={r.id === 'weekend' ? pal.success : pal.accent} track={pal.track} height={4} /> : null}
          </View>
        ))}
      </ProCard>
    );
  }
  return (
    <ProCard title={gh <= 1 ? null : 'Fri om'} icon="time" iconColor={pal.glass ? '#1F8A4C' : null} pad={gh <= 1 ? 8 : 12} testID="pro-countdown">
      {rows.slice(0, max).map((r, i) => (
        <View key={r.id} style={[st.cdRow, i > 0 && { marginTop: 8 }]}>
          <View style={st.cdHead}>
            <Ionicons name={r.icon} size={13} color={pal.muted} />
            <Text style={[st.cdLabel, { color: pal.muted }]} numberOfLines={1}>{r.label}</Text>
            <Text style={[st.cdValue, { color: pal.ink }]} numberOfLines={1}>{gw <= 2 ? r.value.replace(/ · .*/, '') : r.value}</Text>
          </View>
          {r.ratio != null ? <Bar ratio={r.ratio} color={r.id === 'weekend' ? pal.success : pal.accent} track={pal.track} height={5} /> : null}
        </View>
      ))}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Mva-regner                                                          */
/* ------------------------------------------------------------------ */

/** Mva-regner: skriv et beløp, få eks., mva og inkl. med en gang. */
export function VatWidget({ widget }) {
  const pal = useHomePalette();
  const { gw, gh } = gridSize(widget);
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState('eks');
  const [rate, setRate] = useState(25);
  const amount = parseAmount(raw);
  const split = vatSplit(amount, rate, mode);
  const wide = gw >= 4;
  return (
    <ProCard title="Mva-regner" icon="calculator" iconColor={pal.glass ? '#C47A4A' : null} testID="pro-vat">
      <View style={[st.vatTop, !wide && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={[st.vatInputWrap, { backgroundColor: pal.chip, borderColor: pal.line }]}>
          <TextInput
            value={raw}
            onChangeText={setRaw}
            placeholder="Beløp"
            placeholderTextColor={pal.faint}
            keyboardType="decimal-pad"
            inputMode="decimal"
            style={[st.vatInput, { color: pal.ink }]}
            accessibilityLabel="Beløp"
            testID="pro-vat-input"
          />
          <Text style={[st.vatKr, { color: pal.muted }]}>kr</Text>
        </View>
        <Seg options={[{ id: 'eks', label: 'eks.' }, { id: 'inkl', label: 'inkl.' }]} value={mode} onChange={setMode} testID="pro-vat-mode" />
      </View>
      {gh >= 3 || wide ? (
        <View style={st.vatRates}>
          {VAT_RATES.map((r) => (
            <Pill key={r} label={`${r} %`} tone={r === rate ? 'accent' : 'muted'} onPress={() => setRate(r)} testID={`pro-vat-rate-${r}`} />
          ))}
        </View>
      ) : null}
      <View style={st.vatOut}>
        {[
          { id: 'net', label: 'Eks. mva', value: split.net },
          { id: 'vat', label: `Mva ${rate} %`, value: split.vat },
          { id: 'gross', label: 'Inkl. mva', value: split.gross, strong: true },
        ].map((r) => (
          <View key={r.id} style={st.vatCell}>
            <Text style={[st.vatLbl, { color: pal.muted }]} numberOfLines={1}>{r.label}</Text>
            <Text style={[st.vatVal, { color: pal.ink }, r.strong && { fontWeight: '700' }]} numberOfLines={1} testID={`pro-vat-${r.id}`}>
              {amount ? moneyLabel(r.value) : '–'}
            </Text>
          </View>
        ))}
      </View>
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Bedrift: Borte i dag                                                */
/* ------------------------------------------------------------------ */

const KIND_ICON = {
  Ferie: 'airplane', Syk: 'medkit', Sykmeldt: 'medkit', Egenmelding: 'medkit', Permisjon: 'leaf', Kurs: 'school', Avspasering: 'cafe', Borte: 'remove-circle',
};

/** Hvem som er borte i dag, og når de er tilbake. */
export function AwayTodayWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh, gw } = gridSize(widget);
  const live = useAwayToday(model?.preview ? '' : model?.companyId);
  const away = model?.preview?.away || live;
  const open = () => handlers?.onAppAction?.({ type: 'tab', tab: 'arbeid', subView: 'fravaer' });
  if (model?.absenceActive === false && !model?.preview) {
    return (
      <ProCard title="Borte i dag" icon="sunny" testID="pro-away-off">
        <EmptyLine icon="information-circle" text="Fravær er ikke slått på i bedriften." />
      </ProCard>
    );
  }
  const right = away.manager && away.staff ? `${away.count} av ${away.staff}` : null;
  const max = gh >= 3 ? 5 : (gh >= 2 ? 3 : 1);
  return (
    <ProCard title="Borte i dag" icon="sunny" iconColor={pal.glass ? '#E0A106' : null} right={right} onPress={open} testID="pro-away">
      {!away.people.length ? (
        <EmptyLine
          icon="people"
          text={away.ready
            ? (away.manager ? 'Alle er på jobb i dag' : 'Du har ikke registrert fravær i dag')
            : 'Henter fravær …'}
        />
      ) : away.people.slice(0, max).map((p, i) => (
        <View key={p.id} style={[st.personRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.line }]}>
          <Avatar initials={p.initials} size={26} ring={p.me ? pal.accent : pal.line} />
          <View style={st.personBody}>
            <Text style={[st.personName, { color: pal.ink }]} numberOfLines={1}>{p.me ? `${p.name} (deg)` : p.name}</Text>
            <Text style={[st.personMeta, { color: pal.muted }]} numberOfLines={1}>
              {gw >= 3 ? `${p.kind} · ${p.back.replace(/^Tilbake /, 'tilbake ')}` : p.kind}
            </Text>
          </View>
          <View style={[st.kindDisc, { backgroundColor: p.kind === 'Ferie' ? pal.successSoft : pal.chip }]}>
            <Ionicons name={KIND_ICON[p.kind] || 'remove-circle'} size={13} color={p.kind === 'Ferie' ? pal.success : pal.muted} />
          </View>
        </View>
      ))}
      {away.people.length > max ? (
        <Text style={[st.more, { color: pal.muted }]}>+{away.people.length - max} til</Text>
      ) : null}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Bedrift: Jubileer og nye                                            */
/* ------------------------------------------------------------------ */

/** Runde år i bedriften og nye kolleger. Fødselsdato brukes ikke. */
export function CelebrationsWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh, gw } = gridSize(widget);
  const narrow = gw <= 2;
  const max = gh >= 3 ? 4 : (gh >= 2 ? 2 : 1);
  const live = useCelebrations(model?.preview ? '' : model?.companyId, { limit: max });
  const data = model?.preview?.celebrations || live;
  const open = () => handlers?.onAppAction?.({ type: 'tab', tab: 'ansatte' });
  return (
    <ProCard title={narrow ? 'Jubileer' : 'Jubileer og nye'} icon="ribbon" iconColor={pal.glass ? '#E07A9A' : null} onPress={open} testID="pro-celebrations">
      {!data.items.length ? (
        <EmptyLine icon="ribbon-outline" text={data.ready ? 'Ingen jubileer eller nye de neste ukene' : 'Henter kolleger …'} />
      ) : data.items.slice(0, max).map((c, i) => (
        <View key={c.id} style={[st.personRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.line }]}>
          <Avatar
            initials={c.initials}
            size={26}
            ring={c.round ? pal.warn : (c.kind === 'new' ? pal.success : pal.line)}
          />
          <View style={st.personBody}>
            <Text style={[st.personName, { color: pal.ink }]} numberOfLines={1}>{narrow ? c.name.split(' ')[0] : c.name}</Text>
            <Text style={[st.personMeta, { color: pal.muted }]} numberOfLines={1}>{narrow ? c.short : c.label}</Text>
          </View>
          {narrow ? null : <Ionicons
            name={c.kind === 'new' ? 'hand-left' : (c.round ? 'trophy' : 'ribbon')}
            size={15}
            color={c.kind === 'new' ? pal.success : (c.round ? pal.warn : pal.muted)}
          />}
        </View>
      ))}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Bedrift: Anbud                                                      */
/* ------------------------------------------------------------------ */

/** Nye anbudstreff og fristene for dem bedriften følger. */
export function TendersWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh, gw } = gridSize(widget);
  const max = gh >= 3 ? 4 : (gh >= 2 ? 2 : 1);
  const enabled = !model?.preview && model?.anbudActive !== false;
  const live = useTenderPeek(enabled ? model?.companyId : '', { enabled, limit: max });
  const data = model?.preview?.tenders || live;
  const open = (subView = 'varsling') => handlers?.onAppAction?.({ type: 'tab', tab: 'anbud', subView });
  if (model?.anbudActive === false && !model?.preview) {
    return (
      <ProCard title="Anbud" icon="megaphone" testID="pro-tenders-off">
        <EmptyLine icon="information-circle" text="Anbud er ikke slått på i bedriften." />
      </ProCard>
    );
  }
  const right = data.fresh ? `${data.fresh} nye` : (data.following ? `${data.following} følges` : null);
  return (
    <ProCard title="Anbud" icon="megaphone" iconColor={pal.glass ? '#2F80ED' : null} right={right ? `${right} ›` : 'Alle ›'} onRight={() => open('varsling')} testID="pro-tenders">
      {!data.rows.length ? (
        <EmptyLine icon="search" text={data.ready ? 'Ingen nye treff denne uka' : 'Henter anbud …'} action={gh >= 2 ? 'Varsling ›' : null} onAction={() => open('varsling')} />
      ) : data.rows.slice(0, max).map((r, i) => (
        <TouchableOpacity
          key={r.id}
          style={[st.tenderRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.line }]}
          onPress={() => open(r.status === 'Ny' ? 'varsling' : 'vurdering')}
          accessibilityRole="button"
          accessibilityLabel={`${r.title}, ${r.leftLabel}`}
        >
          <View style={st.personBody}>
            <Text style={[st.personName, { color: pal.ink }]} numberOfLines={1}>{r.title}</Text>
            <Text style={[st.personMeta, { color: pal.muted }]} numberOfLines={1}>
              {[r.status, gw >= 3 ? r.buyer : ''].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pill label={r.leftLabel} icon="hourglass-outline" tone={r.urgent ? 'warn' : 'muted'} />
        </TouchableOpacity>
      ))}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Bedrift: Til godkjenning                                            */
/* ------------------------------------------------------------------ */

/** Timer som venter på godkjenning (ledere), denne og forrige uke. */
export function ApprovalsWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh } = gridSize(widget);
  const max = gh >= 3 ? 4 : (gh >= 2 ? 2 : 0);
  const live = useApprovals(model?.preview ? '' : model?.companyId, { limit: Math.max(1, max) });
  const data = model?.preview?.approvals || live;
  const open = () => handlers?.onAppAction?.({ type: 'tab', tab: 'arbeid', subView: 'godkjenning' });
  if (!data.manager) {
    return (
      <ProCard title="Til godkjenning" icon="checkmark-done" testID="pro-approvals-none">
        <EmptyLine icon="information-circle" text="Ledere ser timer som venter på godkjenning her." />
      </ProCard>
    );
  }
  const ctaInk = pal.glass ? '#0B2236' : pal.onAccent;
  return (
    <ProCard title="Til godkjenning" icon="checkmark-done" iconColor={pal.glass ? '#1F8A4C' : null} testID="pro-approvals">
      {!data.count ? (
        <EmptyLine text={data.ready ? 'Ingen timer venter på deg' : 'Henter timer …'} />
      ) : (
        <>
          <View style={st.rowCenter}>
            <Text style={[st.bigVal, { color: pal.ink }]}>{hoursLabel(data.hours)}</Text>
            <Text style={[st.sub, { color: pal.muted, flex: 1 }]} numberOfLines={1}>
              fra {data.count} {data.count === 1 ? 'ansatt' : 'ansatte'}
            </Text>
            <TouchableOpacity
              style={[st.cta, { backgroundColor: pal.glass ? 'rgba(255,255,255,0.9)' : pal.accentInk }]}
              onPress={open}
              accessibilityRole="button"
              testID="pro-approvals-open"
            >
              <Text style={[st.ctaTxt, { color: ctaInk }]}>Godkjenn</Text>
            </TouchableOpacity>
          </View>
          {data.people.slice(0, max).map((p) => (
            <View key={p.id} style={st.approvalRow}>
              <Avatar initials={p.initials} size={22} />
              <Text style={[st.personName, { color: pal.ink, flex: 1 }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[st.personMeta, { color: pal.muted }]}>{hoursLabel(p.hours)}</Text>
            </View>
          ))}
        </>
      )}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */
/* Bedrift: Mine RUH og avvik                                          */
/* ------------------------------------------------------------------ */

/** Avvik og RUH jeg har meldt, med status, og «Meld RUH» rett fra Hjem. */
export function MyReportsWidget({ model, handlers, widget }) {
  const pal = useHomePalette();
  const { gh } = gridSize(widget);
  const max = gh >= 3 ? 3 : (gh >= 2 ? 1 : 0);
  const enabled = !model?.preview;
  const live = useMyReports(enabled ? model?.companyId : '', { enabled, limit: Math.max(1, max) });
  const data = model?.preview?.reports || live;
  const ctaInk = pal.glass ? '#0B2236' : pal.onAccent;
  const report = (
    <QuickReportButton
      label="Meld RUH"
      renderTrigger={({ open: openSheet }) => (
        <TouchableOpacity
          style={[st.cta, { backgroundColor: pal.glass ? 'rgba(255,210,122,0.95)' : pal.warnInk }]}
          onPress={openSheet}
          accessibilityRole="button"
          testID="pro-reports-new"
        >
          <Ionicons name="warning" size={12} color={pal.glass ? '#0B2236' : '#FFFFFF'} />
          <Text style={[st.ctaTxt, { color: pal.glass ? '#0B2236' : '#FFFFFF' }]}>Meld RUH</Text>
        </TouchableOpacity>
      )}
    />
  );
  return (
    <ProCard
      title="Mine RUH og avvik"
      icon="shield-checkmark"
      iconColor={pal.glass ? '#E85D4C' : null}
      right="Alle ›"
      onRight={() => handlers?.onAppAction?.({ type: 'tab', tab: 'iso', subView: 'oversikt' })}
      testID="pro-reports"
    >
      <View style={st.rowCenter}>
        <Text style={[st.sub, { color: pal.muted, flex: 1 }]} numberOfLines={1}>
          {data.ready
            ? (data.open ? `${data.open} åpne av ${data.total}` : (data.total ? `Alle ${data.total} er lukket` : 'Ingen meldinger ennå'))
            : 'Henter meldinger …'}
        </Text>
        {report}
      </View>
      {data.items.slice(0, max).map((r, i) => (
        <View key={r.id} style={[st.reportRow, i === 0 && { marginTop: 2 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: pal.line }]}>
          <View style={[st.dot, { backgroundColor: r.open ? pal.warn : pal.success }]} />
          <Text style={[st.personName, { color: pal.ink, flex: 1 }]} numberOfLines={1}>{r.title}</Text>
          <Text style={[st.personMeta, { color: r.open ? pal.warnInk : pal.muted }]} numberOfLines={1}>{r.statusLabel}</Text>
        </View>
      ))}
      {!data.items.length && data.ready && gh >= 2 ? (
        <Text style={[st.calm, { color: pal.muted }]}>Ser du noe som kan gå galt? Meld det med en gang – det tar et halvt minutt.</Text>
      ) : null}
    </ProCard>
  );
}

/* ------------------------------------------------------------------ */

const st = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarTxt: { fontWeight: '600', fontFamily: FONT },
  seg: { flexDirection: 'row', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 2, alignSelf: 'flex-start' },
  segItem: { paddingHorizontal: 10, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segTxt: { fontSize: 12, fontWeight: '600', fontFamily: FONT },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 11, borderRadius: 14,
  },
  ctaTxt: { fontSize: 12, fontWeight: '600', fontFamily: FONT },
  iconBtn: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth,
  },
  sub: { fontSize: 12, fontFamily: FONT },
  calm: { fontSize: 12, lineHeight: 16, marginTop: 6, fontFamily: FONT },
  more: { fontSize: 11, marginTop: 4, fontFamily: FONT },
  dot: { width: 7, height: 7, borderRadius: 4 },
  bigVal: { fontSize: 24, fontWeight: '600', lineHeight: 28, fontFamily: FONT },

  focusBody: { flex: 1, justifyContent: 'center', minHeight: 0 },
  focusBig: {
    fontSize: 32, fontWeight: '600', lineHeight: 36, fontFamily: FONT, fontVariant: ['tabular-nums'],
  },
  focusBigCompact: { fontSize: 18, fontWeight: '600', fontFamily: FONT, fontVariant: ['tabular-nums'] },
  focusFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8,
  },
  focusBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  cdRow: { gap: 4 },
  cdHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cdLabel: { fontSize: 12, fontFamily: FONT, flexShrink: 1 },
  cdValueNarrow: { fontSize: 15, fontWeight: '600', fontFamily: FONT, marginBottom: 3 },
  cdValue: {
    fontSize: 13, fontWeight: '600', fontFamily: FONT, marginLeft: 'auto', flexShrink: 1, textAlign: 'right',
  },

  vatTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vatInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, height: 36, minWidth: 0,
  },
  vatInput: {
    flex: 1, minWidth: 0, fontSize: 16, fontFamily: FONT, paddingVertical: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  vatKr: { fontSize: 12, fontFamily: FONT },
  vatRates: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  vatOut: { flexDirection: 'row', gap: 8, marginTop: 10 },
  vatCell: { flex: 1, minWidth: 0 },
  vatLbl: { fontSize: 11, fontFamily: FONT },
  vatVal: { fontSize: 14, fontFamily: FONT, marginTop: 1, fontVariant: ['tabular-nums'] },

  kindDisc: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  personBody: { flex: 1, minWidth: 0 },
  personName: { fontSize: 14, fontFamily: FONT },
  personMeta: { fontSize: 11, marginTop: 1, fontFamily: FONT },
  tenderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  approvalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
});
