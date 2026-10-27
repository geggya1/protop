/**
 * Prosesskart (prosesslandskap) generert fra prosessene: ledelsesprosesser øverst,
 * verdikjeden (kjerneprosesser i rekkefølge) i midten og støtteprosesser nederst, med
 * kundens behov inn til venstre og fornøyd kunde ut til høyre.
 * Hver boks er trykkbar og åpner prosessen. Ingen tegning – kartet følger dataene.
 * Med onReorder kan rekkefølgen endres her (lagres som order på prosessene).
 */
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { protopBrand } from '../../src/brand/protopBrand';

const WEB = Platform.OS === 'web';
// Pilene i verdikjeden: hakk inn til venstre, spiss til høyre.
const NOTCH = 12;
const TIP = 16;
// Smalere enn dette blir navnene delt midt i ordet; da brytes kjeden heller over flere rader.
const CHAIN_MIN = 140;
const CHAIN_GAP = 4;
// Fylte piler: ProTop-blå mot marineblå, mørk nok for hvit tekst i lyst og mørkt tema.
const CHAIN_FROM = mix(protopBrand.digitalBlue, protopBrand.navy, 0.2);
const CHAIN_TO = mix(protopBrand.digitalBlue, protopBrand.navy, 0.55);

const CATEGORIES = ['ledelse', 'kjerne', 'stotte'];

function mix(a, b, t) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function sortProcesses(list) {
  return [...(list || [])].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999)
    || String(a.code || '').localeCompare(String(b.code || ''), 'nb', { numeric: true })
    || String(a.title).localeCompare(String(b.title), 'nb'));
}

/** Størrelsen på et element, for SVG-omriss som må følge den. */
function useSize() {
  const [size, setSize] = useState(null);
  const onLayout = (e) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize((cur) => (cur && cur.w === w && cur.h === h ? cur : { w, h }));
  };
  return [size, onLayout];
}

const pts = (list) => list.map(([x, y]) => `${x},${y}`).join(' ');

function BoxText({ proc, live, lines = 2, ink, muted, status }) {
  return (
    <>
      {proc.code ? <Text style={{ color: muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>{proc.code}</Text> : null}
      {/* Lange sammensatte ord deles med bindestrek (nettleseren, lang="nb") i stedet for midt i ordet. */}
      <Text style={{ color: ink, fontSize: 13, fontWeight: '700', lineHeight: 17, ...(WEB ? { hyphens: 'auto', WebkitHyphens: 'auto' } : {}) }} numberOfLines={lines}>{proc.title}</Text>
      <Text style={{ color: status, fontSize: 10, fontWeight: '600' }}>{live ? `v${proc.publishedVersion} i bruk` : 'utkast'}</Text>
    </>
  );
}

/** Flytt-knapper i redigeringsmodus. */
function MoveButtons({ onMove, first, last, color, label }) {
  const btn = (dir, icon, disabled) => (
    <Pressable
      onPress={() => onMove(dir)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Flytt ${label} ${dir < 0 ? 'fram' : 'bak'}`}
      hitSlop={6}
      style={({ pressed }) => ({ padding: 3, borderRadius: 8, opacity: disabled ? 0.3 : (pressed ? 0.6 : 1), ...(WEB && !disabled ? { cursor: 'pointer' } : {}) })}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
      {btn(-1, 'arrow-back-circle', first)}
      {btn(1, 'arrow-forward-circle', last)}
    </View>
  );
}

/** Ledelses- og støtteprosess: kort med fargestripe for båndet. */
function Box({ proc, onOpen, colors, tone, move }) {
  const live = !!proc.publishedVersion;
  return (
    <Pressable
      onPress={move ? undefined : () => onOpen(proc.id)}
      accessibilityRole={move ? undefined : 'button'}
      accessibilityLabel={move ? undefined : `Åpne prosess ${proc.code || ''} ${proc.title}`}
      style={({ pressed, hovered }) => ({
        flexGrow: 1,
        flexBasis: 170,
        minHeight: 66,
        paddingVertical: 10,
        paddingLeft: 14,
        paddingRight: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: live ? `${tone}55` : colors.line,
        borderStyle: live ? 'solid' : 'dashed',
        backgroundColor: pressed ? colors.brandSoft : colors.card,
        justifyContent: 'center',
        gap: 2,
        overflow: 'hidden',
        ...(WEB ? {
          cursor: move ? 'default' : 'pointer',
          transition: 'box-shadow 120ms ease, transform 120ms ease',
          boxShadow: hovered && !move ? '0 4px 14px rgba(7,39,76,0.14)' : '0 1px 2px rgba(7,39,76,0.06)',
          transform: hovered && !move ? 'translateY(-1px)' : 'none',
        } : {}),
      })}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: live ? tone : colors.line }} />
      <BoxText proc={proc} live={live} ink={colors.ink} muted={colors.muted} status={live ? tone : colors.muted} />
      {move ? <MoveButtons {...move} color={tone} label={proc.title} /> : null}
    </Pressable>
  );
}

function chevronPoints(w, h, first, last) {
  const s = 1;
  const left = first ? [[s, h - s], [s, s]] : [[s, h - s], [NOTCH, h / 2], [s, s]];
  const right = last ? [[w - s, s], [w - s, h - s]] : [[w - TIP, s], [w - s, h / 2], [w - TIP, h - s]];
  return pts([...left, ...right]);
}

/** Prosess i verdikjeden: fylt pil. Utkast har stiplet omriss og ingen fyll. */
function Chevron({ proc, onOpen, colors, first, last, width, move }) {
  const live = !!proc.publishedVersion;
  const [size, onLayout] = useSize();
  const grad = `iso-chain-${String(proc.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <Pressable
      onPress={move ? undefined : () => onOpen(proc.id)}
      onLayout={onLayout}
      accessibilityRole={move ? undefined : 'button'}
      accessibilityLabel={move ? undefined : `Åpne prosess ${proc.code || ''} ${proc.title}`}
      style={{
        ...(width ? { width } : { flexGrow: 1, flexBasis: CHAIN_MIN }),
        minHeight: 74,
        paddingVertical: 10,
        paddingLeft: first ? 14 : NOTCH + 8,
        paddingRight: last ? 12 : TIP + 6,
        justifyContent: 'center',
        gap: 2,
        ...(WEB ? { cursor: move ? 'default' : 'pointer' } : {}),
      }}
    >
      {({ pressed, hovered }) => (
        <>
          {size ? (
            <Svg pointerEvents="none" width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }}>
              <Defs>
                <LinearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={CHAIN_FROM} />
                  <Stop offset="1" stopColor={CHAIN_TO} />
                </LinearGradient>
              </Defs>
              <Polygon
                points={chevronPoints(size.w, size.h, first, last)}
                fill={live ? `url(#${grad})` : (colors.card || 'none')}
                fillOpacity={live && (pressed || hovered) && !move ? 0.88 : 1}
                stroke={live ? CHAIN_TO : (colors.brand || 'none')}
                strokeWidth={live ? 1 : 1.5}
                strokeDasharray={live ? undefined : '5,4'}
                strokeLinejoin="round"
              />
            </Svg>
          ) : null}
          <BoxText
            proc={proc}
            live={live}
            lines={3}
            ink={live ? '#ffffff' : colors.ink}
            muted={live ? 'rgba(255,255,255,0.78)' : colors.muted}
            status={live ? 'rgba(255,255,255,0.92)' : colors.muted}
          />
          {move ? <MoveButtons {...move} color={live ? '#ffffff' : colors.brand} label={proc.title} /> : null}
        </>
      )}
    </Pressable>
  );
}

/** Kjernene i rekkefølge. Får de ikke plass på én rad, fordeles de jevnt på flere (7 → 4 + 3). */
function Chain({ core, onOpen, colors, mover }) {
  const [w, setW] = useState(0);
  const perRow = w ? Math.max(1, Math.min(core.length, Math.floor((w + CHAIN_GAP) / (CHAIN_MIN + CHAIN_GAP)))) : core.length;
  const each = Math.ceil(core.length / Math.ceil(core.length / perRow));
  const width = w ? Math.floor((w - CHAIN_GAP * (each - 1)) / each) : 0;
  return (
    <View
      onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: CHAIN_GAP, rowGap: 8 }}
    >
      {core.map((p, i) => (
        <Chevron key={p.id} proc={p} onOpen={onOpen} colors={colors} first={i === 0} last={i === core.length - 1} width={width} move={mover?.(core, i)} />
      ))}
    </View>
  );
}

function Band({ label, icon, tone, count, children }) {
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 14, backgroundColor: `${tone}12`, borderWidth: 1, borderColor: `${tone}26` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={13} color="#ffffff" />
        </View>
        <Text style={{ color: tone, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>{label.toUpperCase()}</Text>
        {count ? <Text style={{ color: tone, fontSize: 11, opacity: 0.7 }}>{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Inn (kundens behov) og ut (fornøyd kunde) på hver side av hele landskapet.
 * Bred skjerm: høye søyler formet som piler. Smal skjerm: bånd over og under.
 */
function EndCap({ side, wide, colors, title, text, icon, tone }) {
  const [size, onLayout] = useSize();
  const out = side === 'out';
  if (!wide) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: `${tone}16` }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color="#ffffff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>{text}</Text>
        </View>
        {out ? null : <Ionicons name="arrow-down" size={16} color={tone} />}
      </View>
    );
  }
  const shape = (w, h) => (out
    ? pts([[0, 0], [w, 0], [w, h], [0, h], [TIP, h / 2]])
    : pts([[0, 0], [w - TIP, 0], [w, h / 2], [w - TIP, h], [0, h]]));
  return (
    <View onLayout={onLayout} style={{ width: 112, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', gap: 8, paddingLeft: out ? TIP + 6 : 10, paddingRight: out ? 10 : TIP + 6, paddingVertical: 16 }}>
      {size ? (
        <Svg pointerEvents="none" width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }}>
          <Polygon points={shape(size.w, size.h)} fill={tone} fillOpacity={0.14} />
        </Svg>
      ) : null}
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color="#ffffff" />
      </View>
      <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function ToolButton({ colors, icon, label, onPress, disabled, primary }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        minHeight: 32,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: primary ? colors.brand : colors.line,
        backgroundColor: primary ? colors.brand : (pressed ? colors.sunken : colors.card),
        opacity: disabled ? 0.6 : 1,
        ...(WEB ? { cursor: disabled ? 'default' : 'pointer' } : {}),
      })}
    >
      <Ionicons name={icon} size={15} color={primary ? '#ffffff' : colors.ink} />
      <Text style={{ color: primary ? '#ffffff' : colors.ink, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export default function IsoProcessMap({ processes, onOpen, wide, onReorder = null }) {
  const colors = useColors();
  // Valgt rekkefølge mens den endres: { ledelse: [id], kjerne: [id], stotte: [id] }.
  const [order, setOrder] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const live = (processes || []).filter((p) => !p.archived);
  if (!live.length) return null;
  const sorted = Object.fromEntries(CATEGORIES.map((c) => [c, sortProcesses(live.filter((p) => p.category === c))]));
  const byId = new Map(live.map((p) => [p.id, p]));
  const list = (c) => (order ? order[c].map((id) => byId.get(id)).filter(Boolean) : sorted[c]);
  const mover = (category) => (order ? (items, i) => ({
    first: i === 0,
    last: i === items.length - 1,
    onMove: (dir) => setOrder((cur) => {
      const ids = [...cur[category]];
      const j = i + dir;
      if (j < 0 || j >= ids.length) return cur;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...cur, [category]: ids };
    }),
  }) : null);

  async function save() {
    setSaving(true);
    setErr('');
    const changed = CATEGORIES.filter((c) => order[c].join() !== sorted[c].map((p) => p.id).join());
    const res = changed.length ? await onReorder(Object.fromEntries(changed.map((c) => [c, order[c]]))) : { ok: true };
    setSaving(false);
    if (res?.ok === false) {
      setErr(res.error || 'Kunne ikke lagre rekkefølgen.');
      return;
    }
    setOrder(null);
  }

  const tones = { ledelse: colors.accent || CHAIN_TO, kjerne: CHAIN_FROM, stotte: colors.success || CHAIN_TO };
  const lead = list('ledelse');
  const core = list('kjerne');
  const support = list('stotte');
  const boxes = (items, c) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((p, i) => <Box key={p.id} proc={p} onOpen={onOpen} colors={colors} tone={tones[c]} move={mover(c)?.(items, i)} />)}
    </View>
  );
  const bands = (
    <View style={{ flex: 1, gap: 10, minWidth: 0 }}>
      {lead.length ? <Band label="Ledelsesprosesser" icon="ribbon-outline" tone={tones.ledelse} count={lead.length}>{boxes(lead, 'ledelse')}</Band> : null}
      {core.length ? (
        <Band label="Verdikjeden – kjerneprosesser" icon="arrow-forward" tone={tones.kjerne} count={core.length}>
          <Chain core={core} onOpen={onOpen} colors={colors} mover={mover('kjerne')} />
        </Band>
      ) : null}
      {support.length ? <Band label="Støtteprosesser" icon="construct-outline" tone={tones.stotte} count={support.length}>{boxes(support, 'stotte')}</Band> : null}
    </View>
  );
  const input = <EndCap side="in" wide={wide} colors={colors} tone={CHAIN_FROM} icon="people" title="Kunder og interessenter" text="Behov og krav" />;
  const output = <EndCap side="out" wide={wide} colors={colors} tone={colors.success || CHAIN_TO} icon="happy" title="Fornøyd kunde" text="Leveranse og oppfølging" />;

  return (
    <View style={{ gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card }}>
      {onReorder ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {order ? <Text style={{ color: colors.muted, fontSize: 12, flex: 1, minWidth: 200 }}>Flytt prosessene med pilene. Rekkefølgen gjelder for alle og endrer ikke selve prosessene.</Text> : null}
          {err ? <Text style={{ color: colors.danger, fontSize: 12 }}>{err}</Text> : null}
          {order ? (
            <>
              <ToolButton colors={colors} icon="close" label="Avbryt" onPress={() => { setOrder(null); setErr(''); }} disabled={saving} />
              <ToolButton colors={colors} icon="checkmark" label={saving ? 'Lagrer …' : 'Lagre rekkefølgen'} onPress={save} disabled={saving} primary />
            </>
          ) : (
            <ToolButton colors={colors} icon="swap-horizontal" label="Endre rekkefølge" onPress={() => setOrder(Object.fromEntries(CATEGORIES.map((c) => [c, sorted[c].map((p) => p.id)])))} />
          )}
        </View>
      ) : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10, alignItems: 'stretch' }}>
        {input}
        {bands}
        {output}
      </View>
      <Text style={{ color: colors.muted, fontSize: 11 }}>Trykk på en prosess for å se kartet, styrende dokumenter og risiko. Stiplet ramme = ikke publisert ennå.</Text>
    </View>
  );
}
