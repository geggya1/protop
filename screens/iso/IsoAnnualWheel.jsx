/**
 * ISO → Styring → Årshjul, grafisk: det samme hjulet som HR-årshjulet (buer for faste aktiviteter,
 * farget etter område), med datoene fra registrene som punkter på månedsringen. Ved siden av
 * står den valgte måneden, og under ligger hele året som tidslinje.
 */
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { prettyDate } from '../../src/iso/core';
import { ANNUAL_AREAS, annualWheelGraphic, pageArea, pageLabel } from '../../src/iso/planning';
import { HR_ANNUAL_ACTIVITIES, activityPeriod, wheelLayout } from '../../src/hr/annualWheel';
import { chartColorsFor } from '../../src/ui/chartColors';
import { radius, space, type } from '../../src/ui/tokens';
import HrAnnualWheel from '../hr/HrAnnualWheel';
import HrAnnualTimeline from '../hr/HrAnnualTimeline';
import { Banner, Btn, Pill } from './isoUi';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];
const pointer = Platform.OS === 'web' ? { cursor: 'pointer' } : {};
const areaLabel = (id) => ANNUAL_AREAS.find((a) => a.id === id)?.label || 'Annet';

/**
 * Én linje i månedspanelet: fargestripe for området, tittel og detaljer. Knappen til høyre ligger
 * ved siden av den trykkbare delen, ikke inni den (ingen knapp i knapp).
 */
function MonthItem({ color, icon, title, subtitle, onPress, right, nativeID }) {
  const colors = useColors();
  return (
    <View style={[styles.item, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID={nativeID}>
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={title}
        style={({ pressed, hovered }) => [styles.itemMain, { opacity: pressed ? 0.7 : 1 }, hovered ? { backgroundColor: colors.sunken } : null, onPress ? pointer : null]}
      >
        {icon ? <Ionicons name={icon} size={16} color={color} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[styles.itemTitle, { color: colors.ink }]} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={[styles.small, { color: colors.muted }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
      </Pressable>
      {right ? <View style={styles.itemRight}>{right}</View> : null}
    </View>
  );
}

/** Tall med forklaring. */
function Kpi({ label, value, hint }) {
  const colors = useColors();
  return (
    <View style={[styles.kpi, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      <Text style={[styles.small, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.kpiValue, { color: colors.ink }]}>{value}</Text>
      {hint ? <Text style={[styles.small, { color: colors.muted }]} numberOfLines={2}>{hint}</Text> : null}
    </View>
  );
}

/** Månedene som små søyler (høyde = antall aktiviteter). Trykk for å velge måneden. */
function MonthStrip({ counts, selected, nowMonth, onSelect }) {
  const colors = useColors();
  const chart = chartColorsFor(colors);
  const max = Math.max(1, ...counts);
  return (
    <View style={styles.strip} accessibilityRole="tablist" nativeID="iso-annual-months">
      {MONTH_SHORT.map((m, i) => {
        const on = i === selected;
        const now = i === nowMonth;
        return (
          <Pressable
            key={m}
            onPress={() => onSelect(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${m}: ${counts[i]} aktiviteter`}
            nativeID={`iso-annual-month-${i}`}
            style={({ hovered }) => [
              styles.stripCell,
              { borderColor: on ? colors.brand : 'transparent', backgroundColor: on ? colors.brandSoft : (hovered ? colors.sunken : 'transparent') },
              pointer,
            ]}
          >
            <Text style={[styles.stripCount, { color: counts[i] ? colors.muted : 'transparent' }]}>{String(counts[i])}</Text>
            <View style={styles.stripBarBox}>
              <View
                style={[
                  styles.stripBar,
                  {
                    height: counts[i] ? 6 + Math.sqrt(counts[i] / max) * 20 : 2,
                    backgroundColor: counts[i] ? (on ? colors.brand : (now ? colors.brandInk : chart.planned)) : colors.line,
                  },
                ]}
              />
            </View>
            <Text style={[styles.stripLabel, { color: on ? colors.brandInk : (now ? colors.ink : colors.muted), fontWeight: on || now ? '600' : '400' }]}>{m}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Legend({ areas, withPoints }) {
  const colors = useColors();
  const chart = chartColorsFor(colors);
  return (
    <View style={styles.legend} accessibilityRole="list" nativeID="iso-annual-legend">
      {areas.map((a) => (
        <View key={a} style={styles.legendItem}>
          <View style={[styles.legendBar, { backgroundColor: chart.areas[a] }]} />
          <Text style={[styles.small, { color: colors.muted }]}>{areaLabel(a)}</Text>
        </View>
      ))}
      {withPoints ? (
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { borderColor: colors.muted }]} />
          <Text style={[styles.small, { color: colors.muted }]}>Punkt = dato fra registrene</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Hjulet, måneden og tidslinjen. months fra annualWheel(state, { year }).
 * month/onMonth: valgt måned. open(record) åpner aktiviteten, go(page, params) går til siden.
 * makeTasks: { label, busy, onPress, msg } når det kan lages oppgaver for inneværende måned.
 */
export default function IsoAnnualWheel({
  months, year, month, onMonth, open, go, today = new Date(), makeTasks = null, hr = null,
}) {
  const colors = useColors();
  const chart = chartColorsFor(colors);
  const { isPhone, width } = useLayout();
  const graphic = useMemo(() => annualWheelGraphic(months), [months]);
  const layout = useMemo(() => wheelLayout([], { extra: graphic.planned }), [graphic]);
  const points = useMemo(() => graphic.points.map((p) => ({ ...p, color: chart.areas[p.area] })), [graphic, chart.areas]);
  const colorOf = (i) => chart.areas[i.area] || chart.areas.annet;
  const thisYear = today.getFullYear() === Number(year);
  const nowMonth = thisYear ? today.getMonth() : -1;

  const counts = months.map((m) => m.planned.length + m.dated.reduce((n, d) => n + (d.count || 1), 0));
  const sel = months[month] || months[0];
  const hrInMonth = hr ? HR_ANNUAL_ACTIVITIES.filter((a) => a.months.includes(month)) : [];
  const areasUsed = ANNUAL_AREAS.map((a) => a.id).filter((id) => graphic.planned.some((i) => i.area === id) || graphic.points.some((p) => p.area === id));
  const datedTotal = graphic.points.reduce((n, p) => n + p.count, 0);
  const auto = graphic.planned.filter((i) => i.record.createTasks).length;
  const wheelSize = isPhone ? Math.max(260, Math.min(340, width - 64)) : 360;
  const monthName = sel.name.toLowerCase();

  return (
    <View style={styles.page}>
      <View style={[styles.hero, isPhone && styles.heroPhone]}>
        <View style={styles.wheelCol}>
          <HrAnnualWheel
            colors={colors}
            layout={layout}
            year={year}
            selectedMonth={month}
            onSelectMonth={onMonth}
            size={wheelSize}
            today={today}
            itemColor={colorOf}
            points={points}
            nativeID="iso-annual-wheel"
            label={`Årshjul ${year}: ${graphic.planned.length} faste aktiviteter og ${datedTotal} datoer fra registrene. Valgt måned: ${monthName}, ${counts[month]} aktiviteter.`}
            center={{ hero: String(counts[month]), lines: [`i ${monthName}`, month === nowMonth ? 'denne måneden' : ''] }}
          />
          <Legend areas={areasUsed.length ? areasUsed : ['ledelse', 'kvalitet', 'miljo', 'hms']} withPoints={graphic.points.length > 0} />
        </View>
        <View style={styles.detailCol}>
          <View style={styles.kpis}>
            <Kpi label="Faste aktiviteter" value={String(graphic.planned.length)} hint={auto ? `${auto} lager oppgave selv` : 'Ingen lager oppgave selv'} />
            <Kpi label="Datoer fra registrene" value={String(datedTotal)} hint="Revisjoner, frister, revurderinger" />
            {thisYear ? <Kpi label="Denne måneden" value={String(counts[nowMonth])} hint={months[nowMonth].name} /> : null}
          </View>
          <MonthStrip counts={counts} selected={month} nowMonth={nowMonth} onSelect={onMonth} />
          <View style={styles.monthHead}>
            <Text style={[styles.monthTitle, { color: colors.ink }]} nativeID="iso-annual-month-title">{`${sel.name} ${year}`}</Text>
            {month === nowMonth ? <Pill label="Nå" tone="info" /> : null}
            <View style={{ flex: 1 }} />
            {makeTasks && month === nowMonth ? (
              <Btn small icon="checkbox-outline" label={makeTasks.label} busy={makeTasks.busy} onPress={makeTasks.onPress} />
            ) : null}
          </View>
          {makeTasks?.msg && month === nowMonth ? <Banner tone="ok" text={makeTasks.msg} /> : null}
          {sel.planned.map((r) => {
            const area = graphic.planned.find((i) => i.record.id === r.id)?.area || 'annet';
            return (
              <MonthItem
                key={r.id}
                nativeID={`iso-annual-item-${r.id}`}
                color={chart.areas[area]}
                title={r.title}
                subtitle={[
                  areaLabel(area),
                  r.ownerName || r.responsibleRole,
                  r.frequency,
                  (r.months || []).length > 1 ? (r.months || []).map((n) => n.slice(0, 3).toLowerCase()).join(', ') : '',
                  r.createTasks ? 'lager oppgave' : '',
                ].filter(Boolean).join(' · ')}
                onPress={() => open(r)}
                right={r.page ? <Btn small icon="arrow-forward-outline" label={pageLabel(r.page) || 'Åpne'} accessibilityLabel={`Gå til ${pageLabel(r.page)}`} onPress={() => go(r.page)} /> : null}
              />
            );
          })}
          {sel.dated.map((d) => (
            <MonthItem
              key={d.key}
              color={chart.areas[pageArea(d.page)]}
              icon={d.count ? 'layers-outline' : 'calendar-outline'}
              title={`${d.title}${d.count ? ` (${d.count})` : ''}`}
              subtitle={[d.date ? prettyDate(d.date) : '', pageLabel(d.page)].filter(Boolean).join(' · ')}
              onPress={() => go(d.page, d.open ? { open: d.open } : {})}
            />
          ))}
          {!sel.planned.length && !sel.dated.length ? (
            <View style={[styles.empty, { borderColor: colors.line }]}>
              <Text style={[styles.small, { color: colors.muted }]}>{`Ingenting i ledelsessystemet i ${monthName}.`}</Text>
            </View>
          ) : null}
          {hr && hrInMonth.length ? (
            <View style={styles.group} nativeID="iso-annual-hr">
              <View style={styles.monthHead}>
                <Text style={[styles.groupTitle, { color: colors.muted }]}>Fra HR-årshjulet</Text>
                <View style={{ flex: 1 }} />
                {hr.onOpen ? <Btn small icon="arrow-forward-outline" label="Åpne HR-årshjulet" onPress={hr.onOpen} /> : null}
              </View>
              {hrInMonth.map((a) => (
                <MonthItem
                  key={a.id}
                  color={colors.muted}
                  icon={a.kind === 'lov' ? 'shield-checkmark-outline' : 'ellipse-outline'}
                  title={a.title}
                  subtitle={[a.kind === 'lov' ? 'Lovkrav' : 'Anbefalt', activityPeriod(a), a.law].filter(Boolean).join(' · ')}
                  onPress={hr.onOpen}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {layout.items.length ? (
        <View style={[styles.section, { borderTopColor: colors.line }]}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Året i oversikt</Text>
          <Text style={[styles.small, { color: colors.muted }]}>Hver faste aktivitet på én linje over månedene den gjelder. Trykk en linje for å velge måneden.</Text>
          <HrAnnualTimeline
            colors={colors}
            layout={layout}
            nowMonth={nowMonth}
            selectedMonth={month}
            onSelectMonth={onMonth}
            compact={isPhone}
            itemColor={colorOf}
            nativeID="iso-annual-timeline"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.md },
  hero: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  heroPhone: { flexDirection: 'column', alignItems: 'stretch' },
  wheelCol: { alignItems: 'center', gap: space.sm },
  detailCol: { flex: 1, minWidth: 0, gap: space.xs },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  kpi: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 4 },
  kpiValue: { ...type.h2 },
  strip: { flexDirection: 'row', gap: 2, marginTop: 4 },
  stripCell: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 6, paddingBottom: 4, borderRadius: radius.control, borderWidth: 1 },
  stripBarBox: { height: 26, justifyContent: 'flex-end' },
  stripBar: { width: 10, borderRadius: 3 },
  stripLabel: { ...type.caption },
  stripCount: { fontSize: 10, lineHeight: 12 },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  monthTitle: { ...type.title },
  item: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderRadius: radius.control, overflow: 'hidden' },
  stripe: { width: 4 },
  itemMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10 },
  itemRight: { justifyContent: 'center', paddingRight: 10 },
  itemTitle: { ...type.bodyStrong },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.control, padding: space.sm, alignItems: 'center' },
  group: { gap: space.xs, marginTop: space.xs },
  groupTitle: { ...type.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { gap: space.xs, borderTopWidth: 1, paddingTop: space.md },
  sectionTitle: { ...type.title },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center', maxWidth: 360 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBar: { width: 14, height: 6, borderRadius: radius.pill },
  legendDot: { width: 9, height: 9, borderRadius: radius.pill, borderWidth: 2 },
  small: { ...type.caption },
});
