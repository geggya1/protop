import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { listEmployeeUsage } from '../../src/employees/usageClient';
import { formatUsageStamp, normalizeUsageSummary, usageSummaryLines } from '../../src/employees/usage';
import { usageLogNotice } from '../../src/privacy/companyPrivacy';

export default function EmployeeUsagePanel({
  companyId,
  company = null,
  employee,
  colors,
  enabled = false,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(() => normalizeUsageSummary(employee?.usage));
  const [events, setEvents] = useState([]);
  // Serverens tekst (listEmployeeUsage) følger selskapets valg; til den kommer, samme tekst lokalt.
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setSummary(normalizeUsageSummary(employee?.usage));
  }, [employee?.usage]);

  useEffect(() => {
    if (!enabled || !companyId || !employee?.id) return undefined;
    let live = true;
    setLoading(true);
    setError('');
    listEmployeeUsage({ companyId, employeeId: employee.id }).then((result) => {
      if (!live) return;
      if (!result?.ok) {
        setError(result?.error || 'Kunne ikke hente bruksloggen.');
        setLoading(false);
        return;
      }
      setSummary(normalizeUsageSummary(result.summary));
      setEvents(Array.isArray(result.events) ? result.events : []);
      setNotice(String(result.notice || ''));
      setLoading(false);
    }).catch(() => {
      if (!live) return;
      setError('Kunne ikke hente bruksloggen.');
      setLoading(false);
    });
    return () => { live = false; };
  }, [enabled, companyId, employee?.id]);

  if (!enabled) return null;
  const lines = usageSummaryLines(summary);

  return (
    <View nativeID="employee-usage" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={[styles.heading, { color: colors.ink }]}>Brukerlogg</Text>
      <Text nativeID="employee-usage-notice" style={{ color: colors.muted, fontSize: 13 }}>
        {notice || usageLogNotice(company)}
      </Text>
      {loading ? <ActivityIndicator color={colors.brand} /> : null}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {!lines.length && !events.length && !loading ? (
        <Text style={{ color: colors.muted }}>Ingen bruk er registrert ennå.</Text>
      ) : null}
      {lines.map((line) => (
        <View key={line.id} style={[styles.row, { borderBottomColor: colors.line }]}>
          <Text style={{ color: colors.muted, width: 150 }}>{line.label}</Text>
          <Text style={{ color: colors.ink, flex: 1 }}>{line.value}</Text>
        </View>
      ))}
      {events.length ? <Text style={[styles.sub, { color: colors.ink }]}>Hendelser</Text> : null}
      {events.map((event) => (
        <View key={event.id} style={styles.event}>
          <Text style={{ color: colors.ink }}>{event.summary || 'Hendelse'}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {[formatUsageStamp(event.at), event.ip].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  heading: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 15, fontWeight: '700', marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  event: { gap: 2 },
});
