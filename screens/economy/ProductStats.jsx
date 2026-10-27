/**
 * Statistikk for ett produkt: nøkkeltall, omsetning per måned, kunder,
 * prosjekter og siste salg.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import { formatMoney } from '../../src/economy/invoices.js';
import { productStats, projectLabel } from '../../src/economy/productCatalog.js';
import { saleStatusLabel } from '../../src/economy/products.js';
import { Card, SectionLabel, StatTile, kroner, qtyText, shortDate, ui as styles } from './productUi';

const RECENT_LIMIT = 8;
const GROUP_LIMIT = 5;

/** Omsetning eks. mva per måned, siste tolv måneder. Én serie: ingen tegnforklaring. */
function MonthBars({ months, colors }) {
  const max = Math.max(0, ...months.map((row) => row.amountExVat));
  const [picked, setPicked] = useState(months.length - 1);
  const focus = months[picked] || months[months.length - 1];
  const peak = max > 0 ? months.findIndex((row) => row.amountExVat === max) : -1;
  const HEIGHT = 96;
  return (
    <View style={{ gap: 8 }} nativeID="produkt-maaneder">
      <Text style={{ color: colors.ink, fontSize: 13 }}>
        <Text style={{ fontWeight: '600' }}>{focus ? `${focus.label} ${focus.year}` : ''}</Text>
        {focus ? `  ${formatMoney(focus.amountExVat)} eks. mva · ${focus.count} salg` : ''}
      </Text>
      <View style={{ height: HEIGHT + 18, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {months.map((row, index) => {
          const h = max > 0 ? Math.max(row.amountExVat > 0 ? 3 : 0, Math.round((row.amountExVat / max) * HEIGHT)) : 0;
          const on = index === picked;
          return (
            <Pressable
              key={row.key}
              onPress={() => setPicked(index)}
              onHoverIn={() => setPicked(index)}
              onHoverOut={() => setPicked(months.length - 1)}
              accessibilityRole="button"
              accessibilityLabel={`${row.label} ${row.year}: ${formatMoney(row.amountExVat)} eks. mva, ${row.count} salg`}
              style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' }}
            >
              {index === peak ? (
                <Text style={{ color: colors.muted, fontSize: 10, marginBottom: 2 }} numberOfLines={1}>
                  {compactMoney(row.amountExVat)}
                </Text>
              ) : null}
              <View
                style={{
                  width: '60%',
                  maxWidth: 24,
                  height: h,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  backgroundColor: colors.brand,
                  opacity: on ? 1 : 0.55,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {months.map((row, index) => (
          <Text
            key={row.key}
            style={{ flex: 1, textAlign: 'center', fontSize: 10, color: index === picked ? colors.ink : colors.muted, fontWeight: index === picked ? '600' : '400' }}
          >
            {row.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function compactMoney(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e6) return `${String(Math.round(n / 1e5) / 10).replace('.', ',')} mill.`;
  if (Math.abs(n) >= 1e4) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

function GroupTable({ title, rows, colors, empty, nativeID }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, GROUP_LIMIT);
  return (
    <View style={{ gap: 6, flexBasis: 260, flexGrow: 1 }} nativeID={nativeID}>
      <SectionLabel colors={colors}>{title}</SectionLabel>
      {!rows.length ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>{empty}</Text>
      ) : (
        <View style={[styles.miniTable, { borderColor: colors.line }]}>
          {shown.map((row) => (
            <View key={row.key} style={[styles.miniRow, { borderBottomColor: colors.line }]}>
              <Text style={{ flex: 1, color: colors.ink, fontSize: 13 }} numberOfLines={1}>{row.label}</Text>
              <Text style={[styles.num, { width: 56, color: colors.muted }]}>{row.count} salg</Text>
              <Text style={[styles.num, { width: 110, color: colors.ink }]}>{formatMoney(row.amountExVat)}</Text>
            </View>
          ))}
          {rows.length > GROUP_LIMIT ? (
            <TouchableOpacity onPress={() => setAll((on) => !on)} accessibilityRole="button" style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>
                {all ? 'Vis færre' : `Vis alle ${rows.length}`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

function RecentSales({ rows, colors, narrow, canApprove, onApprove }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, RECENT_LIMIT);
  if (!rows.length) return null;
  return (
    <View style={{ gap: 6 }} nativeID="produkt-siste-salg">
      <SectionLabel colors={colors}>Siste salg</SectionLabel>
      <View style={[styles.miniTable, { borderColor: colors.line }]}>
        {!narrow ? (
          <View style={[styles.miniRow, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
            <Text style={[styles.th, { width: 86, color: colors.muted }]}>Dato</Text>
            <Text style={[styles.th, { flex: 1, color: colors.muted }]}>Kunde / prosjekt</Text>
            <Text style={[styles.th, styles.num, { width: 70, color: colors.muted }]}>Antall</Text>
            <Text style={[styles.th, styles.num, { width: 110, color: colors.muted }]}>Eks. mva</Text>
            <Text style={[styles.th, { width: 120, color: colors.muted, paddingLeft: 12 }]}>Status</Text>
          </View>
        ) : null}
        {shown.map((row) => {
          const where = [row.customerName, projectLabel(row)].filter(Boolean).join(' · ') || 'Uten kunde og prosjekt';
          const approvable = canApprove && row.status === 'draft' && !row.externalStore;
          const status = (
            <View style={{ width: narrow ? undefined : 120, paddingLeft: narrow ? 0 : 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: colors.ink, fontSize: 13 }}>{saleStatusLabel(row.status)}</Text>
              {approvable ? (
                <TouchableOpacity onPress={() => onApprove(row)} accessibilityRole="button" accessibilityLabel="Merk klar for faktura">
                  <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '600' }}>Merk klar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
          if (narrow) {
            return (
              <View key={row.id} style={[styles.miniRow, { borderBottomColor: colors.line, flexDirection: 'column', alignItems: 'stretch', gap: 2 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{shortDate(row.date)}</Text>
                  <Text style={{ color: colors.ink, fontSize: 13 }}>{formatMoney(row.amountExVat)}</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>
                  {`${qtyText(row.quantity)} ${row.unit} · ${where}`}
                </Text>
                {status}
              </View>
            );
          }
          return (
            <View key={row.id} style={[styles.miniRow, { borderBottomColor: colors.line }]}>
              <Text style={{ width: 86, color: colors.ink, fontSize: 13 }}>{shortDate(row.date)}</Text>
              <Text style={{ flex: 1, color: colors.ink, fontSize: 13 }} numberOfLines={1}>{where}</Text>
              <Text style={[styles.num, { width: 70, color: colors.ink }]}>{qtyText(row.quantity)} {row.unit}</Text>
              <Text style={[styles.num, { width: 110, color: colors.ink }]}>{formatMoney(row.amountExVat)}</Text>
              {status}
            </View>
          );
        })}
        {rows.length > RECENT_LIMIT ? (
          <TouchableOpacity onPress={() => setAll((on) => !on)} accessibilityRole="button" style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
            <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>
              {all ? 'Vis færre' : `Vis alle ${rows.length} salg`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export default function ProductStatsCard({ product, rows, colors, narrow, salesReady, canApprove, onApprove, onOpenSales, onOpenBilling }) {
  const stats = useMemo(() => productStats(rows), [rows]);
  const used = stats.total.count > 0;
  return (
    <Card
      title="Statistikk og bruk"
      colors={colors}
      nativeID="produkt-statistikk"
      right={(
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={onOpenSales} accessibilityRole="link">
            <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>Produktsalg</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenBilling} accessibilityRole="link">
            <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>Til fakturering</Text>
          </TouchableOpacity>
        </View>
      )}
    >
      {!salesReady ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>Henter salg…</Text>
      ) : !used ? (
        <Text style={{ color: colors.muted, fontSize: 13 }} nativeID="produkt-ingen-salg">
          {product.archived
            ? 'Produktet er ikke brukt i noe salg.'
            : 'Produktet er ikke brukt i noe salg ennå. Registrer et salg, eller før det i timelisten eller på et prosjekt.'}
        </Text>
      ) : (
        <View style={{ gap: 16 }}>
          <View style={styles.tiles}>
            <StatTile label="Salg totalt" value={String(stats.total.count)} hint={`Første ${shortDate(stats.total.firstDate)}`} colors={colors} />
            <StatTile label="Solgt mengde" value={`${qtyText(stats.total.quantity)} ${product.unit}`} hint={`Snitt ${kroner(stats.averagePrice)} per ${product.unit}`} colors={colors} />
            <StatTile label="Omsetning eks. mva" value={kroner(stats.total.amountExVat)} hint={`I år ${kroner(stats.thisYear.amountExVat)}`} colors={colors} />
            <StatTile label="Sist solgt" value={shortDate(stats.total.lastDate)} hint={`Utkast ${stats.byStatus.draft} · Klar ${stats.byStatus.approved} · Fakturert ${stats.byStatus.invoiced}`} colors={colors} />
          </View>
          <View style={{ gap: 6 }}>
            <SectionLabel colors={colors}>Omsetning eks. mva siste 12 måneder</SectionLabel>
            <MonthBars months={stats.months} colors={colors} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <GroupTable
              title="Kunder"
              rows={stats.customers}
              colors={colors}
              empty="Ingen salg er koblet til kunde."
              nativeID="produkt-kunder"
            />
            <GroupTable
              title="Prosjekter"
              rows={stats.projects}
              colors={colors}
              empty="Ingen salg er koblet til prosjekt."
              nativeID="produkt-prosjekter"
            />
          </View>
          <RecentSales rows={rows} colors={colors} narrow={narrow} canApprove={canApprove} onApprove={onApprove} />
        </View>
      )}
    </Card>
  );
}
