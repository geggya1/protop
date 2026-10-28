/**
 * KS-malene i Skjemabygger: én skuff per kategori, med en tabell inni.
 * Kolonnene følger kortene de erstatter: ID, dokument med beskrivelse, status, kilde,
 * antall utfylt og handling. På en smal flate blir hvert dokument en blokk i samme rekkefølge.
 *
 * Skuffene er lukket til man åpner dem. Søk åpner kategoriene med treff. Hvilke skuffer som
 * er åpne, eies av Skjemabygger, så de står slik de var etter en utfylling.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KS_LIBRARY, entryTitle, libraryTemplateId } from '../../src/forms/ksLibrary';
import { controlKey, controlStatus, publishedRevision } from '../../src/doccontrol/model';
import { useLayout } from '../../src/theme';
import { radius, space, touch, type } from '../../src/ui/tokens';
import { StatusChip } from '../doccontrol/parts';

export const NOT_CONTROLLED = { label: 'Ikke godkjent', tone: 'warn' };

const COLUMNS = [
  { key: 'ref', label: 'ID', width: 116 },
  { key: 'doc', label: 'Dokument', width: 260, flex: 1 },
  { key: 'status', label: 'Status', width: 176 },
  { key: 'source', label: 'Kilde', width: 150 },
  { key: 'done', label: 'Utfylt', width: 64, align: 'right' },
  { key: 'action', label: '', width: 256 },
];

/** Tabellen trenger kolonnene, radens innrykk og skuffens ramme. Smalere flate gir én blokk per dokument. */
const TABLE_MIN = COLUMNS.reduce((sum, col) => sum + col.width, 0) + 2 * space.xxs + 2;

function cellBox(col) {
  return col.flex ? { flex: col.flex, minWidth: col.width } : { width: col.width, flexGrow: 0, flexShrink: 0 };
}

function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function rowOf(entry, { templates, filledDocs, dc }) {
  const title = entryTitle(entry);
  if (entry.kind !== 'mal') return { entry, title, module: entry.target };
  const id = libraryTemplateId(entry.key);
  const control = dc.controlFor(controlKey('template', id));
  const own = templates.some((row) => row.id === id);
  return {
    entry,
    title,
    status: control ? controlStatus(control) : NOT_CONTROLLED,
    approved: !!(control && publishedRevision(control)),
    source: `${own ? 'Tilpasset av bedriften' : 'Standard KS-mal'}${entry.hr ? ' · lagres i HR' : ''}`,
    done: filledDocs.filter((row) => row.libraryKey === entry.key).length,
  };
}

function Actions({ row, colors, isTouch, onFill, onEdit, onModule }) {
  const hit = isTouch ? styles.touchHit : null;
  const ink = colors.brandInk || colors.brand;
  if (row.module) {
    return (
      <TouchableOpacity
        onPress={() => onModule(row.module)}
        accessibilityRole="button"
        accessibilityLabel={`Åpne ${row.module.label}`}
        style={[styles.link, hit]}
      >
        <Ionicons name="arrow-forward-circle-outline" size={16} color={colors.brand} />
        <Text style={[styles.linkText, { color: ink }]}>{row.module.label}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.actions}>
      <TouchableOpacity
        onPress={() => onFill(row.entry.key)}
        accessibilityRole="button"
        accessibilityLabel={`Fyll ut ${row.title}`}
        style={[styles.primary, hit, { backgroundColor: ink }]}
      >
        <Text style={[styles.primaryText, { color: colors.onBrand || colors.card }]}>Fyll ut</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onEdit(row.entry.key)}
        accessibilityRole="button"
        accessibilityLabel={`Rediger malen ${row.title}`}
        style={[styles.link, hit]}
      >
        <Text style={[styles.linkText, { color: ink }]}>Rediger malen</Text>
      </TouchableOpacity>
    </View>
  );
}

function TableRow({ row, first, colors, ...actions }) {
  const [ref, doc, status, source, done, action] = COLUMNS;
  return (
    <View style={[styles.tr, first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <Text style={[styles.td, cellBox(ref), styles.ref, { color: colors.muted }]}>{row.entry.ref}</Text>
      <View style={[styles.td, cellBox(doc), styles.docCell]}>
        <Text style={[styles.title, { color: colors.ink }]}>{row.title}</Text>
        <Text style={[styles.summary, { color: colors.muted }]}>{row.entry.summary}</Text>
      </View>
      <View style={[styles.td, cellBox(status)]}>
        {row.status ? <StatusChip status={row.status} colors={colors} /> : <Text style={[styles.small, { color: colors.muted }]}>–</Text>}
      </View>
      <Text style={[styles.td, cellBox(source), styles.small, { color: colors.muted }]}>{row.module ? 'Egen modul' : row.source}</Text>
      <Text style={[styles.td, cellBox(done), styles.small, styles.num, { color: row.done ? colors.ink : colors.muted }]}>
        {row.module ? '' : (row.done ? String(row.done) : '–')}
      </Text>
      <View style={[styles.td, cellBox(action)]}>
        <Actions row={row} colors={colors} {...actions} />
      </View>
    </View>
  );
}

function BlockRow({ row, first, colors, ...actions }) {
  const meta = [row.module ? 'Egen modul' : row.source, row.done ? `${row.done} utfylt` : ''].filter(Boolean).join(' · ');
  return (
    <View style={[styles.block, first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
      <View style={styles.blockTop}>
        <Text style={[styles.ref, { color: colors.muted }]}>{row.entry.ref}</Text>
        {row.status ? <StatusChip status={row.status} colors={colors} /> : null}
      </View>
      <Text style={[styles.title, { color: colors.ink }]}>{row.title}</Text>
      <Text style={[styles.summary, { color: colors.muted }]}>{row.entry.summary}</Text>
      <Text style={[styles.small, { color: colors.muted }]}>{meta}</Text>
      <View style={styles.blockActions}>
        <Actions row={row} colors={colors} {...actions} />
      </View>
    </View>
  );
}

function Drawer({ group, rows, open, onToggle, asTable, narrow, colors, ...actions }) {
  const forms = rows.filter((row) => !row.module);
  const modules = rows.length - forms.length;
  const approved = forms.filter((row) => row.approved).length;
  const kinds = [forms.length ? count(forms.length, 'mal', 'maler') : '', modules ? `${modules} i egen modul` : ''].filter(Boolean).join(' · ');
  const Row = asTable ? TableRow : BlockRow;
  return (
    <View style={[styles.drawer, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${group.label}, ${count(rows.length, 'dokument', 'dokumenter')}`}
        nativeID={`ks-${group.id}`}
        style={({ hovered }) => [styles.head, actions.isTouch ? styles.touchHit : null, hovered ? { backgroundColor: colors.sunken } : null]}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
        <Ionicons name={group.icon} size={18} color={colors.brand} />
        <View style={[styles.headText, narrow ? styles.headTextNarrow : null]}>
          <View style={styles.headTitle}>
            <Text style={[styles.headLabel, { color: colors.ink }]}>{group.label}</Text>
            <View style={[styles.countPill, { backgroundColor: colors.sunken, borderColor: colors.line }]}>
              <Text style={[styles.small, { color: colors.muted }]}>{rows.length}</Text>
            </View>
          </View>
          <Text style={[styles.small, { color: colors.muted }]}>
            {kinds}
            {forms.length ? (
              <Text style={{ color: approved === forms.length ? colors.successInk : colors.muted }}>
                {` · ${approved} av ${forms.length} godkjent`}
              </Text>
            ) : null}
          </Text>
        </View>
      </Pressable>
      {open ? (
        <View accessibilityRole={asTable ? 'table' : 'list'} style={[styles.body, { borderTopColor: colors.line }]}>
          {asTable ? (
            <View style={[styles.tr, styles.thead, { backgroundColor: colors.sunken, borderBottomColor: colors.line }]}>
              {COLUMNS.map((col) => (
                <Text key={col.key} style={[styles.th, cellBox(col), col.align === 'right' ? styles.num : null, { color: colors.muted }]}>{col.label}</Text>
              ))}
            </View>
          ) : null}
          {rows.map((row, index) => (
            <Row key={row.entry.key} row={row} first={index === 0} colors={colors} {...actions} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function KsLibraryList({
  colors,
  groups,
  query = '',
  drawers = {},
  onDrawers,
  templates = [],
  filledDocs = [],
  dc,
  onFill,
  onEdit,
  onModule,
}) {
  const { isWide, isPhone, isTouch } = useLayout();
  const [boxWidth, setBoxWidth] = useState(0);
  const asTable = boxWidth ? boxWidth >= TABLE_MIN : isWide;
  const searching = !!String(query).trim();
  // Under søk er skuffene med treff åpne. Det man lukker da, gjelder bare dette søket.
  const searchIds = drawers.search?.query === query ? drawers.search.ids : {};
  const isOpen = (id) => (searching ? searchIds[id] ?? true : !!drawers.browse?.[id]);
  const allOpen = groups.length > 0 && groups.every((group) => isOpen(group.id));

  function setOpen(ids) {
    onDrawers?.(searching
      ? { ...drawers, search: { query, ids: { ...searchIds, ...ids } } }
      : { ...drawers, browse: { ...drawers.browse, ...ids } });
  }

  const context = { templates, filledDocs, dc };
  const actions = { isTouch, onFill, onEdit, onModule };
  return (
    <View style={styles.wrap} onLayout={(event) => setBoxWidth(event.nativeEvent.layout.width)}>
      <View style={styles.intro}>
        <Text style={[styles.introText, { color: colors.muted }]}>
          Hele KS-systemet er lagt inn her. Malene fylles ut og skrives ut fra ProTop, uten Word eller Excel. Det som har en egen modul, åpnes der, så det ikke registreres to steder.
        </Text>
        {groups.length > 1 ? (
          <TouchableOpacity
            onPress={() => setOpen(Object.fromEntries(groups.map((group) => [group.id, !allOpen])))}
            accessibilityRole="button"
            style={[styles.link, isTouch ? styles.touchHit : null]}
          >
            <Ionicons name={allOpen ? 'contract-outline' : 'expand-outline'} size={16} color={colors.brand} />
            <Text style={[styles.linkText, { color: colors.brandInk || colors.brand }]}>{allOpen ? 'Lukk alle' : 'Åpne alle'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {groups.map((group) => (
        <Drawer
          key={group.id}
          group={group}
          rows={group.entries.map((entry) => rowOf(entry, context))}
          open={isOpen(group.id)}
          onToggle={() => setOpen({ [group.id]: !isOpen(group.id) })}
          asTable={asTable}
          narrow={isPhone}
          colors={colors}
          {...actions}
        />
      ))}
      {!groups.length ? <Text style={{ color: colors.muted }}>Ingen KS-maler treffer søket.</Text> : null}
      <Text style={[styles.small, { color: colors.muted }]}>{`${KS_LIBRARY.length} dokumenter fra KS-systemet.`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  intro: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs, marginBottom: space.xxs },
  introText: { ...type.body, flexGrow: 1, flexShrink: 1, flexBasis: 320 },
  drawer: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.sm },
  headText: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  headTextNarrow: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 2 },
  headTitle: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  headLabel: { ...type.bodyStrong },
  countPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.xs, minWidth: 24, alignItems: 'center' },
  body: { borderTopWidth: StyleSheet.hairlineWidth },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xxs },
  thead: { borderBottomWidth: StyleSheet.hairlineWidth },
  th: { ...type.caption, fontWeight: '600', paddingHorizontal: space.xs, paddingVertical: space.xs },
  td: { paddingHorizontal: space.xs, paddingVertical: space.sm },
  ref: { ...type.caption, fontVariant: ['tabular-nums'] },
  docCell: { gap: 2 },
  title: { ...type.bodyStrong },
  summary: { ...type.caption },
  small: { ...type.caption },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  primary: { borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: 6, justifyContent: 'center' },
  primaryText: { ...type.label, fontWeight: '600' },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, alignSelf: 'flex-start', paddingVertical: 6 },
  linkText: { ...type.label },
  touchHit: { minHeight: touch.min },
  block: { gap: space.xxs, paddingHorizontal: space.sm, paddingVertical: space.sm },
  blockActions: { marginTop: space.xxs },
  blockTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
});
