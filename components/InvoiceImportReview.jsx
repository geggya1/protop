import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { reviewHeadline } from '../src/imports/review';
import { formatMoney } from '../src/economy/invoices.js';
import { suggestCustomers, suggestProjects } from '../src/economy/invoiceImport.js';

const AMBER = '#9a6700';

function ActionBar({ colors, busy, readyCount, onCancel, onConfirm, confirmLabel }) {
  return (
    <View style={styles.actions}>
      <TouchableOpacity
        onPress={onCancel}
        accessibilityRole="button"
        style={[styles.btn, { borderColor: colors.line, backgroundColor: colors.card }]}
      >
        <Text style={{ color: colors.ink }}>Avbryt</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onConfirm}
        disabled={busy || !readyCount}
        accessibilityRole="button"
        style={[styles.btnPrimary, { backgroundColor: colors.brand, opacity: busy || !readyCount ? 0.6 : 1 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {busy ? 'Lagrer…' : (confirmLabel?.(readyCount) || `Importer ${readyCount} fakturaer`)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function OkTable({
  colors,
  rows,
  pageSize,
  onMore,
  onToggleRow,
}) {
  if (!rows.length) return null;
  return (
    <View style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
        {['Fakturanr', 'Kunde', 'Prosjekt', 'Beløp', ''].map((label) => (
          <Text key={label || 'act'} style={[styles.th, { color: colors.muted }]}>{label}</Text>
        ))}
      </View>
      {rows.slice(0, pageSize).map((row, index) => (
        <View
          key={row.id}
          style={[
            styles.tr,
            {
              borderBottomColor: colors.line,
              backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card,
              opacity: row.included ? 1 : 0.5,
            },
          ]}
        >
          <Text style={[styles.td, { color: colors.ink, fontWeight: '700' }]}>{row.invoiceNumber}</Text>
          <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>
            {row.customerName || '—'}
            {row.customerNumber ? `\n${row.customerNumber}` : ''}
          </Text>
          <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>
            {row.projectName || '—'}
            {row.projectNumber ? `\n${row.projectNumber}` : ''}
          </Text>
          <Text style={[styles.td, { color: colors.ink }]}>
            {formatMoney(row.amountInclVat, row.currency)}
          </Text>
          <TouchableOpacity onPress={() => onToggleRow(row.id)} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontSize: 12 }}>
              {row.included ? 'Ta ut' : 'Ta med'}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
      {rows.length > pageSize ? (
        <TouchableOpacity onPress={onMore} style={{ padding: 12 }} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '600' }}>
            Vis flere ({pageSize} av {rows.length})
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function InvoiceImportReview({
  colors,
  review,
  customers = [],
  projects = [],
  busy,
  readyCount = 0,
  linkQuery = {},
  setLinkQuery,
  onToggleCard,
  onToggleOkRow,
  onLinkCustomer,
  onLinkProject,
  onConfirm,
  onCancel,
  confirmLabel,
  title = 'Kontroller fakturaimport',
  lead = '',
}) {
  const danger = colors.danger || '#b42318';
  const brand = colors.brand || '#175cd3';
  const [okPage, setOkPage] = useState(40);
  const [reviewPage, setReviewPage] = useState(40);
  const cards = review?.cards || [];
  const okRows = review?.okRows || [];

  const headlineCards = useMemo(() => cards.map((card) => ({
    ...card,
    count: card.count || card.indexes?.length || 1,
  })), [cards]);

  return (
    <View nativeID="invoice-import-review" style={{ gap: 14 }}>
      <ActionBar
        colors={colors}
        busy={busy}
        readyCount={readyCount}
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
      />
      {!!title && <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700' }}>{title}</Text>}
      {!!lead && <Text style={{ color: colors.muted }}>{lead}</Text>}

      <Text style={{ color: colors.ink, fontWeight: '600' }}>{reviewHeadline(headlineCards)}</Text>
      {review?.existingCount ? (
        <Text style={{ color: brand, fontWeight: '600' }}>
          {review.existingCount} fakturaer finnes allerede og er fjernet fra importen.
        </Text>
      ) : null}
      <Text style={{ color: colors.muted }}>
        Koble manglende kunde/prosjekt under. Eksisterende fakturanummer er tatt ut.
        Klare fakturaer vises i tabell.
      </Text>

      {cards.filter((card) => card.severity === 'existing' || card.severity === 'block').map((card) => (
        <View
          key={card.id}
          style={[
            styles.card,
            {
              borderColor: card.severity === 'block' ? danger : brand,
              backgroundColor: colors.card,
            },
          ]}
        >
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{card.title}</Text>
          {!!card.meta && <Text style={{ color: colors.muted }}>{card.meta}</Text>}
          {(card.issues || []).map((issue) => (
            <Text key={issue} style={{ color: card.severity === 'block' ? danger : brand, fontWeight: '600' }}>
              {issue}
            </Text>
          ))}
        </View>
      ))}

      {okRows.length ? (
        <View style={{ gap: 8 }}>
          <View style={styles.okHead}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>
              Klare uten avvik ({okRows.filter((row) => row.included).length})
            </Text>
            <TouchableOpacity
              onPress={() => onToggleCard({ id: 'ok-group', indexes: okRows.map((row) => row.index) })}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.brand }}>
                {okRows.every((row) => row.included) ? 'Ta alle ut' : 'Ta alle med'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tableScroll}>
            <View style={{ minWidth: 720 }}>
              <OkTable
                colors={colors}
                rows={okRows}
                pageSize={okPage}
                onMore={() => setOkPage((n) => n + 40)}
                onToggleRow={onToggleOkRow}
              />
            </View>
          </View>
        </View>
      ) : null}
      {(review?.reviewCards || []).length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: AMBER, fontWeight: '700' }}>
            Må kontrolleres / kobles ({review.reviewCards.length} grupper)
          </Text>
          {(review.reviewCards || []).slice(0, reviewPage).map((card) => {
            const qCustomer = linkQuery[`${card.id}:customer`] || '';
            const qProject = linkQuery[`${card.id}:project`] || '';
            const customerHits = card.needsCustomer
              ? suggestCustomers(customers, {
                customerNumber: card.customerNumber,
                orgnr: card.orgnr,
                client: card.customerName,
                query: qCustomer,
              }, 6)
              : [];
            const projectHits = card.needsProject
              ? suggestProjects(projects, {
                projectNumber: card.projectNumber,
                projectName: card.projectName,
                query: qProject || card.projectNumber || card.projectName,
              }, 6)
              : [];
            return (
              <View
                key={card.id}
                style={[styles.card, { borderColor: AMBER, backgroundColor: colors.card, opacity: card.included ? 1 : 0.55 }]}
              >
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{card.title}</Text>
                {!!card.meta && <Text style={{ color: colors.muted }}>{card.meta}</Text>}
                {(card.issues || []).map((issue) => (
                  <Text key={issue} style={{ color: AMBER, fontWeight: '600' }}>{issue}</Text>
                ))}

                {card.needsCustomer ? (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    <Text style={{ color: colors.muted, fontWeight: '600' }}>Koble kunde</Text>
                    <TextInput
                      value={qCustomer}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [`${card.id}:customer`]: value }))}
                      placeholder="Søk kunde…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                    />
                    {customerHits.map((customer) => (
                      <TouchableOpacity
                        key={customer.id}
                        onPress={() => onLinkCustomer(card.rowIndex, customer)}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.brand }}>
                          {customer.name}
                          {customer.customerNumber ? ` · ${customer.customerNumber}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {card.needsProject ? (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    <Text style={{ color: colors.muted, fontWeight: '600' }}>
                      Koble prosjekt
                      {card.projectNumber ? ` (fra fil: ${card.projectNumber})` : ''}
                    </Text>
                    <TextInput
                      value={qProject}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [`${card.id}:project`]: value }))}
                      placeholder="Søk prosjektnr eller navn…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                    />
                    {projectHits.map((project) => (
                      <TouchableOpacity
                        key={project.id}
                        onPress={() => onLinkProject(card.rowIndex, project)}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.brand }}>
                          {project.number} · {project.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {!projectHits.length ? (
                      <Text style={{ color: colors.muted }}>
                        Ingen treff i prosjektregisteret. Importer prosjektlisten først, eller søk med annet navn.
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                <TouchableOpacity onPress={() => onToggleCard(card)} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>
                    {card.included ? 'Ta ut av importen' : 'Ta med likevel'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {(review.reviewCards || []).length > reviewPage ? (
            <TouchableOpacity onPress={() => setReviewPage((n) => n + 40)} accessibilityRole="button">
              <Text style={{ color: colors.brand, fontWeight: '600' }}>
                Vis flere grupper ({reviewPage} av {review.reviewCards.length})
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}


      <ActionBar
        colors={colors}
        busy={busy}
        readyCount={readyCount}
        onCancel={onCancel}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  btnPrimary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  okHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  tableScroll: Platform.OS === 'web'
    ? { overflowX: 'auto', width: '100%' }
    : { width: '100%' },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  head: {},
  th: { width: 140, fontSize: 11, fontWeight: '700' },
  td: { width: 140, fontSize: 12 },
});
