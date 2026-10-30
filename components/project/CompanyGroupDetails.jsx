/**
 * Selskapene i konsernet, ved siden av treet på brede skjermer og under det ellers:
 * nøkkeltall per selskap i én tabell, og adresse, bransje og stiftet per selskap.
 * Alt er fra de samme registrene som treet. Ingen tall finnes opp her.
 */
import React, { useState } from 'react';
import {
  Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatShare } from '../../src/project/groupChart';
import { dateText } from '../../src/format/nb';

const TILE_MIN = 300;
const GAP = 12;

function openUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return;
  Linking.openURL(raw).catch(() => {});
}

function Cell({ children, colors, flex = 1, align = 'right', strong = false, muted = false }) {
  return (
    <Text
      style={[
        styles.cell,
        { flex, textAlign: align, color: muted ? colors.muted : colors.ink },
        strong && styles.cellStrong,
      ]}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

function FiguresTable({ model, colors }) {
  const nodes = [model.parent, ...model.children];
  const total = model.totals;
  return (
    <View nativeID="company-group-figures" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.cardHead}>
        <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.ink }]}>Nøkkeltall per selskap</Text>
        <Text style={[styles.cardMeta, { color: colors.muted }]}>
          {[model.year ? `Regnskapsår ${model.year}` : 'Ingen regnskap registrert', total.source].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableScroll}>
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow, { borderBottomColor: colors.line }]}>
            <Cell colors={colors} flex={2.4} align="left" muted>Selskap</Cell>
            <Cell colors={colors} muted>Eierandel</Cell>
            <Cell colors={colors} muted>Inntekt</Cell>
            <Cell colors={colors} muted>Resultat</Cell>
            <Cell colors={colors} muted>Margin</Cell>
            <Cell colors={colors} flex={0.8} muted>Ansatte</Cell>
            <Cell colors={colors} muted>Del av inntekt</Cell>
          </View>
          {nodes.map((node) => (
            <View key={node.organisasjonsnummer || node.navn} style={[styles.row, { borderBottomColor: colors.line }]}>
              <Cell colors={colors} flex={2.4} align="left" strong>{node.navn}</Cell>
              <Cell colors={colors}>{node.ownershipLabel || node.role}</Cell>
              <Cell colors={colors}>{node.revenueLabel}</Cell>
              <Cell colors={colors}>{node.resultLabel}</Cell>
              <Cell colors={colors}>{node.marginLabel}</Cell>
              <Cell colors={colors} flex={0.8}>{node.employeesLabel}</Cell>
              <Cell colors={colors}>{node.revenueLabel === '…' ? '…' : formatShare(node.revenue, total.revenue)}</Cell>
            </View>
          ))}
          <View style={[styles.row, styles.totalRow]}>
            <Cell colors={colors} flex={2.4} align="left" strong>Totalt</Cell>
            <Cell colors={colors} muted>{' '}</Cell>
            <Cell colors={colors} strong>{total.revenueLabel}</Cell>
            <Cell colors={colors} strong>{total.resultLabel}</Cell>
            <Cell colors={colors} strong>{total.marginLabel}</Cell>
            <Cell colors={colors} flex={0.8} strong>{total.employeesLabel}</Cell>
            <Cell colors={colors} strong>{total.revenue != null ? '100,0 %' : '–'}</Cell>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Fact({ icon, label, value, colors, onPress }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={15} color={colors.muted} style={styles.factIcon} />
      <Text style={[styles.factLabel, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
      <Text
        style={[styles.factValue, { color: onPress ? colors.brand : colors.ink }]}
        onPress={onPress || undefined}
        accessibilityRole={onPress ? 'link' : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

function CompanyFacts({ node, colors, linked, onOpen, style }) {
  const facts = node.facts || {};
  const role = [node.role, node.ownershipLabel ? `eid ${node.ownershipLabel}` : ''].filter(Boolean).join(' · ');
  return (
    <View
      nativeID={`group-details-${node.organisasjonsnummer || 'ukjent'}`}
      style={[styles.card, styles.companyCard, style, { backgroundColor: colors.card, borderColor: colors.line }]}
    >
      <View style={styles.companyHead}>
        <View style={[styles.mark, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="business" size={16} color={colors.brand} />
        </View>
        <View style={styles.companyTitle}>
          <Text style={[styles.companyName, { color: colors.ink }]} numberOfLines={2}>{node.navn}</Text>
          <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>{role}</Text>
        </View>
      </View>
      <View style={styles.facts}>
        <Fact icon="location-outline" label="Adresse" value={facts.address} colors={colors} />
        <Fact icon="document-text-outline" label="Org.nr." value={[node.organisasjonsnummer, facts.orgForm].filter(Boolean).join(' · ')} colors={colors} />
        <Fact icon="briefcase-outline" label="Bransje" value={facts.industry} colors={colors} />
        <Fact icon="calendar-outline" label="Stiftet" value={facts.founded ? dateText(facts.founded) : ''} colors={colors} />
        <Fact icon="people-outline" label="Ansatte" value={node.employeesLabel !== '–' ? node.employeesLabel : ''} colors={colors} />
        <Fact
          icon="globe-outline"
          label="Nettside"
          value={facts.website}
          colors={colors}
          onPress={facts.websiteUrl ? () => openUrl(facts.websiteUrl) : null}
        />
        {node.flags?.length ? (
          <Text style={[styles.flag, { color: colors.danger }]}>{node.flags.join(' · ')}</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={linked ? `Åpne ${node.navn} i ProTop` : `Se ${node.navn} i Brønnøysundregistrene`}
        onPress={() => onOpen?.(node)}
        style={styles.companyAction}
      >
        <Text style={[styles.actionText, { color: colors.brand }]}>
          {linked ? 'Åpne i ProTop' : 'Se i Brønnøysundregistrene'}
        </Text>
        <Ionicons name={linked ? 'chevron-forward' : 'open-outline'} size={14} color={colors.brand} />
      </Pressable>
    </View>
  );
}

export default function CompanyGroupDetails({ model, colors, isLinked, onOpen }) {
  const [width, setWidth] = useState(0);
  const nodes = [model.parent, ...model.children];
  const cols = width ? Math.max(1, Math.min(3, Math.floor((width + GAP) / (TILE_MIN + GAP)))) : 1;
  const tile = cols > 1
    ? { width: Math.floor((width - (cols - 1) * GAP) / cols) }
    : { width: '100%' };
  return (
    <View
      nativeID="company-group-details"
      style={styles.block}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <FiguresTable model={model} colors={colors} />
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>Selskapene i konsernet</Text>
      <View style={styles.grid}>
        {nodes.map((node) => (
          <CompanyFacts
            key={node.organisasjonsnummer || node.navn}
            node={node}
            colors={colors}
            linked={!!isLinked?.(node)}
            onOpen={onOpen}
            style={tile}
          />
        ))}
      </View>
    </View>
  );
}

const cardShadow = Platform.OS === 'web'
  ? { boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' }
  : {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  };

const styles = StyleSheet.create({
  block: { gap: GAP, width: '100%' },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    ...cardShadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  cardMeta: { fontSize: 12, lineHeight: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2, marginTop: 4 },
  tableScroll: { flexGrow: 1 },
  table: { flexGrow: 1, minWidth: 620 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headRow: { paddingTop: 0 },
  totalRow: { borderBottomWidth: 0 },
  cell: { fontSize: 13, minWidth: 0, ...(Platform.OS === 'web' ? { fontVariant: ['tabular-nums'] } : null) },
  cellStrong: { fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  companyCard: { gap: 12 },
  companyHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  companyTitle: { flex: 1, minWidth: 0, gap: 2 },
  companyName: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facts: { gap: 7 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  factIcon: { marginTop: 1 },
  factLabel: { width: 64, fontSize: 12, lineHeight: 18 },
  factValue: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18 },
  flag: { fontSize: 12, fontWeight: '600' },
  companyAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto', alignSelf: 'flex-start' },
  actionText: { fontSize: 13, fontWeight: '600' },
});
