import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';

const bodyFont = Platform.OS === 'web' ? 'Nunito, sans-serif' : undefined;

/** Phone chrome wrapping a stylized UI tease. */
function PhoneFrame({ children, tint = '#e8eef6' }) {
  return (
    <View style={styles.phone}>
      <View style={styles.notch} />
      <View style={[styles.screen, { backgroundColor: tint }]}>{children}</View>
      <View style={styles.homeBar} />
    </View>
  );
}

function CalendarTease({ caption }) {
  const days = [
    { d: 'MA', events: [{ label: 'Fotball', color: '#2563eb' }] },
    { d: 'TI', events: [{ label: 'Henting', color: '#0ea5e9' }] },
    { d: 'ON', events: [{ label: 'Svømming', color: '#0f766e' }] },
    { d: 'TO', events: [] },
    { d: 'FR', events: [{ label: 'Middag', color: '#e2a325' }] },
  ];
  return (
    <View style={styles.tease}>
      <PhoneFrame>
        <Text style={styles.appBar}>Uke 12</Text>
        <View style={styles.calGrid}>
          {days.map((col) => (
            <View key={col.d} style={styles.calCol}>
              <Text style={styles.calDay}>{col.d}</Text>
              {col.events.map((ev) => (
                <View key={ev.label} style={[styles.calChip, { backgroundColor: ev.color }]}>
                  <Text style={styles.calChipTxt} numberOfLines={1}>{ev.label}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <View style={styles.calFooter}>
          <Ionicons name="people-outline" size={14} color={colors.muted} />
          <Text style={styles.calFooterTxt}>Andersen · familie</Text>
        </View>
      </PhoneFrame>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

function TasksTease({ caption }) {
  const rows = [
    { title: 'Rydd rommet', done: true, stars: 2 },
    { title: 'Lekser', done: false, stars: 3 },
    { title: 'Dekke bord', done: false, stars: 1 },
  ];
  return (
    <View style={styles.tease}>
      <PhoneFrame tint="#f4f7fb">
        <Text style={styles.appBar}>Oppgaver</Text>
        {rows.map((r) => (
          <View key={r.title} style={styles.taskRow}>
            <View style={[styles.check, r.done && styles.checkOn]}>
              {r.done ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
            </View>
            <Text style={[styles.taskTitle, r.done && styles.taskDone]} numberOfLines={1}>
              {r.title}
            </Text>
            <View style={styles.stars}>
              {Array.from({ length: r.stars }).map((_, i) => (
                <Ionicons key={i} name="star" size={11} color="#e2a325" />
              ))}
            </View>
          </View>
        ))}
        <View style={styles.rewardBanner}>
          <Ionicons name="trophy-outline" size={16} color="#b45309" />
          <Text style={styles.rewardTxt}>12 stjerner denne uka</Text>
        </View>
      </PhoneFrame>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

function TeamTease({ caption }) {
  return (
    <View style={styles.tease}>
      <PhoneFrame tint="#eef5f2">
        <Text style={[styles.appBar, { color: '#0f766e' }]}>Sola HK mini</Text>
        <View style={styles.eventCard}>
          <View style={styles.eventDate}>
            <Text style={styles.eventMonth}>MAR</Text>
            <Text style={styles.eventDay}>18</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>Trening</Text>
            <Text style={styles.eventMeta}>Tirsdag kl. 17:00 · Hall A</Text>
          </View>
        </View>
        <View style={styles.eventCard}>
          <View style={styles.eventDate}>
            <Text style={styles.eventMonth}>MAR</Text>
            <Text style={styles.eventDay}>22</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>Kamp</Text>
            <Text style={styles.eventMeta}>Lørdag kl. 11:00 · Borte</Text>
          </View>
        </View>
        <View style={styles.codePill}>
          <Ionicons name="key-outline" size={12} color={colors.brand} />
          <Text style={styles.codeTxt}>Lagkode · AB12CD</Text>
        </View>
      </PhoneFrame>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

export default function WelcomeTeasers({ t }) {
  return (
    <View style={styles.row}>
      <CalendarTease caption={t('welcome.tease1')} />
      <TasksTease caption={t('welcome.tease2')} />
      <TeamTease caption={t('welcome.tease3')} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 4,
  },
  tease: {
    width: 200,
  },
  phone: {
    width: 200,
    borderRadius: 28,
    backgroundColor: '#1a2744',
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 8,
    shadowColor: '#1a2744',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  notch: {
    alignSelf: 'center',
    width: 56,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0f172a',
    marginBottom: 8,
  },
  screen: {
    borderRadius: 20,
    padding: 10,
    minHeight: 248,
  },
  homeBar: {
    alignSelf: 'center',
    width: 72,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#64748b',
    marginTop: 8,
  },
  appBar: {
    fontFamily: bodyFont,
    fontWeight: '800',
    fontSize: 14,
    color: colors.ink,
    marginBottom: 10,
  },
  calGrid: { flexDirection: 'row', gap: 4, flex: 1 },
  calCol: { flex: 1, gap: 4 },
  calDay: {
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '800',
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 2,
  },
  calChip: {
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 3,
  },
  calChipTxt: {
    fontFamily: bodyFont,
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
  },
  calFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  calFooterTxt: {
    fontFamily: bodyFont,
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  taskTitle: {
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  taskDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  stars: { flexDirection: 'row', gap: 1 },
  rewardBanner: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff8e8',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  rewardTxt: {
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '800',
    color: '#92400e',
  },
  eventCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#d5e0db',
  },
  eventDate: { width: 36, alignItems: 'center' },
  eventMonth: {
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '800',
    color: colors.muted,
  },
  eventDay: {
    fontFamily: bodyFont,
    fontSize: 16,
    fontWeight: '900',
    color: colors.ink,
  },
  eventTitle: {
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
  },
  eventMeta: {
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 2,
  },
  codePill: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dbeafe',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  codeTxt: {
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '800',
    color: colors.brand,
  },
  caption: {
    fontFamily: bodyFont,
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 18,
  },
});
