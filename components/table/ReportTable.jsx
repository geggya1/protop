import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { columnText, reportMinWidth } from '../../src/ui/reportTable';

// flex: kolonnen tar resten av bredden, med width som minste bredde.
function cellBox(col) {
  return col.flex ? { flex: col.flex, minWidth: col.width } : { width: col.width, flexGrow: 0, flexShrink: 0 };
}

function alignRight(col) {
  return col.align === 'right' || col.kind === 'money' || col.kind === 'number';
}

function HeadCell({ col, sort, onSort, filters, onFilter, colors, idPrefix }) {
  const on = sort?.key === col.key;
  const arrow = on ? (sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : null;
  const right = alignRight(col);
  const sortable = !!onSort && col.sortable !== false;
  return (
    <View style={[styles.headCell, cellBox(col)]}>
      <TouchableOpacity
        onPress={() => onSort?.(col)}
        disabled={!sortable}
        accessibilityRole="button"
        accessibilityLabel={`Sorter på ${col.label}`}
        accessibilityState={{ selected: on }}
        nativeID={`${idPrefix}-sort-${col.key}`}
        style={[styles.sortBtn, right ? { justifyContent: 'flex-end' } : null]}
      >
        <Text style={[styles.headText, { color: on ? (colors.brandInk || colors.brand) : colors.muted }]} numberOfLines={1}>{col.label}</Text>
        {arrow ? <Ionicons name={arrow} size={12} color={colors.brand} /> : null}
      </TouchableOpacity>
      {onFilter && col.filter !== false ? (
        <TextInput
          value={filters?.[col.key] || ''}
          onChangeText={(value) => onFilter(col.key, value)}
          placeholder="Filtrer"
          placeholderTextColor={colors.placeholder || colors.muted}
          accessibilityLabel={`Filtrer ${col.label}`}
          nativeID={`${idPrefix}-filter-${col.key}`}
          style={[
            styles.filterInput,
            right ? { textAlign: 'right' } : null,
            { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken || colors.bg },
          ]}
        />
      ) : (onFilter ? <View style={styles.filterSpacer} /> : null)}
    </View>
  );
}

function Cell({ row, col, colors, renderCell, cellTone }) {
  const custom = renderCell ? renderCell(row, col) : undefined;
  if (custom !== undefined) {
    return <View style={[styles.cell, cellBox(col), alignRight(col) ? styles.cellRight : null]}>{custom}</View>;
  }
  const value = columnText(row, col);
  return (
    <Text
      style={[
        styles.cell,
        styles.cellText,
        cellBox(col),
        alignRight(col) ? styles.num : null,
        { color: value ? (cellTone?.(row, col) || colors.ink) : colors.muted },
        col.strong ? { fontWeight: '700' } : null,
      ]}
      numberOfLines={col.lines || 2}
    >
      {value || '—'}
    </Text>
  );
}

/**
 * Rapporttabell som prosjektlisten: hele bredden, fast overskrift med sortering og
 * «Filtrer» under hver kolonne, sumlinje nederst og egne kort på mobil.
 * Radene er allerede filtrert og sortert av forelderen.
 */
export default function ReportTable({
  nativeID = 'report',
  colors,
  columns = [],
  rows = [],
  rowKey = (row) => row.id,
  sort = null,
  onSort,
  filters = null,
  onFilter,
  onOpen,
  rowNativeID,
  rowLabel,
  renderCell,
  cellTone,
  renderAction,
  actionWidth = 0,
  limit = rows.length,
  onMore,
  onShowAll,
  totals = null,
  totalsLabel = 'Sum',
  phone = false,
  renderCard,
  empty = 'Ingen rader treffer filteret.',
}) {
  const shown = rows.slice(0, Math.max(0, limit));
  const more = rows.length > shown.length ? (
    <View style={styles.more} nativeID={`${nativeID}-mer`}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{`Viser ${shown.length} av ${rows.length}`}</Text>
      {onMore ? (
        <TouchableOpacity onPress={onMore} accessibilityRole="button" style={[styles.moreBtn, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.brandInk || colors.brand, fontWeight: '600', fontSize: 13 }}>Vis flere</Text>
        </TouchableOpacity>
      ) : null}
      {onShowAll ? (
        <TouchableOpacity onPress={onShowAll} accessibilityRole="button" style={styles.moreLink}>
          <Text style={{ color: colors.brandInk || colors.brand, fontSize: 13 }}>Vis alle</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  if (phone) {
    return (
      <View style={styles.phoneStack}>
        <View nativeID={nativeID} style={[styles.cards, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {shown.length ? shown.map((row) => (
            <React.Fragment key={rowKey(row)}>{renderCard?.(row)}</React.Fragment>
          )) : <Text style={[styles.emptyText, { color: colors.muted }]}>{empty}</Text>}
        </View>
        {more}
      </View>
    );
  }

  const minWidth = reportMinWidth(columns, actionWidth);
  const head = (
    <View
      nativeID={`${nativeID}-head`}
      style={[
        styles.line,
        styles.headLine,
        { backgroundColor: colors.card, borderBottomColor: colors.line },
        Platform.OS === 'web' ? styles.stickyHead : null,
      ]}
    >
      {columns.map((col) => (
        <HeadCell
          key={col.key}
          col={col}
          sort={sort}
          onSort={onSort}
          filters={filters}
          onFilter={onFilter}
          colors={colors}
          idPrefix={nativeID}
        />
      ))}
      {actionWidth ? <View style={{ width: actionWidth }} /> : null}
    </View>
  );
  const body = shown.length ? shown.map((row) => (
    <View key={rowKey(row)} style={[styles.line, { borderBottomColor: colors.line }]}>
      <Pressable
        onPress={() => onOpen?.(row)}
        disabled={!onOpen}
        accessibilityRole="button"
        accessibilityLabel={rowLabel?.(row)}
        nativeID={rowNativeID?.(row)}
        style={({ hovered }) => [styles.rowOpen, hovered ? { backgroundColor: colors.sunken || colors.bg } : null]}
      >
        {columns.map((col) => (
          <Cell key={col.key} row={row} col={col} colors={colors} renderCell={renderCell} cellTone={cellTone} />
        ))}
      </Pressable>
      {actionWidth ? (
        <View style={[styles.action, { width: actionWidth }]}>{renderAction?.(row)}</View>
      ) : null}
    </View>
  )) : (
    <Text style={[styles.emptyText, { color: colors.muted }]} nativeID={`${nativeID}-no-hits`}>{empty}</Text>
  );
  // «Sum (n)» står i første kolonne som er bred nok og ikke har en sum selv.
  const labelAt = totals ? columns.findIndex((col) => (col.width || 0) >= 96 && totals[col.key] == null) : -1;
  const foot = totals && rows.length ? (
    <View
      nativeID={`${nativeID}-sum`}
      style={[
        styles.line,
        styles.footLine,
        { backgroundColor: colors.sunken || colors.bg, borderTopColor: colors.line },
        Platform.OS === 'web' ? styles.stickyFoot : null,
      ]}
    >
      {columns.map((col, index) => {
        const value = totals[col.key];
        const label = index === labelAt ? `${totalsLabel} (${rows.length})` : (value ?? '');
        return (
          <Text
            key={col.key}
            style={[styles.cell, styles.cellText, cellBox(col), value != null ? styles.num : null, { color: colors.ink, fontWeight: '700' }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        );
      })}
      {actionWidth ? <View style={{ width: actionWidth }} /> : null}
    </View>
  ) : null;
  const table = (
    <View
      nativeID={nativeID}
      accessibilityRole="table"
      style={[styles.table, { minWidth, backgroundColor: colors.card }]}
    >
      {head}
      {body}
      {foot}
    </View>
  );

  // Én scroller bundet til skjermen (x og y), så overskriften står og sidelengs scroll synes.
  if (Platform.OS === 'web') {
    return (
      <>
        <View
          nativeID={`${nativeID}-viewport`}
          style={[styles.viewport, styles.viewportWeb, shown.length > 6 ? styles.viewportTall : null, { borderColor: colors.line }]}
        >
          {table}
        </View>
        {more}
      </>
    );
  }
  return (
    <>
      <ScrollView nestedScrollEnabled style={[styles.viewport, { borderColor: colors.line }]} contentContainerStyle={styles.content}>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={styles.content}>
          {table}
        </ScrollView>
      </ScrollView>
      {more}
    </>
  );
}

const styles = StyleSheet.create({
  viewport: { width: '100%', maxWidth: '100%', alignSelf: 'stretch', maxHeight: 560, borderWidth: 1, borderRadius: 12 },
  // Like høy som radene, men aldri høyere enn plassen som er igjen på siden. Da ruller tabellen selv.
  viewportWeb: { flexGrow: 0, flexShrink: 1, flexBasis: 'auto', minHeight: 0, maxHeight: '100%', overflow: 'auto' },
  viewportTall: { minHeight: 320 },
  content: { flexGrow: 1, minWidth: '100%' },
  // overflow synlig: fast overskrift krever at ingen mellomliggende boks klipper.
  table: { width: '100%', alignSelf: 'stretch' },
  line: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth },
  headLine: { borderBottomWidth: 1 },
  stickyHead: { position: 'sticky', top: 0, zIndex: 5 },
  footLine: { borderBottomWidth: 0, borderTopWidth: 1 },
  stickyFoot: { position: 'sticky', bottom: 0, zIndex: 4 },
  headCell: { paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 18 },
  headText: { fontSize: 12, fontWeight: '700' },
  filterInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, width: '100%' },
  filterSpacer: { height: 28 },
  rowOpen: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1 },
  cell: { paddingHorizontal: 8, paddingVertical: 9 },
  cellText: { fontSize: 13 },
  cellRight: { alignItems: 'flex-end' },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  action: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { padding: 16, fontSize: 13 },
  more: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, flexShrink: 0 },
  moreBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  moreLink: { paddingVertical: 8 },
  phoneStack: { gap: 10 },
  cards: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
});
