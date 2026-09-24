import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import { useLiveWidgets } from '../src/hooks/useLiveWidgets';
import {
  LIVE_WIDGETS,
  NEWS_SOURCES,
  POWER_ZONES,
  POPULAR_STOCKS,
  FX_CURRENCIES,
  formatNb,
  formatSignedPct,
  normalizeStockSymbol,
  stockDisplayName,
  stockQuotesFromData,
} from '../src/utils/liveWidgets';

function openHttps(url) {
  if (!/^https:\/\//i.test(String(url || ''))) return;
  Linking.openURL(url).catch(() => {});
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function CardHead({ icon, title, meta, onPress, extra, large }) {
  const label = (
    <>
      <Ionicons name={icon} size={large ? 16 : 15} color={colors.brand} />
      <Text style={[styles.cardTitle, large && styles.cardTitleLarge]} numberOfLines={1}>{title}</Text>
      {meta ? <Text style={styles.cardMeta} numberOfLines={1}>{meta}</Text> : null}
    </>
  );
  return (
    <View style={styles.cardHead}>
      {onPress ? (
        <TouchableOpacity onPress={onPress} accessibilityRole="link" style={styles.cardHeadMain}>
          {label}
        </TouchableOpacity>
      ) : (
        <View style={styles.cardHeadMain}>{label}</View>
      )}
      {extra || null}
    </View>
  );
}

function StatusLine({ loading, error }) {
  if (error) return <Text style={styles.error}>{error}</Text>;
  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  }
  return null;
}

function ToolbarActions({ onRefresh, allowCustomize, editing, onToggleEdit }) {
  return (
    <View style={styles.headActions}>
      <TouchableOpacity onPress={onRefresh} accessibilityLabel="Oppdater" hitSlop={8}>
        <Ionicons name="refresh" size={16} color={colors.muted} />
      </TouchableOpacity>
      {allowCustomize ? (
        <TouchableOpacity onPress={onToggleEdit} accessibilityRole="button">
          <Text style={styles.customize}>{editing ? 'Ferdig' : 'Tilpass'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function NewsCard({ news, loading, error, limit, extra, flushTop }) {
  return (
    <Card style={[styles.newsCard, flushTop && styles.newsCardFlush]}>
      <CardHead
        icon="newspaper-outline"
        title="Siste nytt"
        meta={news?.sourceName || ''}
        onPress={news?.home ? () => openHttps(news.home) : undefined}
        extra={extra}
        large={flushTop}
      />
      <StatusLine loading={loading && !news} error={!news ? error : null} />
      {news?.fallbackFrom ? (
        <Text style={styles.attr}>Viser {news.sourceName} fordi {news.fallbackFrom} ikke svarte</Text>
      ) : null}
      {(news?.items || []).slice(0, limit).map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.newsRow}
          onPress={() => openHttps(item.url)}
          accessibilityRole="link"
          accessibilityLabel={item.title}
        >
          <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
          {item.time ? <Text style={styles.newsTime}>{item.time}</Text> : null}
        </TouchableOpacity>
      ))}
    </Card>
  );
}

function quoteCurrency(quote) {
  return quote?.currency === 'NOK' ? 'kr' : (quote?.currency || '');
}

function StockRow({ quote, symbol, error }) {
  const up = Number(quote?.changePct) >= 0;
  const currency = quoteCurrency(quote);
  return (
    <View style={styles.stockRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.stockName} numberOfLines={1}>{quote?.name || stockDisplayName(symbol)}</Text>
        <Text style={styles.stockSym}>{quote?.symbol || symbol}</Text>
      </View>
      {quote ? (
        <View style={styles.stockNums}>
          <Text style={styles.stockPrice}>
            {formatNb(quote.price, 2)}
            {currency ? <Text style={styles.unit}> {currency}</Text> : null}
          </Text>
          {quote.changePct != null ? (
            <Text style={[styles.stockChg, { color: up ? colors.success : colors.danger }]}>
              {formatSignedPct(quote.changePct)}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.stockFail} numberOfLines={2}>{error || '—'}</Text>
      )}
    </View>
  );
}

function StocksCard({ bundle, symbols, loading, error }) {
  const quotes = stockQuotesFromData(bundle);
  const quoteErrors = bundle?.errors || {};
  const list = (symbols?.length ? symbols : quotes.map((q) => q.symbol)).filter(Boolean);
  const single = list.length <= 1;
  const quote = quotes[0];
  const symbol = list[0];

  if (single) {
    const up = Number(quote?.changePct) >= 0;
    const currency = quoteCurrency(quote);
    return (
      <Card>
        <CardHead icon="trending-up-outline" title={quote?.name || stockDisplayName(symbol) || 'Aksje'} meta={quote?.symbol || symbol} />
        <StatusLine loading={loading && !quote} error={!quote ? (error || quoteErrors[symbol]) : null} />
        {quote ? (
          <>
            <Text style={styles.big}>
              {formatNb(quote.price, 2)}
              {currency ? <Text style={styles.unit}> {currency}</Text> : null}
            </Text>
            {quote.changePct != null ? (
              <Text style={[styles.delta, { color: up ? colors.success : colors.danger }]}>
                {formatSignedPct(quote.changePct)} i dag
              </Text>
            ) : null}
            <Text style={styles.attr}>Kurs via Yahoo Finance · forsinket</Text>
          </>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <CardHead icon="trending-up-outline" title="Aksjer" meta={`${list.length} fulgt`} />
      <StatusLine loading={loading && !quotes.length} error={!quotes.length ? error : null} />
      {list.map((sym) => {
        const q = quotes.find((row) => row.symbol === sym);
        return <StockRow key={sym} quote={q} symbol={sym} error={quoteErrors[sym]} />;
      })}
      {quotes.length ? <Text style={styles.attr}>Kurs via Yahoo Finance · forsinket</Text> : null}
    </Card>
  );
}

function PowerCard({ power, zone, loading, error, auto, placeName }) {
  const zoneLabel = POWER_ZONES.find((z) => z.id === zone)?.label || zone;
  const max = Math.max(...(power?.hours || []).map((h) => h.ore), 1);
  const meta = auto
    ? `${zone || ''} ${zoneLabel}${placeName ? ` · ${placeName}` : ' · området ditt'}`.trim()
    : (zone ? `${zone} ${zoneLabel}` : '');
  return (
    <Card>
      <CardHead icon="flash-outline" title="Strømpris" meta={meta} />
      <StatusLine loading={loading && !power} error={!power ? error : null} />
      {power ? (
        <>
          <Text style={styles.big}>
            {power.currentOre != null ? formatNb(power.currentOre, 1) : '—'}
            <Text style={styles.unit}> øre</Text>
          </Text>
          <Text style={styles.delta}>
            snitt {formatNb(power.avgOre, 1)} · lavest {formatNb(power.minOre, 1)}
            {power.cheapHour ? ` kl ${power.cheapHour}` : ''}
          </Text>
          {power.hours?.length ? (
            <View style={styles.bars}>
              {power.hours.map((h, i) => (
                <View
                  key={`${h.hour}-${i}`}
                  style={[
                    styles.bar,
                    {
                      height: 6 + Math.round((h.ore / max) * 26),
                      backgroundColor: h.active ? colors.brand : '#cbd5e1',
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
          <Text style={styles.attr}>{power.zoneNote}</Text>
        </>
      ) : null}
    </Card>
  );
}

function FxCard({ fx, loading, error }) {
  return (
    <Card>
      <CardHead icon="cash-outline" title="Valuta" meta="NOK" />
      <StatusLine loading={loading && !fx} error={!fx ? error : null} />
      {(fx?.rates || []).map((row) => {
        const up = Number(row.change) > 0;
        const down = Number(row.change) < 0;
        return (
          <View key={row.code} style={styles.fxRow}>
            <Text style={styles.fxCode}>{row.per === 100 ? `100 ${row.code}` : row.code}</Text>
            <Text style={styles.fxVal}>{formatNb(row.nok, row.per === 100 ? 2 : 2)}</Text>
            {row.change != null ? (
              <Text style={[styles.fxChg, { color: up ? colors.success : down ? colors.danger : colors.muted }]}>
                {row.change > 0 ? '+' : ''}{formatNb(row.change, 2)}
              </Text>
            ) : null}
          </View>
        );
      })}
      {fx ? <Text style={styles.attr}>Norges Bank</Text> : null}
    </Card>
  );
}

function HolidayCard({ holiday, loading, error }) {
  return (
    <Card>
      <CardHead icon="flag-outline" title="Neste helligdag" />
      <StatusLine loading={loading && !holiday} error={!holiday ? error : null} />
      {holiday ? (
        <>
          <Text style={styles.holidayName} numberOfLines={2}>{holiday.name}</Text>
          <Text style={styles.delta}>{holiday.when} · {holiday.date.split('-').reverse().join('.')}</Text>
        </>
      ) : null}
    </Card>
  );
}

function AirCard({ air, placeName, loading, error }) {
  const tone = air?.tone === 'good' ? colors.success : air?.tone === 'bad' ? colors.danger : colors.warn;
  return (
    <Card>
      <CardHead icon="leaf-outline" title="Luftkvalitet" meta={placeName} />
      <StatusLine loading={loading && !air} error={!air ? error : null} />
      {air ? (
        <>
          <Text style={[styles.big, { color: tone }]}>{air.aqi}</Text>
          <Text style={styles.delta}>{air.label}{air.pm25 != null ? ` · PM2,5 ${formatNb(air.pm25, 1)}` : ''}</Text>
          <Text style={styles.attr}>Europeisk luftkvalitetsindeks</Text>
        </>
      ) : null}
    </Card>
  );
}

function Chip({ label, on, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
    >
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Editor({ prefs, updatePrefs, placeName }) {
  const [symbol, setSymbol] = useState('');
  const enabled = new Set(prefs.enabled || []);
  const followed = prefs.stockSymbols || (prefs.stockSymbol ? [prefs.stockSymbol] : []);
  const fxCodes = prefs.fxCodes || [];
  const popularSet = new Set(POPULAR_STOCKS.map((s) => s.symbol));
  const extraSymbols = followed.filter((s) => !popularSet.has(s));

  const toggle = (id) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const patch = { enabled: [...next] };
    if (id === 'stocks' && next.has('stocks') && !followed.length) {
      patch.stockSymbols = ['EQNR.OL'];
      patch.stockSymbol = 'EQNR.OL';
    }
    if (id === 'fx' && next.has('fx') && !fxCodes.length) {
      patch.fxCodes = ['USD', 'EUR', 'GBP', 'SEK'];
    }
    updatePrefs(patch);
  };

  const setStocks = (symbols) => {
    const list = [...new Set(symbols.map(normalizeStockSymbol).filter(Boolean))];
    updatePrefs({
      stockSymbols: list,
      stockSymbol: list[0] || '',
      enabled: list.length
        ? [...new Set([...(prefs.enabled || []), 'stocks'])]
        : (prefs.enabled || []).filter((id) => id !== 'stocks'),
    });
  };

  const toggleStock = (sym) => {
    const next = followed.includes(sym)
      ? followed.filter((s) => s !== sym)
      : [...followed, sym];
    setStocks(next);
  };

  const follow = () => {
    const sym = normalizeStockSymbol(symbol);
    if (!sym) return;
    setSymbol('');
    setStocks([...followed, sym]);
  };

  const toggleFx = (code) => {
    const next = fxCodes.includes(code)
      ? fxCodes.filter((c) => c !== code)
      : [...fxCodes, code];
    if (!next.length) return;
    updatePrefs({ fxCodes: next });
  };

  return (
    <View style={styles.editor}>
      <Text style={styles.editorLbl}>Vis</Text>
      <View style={styles.chips}>
        {LIVE_WIDGETS.map((w) => (
          <Chip key={w.id} label={w.title} on={enabled.has(w.id)} onPress={() => toggle(w.id)} />
        ))}
      </View>
      {enabled.has('news') ? (
        <>
          <Text style={styles.editorLbl}>Nyhetskilde</Text>
          <View style={styles.chips}>
            {NEWS_SOURCES.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                on={prefs.newsSource === s.id}
                onPress={() => updatePrefs({ newsSource: s.id })}
              />
            ))}
          </View>
        </>
      ) : null}
      {enabled.has('stocks') ? (
        <>
          <Text style={styles.editorLbl}>Aksjer å følge</Text>
          <View style={styles.chips}>
            {POPULAR_STOCKS.map((s) => (
              <Chip
                key={s.symbol}
                label={s.name}
                on={followed.includes(s.symbol)}
                onPress={() => toggleStock(s.symbol)}
              />
            ))}
            {extraSymbols.map((s) => (
              <Chip
                key={s}
                label={s}
                on
                onPress={() => toggleStock(s)}
              />
            ))}
          </View>
          <View style={styles.symbolRow}>
            <TextInput
              value={symbol}
              onChangeText={setSymbol}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Symbol, f.eks. EQNR.OL"
              placeholderTextColor={colors.muted}
              style={styles.symbolInput}
              onSubmitEditing={follow}
            />
            <TouchableOpacity style={styles.followBtn} onPress={follow} accessibilityRole="button">
              <Text style={styles.followTxt}>Følg</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
      {enabled.has('fx') ? (
        <>
          <Text style={styles.editorLbl}>Valuta mot NOK</Text>
          <View style={styles.chips}>
            {FX_CURRENCIES.map((c) => (
              <Chip
                key={c.code}
                label={c.code}
                on={fxCodes.includes(c.code)}
                onPress={() => toggleFx(c.code)}
              />
            ))}
          </View>
        </>
      ) : null}
      {enabled.has('power') ? (
        <>
          <Text style={styles.editorLbl}>Strømområde</Text>
          <View style={styles.chips}>
            <Chip
              label={placeName ? `Automatisk · ${placeName}` : 'Automatisk · området ditt'}
              on={prefs.powerZoneAuto !== false}
              onPress={() => updatePrefs({ powerZoneAuto: true })}
            />
            {POWER_ZONES.map((z) => (
              <Chip
                key={z.id}
                label={`${z.id} ${z.label}`}
                on={prefs.powerZoneAuto === false && prefs.powerZone === z.id}
                onPress={() => updatePrefs({ powerZone: z.id, powerZoneAuto: false })}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export default function LiveHomeWidgets({
  newsLimit = 3,
  allowCustomize = true,
  compact = false,
  flushTop = false,
}) {
  const {
    prefs, ready, loading, data, errors, updatePrefs, refresh, placeName,
  } = useLiveWidgets();
  const [editing, setEditing] = useState(false);
  if (!ready || !prefs) return null;
  const enabled = new Set(prefs.enabled || []);
  if (!enabled.size && !editing) {
    if (!allowCustomize) return null;
    return (
      <View style={[styles.wrap, flushTop && styles.wrapFlush]}>
        <TouchableOpacity onPress={() => setEditing(true)} accessibilityRole="button">
          <Text style={styles.customize}>Legg til nyheter, aksje og strøm</Text>
        </TouchableOpacity>
        {editing ? <Editor prefs={prefs} updatePrefs={updatePrefs} placeName={placeName} /> : null}
      </View>
    );
  }

  const limit = compact ? Math.min(newsLimit, 2) : newsLimit;
  const actions = (
    <ToolbarActions
      onRefresh={refresh}
      allowCustomize={allowCustomize}
      editing={editing}
      onToggleEdit={() => setEditing((v) => !v)}
    />
  );

  return (
    <View style={[styles.wrap, flushTop && styles.wrapFlush]}>
      {editing && allowCustomize ? (
        <Editor prefs={prefs} updatePrefs={updatePrefs} placeName={placeName} />
      ) : null}
      <View style={styles.grid}>
        {enabled.has('news') ? (
          <View style={styles.full}>
            <NewsCard
              news={data.news}
              loading={loading}
              error={errors.news}
              limit={limit}
              extra={actions}
              flushTop={flushTop}
            />
          </View>
        ) : actions ? (
          <View style={styles.toolbarOnly}>{actions}</View>
        ) : null}
        {enabled.has('stocks') ? (
          <View style={styles.cell}>
            <StocksCard
              bundle={data.stocks}
              symbols={prefs.stockSymbols || [prefs.stockSymbol]}
              loading={loading}
              error={errors.stocks}
            />
          </View>
        ) : null}
        {enabled.has('power') ? (
          <View style={styles.cell}>
            <PowerCard
              power={data.power}
              zone={data.power?.zone || prefs.powerZone}
              loading={loading}
              error={errors.power}
              auto={prefs.powerZoneAuto !== false}
              placeName={placeName}
            />
          </View>
        ) : null}
        {enabled.has('fx') ? (
          <View style={styles.cell}>
            <FxCard fx={data.fx} loading={loading} error={errors.fx} />
          </View>
        ) : null}
        {enabled.has('holiday') ? (
          <View style={styles.cell}>
            <HolidayCard holiday={data.holiday} loading={loading} error={errors.holiday} />
          </View>
        ) : null}
        {enabled.has('air') ? (
          <View style={styles.cell}>
            <AirCard air={data.air} placeName={placeName} loading={loading} error={errors.air} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8 },
  wrapFlush: { marginTop: 0, marginBottom: 0 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 8, flexShrink: 0 },
  customize: { fontSize: 13, fontWeight: '600', color: colors.brand },
  toolbarOnly: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  full: { width: '100%' },
  cell: { flexGrow: 1, flexBasis: 168, minWidth: 150 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    minHeight: 92,
  },
  newsCard: { minHeight: 0 },
  newsCardFlush: { padding: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cardHeadMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { flexShrink: 1, fontWeight: '700', fontSize: 13, color: colors.ink },
  cardTitleLarge: { fontSize: 16, letterSpacing: -0.3 },
  cardMeta: { marginLeft: 'auto', fontSize: 11, color: colors.muted, fontWeight: '600' },
  big: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  unit: { fontSize: 14, fontWeight: '600', color: colors.muted },
  delta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  attr: { fontSize: 10, color: colors.muted, marginTop: 6 },
  error: { color: colors.danger, fontSize: 12, fontWeight: '500', paddingVertical: 4 },
  loadingRow: { paddingVertical: 10, alignItems: 'flex-start' },
  newsRow: { paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  newsTitle: { fontSize: 14, fontWeight: '600', color: colors.ink, lineHeight: 18 },
  newsTime: { fontSize: 11, color: colors.muted, marginTop: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 34, marginTop: 8 },
  bar: { flex: 1, borderRadius: 2, minWidth: 3 },
  fxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  fxCode: { width: 72, fontSize: 12, fontWeight: '700', color: colors.ink },
  fxVal: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink },
  fxChg: { fontSize: 11, fontWeight: '600' },
  holidayName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  stockRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  stockName: { fontSize: 13, fontWeight: '700', color: colors.ink },
  stockSym: { fontSize: 11, color: colors.muted, fontWeight: '600', marginTop: 1 },
  stockNums: { alignItems: 'flex-end' },
  stockPrice: { fontSize: 14, fontWeight: '700', color: colors.ink },
  stockChg: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  stockFail: { flexShrink: 1, maxWidth: 140, fontSize: 11, fontWeight: '600', color: colors.danger, textAlign: 'right' },
  editor: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginBottom: 8,
  },
  editorLbl: {
    fontSize: 10, fontWeight: '700', color: colors.muted, letterSpacing: 0.4,
    textTransform: 'uppercase', marginTop: 6, marginBottom: 6,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft },
  chipTxt: { fontSize: 12, fontWeight: '600', color: colors.ink },
  chipTxtOn: { color: colors.brand },
  symbolRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  symbolInput: {
    flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: colors.ink, backgroundColor: colors.bg,
  },
  followBtn: {
    backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: 12, justifyContent: 'center',
  },
  followTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
