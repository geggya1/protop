import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { reviewHeadline } from '../../src/imports/review';
import { formatDate, formatHours } from '../../src/economy/hoursList.js';
import { suggestEmployees } from '../../src/economy/hoursImport.js';
import { suggestCustomers, suggestProjects } from '../../src/economy/invoiceImport.js';
import { displayName } from '../../src/employees/model.js';

const AMBER = '#9a6700';

function ActionBar({ colors, busy, readyCount, onCancel, onConfirm, confirmLabel }) {
  return (
    <View style={styles.actions} nativeID="hour-import-actions">
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
        accessibilityLabel={confirmLabel?.(readyCount) || `Importer ${readyCount} timer`}
        nativeID="hour-import-confirm"
        style={[styles.btnPrimary, { backgroundColor: colors.brand, opacity: busy || !readyCount ? 0.6 : 1 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {busy ? 'Lagrer…' : (confirmLabel?.(readyCount) || `Importer ${readyCount} timer`)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function OkTable({ colors, rows, pageSize, onMore, onToggleRow }) {
  if (!rows.length) return null;
  return (
    <View style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="hour-import-ok-table">
      <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
        {['Dato', 'Medarbeider', 'Kunde', 'Prosjekt', 'Aktivitet', 'Timer', 'Fakt.', 'Beskrivelse', ''].map((label) => (
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
          <Text style={[styles.td, styles.dateCol, { color: colors.ink }]}>{formatDate(row.date)}</Text>
          <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>{row.employeeName || '—'}</Text>
          <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>{row.customerName || '—'}</Text>
          <Text style={[styles.td, styles.projectCol, { color: colors.ink }]} numberOfLines={2}>
            {row.projectNumber ? `${row.projectNumber} ${row.projectName || ''}`.trim() : (row.projectName || '—')}
          </Text>
          <Text style={[styles.td, { color: colors.ink }]} numberOfLines={1}>{row.activityName || '—'}</Text>
          <Text style={[styles.td, styles.hoursCol, { color: colors.ink }]}>{formatHours(row.hours)}</Text>
          <Text style={[styles.td, styles.hoursCol, { color: colors.ink }]}>{formatHours(row.billableHours)}</Text>
          <Text style={[styles.td, styles.descCol, { color: colors.ink }]} numberOfLines={2}>{row.description || '—'}</Text>
          <TouchableOpacity onPress={() => onToggleRow(row.id)} accessibilityRole="button" style={styles.actCol}>
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

export default function HoursImportReview({
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
  confirmLabel,
  title = 'Kontroller timeimport',
  lead = '',
}) {
  const danger = colors.danger || '#b42318';
  const brand = colors.brand || '#175cd3';
  const [okPage, setOkPage] = useState(50);
  const [reviewPage, setReviewPage] = useState(40);
  const cards = review?.cards || [];
  const okRows = review?.okRows || [];
  const reviewCards = review?.reviewCards || [];

  const headlineCards = useMemo(() => cards.map((card) => ({
    ...card,
    count: card.count || card.indexes?.length || 1,
  })), [cards]);

  return (
    <View nativeID="hour-import-review" style={{ gap: 14 }}>
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
          {review.existingCount} føringer finnes allerede og hoppes over.
        </Text>
      ) : null}
      <Text style={{ color: colors.muted }}>
        Duplikat bare ved helt like føringer (samme dato, person, prosjekt, timer og beskrivelse).
        Samme dag på ulike prosjekt, eller oppstykkede timer, beholdes. Medarbeidere legges inn på prosjektene ved lagring.
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
          <Text style={{ color: card.severity === 'block' ? danger : brand }}>
            {card.severity === 'existing' ? 'Finnes allerede og blir ikke importert.' : 'Blir ikke importert.'}
          </Text>
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
            <View style={{ minWidth: 980 }}>
              <OkTable
                colors={colors}
                rows={okRows}
                pageSize={okPage}
                onMore={() => setOkPage((n) => n + 50)}
                onToggleRow={onToggleOkRow}
              />
            </View>
          </View>
        </View>
      ) : null}

      {reviewCards.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: AMBER, fontWeight: '700' }}>
            Må kontrolleres / kobles ({reviewCards.length} grupper)
          </Text>
          {reviewCards.slice(0, reviewPage).map((card) => {
            const qEmployee = linkQuery[`${card.id}:employee`] || '';
            const qCustomer = linkQuery[`${card.id}:customer`] || '';
            const qProject = linkQuery[`${card.id}:project`] || '';
            const employeeHits = card.needsEmployee
              ? suggestEmployees(employees, {
                employeeName: card.employeeName,
                employeeNumber: card.employeeNumber,
                query: qEmployee || card.employeeName || card.employeeNumber,
              }, 6)
              : [];
            const projectHits = card.needsProject
              ? suggestProjects(projects, {
                projectNumber: card.projectNumber,
                projectName: card.projectName,
                query: qProject || card.projectNumber || card.projectName,
              }, 6)
              : [];
            const customerHits = card.needsCustomer
              ? suggestCustomers(customers, {
                customerNumber: card.customerNumber,
                client: card.customerName,
                query: qCustomer,
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

                {card.needsEmployee ? (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    <Text style={{ color: colors.muted, fontWeight: '600' }}>Koble medarbeider</Text>
                    <TextInput
                      value={qEmployee}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [`${card.id}:employee`]: value }))}
                      placeholder="Søk medarbeider…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                    />
                    {employeeHits.map((employee) => (
                      <TouchableOpacity
                        key={employee.id}
                        onPress={() => onLinkEmployee(card.rowIndex, employee)}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.brand }}>
                          {displayName(employee)}
                          {employee.company?.externalEmployeeNumber
                            ? ` · ${employee.company.externalEmployeeNumber}`
                            : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {card.needsProject ? (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    <Text style={{ color: colors.muted, fontWeight: '600' }}>Koble prosjekt</Text>
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
                          {[project.number, project.name, project.client].filter(Boolean).join(' · ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

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

                <TouchableOpacity onPress={() => onToggleCard(card)} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>
                    {card.included ? 'Ta ut av importen' : 'Ta med likevel'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {reviewCards.length > reviewPage ? (
            <TouchableOpacity onPress={() => setReviewPage((n) => n + 40)} accessibilityRole="button">
              <Text style={{ color: colors.brand, fontWeight: '600' }}>
                Vis flere grupper ({reviewPage} av {reviewCards.length})
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
  th: { width: 110, fontSize: 11, fontWeight: '700' },
  td: { width: 110, fontSize: 12 },
  dateCol: { width: 88 },
  projectCol: { width: 160 },
  hoursCol: { width: 56 },
  descCol: { width: 160, flexGrow: 1 },
  actCol: { width: 56 },
});
