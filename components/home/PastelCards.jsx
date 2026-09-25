import React, { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DASHBOARD_CARD_ART } from '../../src/parentDashboardThemes';
import { parentAppShortLabel, parentAppAccent, MORE_FOLDER_GLYPHS } from '../../src/utils/parentHomeShortcuts';
import IconBadge from '../IconBadge';
import { AvatarBubble } from '../AvatarPicker';
import TodoTaskIcon from '../TodoTaskIcon';
import { soft } from '../parentHome/softTheme';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { immersiveCardSurface, immersiveChipSurface, immersiveIconDisc } from './homeGlass';

function useImmersiveCard() {
  const immersive = useHomeImmersive();
  return immersive ? immersiveCardSurface : null;
}

function useImmersiveChip() {
  const immersive = useHomeImmersive();
  return immersive ? immersiveChipSurface : null;
}

/** Module glyph on a solid white disc when immersive — pops against frost. */
function ModuleHeadIcon({ name, color, size = 15, compact = false }) {
  const immersive = useHomeImmersive();
  if (!immersive) {
    return <Ionicons name={name} size={size} color={color} />;
  }
  const disc = compact ? 26 : 28;
  return (
    <View
      style={[
        styles.headIconDisc,
        immersiveIconDisc,
        { width: disc, height: disc, borderRadius: disc / 2 },
      ]}
    >
      <Ionicons name={name} size={Math.round(disc * 0.52)} color={color} />
    </View>
  );
}

const MEAL_IMG = DASHBOARD_CARD_ART.meal;
const sans = Platform.OS === 'web' ? 'Inter, system-ui, -apple-system, sans-serif' : undefined;
const display = Platform.OS === 'web' ? 'Fraunces, Georgia, serif' : undefined;

const PERIOD_HOUR = {
  morning: '09',
  forenoon: '11',
  afternoon: '13',
  midafternoon: '15',
  evening: '17',
};

export function HomeWeekStrip({ onPressDay }) {
  const days = useMemo(() => {
    const labels = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
    const now = new Date();
    const mondayIndex = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayIndex);
    return labels.map((label, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
        label,
        date: d.getDate(),
        selected: i === mondayIndex,
      };
    });
  }, []);

  return (
    <View style={styles.strip} testID="home-week-strip">
      {days.map((d) => (
        <TouchableOpacity
          key={d.key}
          style={[styles.stripDay, d.selected && styles.stripDayOn]}
          onPress={() => onPressDay?.()}
          accessibilityRole="button"
          accessibilityState={{ selected: d.selected }}
          accessibilityLabel={`${d.label} ${d.date}`}
        >
          <Text style={[styles.stripLbl, d.selected && styles.stripLblOn]}>{d.label}</Text>
          <Text style={[styles.stripNum, d.selected && styles.stripNumOn]}>{d.date}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function weatherHours(weather) {
  if (weather?.hours?.length) return weather.hours.slice(0, 6);
  return (weather?.periods || []).slice(0, 5).map((p) => ({
    id: p.id,
    hour: PERIOD_HOUR[p.id] || p.label || p.hour || '',
    icon: p.icon,
    temp: p.temp,
  }));
}

function weatherDays(weather) {
  if (weather?.days?.length) return weather.days.slice(0, 3);
  const today = {
    weekday: 'I dag',
    icon: weather?.icon,
    max: weather?.high,
    min: weather?.low,
    label: weather?.label,
  };
  return [today];
}

export function SoftWeatherCard({ weather, look = 'now', compact = false, onPress }) {
  const immersiveCard = useImmersiveCard();
  const chip = useImmersiveChip();
  const temp = weather?.temp != null ? `${weather.temp}°` : '—';
  const place = weather?.place || 'Vær';
  const mode = look === 'day' || look === 'hours' ? look : 'now';
  const hours = weatherHours(weather);
  const days = weatherDays(weather);
  const inner = (
    <>
      <View style={styles.weatherTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.weatherPlace} numberOfLines={1}>{place}</Text>
          <Text style={[styles.weatherTemp, (compact || mode === 'now') && styles.weatherTempSm]}>{temp}</Text>
        </View>
        <View style={styles.weatherMeta}>
          <Ionicons name={weather?.icon || 'partly-sunny'} size={compact ? 22 : 26} color={soft.sage} />
          {weather?.high != null || weather?.low != null ? (
            <Text style={styles.weatherHiLo}>
              {weather.high != null ? `H ${weather.high}°` : ''}
              {weather.high != null && weather.low != null ? '  ' : ''}
              {weather.low != null ? `L ${weather.low}°` : ''}
            </Text>
          ) : null}
        </View>
      </View>

      {mode === 'day' ? (
        <View style={styles.days}>
          {days.map((d, i) => (
            <View key={d.weekday || d.date || i} style={[styles.day, chip]}>
              <Text style={styles.hourLbl} numberOfLines={1}>{d.weekday || 'Dag'}</Text>
              <Ionicons name={d.icon || 'partly-sunny'} size={16} color={soft.sage} />
              <Text style={styles.hourTemp}>
                {d.max != null ? `${d.max}°` : '—'}
                {d.min != null ? ` / ${d.min}°` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {mode === 'hours' ? (
        <View style={styles.hours}>
          {hours.map((p) => (
            <View key={p.id || p.hour} style={styles.hour}>
              <Text style={styles.hourLbl}>{p.hour}</Text>
              <Ionicons name={p.icon || 'partly-sunny'} size={14} color={soft.sage} />
              <Text style={styles.hourTemp}>{p.temp != null ? `${p.temp}°` : '—'}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {mode === 'now' && weather?.label && !compact ? (
        <Text style={styles.weatherLabel} numberOfLines={1}>{weather.label}</Text>
      ) : null}
    </>
  );

  const shared = {
    style: [styles.weather, immersiveCard],
    accessibilityLabel: `Vær ${temp} ${place}`,
    testID: `home-weather-${mode}`,
  };

  if (!onPress) {
    return <View {...shared}>{inner}</View>;
  }
  return (
    <TouchableOpacity
      {...shared}
      onPress={onPress}
      activeOpacity={0.92}
      accessibilityRole="button"
    >
      {inner}
    </TouchableOpacity>
  );
}

export function NextEventPastel({
  next, onPress, wide = false,
}) {
  const birthday = /bursdag|fødselsdag/i.test(next?.title || '');
  return (
    <TouchableOpacity
      style={[styles.next, wide && styles.nextWide, useImmersiveCard()]}
      onPress={onPress}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={next?.title || 'Neste avtale'}
    >
      <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
        <View style={styles.eyebrow}>
          <Ionicons name="calendar-outline" size={13} color={soft.sage} />
          <Text style={styles.eyebrowTxt}>Neste avtale</Text>
        </View>
        <Text style={styles.nextTitle} numberOfLines={2}>
          {next?.title || 'Ingen avtaler'}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={13} color={soft.muted} />
          <Text style={styles.metaTxt}>
            {next?.time || 'Ledig dag'}
            {next?.end ? ` – ${next.end}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.nextArt}>
        <Text style={styles.nextEmoji}>{birthday ? '🎂🎈' : '📅'}</Text>
      </View>
      <View style={styles.chev}>
        <Ionicons name="chevron-forward" size={16} color={soft.sage} />
      </View>
    </TouchableOpacity>
  );
}

function CheckItem({ title, done, onPress }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.radio, done && styles.radioOn]}>
        {done ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
      </View>
      <Text style={[styles.checkTxt, done && styles.checkDone]} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
}

export function TasksPastel({
  progress, onOpen, onToggle, illustrated = false, title = 'Dagens oppgaver', compact = false, maxItems,
}) {
  const shownCount = maxItems ?? (compact ? 3 : 8);
  const items = (progress?.items || []).slice(0, shownCount);
  const done = progress?.done || items.filter((t) => t.done).length;
  const total = progress?.total || items.length;
  const remaining = Math.max(0, (total || 0) - (done || 0));
  const immersive = useHomeImmersive();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <View style={[styles.card, styles.tasks, useImmersiveCard()]}>
      <TouchableOpacity style={styles.head} onPress={onOpen} activeOpacity={0.9}>
        <ModuleHeadIcon name="checkmark-circle" color="#2F8A4C" size={14} compact={compact} />
        <Text style={styles.headTitle} numberOfLines={1}>{title}</Text>
      </TouchableOpacity>
      <Text style={styles.progressLbl}>
        {immersive ? `${remaining} av ${total} gjenstår` : `${done} av ${total}`}
      </Text>
      {!compact ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
      ) : null}
      <ScrollView
        style={styles.widgetScroll}
        contentContainerStyle={styles.widgetScrollBody}
        showsVerticalScrollIndicator={items.length > 2}
        nestedScrollEnabled
      >
        <View style={illustrated && !compact ? styles.taskSplit : null}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {items.map((t) => (
              <CheckItem
                key={t.id}
                title={t.title}
                done={!!t.done}
                onPress={() => (onToggle ? onToggle(t) : onOpen?.())}
              />
            ))}
          </View>
          {illustrated && !compact ? <Text style={styles.sideEmoji}>🐶</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Barnevennlig gjøremål-kort: full bredde, gjenstående øverst,
 * utkvitterte under — samme tetthet som avtaler-radene.
 */
export function ChildTasksPastel({
  progress,
  onOpen,
  onToggle,
  title = 'Dagens gjøremål',
  compact = false,
  maxOpen = 6,
  maxDone = 4,
}) {
  const openItems = (progress?.openItems || progress?.items?.filter((t) => !t.done) || [])
    .slice(0, maxOpen);
  const doneItems = (progress?.doneItems || progress?.items?.filter((t) => t.done) || [])
    .slice(0, maxDone);
  const done = progress?.done ?? doneItems.length;
  const total = progress?.total ?? (openItems.length + doneItems.length);
  const remaining = Math.max(0, (total || 0) - (done || 0));
  const pct = total ? Math.round((done / total) * 100) : 0;
  const nudge = remaining === 0
    ? (total ? 'Alt klart — digg jobba!' : 'Ingen gjøremål i dag')
    : remaining === 1
      ? 'Én ting igjen — trykk for å kvittere ut'
      : `${remaining} ting igjen — trykk for å kvittere ut`;

  return (
    <View style={[styles.card, styles.childTasks, useImmersiveCard()]} testID="child-tasks-pastel">
      <TouchableOpacity style={styles.head} onPress={onOpen} activeOpacity={0.9}>
        <ModuleHeadIcon name="star" color="#E0A106" size={compact ? 14 : 15} compact={compact} />
        <Text style={styles.headTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.childTasksLink}>Se alle ›</Text>
      </TouchableOpacity>
      {!compact ? <Text style={styles.childTasksNudge}>{nudge}</Text> : null}
      {!compact ? (
        <View style={styles.childTrack}>
          <View style={[styles.childFill, { width: `${pct}%` }]} />
        </View>
      ) : null}
      <ScrollView
        style={styles.childTaskScroll}
        contentContainerStyle={styles.childTaskScrollBody}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {openItems.length ? (
          <View style={styles.childTaskSection}>
            {openItems.map((t) => (
              <ChildTaskRow
                key={t.id}
                item={t}
                done={false}
                onPress={() => (onToggle ? onToggle(t) : onOpen?.())}
              />
            ))}
          </View>
        ) : null}
        {doneItems.length ? (
          <View style={[styles.childTaskSection, openItems.length ? styles.childTaskSectionDone : null]}>
            {doneItems.map((t) => (
              <ChildTaskRow
                key={t.id}
                item={t}
                done
                onPress={() => (onToggle ? onToggle(t) : onOpen?.())}
              />
            ))}
          </View>
        ) : null}
        {!openItems.length && !doneItems.length ? (
          <Text style={styles.empty}>Ingen gjøremål i dag</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ChildTaskRow({ item, done, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.childTaskRow, done && styles.childTaskRowDone]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!done }}
      accessibilityLabel={done ? `${item.title}, ferdig` : `${item.title}, marker som ferdig`}
    >
      <View style={[styles.childTaskIcon, done && styles.childTaskIconDone]}>
        {item.raw ? (
          <TodoTaskIcon task={item.raw} style={styles.childTaskIconImg} emojiSize={13} />
        ) : (
          <Ionicons
            name={done ? 'checkmark-circle' : 'star'}
            size={13}
            color={done ? '#34C759' : '#E0A106'}
          />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.childTaskTitle, done && styles.childTaskTitleDone]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
      </View>
      <View style={[styles.childCheck, done && styles.childCheckOn]}>
        {done ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
      </View>
    </TouchableOpacity>
  );
}

export function ShoppingPastel({ count, items = [], onPress, compact = false, maxItems }) {
  const limit = maxItems ?? (compact ? 8 : 12);
  const shown = items.slice(0, limit);
  return (
    <TouchableOpacity style={[styles.card, styles.shop, useImmersiveCard()]} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.head}>
        <ModuleHeadIcon name="cart" color="#C47A4A" size={16} compact={compact} />
        <Text style={styles.headTitle} numberOfLines={1}>Handleliste</Text>
      </View>
      <Text style={styles.progressLbl}>{count === 1 ? '1 vare igjen' : `${count || 0} varer igjen`}</Text>
      <ScrollView
        style={styles.widgetScroll}
        contentContainerStyle={styles.widgetScrollBody}
        showsVerticalScrollIndicator={shown.length > 2}
        nestedScrollEnabled
      >
        {shown.length ? shown.map((it) => (
          <CheckItem key={it.id || it.title} title={it.title} done={!!it.done} onPress={onPress} />
        )) : <Text style={styles.empty}>Listen er tom</Text>}
      </ScrollView>
    </TouchableOpacity>
  );
}

export function MealsPastel({ dinner, onPress, link = false, compact = false }) {
  const lead = link ? 'Enklere middagshverdag' : 'Enklere hverdager';
  return (
    <TouchableOpacity style={[styles.card, styles.meals, useImmersiveCard()]} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.head}>
        <ModuleHeadIcon name="restaurant" color="#C47A4A" size={14} compact={compact} />
        <Text style={styles.headTitle} numberOfLines={1}>Måltidsplan</Text>
      </View>
      {!compact ? <Text style={styles.mealsLead}>{lead}</Text> : null}
      {!compact && MEAL_IMG ? (
        <Image source={MEAL_IMG} style={styles.mealImg} resizeMode="cover" />
      ) : null}
      <Text style={styles.mealName} numberOfLines={2}>
        {dinner?.title || 'Ingen middag satt'}
      </Text>
      {link && !compact ? <Text style={styles.link}>Se ukens måltidsplan →</Text> : null}
    </TouchableOpacity>
  );
}

export function CalendarPeek({ events = [], onPress, title = 'Familiekalender', compact = false, linkLabel }) {
  const rows = events.slice(0, compact ? 2 : 3);
  return (
    <TouchableOpacity style={[styles.card, styles.cal, useImmersiveCard()]} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.head}>
        <ModuleHeadIcon name="calendar" color="#2F80ED" size={16} compact={compact} />
        <Text style={styles.headTitle} numberOfLines={1}>{title}</Text>
        {linkLabel ? <Text style={styles.link}>{linkLabel}</Text> : null}
      </View>
      {rows.map((ev) => (
        <View key={ev.id} style={styles.calRow}>
          <Text style={styles.calTime}>{ev.time || ''}</Text>
          <View style={[styles.dot, { backgroundColor: ev.color || '#34C759' }]} />
          <Text style={styles.calTitle} numberOfLines={1}>{ev.title}</Text>
        </View>
      ))}
    </TouchableOpacity>
  );
}

/** Barnets ukeplan: ukestripe + dagens (eller morgendagens) program. */
export function WeekPlanPastel({
  programTitle = 'Dagens program',
  weekLabel,
  weekDays = [],
  lessons = [],
  emptyLabel = 'Ingen timeplan ennå',
  compact = false,
  onPress,
}) {
  const rows = lessons.slice(0, compact ? 2 : 4);
  return (
    <TouchableOpacity
      style={[styles.card, styles.weekPlanCard, useImmersiveCard()]}
      onPress={onPress}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={`${programTitle}. ${rows.map((r) => r.title).join(', ') || emptyLabel}`}
    >
      <View style={styles.head}>
        <ModuleHeadIcon name="school" color="#2F80ED" size={16} compact={compact} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headTitle} numberOfLines={1}>Ukeplan</Text>
          <Text style={styles.weekPlanSub} numberOfLines={1}>
            {weekLabel ? `${weekLabel} · ${programTitle}` : programTitle}
          </Text>
        </View>
      </View>
      {weekDays.length ? (
        <View style={styles.weekPlanStrip}>
          {weekDays.map((d) => (
            <View
              key={d.id}
              style={[styles.weekPlanDay, d.active && styles.weekPlanDayOn]}
            >
              <Text style={[styles.weekPlanDayLbl, d.active && styles.weekPlanDayLblOn]}>
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {rows.length ? (
        <View style={styles.weekPlanCols}>
          {rows.map((ev) => {
            const time = compact
              ? String(ev.time || '').split(/[–-]/)[0]?.trim() || ev.time || '—'
              : (ev.time || '—');
            return (
              <View key={ev.id} style={styles.weekPlanRow}>
                <View style={[styles.weekPlanTimeCol, compact && styles.weekPlanTimeColSm]}>
                  <Text style={styles.weekPlanTime} numberOfLines={1}>{time}</Text>
                </View>
                <View style={styles.weekPlanSubjectCol}>
                  <Text style={styles.weekPlanSubject} numberOfLines={1}>{ev.title}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.weekPlanEmpty}>{emptyLabel}</Text>
      )}
    </TouchableOpacity>
  );
}

export function RewardsPastel({ amount, hint, onPress, unit = 'kr' }) {
  return (
    <TouchableOpacity style={[styles.card, styles.rewards, useImmersiveCard()]} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.head}>
        <ModuleHeadIcon name="star" color="#E0A106" size={16} />
        <Text style={styles.headTitle}>Belønninger</Text>
      </View>
      <View style={styles.rewardSplit}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.coin}>
            {amount != null ? (typeof amount === 'number' ? `${amount} ${unit}` : String(amount)) : '—'}
          </Text>
          <Text style={styles.metaTxt}>{hint || 'Se hva som er opptjent'}</Text>
        </View>
        <Text style={styles.sideEmoji}>💰</Text>
      </View>
    </TouchableOpacity>
  );
}

export function GoalsPastel({ items = [], done = 0, total = 0, onPress, compact = false }) {
  const shown = items.slice(0, compact ? 2 : 3);
  const t = total || shown.length;
  return (
    <TouchableOpacity style={[styles.card, styles.goals, useImmersiveCard()]} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.head}>
        <ModuleHeadIcon name="flag" color="#1F8A4C" size={16} compact={compact} />
        <Text style={styles.headTitle} numberOfLines={1}>Ukens mål</Text>
      </View>
      <Text style={styles.progressLbl}>{done} av {t || 3}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${t ? Math.round((done / t) * 100) : 0}%` }]} />
      </View>
      {shown.map((it) => (
        <CheckItem key={it.id || it.title} title={it.title} done={!!it.done} onPress={onPress} />
      ))}
    </TouchableOpacity>
  );
}

export function KidsProgressPastel({ kids = [], onPress, maxItems = 12 }) {
  const shown = kids.slice(0, maxItems);
  return (
    <TouchableOpacity
      style={[styles.card, styles.progressCard, useImmersiveCard()]}
      onPress={onPress}
      activeOpacity={0.92}
    >
      <View style={styles.head}>
        <ModuleHeadIcon name="stats-chart" color="#2F80ED" size={16} />
        <Text style={styles.headTitle} numberOfLines={1}>Barnas progresjon</Text>
      </View>
      {shown.length ? (
        <ScrollView
          style={styles.widgetScroll}
          contentContainerStyle={[styles.widgetScrollBody, styles.progressKids]}
          showsVerticalScrollIndicator={shown.length > 2}
          nestedScrollEnabled
        >
          {shown.map((kid) => {
            const total = kid.todayTotal || 0;
            const done = kid.doneToday || 0;
            const pct = Number.isFinite(kid.pct)
              ? kid.pct
              : (total ? Math.round((done / total) * 100) : 0);
            return (
              <View key={kid.kidId || kid.name} style={styles.progressKid}>
                <AvatarBubble
                  avatarId={kid.avatarId}
                  photoURL={kid.photoURL}
                  name={kid.name}
                  size={28}
                  color={kid.color}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.progressKidHead}>
                    <Text style={styles.progressKidName} numberOfLines={1}>{kid.name}</Text>
                    <Text style={styles.progressKidMeta} numberOfLines={1}>
                      {total ? `${done}/${total} i dag` : 'Ingen i dag'}
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>Ingen barn i familien ennå</Text>
      )}
    </TouchableOpacity>
  );
}

export function AssistantPastel({ onPress, banner = false }) {
  const glass = useImmersiveCard();
  const chip = useImmersiveChip();
  if (banner) {
    return (
      <TouchableOpacity style={[styles.aiBanner, glass]} onPress={onPress} activeOpacity={0.92}>
        <View style={[styles.aiIcon, immersiveIconDisc]}>
          <Ionicons name="sparkles" size={18} color="#7C3AED" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headTitle}>ProTop AI</Text>
          <Text style={styles.aiBody} numberOfLines={2}>
            Få hjelp til å planlegge, lage lister eller finne gode rutiner.
          </Text>
        </View>
        <View style={[styles.aiCta, chip, banner && { marginTop: 0 }]}>
          <Text style={styles.aiCtaTxt}>Spør meg</Text>
          <Ionicons name="chevron-forward" size={14} color="#7C3AED" />
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity style={[styles.card, styles.ai, glass]} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.head}>
        <ModuleHeadIcon name="sparkles" color="#7C3AED" size={16} />
        <Text style={styles.headTitle}>ProTop AI</Text>
      </View>
      <Text style={styles.aiBody}>
        Få hjelp til å planlegge, lage lister eller finne gode rutiner.
      </Text>
        <View style={[styles.aiCta, chip, { marginTop: 0 }]}>
          <Text style={styles.aiCtaTxt}>Spør meg</Text>
          <Ionicons name="chevron-forward" size={14} color="#7C3AED" />
        </View>
      </TouchableOpacity>
    );
  }

export function NotesPastel({ notes = [], onPress, title = 'Notater' }) {
  const note = notes[0];
  return (
    <TouchableOpacity style={[styles.card, styles.notes, useImmersiveCard()]} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.head}>
        <ModuleHeadIcon name="document-text" color="#5B63A6" size={16} />
        <Text style={styles.headTitle}>{title}</Text>
      </View>
      <Text style={styles.progressLbl}>{notes.length ? `${notes.length} notat` : 'Tomt'}</Text>
      <Text style={styles.noteBody} numberOfLines={3}>
        {note?.title || note?.meta || 'Ingen notater ennå'}
      </Text>
    </TouchableOpacity>
  );
}

export function AppsPastel({ apps = [], onPress }) {
  const shown = apps.slice(0, 4);
  const chip = useImmersiveChip();
  const immersive = useHomeImmersive();
  return (
    <View style={[styles.card, styles.apps, useImmersiveCard()]}>
      <View style={styles.head}>
        <ModuleHeadIcon name="apps" color="#5B63A6" size={16} />
        <Text style={styles.headTitle}>Apper</Text>
      </View>
      <View style={styles.appGrid}>
        {shown.map((app) => (
          <TouchableOpacity key={app.id} style={[styles.appCell, chip]} onPress={() => onPress?.(app)} activeOpacity={0.85}>
            <View style={[styles.appGlyphDisc, immersive && immersiveIconDisc]}>
              <Ionicons name={app.icon || 'apps'} size={15} color={parentAppAccent(app.id)} />
            </View>
            <Text style={styles.appLbl} numberOfLines={1}>{parentAppShortLabel(app)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function FolderGlyph({ size = 40 }) {
  const immersive = useHomeImmersive();
  const gap = 3;
  const cell = Math.max(12, Math.round((size - 12 - gap) / 2));
  const inner = cell * 2 + gap;
  return (
    <View
      testID="home-shortcut-folder-glyph"
      style={[
        styles.folderGlyph,
        immersive ? immersiveIconDisc : { backgroundColor: 'rgba(255,255,255,0.9)' },
        { width: size, height: size, borderRadius: 12 },
      ]}
    >
      <View style={{ width: inner, height: inner, flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {MORE_FOLDER_GLYPHS.map((g) => (
          <View
            key={g.icon}
            style={[
              styles.folderGlyphCell,
              {
                width: cell,
                height: cell,
                borderRadius: 6,
                backgroundColor: `${g.color}22`,
              },
            ]}
          >
            <Ionicons name={g.icon} size={Math.max(9, Math.round(cell * 0.62))} color={g.color} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function ShortcutTile({ app, onPress, index = 0, size = 'row' }) {
  const immersive = useHomeImmersive();
  const glass = useImmersiveCard();
  const board = size === 'board';
  const bg = immersive
    ? undefined
    : ['#E8F3EC', '#F8EDE6', '#EEF0F8', '#E8F0F6'][index % 4];
  const isFolder = !!app?.folder;
  const label = app?.tileLabel || parentAppShortLabel(app);
  return (
    <TouchableOpacity
      style={[
        styles.shortcut,
        board && styles.shortcutBoard,
        bg ? { backgroundColor: bg } : null,
        glass,
      ]}
      onPress={() => onPress?.(app)}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={isFolder ? 'home-shortcut-folder' : `home-shortcut-${app?.id || 'app'}`}
    >
      <IconBadge count={app?.badge || 0} size={board ? 13 : 12} offset={-3}>
        {isFolder ? (
          <FolderGlyph size={board ? 48 : 40} />
        ) : (
          <View style={[
            styles.shortcutIconDisc,
            board && styles.shortcutIconDiscBoard,
            immersive ? immersiveIconDisc : { backgroundColor: 'rgba(255,255,255,0.7)' },
          ]}>
            <Ionicons
              name={app?.icon || 'apps'}
              size={board ? 22 : 20}
              color={parentAppAccent(app?.id)}
            />
          </View>
        )}
      </IconBadge>
      <Text style={[styles.shortcutLbl, board && styles.shortcutLblBoard]} numberOfLines={1}>
        {label}
      </Text>
      {app?.sub ? (
        <Text style={[styles.shortcutSub, board && styles.shortcutSubBoard]} numberOfLines={1}>
          {app.sub}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export function ShortcutRow({ apps = [], onPress }) {
  return (
    <View style={styles.shortcutRow}>
      {apps.slice(0, 4).map((app, i) => (
        <ShortcutTile key={app.id} app={app} index={i} onPress={onPress} />
      ))}
    </View>
  );
}

/** 2×2 app collection: three module icons + «+ mer» opening the full apps hub. */
export function AppFolderPastel({
  apps = [],
  onOpenApp,
  onOpenMore,
  moreLabel = '+ mer',
}) {
  const glass = useImmersiveCard();
  const immersive = useHomeImmersive();
  const slots = [0, 1, 2].map((i) => apps[i] || null);
  return (
    <View style={styles.folderGrid} testID="home-app-folder">
      {slots.map((app, i) => (
        <TouchableOpacity
          key={app?.id || `slot-${i}`}
          style={[styles.folderCell, glass]}
          onPress={() => app && onOpenApp?.(app)}
          activeOpacity={app ? 0.88 : 1}
          disabled={!app}
          accessibilityRole={app ? 'button' : undefined}
          accessibilityLabel={app ? parentAppShortLabel(app) : undefined}
        >
          {app ? (
            <>
              <IconBadge count={app.badge || 0} size={11} offset={-2}>
                <View style={[
                  styles.folderIcon,
                  immersive
                    ? immersiveIconDisc
                    : { backgroundColor: `${parentAppAccent(app.id)}22` },
                ]}>
                  <Ionicons name={app.icon || 'apps'} size={22} color={parentAppAccent(app.id)} />
                </View>
              </IconBadge>
              <Text style={styles.folderLbl} numberOfLines={1}>{parentAppShortLabel(app)}</Text>
            </>
          ) : null}
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={[styles.folderCell, glass]}
        onPress={onOpenMore}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Flere apper"
        testID="home-app-folder-more"
      >
        <View style={[
          styles.folderIcon,
          immersive ? immersiveIconDisc : styles.folderMoreIcon,
        ]}>
          <Ionicons name="add" size={22} color={immersive ? '#2F80ED' : soft.sage} />
        </View>
        <Text style={styles.folderLbl} numberOfLines={1}>{moreLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function TimelinePastel({
  items = [],
  onOpen,
  onSeeAll,
  title = 'Dagens avtaler',
  emptyLabel = 'Ingenting planlagt i dag',
  seeAllLabel = 'Se hele dagen →',
  icon = 'calendar',
  maxItems,
  compact = false,
}) {
  const limit = maxItems ?? (compact ? 2 : 8);
  const rows = items.slice(0, limit);
  return (
    <View style={[styles.timeline, compact && styles.timelineCompact, useImmersiveCard()]}>
      <View style={styles.timelineHead}>
        <View style={styles.head}>
          <ModuleHeadIcon name={icon} color={soft.sage} size={compact ? 14 : 16} compact={compact} />
          <Text style={styles.headTitle}>{title}</Text>
        </View>
        {onSeeAll ? (
          <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
            <Text style={styles.link}>{seeAllLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        style={styles.widgetScroll}
        contentContainerStyle={styles.widgetScrollBody}
        showsVerticalScrollIndicator={rows.length > 2}
        nestedScrollEnabled
      >
        {rows.length ? rows.map((ev, idx) => (
          <TouchableOpacity
            key={ev.id}
            style={[
              styles.tlRow,
              compact && styles.tlRowCompact,
              idx < rows.length - 1 && styles.tlBorder,
            ]}
            onPress={() => onOpen?.(ev)}
            activeOpacity={0.85}
          >
            <Text style={[styles.tlTime, compact && styles.tlTimeCompact]}>{ev.time || 'Heldag'}</Text>
            <View style={[styles.dot, { backgroundColor: ev.color || '#2F80ED' }]} />
            <Text style={[styles.tlTitle, compact && styles.tlTitleCompact]} numberOfLines={1}>{ev.title}</Text>
            <Ionicons name="chevron-forward" size={compact ? 14 : 16} color="#C8CDD6" />
          </TouchableOpacity>
        )) : <Text style={styles.empty}>{emptyLabel}</Text>}
      </ScrollView>
    </View>
  );
}

export function HomeFooterLine({ text = 'Små steg i dag – en enklere hverdag i morgen', light = false }) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerLeaf}>🌿</Text>
      <Text style={[styles.footerTxt, light && styles.footerTxtLight]}>{text}</Text>
      <Text style={styles.footerLeaf}>🌿</Text>
    </View>
  );
}

const card = {
  borderRadius: 18,
  padding: 10,
  overflow: 'hidden',
  minHeight: 0,
  flex: 1,
  alignSelf: 'stretch',
  width: '100%',
  height: '100%',
};

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 4, marginBottom: 2 },
  stripDay: {
    flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 10, backgroundColor: soft.cream,
  },
  stripDayOn: { backgroundColor: soft.sage },
  stripLbl: { fontSize: 11, color: soft.muted, fontFamily: sans },
  stripLblOn: { color: 'rgba(255,255,255,0.85)' },
  stripNum: { fontSize: 15, color: soft.ink, fontFamily: display, marginTop: 2 },
  stripNumOn: { color: '#fff' },
  weather: {
    ...card,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
    justifyContent: 'space-between',
  },
  weatherTop: { flexDirection: 'row', alignItems: 'flex-start' },
  weatherPlace: { fontSize: 12, color: soft.muted, fontFamily: sans },
  weatherTemp: { fontSize: 26, color: soft.ink, fontFamily: display, lineHeight: 30, marginTop: 0 },
  weatherTempSm: { fontSize: 22, lineHeight: 26 },
  weatherMeta: { alignItems: 'flex-end', maxWidth: 90 },
  weatherLabel: { fontSize: 12, color: soft.muted, marginTop: 6, fontFamily: sans },
  weatherHiLo: { fontSize: 11, color: soft.muted, marginTop: 2, fontFamily: sans },
  hours: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 6 },
  day: {
    flex: 1, alignItems: 'center', gap: 3, backgroundColor: soft.cream,
    borderRadius: 12, paddingVertical: 6, paddingHorizontal: 4,
  },
  hour: { alignItems: 'center', gap: 3, flex: 1 },
  hourLbl: { fontSize: 10, color: soft.muted, fontFamily: sans, textTransform: 'capitalize' },
  hourTemp: { fontSize: 12, color: soft.ink, fontFamily: sans },
  next: {
    ...card, backgroundColor: '#E7F3EA', flexDirection: 'row', alignItems: 'center',
  },
  nextWide: { minHeight: 64 },
  nextTitle: { fontSize: 15, color: soft.ink, fontFamily: display, marginTop: 1, lineHeight: 19 },
  nextArt: { width: 40, alignItems: 'center', justifyContent: 'center' },
  nextEmoji: { fontSize: 24 },
  chev: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.82)',
    alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eyebrowTxt: { fontSize: 11, color: soft.sage, fontFamily: sans },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaTxt: { fontSize: 12, color: soft.muted, fontFamily: sans },
  card,
  tasks: { backgroundColor: '#EAF6EF' },
  childTasks: {
    backgroundColor: '#FFF6E0',
    minHeight: 0,
    padding: 10,
    flex: 1,
  },
  childTaskScroll: {
    flex: 1,
    minHeight: 0,
  },
  childTaskScrollBody: {
    paddingBottom: 2,
    gap: 0,
  },
  widgetScroll: {
    flex: 1,
    minHeight: 0,
  },
  widgetScrollBody: {
    paddingBottom: 2,
    flexGrow: 1,
  },
  childTasksNudge: {
    fontSize: 11,
    color: soft.muted,
    fontFamily: sans,
    marginBottom: 4,
    fontWeight: '500',
  },
  childTasksLink: {
    fontSize: 11,
    color: soft.sage,
    fontFamily: sans,
    fontWeight: '400',
  },
  childTrack: {
    height: 5,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  childFill: {
    height: '100%',
    backgroundColor: '#E0A106',
    borderRadius: 99,
  },
  childTaskSection: { gap: 3 },
  childTaskSectionDone: { marginTop: 4, opacity: 0.92 },
  childTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 9,
    paddingVertical: 3,
    paddingHorizontal: 7,
    minHeight: 26,
  },
  childTaskRowDone: {
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  childTaskIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FFF1C2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childTaskIconDone: {
    backgroundColor: '#E4F5E8',
  },
  childTaskIconImg: { width: 14, height: 14 },
  childTaskTitle: {
    fontSize: 12,
    color: soft.ink,
    fontFamily: sans,
    fontWeight: '400',
  },
  childTaskTitleDone: {
    textDecorationLine: 'line-through',
    color: soft.muted,
    fontWeight: '500',
  },
  childCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#E0A106',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childCheckOn: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  shop: { backgroundColor: '#F8EEE6' },
  meals: { backgroundColor: '#FAF6EF' },
  cal: { backgroundColor: '#EEF4EA' },
  weekPlanCard: { backgroundColor: '#E8F0FB' },
  weekPlanSub: { fontSize: 11, color: soft.muted, fontFamily: sans, marginTop: 1 },
  weekPlanStrip: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 6,
    marginTop: 2,
  },
  weekPlanDay: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  weekPlanDayOn: { backgroundColor: '#2F80ED' },
  weekPlanDayLbl: { fontSize: 11, color: soft.muted, fontFamily: sans, fontWeight: '400' },
  weekPlanDayLblOn: { color: '#fff' },
  weekPlanCols: { gap: 3 },
  weekPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 18,
  },
  weekPlanTimeCol: {
    width: 78,
    flexGrow: 0,
    flexShrink: 0,
  },
  weekPlanTimeColSm: { width: 42 },
  weekPlanTime: {
    fontSize: 11,
    color: soft.muted,
    fontFamily: sans,
    fontVariant: ['tabular-nums'],
  },
  weekPlanSubjectCol: {
    flex: 1,
    minWidth: 0,
  },
  weekPlanSubject: {
    fontSize: 12,
    color: soft.ink,
    fontFamily: sans,
    fontWeight: '500',
  },
  weekPlanEmpty: { fontSize: 12, color: soft.muted, fontFamily: sans, marginTop: 2 },
  rewards: { backgroundColor: '#FBF3D8' },
  goals: { backgroundColor: '#E8F5EE' },
  progressCard: { backgroundColor: '#EAF2FB' },
  ai: { backgroundColor: '#EEE8F8' },
  notes: { backgroundColor: '#F7F3EA' },
  apps: { backgroundColor: '#EEF1F6' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  headIconDisc: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headTitle: { fontSize: 13, color: soft.ink, fontFamily: sans, fontWeight: '400', flex: 1 },
  progressLbl: { fontSize: 11, color: soft.muted, fontFamily: sans, marginBottom: 3, fontWeight: '500' },
  track: { height: 4, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.85)', overflow: 'hidden', marginBottom: 4 },
  fill: { height: '100%', backgroundColor: '#34C759', borderRadius: 99 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18, marginBottom: 0 },
  radio: {
    width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#8AA894',
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { backgroundColor: '#34C759', borderColor: '#34C759' },
  checkTxt: { fontSize: 12, color: soft.ink, fontFamily: sans, flex: 1, minWidth: 0, fontWeight: '500' },
  checkDone: { textDecorationLine: 'line-through', color: soft.muted },
  rewardSplit: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 2 },
  taskSplit: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  sideEmoji: { fontSize: 26, marginBottom: 0 },
  link: { fontSize: 11, color: soft.sage, fontFamily: sans, marginTop: 2 },
  empty: { fontSize: 12, color: soft.muted, fontFamily: sans },
  progressKids: { minHeight: 0, justifyContent: 'flex-start', gap: 8 },
  progressKid: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  progressKidHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  progressKidName: { fontSize: 13, color: soft.ink, fontFamily: sans, flex: 1, fontWeight: '500' },
  progressKidMeta: { fontSize: 11, color: soft.muted, fontFamily: sans, flexShrink: 0 },
  mealImg: { width: '100%', height: 36, borderRadius: 8, marginBottom: 3, backgroundColor: '#fff' },
  mealsLead: { fontSize: 11, color: soft.muted, fontFamily: sans, marginBottom: 2 },
  mealName: { fontSize: 12, color: soft.ink, fontFamily: sans },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 16 },
  calTitle: { flex: 1, fontSize: 12, color: soft.ink, fontFamily: sans },
  calTime: { fontSize: 11, color: soft.muted, fontFamily: sans },
  dot: { width: 7, height: 7, borderRadius: 4 },
  coin: { fontSize: 20, color: soft.ink, fontFamily: display, marginVertical: 0 },
  aiBanner: {
    ...card, minHeight: 56, backgroundColor: '#EEE8F8', flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  aiIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  aiBody: { fontSize: 12, color: soft.muted, fontFamily: sans, lineHeight: 17, marginTop: 2 },
  aiCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, marginTop: 6,
  },
  aiCtaTxt: { fontSize: 12, color: '#7C3AED', fontFamily: sans },
  noteBody: { fontSize: 13, color: soft.ink, fontFamily: sans, lineHeight: 18, marginTop: 2 },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  appCell: {
    width: '47%', backgroundColor: '#fff', borderRadius: 10, paddingVertical: 6, alignItems: 'center', gap: 3,
  },
  appGlyphDisc: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  appLbl: { fontSize: 10, color: soft.muted, fontFamily: sans, fontWeight: '400' },
  shortcutRow: { flexDirection: 'row', gap: 6 },
  shortcut: {
    flex: 1,
    width: '100%',
    borderRadius: 16,
    padding: 8,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutBoard: {
    minHeight: 108,
    padding: 10,
    borderRadius: 18,
    width: '100%',
    flexGrow: 0,
    flexBasis: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutIconDisc: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  shortcutIconDiscBoard: {
    width: 44, height: 44, borderRadius: 22,
  },
  shortcutLbl: {
    fontSize: 12,
    color: soft.ink,
    fontFamily: sans,
    fontWeight: '400',
    marginTop: 6,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  shortcutLblBoard: { fontSize: 14, marginTop: 8 },
  shortcutSub: {
    fontSize: 10,
    color: soft.muted,
    fontFamily: sans,
    marginTop: 1,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  shortcutSubBoard: { fontSize: 12, marginTop: 2 },
  folderGlyph: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  folderGlyphCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    minHeight: 0,
  },
  folderCell: {
    width: '47%',
    flexGrow: 1,
    minHeight: 64,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: soft.cream,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
  },
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderMoreIcon: { backgroundColor: 'rgba(107,143,113,0.16)' },
  folderLbl: { fontSize: 11, color: soft.ink, fontFamily: sans, fontWeight: '400', textAlign: 'center' },
  timeline: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    minHeight: 0,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
  },

  timelineCompact: { paddingVertical: 3, paddingHorizontal: 6 },
  timelineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  tlRowCompact: { minHeight: 20, gap: 6 },
  tlBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(61,68,80,0.12)' },
  tlTime: { width: 48, fontSize: 12, color: soft.ink, fontFamily: sans, fontWeight: '400' },
  tlTimeCompact: { width: 44, fontSize: 11 },
  tlTitle: { flex: 1, fontSize: 13, color: soft.ink, fontFamily: sans, fontWeight: '400' },
  tlTitleCompact: { fontSize: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  footerLeaf: { fontSize: 14 },
  footerTxt: { fontSize: 12, color: soft.muted, fontFamily: sans, textAlign: 'center', flexShrink: 1 },
  footerTxtLight: { color: 'rgba(255,255,255,0.92)' },
});
