import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarBubble } from '../AvatarPicker';
import IconBadge from '../IconBadge';
import HelpTarget from '../HelpTarget';
import { colors } from '../../src/theme';
import { parentAppShortLabel, parentAppAccent } from '../../src/utils/parentHomeShortcuts';
import { DASHBOARD_CARD_ART } from '../../src/parentDashboardThemes';
import LiveHomeWidgets from '../LiveHomeWidgets';
import { dashboardDayPartLabel } from '../../src/utils/dashboardTimeArt';
import { soft } from './softTheme';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { immersiveCardSurface } from '../home/homeGlass';
import { placeText } from '../../src/utils/homeWidgetVisuals';
import {
  KIDS_GAP,
  KIDS_VISIBLE,
  kidsDayCardWidth,
} from '../../src/utils/kidsDayLayout';

export { kidsDayCardWidth } from '../../src/utils/kidsDayLayout';

const SHOP_IMG = DASHBOARD_CARD_ART.grocery;
const MEALS_IMG = DASHBOARD_CARD_ART.meal;
const HOUSE_IMG = DASHBOARD_CARD_ART.house;

/** Soft pastel accents for shortcut tiles (mockup) */
const SOFT_TILE_BG = ['#E8F3EC', '#F8EDE6', '#EEF0F8', '#E8F0F6', '#F7F3EA'];

export function HeroArtBanner({
  heroSource, accentSource, dayPart, style, tall = false, showDayPart = false,
}) {
  if (!heroSource && !accentSource) return null;
  return (
    <View style={[styles.heroBleed, tall && styles.heroBleedTall, style]}>
      {heroSource ? (
        <Image
          source={heroSource}
          style={styles.heroBleedImg}
          resizeMode="cover"
          accessibilityLabel={dayPart ? `Illustrasjon for ${dashboardDayPartLabel(dayPart)}` : 'Dashbord-illustrasjon'}
        />
      ) : null}
      {/* Soft fade into cream page background */}
      <View style={styles.fadeLeft} pointerEvents="none">
        {Platform.OS !== 'web' ? (
          <>
            <View style={[styles.fadeStrip, styles.fadeStripA]} />
            <View style={[styles.fadeStrip, styles.fadeStripB]} />
            <View style={[styles.fadeStrip, styles.fadeStripC]} />
          </>
        ) : null}
      </View>
      <View style={styles.fadeRight} pointerEvents="none" />
      <View style={styles.fadeBottom} pointerEvents="none">
        {Platform.OS !== 'web' ? (
          <>
            <View style={[styles.fadeBottomStrip, { top: 0, opacity: 0.2 }]} />
            <View style={[styles.fadeBottomStrip, { top: '35%', opacity: 0.45 }]} />
            <View style={[styles.fadeBottomStrip, { top: '65%', opacity: 0.72 }]} />
          </>
        ) : null}
      </View>
      {accentSource ? (
        <Image
          source={accentSource}
          style={styles.heroAccent}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {showDayPart && dayPart ? (
        <View style={styles.dayPartChip} pointerEvents="none">
          <Text style={styles.dayPartTxt}>{dashboardDayPartLabel(dayPart)}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Hero matching mockup: large full-bleed illustration that fades into the page,
 * with greeting copy overlaid on the left — not a small side thumbnail.
 */
export function InlineHeroGreeting({
  greeting, title, subtitle, heroSource, dayPart, style, showLiveWidgets = false,
}) {
  return (
    <>
    <View style={[styles.heroScene, style]}>
      {heroSource ? (
        <View style={styles.heroSceneArt} pointerEvents="none">
          <Image
            source={heroSource}
            style={styles.heroSceneImg}
            resizeMode="cover"
            accessibilityLabel={dayPart ? `Illustrasjon for ${dashboardDayPartLabel(dayPart)}` : 'Dashbord-illustrasjon'}
          />
          <View style={styles.fadeLeftWide} pointerEvents="none">
            {Platform.OS !== 'web' ? (
              <>
                <View style={[styles.fadeStrip, styles.fadeStripA]} />
                <View style={[styles.fadeStrip, styles.fadeStripB]} />
                <View style={[styles.fadeStrip, styles.fadeStripC]} />
              </>
            ) : null}
          </View>
          <View style={styles.fadeRight} pointerEvents="none" />
          <View style={styles.fadeBottomTall} pointerEvents="none">
            {Platform.OS !== 'web' ? (
              <>
                <View style={[styles.fadeBottomStrip, { top: 0, opacity: 0.25 }]} />
                <View style={[styles.fadeBottomStrip, { top: '33%', opacity: 0.5 }]} />
                <View style={[styles.fadeBottomStrip, { top: '66%', opacity: 0.78 }]} />
              </>
            ) : null}
          </View>
        </View>
      ) : null}
      <View style={styles.heroSceneCopy}>
        {greeting ? <Text style={styles.greetingHi}>{greeting}</Text> : null}
        {title ? <Text style={styles.greetingTitle}>{title}</Text> : null}
        {subtitle ? <Text style={styles.greetingSub}>{subtitle}</Text> : null}
      </View>
    </View>
    {showLiveWidgets ? <LiveHomeWidgets /> : null}
    </>
  );
}

export function WeatherPill({ weather, style }) {
  if (!weather) return null;
  return (
    <View style={[styles.weatherPill, style]} accessibilityLabel="Vær">
      <Ionicons name={weather.icon || 'partly-sunny'} size={16} color={colors.brand} />
      <Text style={styles.weatherTemp}>
        {weather.temp != null ? `${weather.temp}°` : '—'}
      </Text>
      {placeText(weather.place) ? <Text style={styles.weatherPlace}>{placeText(weather.place)}</Text> : null}
    </View>
  );
}

export function WeatherCard({ weather, style }) {
  if (!weather) return null;
  return (
    <View style={[styles.weatherCard, style]}>
      <Ionicons name={weather.icon || 'partly-sunny'} size={22} color={colors.brand} />
      <Text style={styles.weatherCardTemp}>
        {weather.temp != null ? `${weather.temp}°` : '—'}
      </Text>
      {weather.label ? (
        <Text style={styles.weatherCardLabel} numberOfLines={1}>{weather.label}</Text>
      ) : placeText(weather.place) ? (
        <Text style={styles.weatherCardLabel} numberOfLines={1}>{placeText(weather.place)}</Text>
      ) : null}
    </View>
  );
}

export function GreetingBlock({
  greeting, title, subtitle, weather, weatherMode = 'pill', style, titleStyle,
  showLiveWidgets = false,
}) {
  return (
    <>
    <View style={[styles.greetingRow, style]}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        {greeting ? <Text style={styles.greetingHi}>{greeting}</Text> : null}
        {title ? <Text style={[styles.greetingTitle, titleStyle]}>{title}</Text> : null}
        {subtitle ? <Text style={styles.greetingSub}>{subtitle}</Text> : null}
      </View>
      {weatherMode === 'card' ? (
        <WeatherCard weather={weather} />
      ) : weatherMode === 'pill' ? (
        <WeatherPill weather={weather} />
      ) : null}
    </View>
    {showLiveWidgets ? <LiveHomeWidgets /> : null}
    </>
  );
}

export function WeatherInline({ weather, style }) {
  if (!weather) return null;
  return (
    <View style={[styles.weatherInline, style]} accessibilityLabel="Vær">
      <Ionicons name={weather.icon || 'partly-sunny'} size={14} color={soft.sage} />
      <Text style={styles.weatherTemp}>
        {weather.temp != null ? `${weather.temp}°` : '—'}
        {placeText(weather.place) ? ` ${placeText(weather.place)}` : ''}
      </Text>
    </View>
  );
}

export function SectionHeader({ title, linkLabel, onLink, icon, iconColor }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionHeadLeft}>
        {icon ? (
          <View style={[styles.sectionIcon, iconColor && { backgroundColor: `${iconColor}22` }]}>
            <Ionicons name={icon} size={14} color={iconColor || soft.sage} />
          </View>
        ) : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {linkLabel && onLink ? (
        <TouchableOpacity onPress={onLink} hitSlop={8} style={styles.linkRow} accessibilityRole="button">
          <Text style={styles.linkTxt}>{linkLabel}</Text>
          <Ionicons name="chevron-forward" size={12} color={soft.sage} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function NextEventCard({
  next, onPress, variant = 'mint', scriptNote, accentSource,
}) {
  const bg = variant === 'mint' ? soft.mint : variant === 'soft' ? soft.lavender : soft.sky;
  const houseSrc = accentSource || HOUSE_IMG;
  return (
    <HelpTarget id="timeline">
      <TouchableOpacity
        style={[styles.nextCard, { backgroundColor: bg }]}
        onPress={onPress}
        activeOpacity={0.9}
        accessibilityRole="button"
      >
        <View style={{ flex: 1, zIndex: 1, paddingRight: 8 }}>
          <View style={styles.nextEyebrowRow}>
            <Ionicons name="calendar-outline" size={13} color={soft.sage} />
            <Text style={styles.nextEyebrow}>Neste avtale</Text>
          </View>
          <Text style={styles.nextTitle} numberOfLines={2}>
            {next?.title || 'Ingen avtaler'}
          </Text>
          {next ? (
            <>
              <View style={styles.placeRow}>
                <Ionicons name="time-outline" size={12} color={soft.muted} />
                <Text style={styles.nextMeta}>
                  {next.end ? `${next.time} – ${next.end}` : next.time}
                </Text>
              </View>
              {placeText(next.place) ? (
                <View style={styles.placeRow}>
                  <Ionicons name="location-outline" size={12} color={soft.muted} />
                  <Text style={styles.placeTxt} numberOfLines={1}>{placeText(next.place)}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.nextMeta}>Dagen er ledig</Text>
          )}
        </View>
        <View style={styles.nextRight}>
          {houseSrc ? (
            <Image source={houseSrc} style={styles.nextAccent} resizeMode="contain" />
          ) : null}
          {scriptNote ? <Text style={styles.scriptNote}>{scriptNote}</Text> : null}
        </View>
        <View style={styles.chevCircle}>
          <Ionicons name="chevron-forward" size={16} color={soft.sage} />
        </View>
      </TouchableOpacity>
    </HelpTarget>
  );
}

export function TimelineList({ items = [], onOpen, onSeeAll }) {
  return (
    <HelpTarget id="timeline">
      <View style={styles.timelineCard}>
        {items.length === 0 ? (
          <Text style={styles.emptyTxt}>Ingen avtaler</Text>
        ) : items.map((row, idx) => (
          <TouchableOpacity
            key={row.id}
            style={[styles.timelineRow, idx < items.length - 1 && styles.timelineRowBorder]}
            onPress={() => onOpen?.(row.event || row)}
            activeOpacity={0.85}
          >
            <Text style={styles.timelineTime} numberOfLines={1}>{row.time}</Text>
            <View style={styles.timelineRail}>
              <View style={[styles.timelineDot, { backgroundColor: row.color || colors.brand }]} />
              {idx < items.length - 1 ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.timelineTitle} numberOfLines={1}>{row.title}</Text>
              {placeText(row.place) ? (
                <Text style={styles.timelineSub} numberOfLines={1}>{placeText(row.place)}</Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
          </TouchableOpacity>
        ))}
        {onSeeAll ? (
          <TouchableOpacity onPress={onSeeAll} style={styles.seeAllBtn}>
            <Text style={styles.linkTxt}>Se hele dagen</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </TouchableOpacity>
        ) : null}
      </View>
    </HelpTarget>
  );
}

export function TasksCard({
  progress, onOpen, onToggle, variant = 'green', showProgress = true, title = 'Dagens oppgaver',
}) {
  const tint = variant === 'lavender' ? '#f3e8ff' : variant === 'mint' ? '#ecfdf5' : '#f0fdf4';
  const accent = variant === 'lavender' ? '#7c3aed' : '#16a34a';
  const done = Math.max(0, progress?.done || 0);
  const openItems = progress?.items || [];
  const total = Math.max(0, progress?.total || 0, openItems.length + done, done);
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const hasTasks = total > 0 || openItems.length > 0;

  return (
    <HelpTarget id="shortcuts">
      <View style={[styles.widgetCard, { backgroundColor: tint }]}>
      <View style={styles.widgetHead}>
        <View style={[styles.sectionIcon, { backgroundColor: `${accent}22` }]}>
          <Ionicons name="checkmark-circle" size={18} color={accent} />
        </View>
        <Text style={styles.widgetTitle}>{title}</Text>
        <TouchableOpacity onPress={onOpen} hitSlop={8}>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      </View>
      {showProgress ? (
        <>
          <Text style={styles.progressLabel}>
            {hasTasks
              ? `${done} av ${total} fullført`
              : 'Ingen oppgaver i dag'}
          </Text>
          {hasTasks ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: accent }]} />
            </View>
          ) : null}
        </>
      ) : null}
      {(openItems.length ? openItems : [{ id: 'empty', title: 'Ingen åpne oppgaver', meta: '' }]).slice(0, 3).map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.checkRow}
          onPress={() => (item.id === 'empty' ? onOpen?.() : onToggle?.(item))}
          activeOpacity={0.85}
        >
          <View style={[styles.radio, item.done && { backgroundColor: accent, borderColor: accent }]}>
            {item.done ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.checkTitle, item.done && styles.checkDone]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.meta ? <Text style={styles.checkMeta}>{item.meta}</Text> : null}
          </View>
          {item.id !== 'empty' ? (
            <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
          ) : null}
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onOpen} style={styles.footerLink}>
        <Text style={[styles.linkTxt, { color: accent }]}>Se alle oppgaver →</Text>
      </TouchableOpacity>
      </View>
    </HelpTarget>
  );
}

export function AppointmentsCard({ rows = [], onOpen, onSeeAll, title = 'Neste avtaler' }) {
  return (
    <HelpTarget id="timeline">
      <View style={styles.widgetCard}>
        <SectionHeader
          title={title}
          icon="calendar"
          iconColor="#7c3aed"
          linkLabel="Se hele kalenderen"
          onLink={onSeeAll}
        />
        {rows.length === 0 ? (
          <Text style={styles.emptyTxt}>Ingen kommende avtaler</Text>
        ) : rows.map((row) => (
          <TouchableOpacity
            key={row.id}
            style={styles.apptRow}
            onPress={() => onOpen?.(row.event || row)}
          >
            <View style={{ width: 72 }}>
              <Text style={styles.apptWhen}>{row.when}</Text>
              <Text style={styles.apptTime}>{row.time}</Text>
            </View>
            <View style={[styles.timelineDot, { backgroundColor: row.color || colors.brand, marginRight: 10 }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.timelineTitle} numberOfLines={1}>{row.title}</Text>
              {placeText(row.place) ? (
                <View style={styles.placeRow}>
                  <Ionicons name="location-outline" size={12} color={colors.muted} />
                  <Text style={styles.placeTxt} numberOfLines={1}>{placeText(row.place)}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </HelpTarget>
  );
}

export function MessagesCard({ members = [], onOpen }) {
  const person = members.find((m) => m.role === 'parent' || m.role === 'adult') || members[0];
  const name = person?.name || 'Familien';
  return (
    <View style={[styles.widgetCard, { backgroundColor: '#fff7ed' }]}>
      <SectionHeader
        title="Hold kontakt"
        icon="chatbubble-ellipses"
        iconColor="#db2777"
        linkLabel="Åpne meldinger"
        onLink={onOpen}
      />
      <TouchableOpacity style={styles.msgRow} onPress={onOpen} activeOpacity={0.85}>
        <AvatarBubble
          avatarId={person?.avatarId}
          photoURL={person?.photoURL || person?.photoUrl}
          name={name}
          size={40}
        />
        <View style={{ flex: 1 }}>
          <View style={styles.msgHead}>
            <Text style={styles.msgName}>{name}</Text>
            <Text style={styles.msgTime}>Nylig</Text>
          </View>
          <Text style={styles.msgPreview} numberOfLines={2}>
            Åpne meldinger for å holde kontakten med familien.
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}

export function ShortcutTiles({
  apps = [], onPress, columns = 3, compact = false,
}) {
  return (
    <HelpTarget id="shortcuts">
      <View style={[styles.tileRow, columns === 2 && styles.tileRow2]}>
        {apps.map((app, idx) => {
          const accent = parentAppAccent(app.id);
          const label = parentAppShortLabel(app);
          const bg = SOFT_TILE_BG[idx % SOFT_TILE_BG.length];
          return (
            <TouchableOpacity
              key={app.id}
              style={[
                styles.tile,
                compact && styles.tileCompact,
                { backgroundColor: bg, flex: 1 },
              ]}
              onPress={() => onPress?.(app)}
              activeOpacity={0.85}
            >
              <IconBadge count={app.badge || 0} size={14} offset={-4}>
                <Ionicons name={app.icon || 'apps'} size={18} color={accent} />
              </IconBadge>
              <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
              {app.sub ? <Text style={styles.tileSub} numberOfLines={1}>{app.sub}</Text> : null}
              <View style={styles.tileChevron}>
                <Ionicons name="chevron-forward" size={11} color={soft.quiet} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </HelpTarget>
  );
}

export function PairTiles({ left, right, onPress }) {
  const renderOne = (app) => {
    if (!app?.id) return <View style={{ flex: 1 }} />;
    const accent = parentAppAccent(app.id);
    return (
      <TouchableOpacity
        style={[styles.pairTile, { backgroundColor: `${accent}12` }]}
        onPress={() => onPress?.(app)}
        activeOpacity={0.85}
      >
        <IconBadge count={app.badge || 0} size={14} offset={-4}>
          <Ionicons name={app.icon || 'apps'} size={22} color={accent} />
        </IconBadge>
        <Text style={styles.tileLabel}>{parentAppShortLabel(app)}</Text>
        {app.sub ? <Text style={styles.tileSub}>{app.sub}</Text> : null}
        <View style={[styles.chevCircle, { marginTop: 10, alignSelf: 'flex-start' }]}>
          <Ionicons name="arrow-forward" size={14} color={accent} />
        </View>
      </TouchableOpacity>
    );
  };
  return (
    <HelpTarget id="shortcuts">
      <View style={styles.pairRow}>
        {renderOne(left)}
        {renderOne(right)}
      </View>
    </HelpTarget>
  );
}

export function FamilyRemainingCard({ count, hints = [], onPress, script }) {
  return (
    <TouchableOpacity style={styles.familyCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.sectionIcon, { backgroundColor: soft.peach }]}>
        <Ionicons name="people-outline" size={16} color={soft.sage} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.familyEyebrow}>Familien</Text>
        <Text style={styles.familyTitle}>
          {count === 1 ? '1 ting gjenstår i dag' : `${count || 0} ting gjenstår i dag`}
        </Text>
        {hints.length ? (
          <Text style={styles.familySub} numberOfLines={1}>{hints.join(' og ')}</Text>
        ) : null}
      </View>
      {script ? <Text style={styles.scriptNote}>{script}</Text> : null}
    </TouchableOpacity>
  );
}

export function ShoppingCard({
  count, items = [], onPress, image = SHOP_IMG, note, variant = 'beige',
}) {
  const bg = variant === 'purple' ? '#f3e8ff' : variant === 'green' ? '#ecfdf5' : '#faf6ef';
  const accent = variant === 'purple' ? '#7c3aed' : '#059669';
  const sample = (items || []).slice(0, 3);
  return (
    <TouchableOpacity
      style={[styles.widgetCard, styles.shopCard, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.widgetHead}>
          <View style={[styles.sectionIcon, { backgroundColor: `${accent}22` }]}>
            <IconBadge count={count || 0} size={14} offset={-4}>
              <Ionicons name="cart" size={16} color={accent} />
            </IconBadge>
          </View>
          <Text style={styles.widgetTitle}>Handleliste</Text>
          <Text style={styles.shopCount}>{count === 1 ? '1 vare' : `${count} varer`}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </View>
        {sample.length ? sample.map((it) => (
          <View key={it.id || it.title} style={styles.checkRow}>
            <View style={styles.radio} />
            <Text style={styles.checkTitle}>{it.title}</Text>
          </View>
        )) : (
          <Text style={styles.emptyTxt}>Ingen varer akkurat nå</Text>
        )}
        <Text style={[styles.linkTxt, { marginTop: 8 }]}>Åpne handleliste ></Text>
        {note ? <Text style={styles.scriptNote}>{note}</Text> : null}
      </View>
      {image ? (
        <Image source={image} style={styles.shopImage} resizeMode="cover" />
      ) : null}
    </TouchableOpacity>
  );
}

export function MealsCard({
  dinner, onPress, image = MEALS_IMG, body, variant = 'pink',
}) {
  const bg = variant === 'cream' ? '#fff7ed' : '#fdf2f8';
  const accent = '#ea580c';
  return (
    <TouchableOpacity
      style={[styles.widgetCard, styles.shopCard, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <View style={styles.widgetHead}>
          <View style={[styles.sectionIcon, { backgroundColor: `${accent}22` }]}>
            <Ionicons name="restaurant" size={16} color={accent} />
          </View>
          <Text style={styles.widgetTitle}>Måltider</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </View>
        <Text style={styles.mealsLead}>Planlegg en enklere uke</Text>
        <Text style={styles.mealsBody}>
          {body || (dinner?.title
            ? `I dag: ${dinner.title}`
            : 'Gode måltider gir en roligere hverdag for hele familien.')}
        </Text>
        <Text style={[styles.linkTxt, { marginTop: 10 }]}>Se måltidsplan ></Text>
      </View>
      {image ? (
        <Image source={image} style={styles.mealImage} resizeMode="cover" />
      ) : null}
    </TouchableOpacity>
  );
}

export function RememberCard({ count, hints = [], onPress, script }) {
  const immersive = useHomeImmersive();
  return (
    <TouchableOpacity
      style={[styles.rememberCard, immersive && immersiveCardSurface]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.sectionIcon, { backgroundColor: '#fef08a' }]}>
        <Ionicons name="bulb" size={18} color="#ca8a04" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rememberEyebrow}>HUSK I DAG</Text>
        <Text style={styles.familyTitle}>
          {count === 1 ? '1 ting gjenstår' : `${count || 0} ting gjenstår`}
        </Text>
        {hints.length ? (
          <Text style={styles.familySub}>{hints.join(' og ')}</Text>
        ) : null}
      </View>
      {script ? <Text style={styles.scriptNote}>{script}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

export function MemberAvatars({
  members = [], onAdd, max = 4,
}) {
  const shown = (members || []).slice(0, max);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
      {shown.map((m) => (
        <View key={m.id || m.uid || m.name} style={styles.avatarItem}>
          <AvatarBubble
            avatarId={m.avatarId}
            photoURL={m.photoURL || m.photoUrl}
            name={m.name}
            size={52}
          />
          <Text style={styles.avatarName} numberOfLines={1}>
            {String(m.name || '').split(' ')[0]}
          </Text>
        </View>
      ))}
      {onAdd ? (
        <TouchableOpacity style={styles.avatarItem} onPress={onAdd} accessibilityRole="button">
          <View style={styles.addAvatar}>
            <Ionicons name="add" size={22} color={colors.muted} />
          </View>
          <Text style={styles.avatarName}>Legg til</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function nextEventForKid(events, kid) {
  const kidIds = [kid?.id, kid?.uid, kid?.childId].filter(Boolean);
  return (events || []).find((ev) => {
    const ids = ev.memberIds || ev.childIds || [];
    return kidIds.some((id) => ids.includes?.(id));
  });
}

function kidsDayEventLabel(next, firstName) {
  if (!next) return 'Ingen avtaler i dag';
  let title = String(next.title || 'Avtale').trim();
  // Avoid "Neste: Adelen - Håndball" when the card already shows Adelen.
  const prefix = String(firstName || '').trim();
  if (prefix && title.toLowerCase().startsWith(prefix.toLowerCase())) {
    title = title.slice(prefix.length).replace(/^\s*[-–:]\s*/, '') || title;
  }
  const time = next.startTime ? String(next.startTime).slice(0, 5) : '';
  if (time && title) return `${time} · ${title}`;
  if (time) return `Neste ${time}`;
  return title ? `Neste: ${title}` : 'Neste avtale';
}

export function KidsDayCards({ kids = [], events = [], onOpenKid }) {
  const list = kids || [];
  const [viewportW, setViewportW] = useState(0);
  const immersive = useHomeImmersive();
  const needsScroll = list.length > KIDS_VISIBLE;
  // When all kids fit, flex cards fill available width. When scrolling,
  // size each card so KIDS_VISIBLE fit with a peek of the next.
  const cardWidth = needsScroll ? kidsDayCardWidth(viewportW, list.length) : undefined;

  if (!list.length) return null;

  const cards = list.map((kid) => {
    const next = nextEventForKid(events, kid);
    const firstName = String(kid.name || '').split(' ')[0] || 'Barn';
    const nextLabel = kidsDayEventLabel(next, firstName);
    return (
      <TouchableOpacity
        key={kid.id || kid.uid || firstName}
        style={[
          styles.kidCard,
          needsScroll
            ? (cardWidth
              ? { width: cardWidth, flexGrow: 0, flexShrink: 0 }
              : styles.kidCardScrollFallback)
            : styles.kidCardFit,
          immersive && immersiveCardSurface,
        ]}
        onPress={() => onOpenKid?.(kid)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${firstName}. ${nextLabel}`}
      >
        <AvatarBubble
          avatarId={kid.avatarId}
          photoURL={kid.photoURL || kid.photoUrl}
          name={kid.name}
          size={36}
        />
        <Text style={styles.kidName} numberOfLines={1}>{firstName}</Text>
        <Text style={styles.kidNext} numberOfLines={2}>{nextLabel}</Text>
      </TouchableOpacity>
    );
  });

  const webScrollStyle = {
    display: 'flex',
    flexDirection: 'row',
    gap: KIDS_GAP,
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    overflowX: needsScroll ? 'auto' : 'hidden',
    overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    touchAction: needsScroll ? 'pan-x' : 'auto',
  };

  return (
    <View
      style={styles.kidsViewport}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== viewportW) setViewportW(w);
      }}
    >
      {!needsScroll ? (
        <View style={styles.kidsRowFit}>{cards}</View>
      ) : Platform.OS === 'web' ? (
        <>
          <style>{'.kids-day-scroll::-webkit-scrollbar{display:none;height:0}'}</style>
          <div className="kids-day-scroll" style={webScrollStyle}>
            {cards}
          </div>
        </>
      ) : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kidsRow}
          decelerationRate="fast"
          snapToInterval={cardWidth ? cardWidth + KIDS_GAP : undefined}
          snapToAlignment="start"
          disableIntervalMomentum
        >
          {cards}
        </ScrollView>
      )}
    </View>
  );
}

export function CustodyPill({ label }) {
  if (!label) return null;
  return (
    <View style={styles.custodyPill}>
      <Ionicons name="home-outline" size={14} color={colors.brand} />
      <Text style={styles.custodyTxt}>{label}</Text>
    </View>
  );
}

export function WeekSummaryCard({
  stats, onPress, title = 'Barnas uke', status,
}) {
  const swaps = Math.max(0, Number(stats?.swaps) || 0);
  const appointments = Math.max(
    0,
    Number(stats?.appointments ?? stats?.activities) || 0,
  );
  const reminders = Math.max(0, Number(stats?.reminders) || 0);
  const swapLabel = swaps === 1 ? '1 bytte' : `${swaps} bytter`;
  const apptLabel = appointments === 1 ? '1 avtale' : `${appointments} avtaler`;
  const reminderLabel = reminders === 1 ? '1 oppgave' : `${reminders} oppgaver`;

  return (
    <TouchableOpacity style={styles.widgetCard} onPress={onPress} activeOpacity={0.9}>
      <Text style={[styles.widgetTitle, { color: colors.brand }]}>{title}</Text>
      <Text style={styles.weekStats}>
        {`${swapLabel} · ${apptLabel} · ${reminderLabel}`}
      </Text>
      <Text style={styles.weekStatus}>
        {status || (appointments === 0 && swaps === 0 && reminders === 0
          ? 'Ingen avtaler eller bytter registrert denne uken'
          : 'En rolig og god uke – dere er oppdatert')}
      </Text>
      <View style={styles.weekIcons}>
        <View style={styles.weekIconItem}>
          <View style={[styles.sectionIcon, { backgroundColor: '#dbeafe' }]}>
            <Ionicons name="swap-horizontal" size={16} color="#2563eb" />
          </View>
          <Text style={styles.weekIconLabel}>{swapLabel}</Text>
        </View>
        <View style={styles.weekIconItem}>
          <View style={[styles.sectionIcon, { backgroundColor: '#dbeafe' }]}>
            <Ionicons name="calendar" size={16} color="#2563eb" />
          </View>
          <Text style={styles.weekIconLabel}>{apptLabel}</Text>
        </View>
        <View style={styles.weekIconItem}>
          <View style={[styles.sectionIcon, { backgroundColor: '#dcfce7' }]}>
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
          </View>
          <Text style={styles.weekIconLabel}>{reminderLabel}</Text>
        </View>
      </View>
      <View style={styles.weekCta}>
        <Text style={styles.linkTxt}>Se ukeplan</Text>
        <View style={styles.chevCircle}>
          <Ionicons name="arrow-forward" size={14} color={colors.brand} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function AssistantCard({ summary, suggestions = [], onOpen }) {
  return (
    <View style={styles.assistantCard}>
      <View style={styles.widgetHead}>
        <Ionicons name="sparkles" size={16} color="#7c3aed" />
        <Text style={styles.widgetTitle}>Din ProTop-assistent</Text>
      </View>
      <Text style={styles.assistantSummary}>{summary}</Text>
      <Text style={styles.assistantLead}>Mine forslag til i dag</Text>
      {suggestions.map((s) => (
        <TouchableOpacity key={s.id} style={styles.suggestRow} onPress={onOpen} activeOpacity={0.85}>
          <Ionicons name={s.icon || 'checkmark-circle'} size={18} color={s.color || colors.brand} />
          <Text style={styles.suggestTxt}>{s.text}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function FocusHeroCard({
  label = 'DAGENS FOKUS', title, sub, onPress, cta = 'Se dagens plan', accentSource,
}) {
  return (
    <TouchableOpacity style={styles.focusHero} onPress={onPress} activeOpacity={0.9}>
      {accentSource ? (
        <Image source={accentSource} style={styles.focusAccent} resizeMode="contain" />
      ) : (
        <View style={styles.focusWatermark} pointerEvents="none">
          <Ionicons name="calendar" size={88} color="rgba(37,99,235,0.12)" />
        </View>
      )}
      <View style={styles.focusCopy}>
        <Text style={styles.focusLabel}>{label}</Text>
        <Text style={styles.focusTitle}>{title || 'Ingen fokus i dag'}</Text>
        <Text style={styles.focusSub}>{sub || 'Her er dagens planer klare.'}</Text>
        <View style={styles.focusCta}>
          <Text style={styles.focusCtaTxt}>{cta}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.brand} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function FamilyDayBanner({
  dateLabel, eventCount, taskCount, onPress, title,
}) {
  return (
    <TouchableOpacity style={styles.familyDayBanner} onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.sectionIcon, { backgroundColor: '#dbeafe' }]}>
        <Ionicons name="calendar" size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerDate}>{dateLabel}</Text>
        <Text style={styles.bannerTitle}>{title || 'Dagens avtaler'}</Text>
        <Text style={styles.bannerSub}>
          {`${eventCount} avtaler · ${taskCount} oppgaver · Alt under kontroll`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.brand} />
    </TouchableOpacity>
  );
}

export function FooterTagline({ text = 'Mer tid til det som betyr mest' }) {
  return (
    <View style={styles.footerTag}>
      <View style={styles.footerLine} />
      <Text style={styles.footerTxt}>{text}</Text>
      <View style={styles.footerLine} />
    </View>
  );
}

export function GridShortcuts({ items = [], onPress }) {
  return (
    <View style={styles.grid2}>
      {items.map((app) => {
        const accent = parentAppAccent(app.id);
        return (
          <TouchableOpacity
            key={app.id}
            style={[styles.gridTile, { backgroundColor: `${accent}12` }]}
            onPress={() => onPress?.(app)}
          >
            <IconBadge count={app.badge || 0} size={14} offset={-4}>
              <Ionicons name={app.icon || 'apps'} size={22} color={accent} />
            </IconBadge>
            <Text style={styles.tileLabel}>{parentAppShortLabel(app)}</Text>
            {app.sub ? <Text style={styles.tileSub}>{app.sub}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  weatherPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: soft.card, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: soft.line,
  },
  weatherTemp: {
    fontWeight: soft.wReg, fontSize: 12, color: soft.ink,
    fontFamily: soft.body,
  },
  weatherPlace: { fontSize: 11, color: soft.muted, fontWeight: soft.wReg, fontFamily: soft.body },
  weatherInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weatherCard: {
    backgroundColor: soft.card, borderRadius: soft.radiusSm, padding: 8, alignItems: 'center',
    minWidth: 64, borderWidth: StyleSheet.hairlineWidth, borderColor: soft.line, gap: 2,
  },
  weatherCardTemp: { fontSize: 15, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.body },
  weatherCardLabel: { fontSize: 10, color: soft.muted, fontWeight: soft.wReg, maxWidth: 72, fontFamily: soft.body },

  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  greetingHi: {
    fontSize: 13, color: soft.muted, fontWeight: soft.wReg, fontFamily: soft.body,
  },
  greetingTitle: {
    fontSize: 24, fontWeight: soft.wMed, color: soft.ink, marginTop: 2, lineHeight: 30,
    fontFamily: soft.display,
  },
  greetingSub: {
    fontSize: 13, color: soft.muted, marginTop: 4, fontWeight: soft.wReg, lineHeight: 18,
    fontFamily: soft.body,
  },

  /* Full-bleed soft hero (mockup): art fades into cream, copy on the left */
  /* Full-bleed soft hero (mockup): art fills width and fades into cream */
  heroScene: {
    marginHorizontal: -14,
    marginTop: -8,
    marginBottom: 10,
    height: 220,
    position: 'relative',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    backgroundColor: soft.bg,
  },
  heroSceneArt: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: soft.bg,
  },
  heroSceneImg: {
    position: 'absolute',
    left: '-2%',
    right: '-2%',
    top: '-42%',
    width: '104%',
    height: '160%',
  },

  heroSceneCopy: {
    zIndex: 2,
    maxWidth: '58%',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
  },
  fadeLeft: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: '28%',
    flexDirection: 'row',
    ...(Platform.OS === 'web'
      ? { backgroundImage: `linear-gradient(90deg, ${soft.bg} 0%, ${soft.bg}99 45%, transparent 100%)` }
      : null),
  },
  fadeLeftWide: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: '28%',
    zIndex: 1,
    ...(Platform.OS === 'web'
      ? { backgroundImage: `linear-gradient(90deg, ${soft.bg} 0%, ${soft.bg}d9 35%, transparent 100%)` }
      : { backgroundColor: soft.bg, opacity: 0.35 }),
  },
  fadeStrip: {
    flex: 1,
    height: '100%',
    backgroundColor: soft.bg,
  },
  fadeStripA: { opacity: 0.78 },
  fadeStripB: { opacity: 0.42 },
  fadeStripC: { opacity: 0.16 },
  fadeRight: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 28,
    zIndex: 1,
    ...(Platform.OS === 'web'
      ? { backgroundImage: `linear-gradient(270deg, ${soft.bg} 0%, transparent 100%)` }
      : { backgroundColor: soft.bg, opacity: 0.3 }),
  },
  fadeBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 56,
    ...(Platform.OS === 'web'
      ? { backgroundImage: `linear-gradient(180deg, transparent, ${soft.bg})` }
      : null),
  },
  fadeBottomTall: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 72,
    zIndex: 1,
    ...(Platform.OS === 'web'
      ? { backgroundImage: `linear-gradient(180deg, transparent, ${soft.bg})` }
      : { backgroundColor: soft.bg, opacity: 0.55 }),
  },
  fadeBottomStrip: {
    position: 'absolute', left: 0, right: 0, height: '40%',
    backgroundColor: soft.bg,
  },

  heroBleed: {
    marginHorizontal: -14,
    marginTop: -4,
    height: 160,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: soft.bg,
    position: 'relative',
  },
  heroBleedTall: { height: 188 },
  heroBleedImg: { width: '100%', height: '100%', transform: [{ scale: 1.25 }] },
  heroAccent: {
    position: 'absolute', right: 0, bottom: 0, width: 148, height: 100,
  },
  dayPartChip: {
    position: 'absolute', left: 22, top: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
    zIndex: 3,
  },
  dayPartTxt: {
    fontSize: 10, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.body,
  },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  sectionIcon: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: soft.mint,
    overflow: 'visible',
  },
  sectionTitle: {
    fontSize: 15, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.display,
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkTxt: { fontSize: 12, fontWeight: soft.wMed, color: soft.sage, fontFamily: soft.body },

  nextCard: {
    borderRadius: soft.radius, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 12, overflow: 'hidden',
  },
  nextEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  nextEyebrow: {
    fontSize: 11, fontWeight: soft.wMed, color: soft.sage, fontFamily: soft.body,
  },
  nextTitle: {
    fontSize: 17, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.display,
  },
  nextMeta: {
    fontSize: 12, fontWeight: soft.wReg, color: soft.ink, marginTop: 0, fontFamily: soft.body,
  },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  placeTxt: { fontSize: 11, color: soft.muted, fontWeight: soft.wReg, flex: 1, fontFamily: soft.body },
  nextRight: { alignItems: 'center', justifyContent: 'center', width: 64 },
  chevCircle: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: soft.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: soft.line, zIndex: 1,
  },
  nextAccent: { width: 88, height: 64, opacity: 0.95 },
  scriptNote: {
    fontSize: 10, fontStyle: 'italic', color: soft.muted, marginTop: 2,
    fontWeight: soft.wReg, textAlign: 'center', fontFamily: soft.script, maxWidth: 72,
  },

  timelineCard: {
    backgroundColor: soft.card, borderRadius: soft.radius, padding: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: soft.line, marginBottom: 12,
  },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, gap: 6 },
  timelineRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: soft.line },
  timelineTime: {
    width: 64,
    minWidth: 64,
    flexGrow: 0,
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: soft.wMed,
    color: soft.ink,
    paddingTop: 1,
    fontFamily: soft.body,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' } : null),
  },
  timelineRail: { width: 12, alignItems: 'center' },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineLine: { width: 1.5, flex: 1, backgroundColor: soft.line, marginTop: 3, minHeight: 14 },
  timelineTitle: {
    fontSize: 13, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.body,
  },
  timelineSub: {
    fontSize: 11, color: soft.muted, marginTop: 1, fontWeight: soft.wReg, fontFamily: soft.body,
  },
  seeAllBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 6 },
  emptyTxt: {
    fontSize: 12, color: soft.muted, fontWeight: soft.wReg, paddingVertical: 6, fontFamily: soft.body,
  },

  widgetCard: {
    backgroundColor: soft.card, borderRadius: soft.radius, padding: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: soft.line, marginBottom: 10,
  },
  widgetHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  widgetTitle: {
    flex: 1, fontSize: 14, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.display,
  },
  progressLabel: {
    fontSize: 11, fontWeight: soft.wReg, color: soft.muted, marginBottom: 4, fontFamily: soft.body,
  },
  progressTrack: {
    height: 5, borderRadius: 999, backgroundColor: soft.line, marginBottom: 8, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: soft.line,
    alignItems: 'center', justifyContent: 'center',
  },
  checkTitle: {
    fontSize: 13, fontWeight: soft.wReg, color: soft.ink, fontFamily: soft.body,
  },
  checkDone: { textDecorationLine: 'line-through', color: soft.muted },
  checkMeta: { fontSize: 11, color: soft.muted, marginTop: 1, fontFamily: soft.body },
  footerLink: { marginTop: 4 },

  apptRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  apptWhen: { fontSize: 10, fontWeight: soft.wReg, color: soft.muted, fontFamily: soft.body },
  apptTime: { fontSize: 13, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.body },

  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  msgHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  msgName: { fontSize: 13, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.body },
  msgTime: { fontSize: 10, color: soft.muted, fontWeight: soft.wReg, fontFamily: soft.body },
  msgPreview: {
    fontSize: 12, color: soft.muted, marginTop: 2, lineHeight: 16, fontFamily: soft.body,
  },

  tileRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tileRow2: { gap: 8 },
  tile: {
    borderRadius: soft.radiusSm, padding: 10, minHeight: 78, position: 'relative',
  },
  tileCompact: { minHeight: 68, padding: 8 },
  tileLabel: {
    fontSize: 12, fontWeight: soft.wMed, color: soft.ink, marginTop: 6, fontFamily: soft.body,
  },
  tileSub: {
    fontSize: 10, color: soft.muted, fontWeight: soft.wReg, marginTop: 2, fontFamily: soft.body,
  },
  tileChevron: { position: 'absolute', right: 6, bottom: 6 },

  pairRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pairTile: { flex: 1, borderRadius: soft.radiusSm, padding: 12, minHeight: 92 },

  familyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: soft.family, borderRadius: soft.radius, padding: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: soft.line, marginBottom: 10,
  },
  familyEyebrow: {
    fontSize: 10, fontWeight: soft.wMed, color: soft.muted, fontFamily: soft.body,
  },
  familyTitle: {
    fontSize: 13, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.body,
  },
  familySub: {
    fontSize: 11, color: soft.muted, marginTop: 1, fontWeight: soft.wReg, fontFamily: soft.body,
  },

  shopCard: { flexDirection: 'row', alignItems: 'center' },
  shopCount: {
    fontSize: 11, fontWeight: soft.wReg, color: soft.muted, marginRight: 4, fontFamily: soft.body,
  },
  shopImage: { width: 72, height: 72, borderRadius: 12, marginLeft: 6 },
  mealImage: { width: 64, height: 64, borderRadius: 32, marginLeft: 6 },
  mealsLead: {
    fontSize: 12, fontWeight: soft.wMed, color: soft.ink, marginBottom: 3, fontFamily: soft.body,
  },
  mealsBody: {
    fontSize: 12, color: soft.muted, lineHeight: 16, fontWeight: soft.wReg, fontFamily: soft.body,
  },

  rememberCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: soft.cream, borderRadius: soft.radius, padding: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: soft.line, marginBottom: 10,
  },
  rememberEyebrow: {
    fontSize: 10, fontWeight: soft.wMed, color: soft.muted, letterSpacing: 0.3, fontFamily: soft.body,
  },

  avatarRow: { gap: 12, paddingVertical: 2, paddingRight: 8, marginBottom: 10 },
  avatarItem: { alignItems: 'center', width: 56 },
  avatarName: {
    fontSize: 11, fontWeight: soft.wReg, color: soft.ink, marginTop: 4, fontFamily: soft.body,
  },
  addAvatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: soft.line,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: soft.card,
  },

  kidsViewport: { marginBottom: 6, width: '100%', minWidth: 0, alignSelf: 'stretch' },
  kidsRow: { flexDirection: 'row', gap: KIDS_GAP },
  kidsRowFit: {
    flexDirection: 'row',
    gap: KIDS_GAP,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignItems: 'stretch',
  },
  kidCard: {
    alignSelf: 'stretch',
    backgroundColor: soft.card,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
    gap: 4,
    minWidth: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  /** Equal share of available width when ≤ KIDS_VISIBLE kids. */
  kidCardFit: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  /** Pre-measure fallback while scrolling more than KIDS_VISIBLE. */
  kidCardScrollFallback: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: `${100 / KIDS_VISIBLE}%`,
    maxWidth: `${100 / KIDS_VISIBLE}%`,
  },
  kidName: { fontSize: 13, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.body },
  kidNext: {
    fontSize: 11, color: soft.muted, fontWeight: soft.wReg, lineHeight: 14, fontFamily: soft.body,
  },

  custodyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: soft.sky, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    marginBottom: 8,
  },
  custodyTxt: { fontSize: 12, fontWeight: soft.wMed, color: soft.sage, fontFamily: soft.body },

  weekStats: { fontSize: 13, fontWeight: soft.wMed, color: soft.ink, marginTop: 3, fontFamily: soft.body },
  weekStatus: {
    fontSize: 12, color: soft.muted, marginTop: 4, fontWeight: soft.wReg, fontFamily: soft.body,
  },
  weekIcons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  weekIconItem: { alignItems: 'center', gap: 3 },
  weekIconLabel: { fontSize: 10, fontWeight: soft.wReg, color: soft.muted, fontFamily: soft.body },
  weekCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 8,
  },

  assistantCard: {
    backgroundColor: soft.lavender, borderRadius: soft.radius, padding: 12, marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: soft.line,
  },
  assistantSummary: {
    fontSize: 15, fontWeight: soft.wMed, color: soft.ink, lineHeight: 21, marginBottom: 8,
    fontFamily: soft.display,
  },
  assistantLead: {
    fontSize: 12, fontWeight: soft.wMed, color: soft.muted, marginBottom: 6, fontFamily: soft.body,
  },
  suggestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: soft.card, borderRadius: soft.radiusSm, padding: 10, marginBottom: 6,
  },
  suggestTxt: {
    flex: 1, fontSize: 13, fontWeight: soft.wReg, color: soft.ink, fontFamily: soft.body,
  },

  focusHero: {
    backgroundColor: soft.sky, borderRadius: soft.radius, padding: 14, marginBottom: 12,
    overflow: 'hidden', minHeight: 148, position: 'relative',
  },
  focusCopy: { position: 'relative', zIndex: 1 },
  focusLabel: {
    fontSize: 10, fontWeight: soft.wMed, color: soft.muted, letterSpacing: 0.4, fontFamily: soft.body,
  },
  focusTitle: {
    fontSize: 18, fontWeight: soft.wMed, color: soft.ink, marginTop: 4, fontFamily: soft.display,
    maxWidth: '62%',
  },
  focusSub: {
    fontSize: 12, color: soft.muted, marginTop: 4, fontWeight: soft.wReg, maxWidth: '58%',
    fontFamily: soft.body,
  },
  focusCta: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: soft.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10,
  },
  focusCtaTxt: { fontSize: 12, fontWeight: soft.wMed, color: soft.sage, fontFamily: soft.body },
  focusWatermark: { position: 'absolute', right: 6, bottom: 6 },
  /* Landscape accent art (~16:9) — tall square boxes made the subject disappear. */
  focusAccent: {
    position: 'absolute', right: -6, bottom: -10, width: 188, height: 124, zIndex: 0,
  },

  familyDayBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: soft.sky, borderRadius: soft.radius, padding: 12, marginBottom: 10,
  },
  bannerDate: { fontSize: 11, fontWeight: soft.wReg, color: soft.muted, fontFamily: soft.body },
  bannerTitle: { fontSize: 14, fontWeight: soft.wMed, color: soft.ink, fontFamily: soft.display },
  bannerSub: {
    fontSize: 11, color: soft.muted, fontWeight: soft.wReg, marginTop: 1, fontFamily: soft.body,
  },

  footerTag: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12, paddingHorizontal: 6,
  },
  footerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: soft.line },
  footerTxt: { fontSize: 11, color: soft.muted, fontWeight: soft.wReg, fontFamily: soft.body },

  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  gridTile: {
    width: '47%', flexGrow: 1, borderRadius: soft.radiusSm, padding: 12, minHeight: 80,
  },
});
