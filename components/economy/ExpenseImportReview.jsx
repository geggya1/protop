import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { reviewHeadline } from '../../src/imports/review';
import { formatDate } from '../../src/economy/hoursList.js';
import { formatMoney } from '../../src/economy/invoices.js';
import { expenseStatusLabel } from '../../src/economy/expenseList.js';
import { suggestEmployees } from '../../src/economy/hoursImport.js';
import { suggestCustomers, suggestProjects } from '../../src/economy/invoiceImport.js';
import { displayName } from '../../src/employees/model.js';

const AMBER = '#9a6700';

function money(value) {
  return typeof formatMoney === 'function' ? formatMoney(value) : String(value ?? '');
}

function ActionBar({ colors, busy, readyCount, onCancel, onConfirm }) {
  return (
    <View style={styles.actions} nativeID="expense-import-actions">
      <TouchableOpacity onPress={onCancel} accessibilityRole="button" style={[styles.btn, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink }}>Avbryt</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onConfirm}
        disabled={busy || !readyCount}
        accessibilityRole="button"
        nativeID="expense-import-confirm"
        style={[styles.btnPrimary, { backgroundColor: colors.brand, opacity: busy || !readyCount ? 0.6 : 1 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {busy ? 'Lagrer…' : `Importer ${readyCount} utlegg`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ExpenseImportReview({
  colors,
  review,
  employees = [],
  customers = [],
  projects = [],
  busy,
  readyCount = 0,
  linkQuery = {},
  setLinkQuery,
  onToggleCard,
  onToggleOkRow,
  onLinkEmployee,
  onLinkProject,
  onLinkCustomer,
  onConfirm,
  onCancel,
}) {
  const danger = colors.danger || '#b42318';
  const brand = colors.brand || '#175cd3';
  const [okPage, setOkPage] = useState(40);
  const [reviewPage, setReviewPage] = useState(20);
  const cards = review?.cards || [];
  const okRows = review?.okRows || [];
  const reviewCards = review?.reviewCards || [];
  const headlineCards = useMemo(() => cards.map((card) => ({
    ...card,
    count: card.count || card.indexes?.length || 1,
  })), [cards]);

  return (
    <View nativeID="expense-import-review" style={{ gap: 14 }}>
      <ActionBar colors={colors} busy={busy} readyCount={readyCount} onCancel={onCancel} onConfirm={onConfirm} />
      <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700' }}>Kontroller utleggsimport</Text>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{reviewHeadline(headlineCards)}</Text>
      {review?.existingCount ? (
        <Text style={{ color: brand, fontWeight: '600' }}>
          {review.existingCount} utlegg finnes allerede og hoppes over.
        </Text>
      ) : null}
      <Text style={{ color: colors.muted }}>
        Duplikater hoppes over når samme dato, person, prosjekt, beløp og beskrivelse allerede er lagret.
        Like rader i selve filen beholdes. Rader med ukjent kunde, prosjekt eller medarbeider kan importeres med dataene fra filen, eller kobles her.
      </Text>

      {cards.filter((card) => card.severity === 'existing' || card.severity === 'block').map((card) => (
        <View key={card.id} style={[styles.card, { borderColor: card.severity === 'block' ? danger : brand, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{card.title}</Text>
          {!!card.meta && <Text style={{ color: colors.muted }}>{card.meta}</Text>}
          {(card.issues || []).map((issue) => (
            <Text key={issue} style={{ color: card.severity === 'block' ? danger : brand, fontWeight: '600' }}>{issue}</Text>
          ))}
        </View>
      ))}

      {okRows.length ? (
        <View style={{ gap: 8 }}>
          <View style={styles.okHead}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>
              Klare uten avvik ({okRows.filter((row) => row.included).length})
            </Text>
            <TouchableOpacity onPress={() => onToggleCard({ id: 'ok-group', indexes: okRows.map((row) => row.index) })} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>{okRows.every((row) => row.included) ? 'Ta alle ut' : 'Ta alle med'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tableScroll}>
            <View style={{ minWidth: 860 }}>
              <View style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
                {['Dato', 'Medarbeider', 'Kunde', 'Prosjekt', 'Beskrivelse', 'Beløp', 'Status', ''].map((label) => (
                  <Text key={label || 'x'} style={[styles.th, { color: colors.muted }]}>{label}</Text>
                ))}
              </View>
              {okRows.slice(0, okPage).map((row) => (
                <View key={row.id} style={[styles.tr, { borderBottomColor: colors.line, opacity: row.included ? 1 : 0.45 }]}>
                  <Text style={[styles.td, { color: colors.ink }]}>{formatDate(row.date)}</Text>
                  <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>{row.employeeName || '—'}</Text>
                  <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>{row.customerName || '—'}</Text>
                  <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>
                    {row.projectNumber ? `${row.projectNumber} ${row.projectName || ''}`.trim() : (row.projectName || '—')}
                  </Text>
                  <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>{row.description || '—'}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{money(row.amountInclVat)}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{expenseStatusLabel(row.status)}</Text>
                  <TouchableOpacity onPress={() => onToggleOkRow(row.id)} accessibilityRole="button">
                    <Text style={{ color: colors.brand, fontSize: 12 }}>{row.included ? 'Ta ut' : 'Ta med'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {okRows.length > okPage ? (
                <TouchableOpacity onPress={() => setOkPage((n) => n + 40)} style={{ padding: 12 }}>
                  <Text style={{ color: colors.brand, fontWeight: '600' }}>Vis flere ({okPage} av {okRows.length})</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {reviewCards.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: AMBER, fontWeight: '700' }}>Må kontrolleres / kobles ({reviewCards.length} grupper)</Text>
          {reviewCards.slice(0, reviewPage).map((card) => {
            const qEmployee = linkQuery[`${card.id}:employee`] || '';
            const qCustomer = linkQuery[`${card.id}:customer`] || '';
            const qProject = linkQuery[`${card.id}:project`] || '';
            const employeeHits = card.needsEmployee
              ? suggestEmployees(employees, { employeeName: card.employeeName, query: qEmployee || card.employeeName }, 6)
              : [];
            const projectHits = card.needsProject
              ? suggestProjects(projects, { projectNumber: card.projectNumber, projectName: card.projectName, query: qProject || card.projectNumber || card.projectName }, 6)
              : [];
            const customerHits = card.needsCustomer
              ? suggestCustomers(customers, { customerNumber: card.customerNumber, client: card.customerName, query: qCustomer || card.customerName }, 6)
              : [];
            return (
              <View key={card.id} style={[styles.card, { borderColor: AMBER, backgroundColor: colors.card, opacity: card.included ? 1 : 0.55 }]}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{card.title}</Text>
                {!!card.meta && <Text style={{ color: colors.muted }}>{card.meta}</Text>}
                {(card.issues || []).map((issue) => (
                  <Text key={issue} style={{ color: AMBER, fontWeight: '600' }}>{issue}</Text>
                ))}
                {card.needsEmployee ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.muted, fontWeight: '600' }}>Koble medarbeider</Text>
                    <TextInput
                      value={qEmployee}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [`${card.id}:employee`]: value }))}
                      placeholder="Søk medarbeider…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                    />
                    {employeeHits.map((employee) => (
                      <TouchableOpacity key={employee.id} onPress={() => onLinkEmployee(card.rowIndex, employee)}>
                        <Text style={{ color: colors.brand }}>{displayName(employee)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {card.needsProject ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.muted, fontWeight: '600' }}>Koble prosjekt</Text>
                    <TextInput
                      value={qProject}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [`${card.id}:project`]: value }))}
                      placeholder="Søk prosjekt…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                    />
                    {projectHits.map((project) => (
                      <TouchableOpacity key={project.id} onPress={() => onLinkProject(card.rowIndex, project)}>
                        <Text style={{ color: colors.brand }}>{[project.number, project.name].filter(Boolean).join(' · ')}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {card.needsCustomer ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.muted, fontWeight: '600' }}>Koble kunde</Text>
                    <TextInput
                      value={qCustomer}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [`${card.id}:customer`]: value }))}
                      placeholder="Søk kunde…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                    />
                    {customerHits.map((customer) => (
                      <TouchableOpacity key={customer.id} onPress={() => onLinkCustomer(card.rowIndex, customer)}>
                        <Text style={{ color: colors.brand }}>{customer.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <TouchableOpacity onPress={() => onToggleCard(card)} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>{card.included ? 'Ta ut av importen' : 'Ta med likevel'}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {reviewCards.length > reviewPage ? (
            <TouchableOpacity onPress={() => setReviewPage((n) => n + 20)}>
              <Text style={{ color: colors.brand, fontWeight: '600' }}>Vis flere grupper</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <ActionBar colors={colors} busy={busy} readyCount={readyCount} onCancel={onCancel} onConfirm={onConfirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  btnPrimary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  okHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableScroll: Platform.OS === 'web' ? { overflowX: 'auto', width: '100%' } : { width: '100%' },
  tr: { flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { width: 110, fontSize: 11, fontWeight: '700' },
  td: { width: 110, fontSize: 12 },
});
