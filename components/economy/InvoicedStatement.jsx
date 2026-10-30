import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useColors } from '../../src/context/ThemeContext';
import {
  buildInvoicedStatement,
  chartCanvasHeight,
  chartCanvasWidth,
  formatStatementAmount,
  invoicedStatementWorkbook,
  layoutMonthChart,
  layoutYearChart,
  STATEMENT_MONTHS,
  STATEMENT_YEAR_BAR,
  STATEMENT_YEAR_WINDOW,
  statementRow,
  statementTableYears,
  statementTip,
  statementYearColor,
  statementYearWindow,
  yearWindowEnd,
  yearWindowOffset,
} from '../../src/economy/invoicedStatement.js';
import { readInvoicedStatement } from '../../src/economy/invoicedStatementStorage.js';
import { watchInvoices } from '../../src/economy/invoiceStorage.js';

function downloadWorkbook(statement, section, filename) {
  if (typeof document === 'undefined' || !statement) return;
  const xml = invoicedStatementWorkbook(statement, section);
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function canDownload() {
  return typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

/**
 * Bredden til en flate. På web leses den før første tegning, så grafer og
 * tabell ikke vises smale først og så vokser når onLayout kommer.
 */
function useMeasuredWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (typeof node?.getBoundingClientRect !== 'function') return;
    const next = node.getBoundingClientRect().width;
    if (next > 0) setWidth(next);
  }, []);
  const onLayout = (event) => setWidth(event.nativeEvent.layout.width);
  return [ref, width, onLayout];
}

function amountOf(series, year, index) {
  const value = statementRow(series, year)[index];
  return value == null ? null : value;
}

function totalOf(statement, year) {
  if (!statement?.totals) return null;
  const value = statement.totals[year] ?? statement.totals[String(year)];
  return value == null ? null : value;
}

function Panel({ title, subtitle, children, nativeID }) {
  const colors = useColors();
  return (
    <View nativeID={nativeID} style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={[styles.panelHead, { backgroundColor: colors.sunken, borderBottomColor: colors.line }]}>
        <Text accessibilityRole="header" style={[styles.panelTitle, { color: colors.ink }]}>{title}</Text>
      </View>
      <View style={styles.panelBody}>
        {subtitle ? <Text style={[styles.sub, { color: colors.ink }]}>{subtitle}</Text> : null}
        {children}
      </View>
    </View>
  );
}

function Legend({ years, colorYears }) {
  const colors = useColors();
  return (
    <View style={styles.legend}>
      {years.map((year) => (
        <View key={year} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: statementYearColor(year, colorYears) }]} />
          <Text style={[styles.legendText, { color: colors.ink }]}>{year}</Text>
        </View>
      ))}
    </View>
  );
}

function Axis({ layout, colors }) {
  return (
    <>
      {layout.yTicks.map((tick) => (
        <Line
          key={`g-${tick.value}`}
          x1={layout.padL}
          x2={layout.width - 8}
          y1={tick.y}
          y2={tick.y}
          stroke={colors.line}
          strokeWidth={1}
        />
      ))}
      {layout.yTicks.map((tick) => (
        <SvgText
          key={`t-${tick.value}`}
          x={layout.padL - 8}
          y={tick.y + 3}
          fontSize={10}
          fill={colors.muted}
          textAnchor="end"
        >
          {tick.label}
        </SvgText>
      ))}
      {layout.labels.map((label) => (
        <SvgText
          key={label.label}
          x={label.x}
          y={label.y}
          fontSize={11}
          fill={colors.muted}
          textAnchor="middle"
        >
          {label.label}
        </SvgText>
      ))}
    </>
  );
}

function ChartFrame({ nativeID, canvasWidth, canvasHeight, tip, children }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} nativeID={nativeID}>
      <View style={{ width: canvasWidth, height: canvasHeight, position: 'relative' }}>
        {children}
        {tip ? (
          <View pointerEvents="none" style={[styles.tip, { left: tip.left, top: tip.top }]}>
            <Text style={styles.tipTitle}>{tip.title}</Text>
            <Text style={styles.tipBody}>{tip.body}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function placeTip(x, y, canvasWidth) {
  return {
    left: Math.min(Math.max(4, x - 54), Math.max(4, canvasWidth - 176)),
    top: Math.max(4, y - 46),
  };
}

function MonthChart({
  statement,
  years,
  colorYears,
  series,
  mode,
  nativeID,
}) {
  const colors = useColors();
  const months = statement?.months?.length === 12 ? statement.months : STATEMENT_MONTHS;
  const [measureRef, width, onLayout] = useMeasuredWidth();
  const [tip, setTip] = useState(null);
  const canvas = chartCanvasWidth(width, 12, 56);
  const height = chartCanvasHeight(canvas);
  const layout = layoutMonthChart({
    years,
    series,
    width: canvas,
    height,
    mode,
  });

  function show(item) {
    const text = statementTip(months[item.month], item.year, item.value);
    setTip({
      ...text,
      ...placeTip(item.x, item.y, canvas),
    });
  }

  return (
    <View ref={measureRef} onLayout={onLayout}>
      <ChartFrame nativeID={nativeID} canvasWidth={canvas} canvasHeight={height} tip={tip}>
        <Svg width={canvas} height={height} pointerEvents="none">
          <Axis layout={layout} colors={colors} />
          {mode === 'bars' ? layout.bars.map((bar) => (
            bar.h > 0 ? (
              <Rect
                key={`${bar.year}-${bar.month}`}
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                fill={statementYearColor(bar.year, colorYears)}
              />
            ) : null
          )) : layout.segments.map((segment) => (
            segment.points.length < 2 ? (
              <Circle
                key={`${segment.year}-${segment.points[0]?.month}`}
                cx={segment.points[0]?.x || 0}
                cy={segment.points[0]?.y || 0}
                r={3}
                fill={statementYearColor(segment.year, colorYears)}
              />
            ) : (
              <Polyline
                key={`${segment.year}-${segment.points[0]?.month}`}
                points={segment.points.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke={statementYearColor(segment.year, colorYears)}
                strokeWidth={2}
              />
            )
          ))}
        </Svg>
        {mode === 'bars' ? layout.bars.map((bar) => {
          const hit = Math.max(bar.h, 14);
          return (
            <Pressable
              key={`hit-${bar.year}-${bar.month}`}
              accessibilityLabel={`${months[bar.month]} ${bar.year}: ${formatStatementAmount(bar.value)} NOK`}
              onPress={() => show(bar)}
              onHoverIn={() => show(bar)}
              onHoverOut={() => setTip(null)}
              style={{
                position: 'absolute',
                left: bar.x,
                top: bar.y + bar.h - hit,
                width: Math.max(bar.w, 6),
                height: hit,
              }}
            />
          );
        }) : layout.points.map((point) => (
          <Pressable
            key={`hit-${point.year}-${point.month}`}
            accessibilityLabel={`${months[point.month]} ${point.year}: ${formatStatementAmount(point.value)} NOK`}
            onPress={() => show(point)}
            onHoverIn={() => show(point)}
            onHoverOut={() => setTip(null)}
            style={{
              position: 'absolute',
              left: point.x - 8,
              top: point.y - 8,
              width: 16,
              height: 16,
            }}
          />
        ))}
      </ChartFrame>
    </View>
  );
}

function YearChart({ statement }) {
  const colors = useColors();
  const years = statement?.allYears || [];
  const amounts = years.map((year) => totalOf(statement, year));
  const [measureRef, width, onLayout] = useMeasuredWidth();
  const [tip, setTip] = useState(null);
  const canvas = chartCanvasWidth(width, Math.max(years.length, 1), 40);
  const height = chartCanvasHeight(canvas);
  const layout = layoutYearChart({ years, amounts, width: canvas, height });

  function show(bar) {
    if (bar.value == null) return;
    setTip({
      title: String(bar.year),
      body: `${formatStatementAmount(bar.value)} NOK`,
      ...placeTip(bar.x, bar.y, canvas),
    });
  }

  return (
    <View ref={measureRef} onLayout={onLayout}>
      <ChartFrame nativeID="economy-invoiced-yearly-chart" canvasWidth={canvas} canvasHeight={height} tip={tip}>
        <Svg width={canvas} height={height} pointerEvents="none">
          <Axis layout={layout} colors={colors} />
          {layout.bars.map((bar) => (
            bar.h > 0 ? (
              <Rect
                key={bar.year}
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                fill={STATEMENT_YEAR_BAR}
              />
            ) : null
          ))}
        </Svg>
        {layout.bars.map((bar) => {
          const hit = Math.max(bar.h, 14);
          return (
            <Pressable
              key={`hit-${bar.year}`}
              accessibilityLabel={`${bar.year}: ${formatStatementAmount(bar.value)} NOK`}
              onPress={() => show(bar)}
              onHoverIn={() => show(bar)}
              onHoverOut={() => setTip(null)}
              style={{
                position: 'absolute',
                left: bar.x,
                top: bar.y + bar.h - hit,
                width: bar.w,
                height: hit,
              }}
            />
          );
        })}
      </ChartFrame>
    </View>
  );
}

function DataTable({
  nativeID,
  statement,
  years,
  series,
  end,
  onEnd,
  onDownload,
}) {
  const colors = useColors();
  const months = statement?.months || [];
  const scrollRef = useRef(null);
  const reported = useRef(end);
  const [viewportRef, viewport, onViewportLayout] = useMeasuredWidth();
  const count = years.length;
  const shown = Math.max(1, Math.min(count, STATEMENT_YEAR_WINDOW));
  const column = Math.max(CELL_WIDTH, viewport / shown);
  const content = column * count;

  function placeWindow() {
    if (!(viewport > 0)) return;
    const x = yearWindowOffset({ end: reported.current, viewport, column, count });
    scrollRef.current?.scrollTo({ x, animated: false });
  }

  useEffect(placeWindow, [viewport, column, count]);

  useEffect(() => {
    if (end === reported.current) return;
    reported.current = end;
    const x = yearWindowOffset({ end, viewport, column, count });
    scrollRef.current?.scrollTo({ x, animated: true });
  }, [end]);

  function onScroll(event) {
    const next = yearWindowEnd({ offset: event.nativeEvent.contentOffset.x, viewport, column, count });
    if (next === reported.current) return;
    reported.current = next;
    onEnd(next);
  }

  return (
    <View nativeID={nativeID} style={styles.tableBlock}>
      <View style={styles.tableHead}>
        <Text style={[styles.tableTitle, { color: colors.ink }]}>Datagrunnlag</Text>
        {canDownload() ? (
          <Pressable onPress={onDownload} accessibilityRole="button" accessibilityLabel="Last ned som Excel-fil">
            <Text style={[styles.excel, { color: '#7030A0' }]}>Last ned som Excel-fil</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.tableBody}>
        <View>
          <View style={[styles.row, { borderBottomColor: colors.line, backgroundColor: colors.sunken }]}>
            <Text style={[styles.labelCell, { color: colors.muted }]} />
          </View>
          {months.map((label, index) => (
            <View key={label} style={[styles.row, { borderBottomColor: colors.line, backgroundColor: index % 2 ? colors.sunken : colors.card }]}>
              <Text style={[styles.labelCell, { color: colors.ink }]}>{label}</Text>
            </View>
          ))}
          <View style={[styles.row, { borderBottomColor: colors.line }]}>
            <Text style={[styles.labelCell, { color: colors.muted }]} />
          </View>
        </View>
        <View ref={viewportRef} style={styles.yearColumns} onLayout={onViewportLayout}>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={content > viewport + 1}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onContentSizeChange={placeWindow}
          >
            <View style={{ width: content }}>
              <View style={[styles.row, { borderBottomColor: colors.line, backgroundColor: colors.sunken }]}>
                {years.map((year) => (
                  <Text key={year} style={[styles.yearCell, styles.headCell, { width: column, color: colors.ink }]}>{year}</Text>
                ))}
              </View>
              {months.map((label, index) => (
                <View key={label} style={[styles.row, { borderBottomColor: colors.line, backgroundColor: index % 2 ? colors.sunken : colors.card }]}>
                  {years.map((year) => (
                    <Text key={year} style={[styles.yearCell, { width: column, color: colors.ink }]}>
                      {formatStatementAmount(amountOf(series, year, index))}
                    </Text>
                  ))}
                </View>
              ))}
              <View style={[styles.row, { borderBottomColor: colors.line }]}>
                {years.map((year) => (
                  <Text key={year} style={[styles.yearCell, styles.totalCell, { width: column, color: colors.ink }]}>
                    {formatStatementAmount(totalOf(statement, year))}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function YearPager({ years, end, onEnd }) {
  const colors = useColors();
  if (years.length <= STATEMENT_YEAR_WINDOW) return null;
  const shown = statementYearWindow(years, end);
  const canBack = end > STATEMENT_YEAR_WINDOW - 1;
  const canForward = end < years.length - 1;
  return (
    <View style={styles.pager}>
      <Pressable
        onPress={() => onEnd(end - 1)}
        disabled={!canBack}
        accessibilityRole="button"
        accessibilityLabel="Vis eldre år"
        hitSlop={6}
        style={[styles.pagerButton, { borderColor: colors.line, opacity: canBack ? 1 : 0.35 }]}
      >
        <Ionicons name="chevron-back" size={16} color={colors.ink} />
      </Pressable>
      <Text style={[styles.pagerText, { color: colors.muted }]}>{`${shown[0]}–${shown[shown.length - 1]}`}</Text>
      <Pressable
        onPress={() => onEnd(end + 1)}
        disabled={!canForward}
        accessibilityRole="button"
        accessibilityLabel="Vis nyere år"
        hitSlop={6}
        style={[styles.pagerButton, { borderColor: colors.line, opacity: canForward ? 1 : 0.35 }]}
      >
        <Ionicons name="chevron-forward" size={16} color={colors.ink} />
      </Pressable>
    </View>
  );
}

/** Graf og tabell for måned-for-måned. Fem år vises, eldre år blas frem sidelengs. */
function MonthPanel({
  title,
  subtitle,
  nativeID,
  statement,
  series,
  mode,
  section,
  filename,
}) {
  const years = statementTableYears(statement);
  const last = years.length - 1;
  const first = Math.min(years.length, STATEMENT_YEAR_WINDOW) - 1;
  const [end, setEnd] = useState(last);

  useEffect(() => {
    setEnd(last);
  }, [last, years[0]]);

  const windowYears = statementYearWindow(years, end);
  const move = (next) => setEnd(Math.min(last, Math.max(first, next)));

  return (
    <Panel title={title} subtitle={subtitle} nativeID={nativeID}>
      <View style={styles.chartHead}>
        <Legend years={windowYears} colorYears={years} />
        <YearPager years={years} end={end} onEnd={move} />
      </View>
      <MonthChart
        statement={statement}
        years={windowYears}
        colorYears={years}
        series={series}
        mode={mode}
        nativeID={`${nativeID}-chart`}
      />
      <DataTable
        nativeID={`${nativeID}-table`}
        statement={statement}
        years={years}
        series={series}
        end={end}
        onEnd={move}
        onDownload={() => downloadWorkbook(statement, section, filename)}
      />
    </Panel>
  );
}

function YearTable({ statement, onDownload }) {
  const colors = useColors();
  return (
    <View nativeID="economy-invoiced-yearly-table" style={styles.tableBlock}>
      <View style={styles.tableHead}>
        <Text style={[styles.tableTitle, { color: colors.ink }]}>Datagrunnlag</Text>
        {canDownload() ? (
          <Pressable onPress={onDownload} accessibilityRole="button" accessibilityLabel="Last ned som Excel-fil">
            <Text style={[styles.excel, { color: '#7030A0' }]}>Last ned som Excel-fil</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.row, { borderBottomColor: colors.line, backgroundColor: colors.sunken }]}>
        <Text style={[styles.yearLabel, styles.headCell, { color: colors.ink }]}>År</Text>
        <Text style={[styles.cell, styles.headCell, { color: colors.ink }]}>Omsetning</Text>
      </View>
      {(statement?.yearly || []).map((row, index) => (
        <View key={row.year} style={[styles.row, { borderBottomColor: colors.line, backgroundColor: index % 2 ? colors.sunken : colors.card }]}>
          <Text style={[styles.yearLabel, { color: colors.ink }]}>{row.year}</Text>
          <Text style={[styles.cell, { color: colors.ink }]}>{formatStatementAmount(row.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function InvoicedStatement({ familyId }) {
  const colors = useColors();
  const [statement, setStatement] = useState(null);
  const [phase, setPhase] = useState('loading');

  useEffect(() => {
    if (!familyId) {
      setStatement(null);
      setPhase('ready');
      return undefined;
    }
    let live = true;
    let remote = false;
    setPhase('loading');
    readInvoicedStatement(familyId).then((saved) => {
      if (!live || remote || !saved) return;
      setStatement(saved);
      setPhase('ready');
    }).catch(() => {});
    const stop = watchInvoices(familyId, (rows, meta) => {
      if (!live || meta?.source !== 'remote') return;
      remote = true;
      setStatement({ ...buildInvoicedStatement(rows), savedAt: new Date().toISOString() });
      setPhase('ready');
    }, () => {
      if (live) setPhase('ready');
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [familyId]);

  if (!familyId) return null;

  const hasFigures = (statement?.invoiceCount > 0)
    || (statement?.yearly || []).some((row) => row && row.amount != null);
  const empty = !hasFigures;
  return (
    <View nativeID="economy-invoiced-statement" id="economy-invoiced-statement" style={styles.page}>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Tallene hentes fra fakturaene og lagres automatisk.
      </Text>
      {phase === 'loading' && !statement ? (
        <Text style={[styles.lead, { color: colors.muted }]}>Henter utfakturert omsetning…</Text>
      ) : null}
      {phase !== 'loading' && empty ? (
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={styles.panelBody}>
            <Text style={[styles.sub, { color: colors.ink }]}>Ingen utfakturerte fakturaer ennå.</Text>
            <Text style={[styles.lead, { color: colors.muted }]}>
              Når fakturaer registreres eller importeres, fylles måned, akkumulert og år av seg selv.
            </Text>
          </View>
        </View>
      ) : null}
      {!empty ? (
        <>
          <MonthPanel
            title="Utfakturert per måned"
            subtitle="Eks. mva, basert på fakturadato"
            nativeID="economy-invoiced-monthly"
            statement={statement}
            series={statement.monthly}
            mode="bars"
            section="monthly"
            filename="utfakturert-per-maned.xls"
          />
          <MonthPanel
            title="Utfakturert gjennom året"
            subtitle="Måned for måned akkumulert"
            nativeID="economy-invoiced-cumulative"
            statement={statement}
            series={statement.cumulative}
            mode="lines"
            section="cumulative"
            filename="utfakturert-gjennom-aret.xls"
          />
          <Panel title="Omsetning per år" subtitle="Eks. mva, basert på fakturadato" nativeID="economy-invoiced-yearly">
            <YearChart statement={statement} />
            <YearTable
              statement={statement}
              onDownload={() => downloadWorkbook(statement, 'yearly', 'omsetning-per-ar.xls')}
            />
          </Panel>
        </>
      ) : null}
    </View>
  );
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' }
  : {};

const LABEL_WIDTH = 48;
const CELL_WIDTH = 132;
const ROW_HEIGHT = 29;
const cellText = { fontSize: 12, lineHeight: 16, textAlign: 'right', paddingVertical: 6, paddingHorizontal: 8, fontVariant: ['tabular-nums'] };

const styles = StyleSheet.create({
  page: { gap: 14 },
  lead: { fontSize: 13, lineHeight: 18 },
  panel: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', ...webShadow },
  panelHead: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  panelTitle: { fontSize: 15, fontWeight: '600' },
  panelBody: { padding: 12, gap: 10 },
  sub: { fontSize: 13, lineHeight: 18 },
  chartHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, flexShrink: 1 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  pagerButton: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pagerText: { fontSize: 12, minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 2 },
  legendText: { fontSize: 12 },
  tableBlock: { gap: 8, marginTop: 4 },
  tableHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tableTitle: { fontSize: 14, fontWeight: '600' },
  excel: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth },
  tableBody: { flexDirection: 'row', alignItems: 'flex-start' },
  yearColumns: { flex: 1, minWidth: 0 },
  labelCell: { width: LABEL_WIDTH, fontSize: 12, lineHeight: 16, paddingVertical: 6, paddingHorizontal: 4 },
  yearLabel: { width: 72, fontSize: 12, paddingVertical: 6, paddingHorizontal: 4 },
  cell: { width: CELL_WIDTH, ...cellText },
  yearCell: cellText,
  headCell: { fontWeight: '700' },
  totalCell: { fontWeight: '700' },
  tip: {
    position: 'absolute',
    zIndex: 5,
    minWidth: 150,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d6d6d6',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    ...webShadow,
  },
  tipTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  tipBody: { fontSize: 12, color: '#222', marginTop: 2 },
});
