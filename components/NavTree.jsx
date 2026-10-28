import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../src/theme';
import { touch } from '../src/ui/tokens';
import { useColors } from '../src/context/ThemeContext';
import {
  drawerGroupOpen,
  drawerHasSubmenuToggle,
  drawerSubmenuOpen,
  isNavItemActive,
  releaseClosedActiveGroups,
  releaseClosedActiveSubmenus,
} from '../src/navigation/shellModules';
import { navSectionExpanded } from '../src/navigation/navTree';
import IconBadge from './IconBadge';
import { countForItem } from '../src/utils/notifications';

/**
 * Én meny for PC og telefon (UX-22). Sidemenyen (variant «rail») og skuffen og Meny-siden
 * (variant «drawer») tegner det samme treet fra src/navigation/navTree.js. Variantene har
 * ulik tetthet (mus mot fingre), men samme seksjoner, grupper, rader og regler for åpning.
 * Tettheten følger pekeren, ikke bredden (UX-23): på berøringsskjerm, også iPad i liggende
 * format med PC-menyen, er radene og knappene minst touch.min (44 px) høye.
 */

/** Fylt ikon når raden er valgt eller uthevet, ellers outline. */
function rowIcon(item, on) {
  const base = item.icon || 'ellipse';
  const outline = base.endsWith('-outline');
  if (on || outline) return outline && on ? base.replace(/-outline$/, '') : base;
  return `${base}-outline`;
}

function groupIcon(item, containsActive) {
  const base = item.icon || 'folder-outline';
  if (containsActive) return base.replace(/-outline$/, '');
  return base.endsWith('-outline') ? base : `${base}-outline`;
}

/**
 * Farger fra useColors() i lyst og mørkt. Stilarkene under har bare oppsett (og lyse reserver),
 * så menyen ikke blir lys med lys tekst i mørk modus.
 */
function paint(colors) {
  return {
    title: { color: colors.ink },
    titleOn: { color: colors.brandInk },
    muted: { color: colors.muted },
    line: { borderTopColor: colors.line },
    well: { backgroundColor: colors.bg },
    wellOn: { backgroundColor: colors.card },
    appSection: { backgroundColor: colors.card, borderColor: colors.line },
    appHead: { backgroundColor: colors.sunken },
  };
}

/** Hvilke grupper og undermenyer som er åpne. Bor hos menyen, så valgene står mens den er i bruk. */
export function useNavTreeState(sections, activeTab, activeSubView) {
  const [open, setOpen] = useState({});
  const [groupOpen, setGroupOpen] = useState({});
  const [submenuOpen, setSubmenuOpen] = useState({});
  const companyItems = useMemo(
    () => (sections || []).find((section) => section.id === 'company')?.items || [],
    [sections],
  );

  useEffect(() => {
    setGroupOpen((prev) => releaseClosedActiveGroups(prev, companyItems, activeTab, activeSubView));
    setSubmenuOpen((prev) => releaseClosedActiveSubmenus(prev, companyItems, activeTab, activeSubView));
  }, [activeTab, activeSubView, companyItems]);

  return {
    open, setOpen, groupOpen, setGroupOpen, submenuOpen, setSubmenuOpen,
  };
}

export function NavRow({
  variant = 'drawer', item, active, depth = 0, collapsed = false, onPress, badgeCount = 0,
  expanded = false, onToggle,
}) {
  const colors = useColors();
  const tone = useMemo(() => paint(colors), [colors]);
  const { isTouch } = useLayout();
  const rail = variant === 'rail';
  const s = rail ? railStyles : drawerStyles;
  const t = isTouch ? touchStyles : null;
  const highlight = !rail && !!item.highlight;
  const expandable = typeof onToggle === 'function' && !collapsed;
  const nestPad = depth > 0
    ? (rail ? Math.min(8 + depth * 12, 32) : Math.min(14 + (depth - 1) * 12, 38))
    : 0;
  const webId = Platform.OS === 'web' && !rail ? { id: `module-nav-${item.id}` } : null;

  if (item.locked) {
    const note = item.lockedNote || 'Ikke aktivert';
    const icon = <Ionicons name={rowIcon(item, false)} size={16} color={colors.muted} />;
    return (
      <View
        style={[s.row, t?.row, depth > 0 && { paddingLeft: nestPad }, collapsed && s.rowCollapsed, collapsed && t?.rowCollapsed, s.rowLocked]}
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        accessibilityLabel={`${item.label}. ${note}`}
        nativeID={`module-nav-${item.id}`}
        {...webId}
        {...(Platform.OS === 'web' ? { dataSet: { moduleLocked: '1' }, title: `${item.label} – ${note}` } : null)}
      >
        <View style={s.rowMain}>
          {rail ? icon : <View style={[s.iconWrap, tone.well]}>{icon}</View>}
          {collapsed ? null : (
            <View style={s.lockedText}>
              <Text style={[s.rowLabel, { color: colors.muted }]} numberOfLines={1}>{item.label}</Text>
              <Text style={[s.lockedNote, { color: colors.muted }]} numberOfLines={2}>{note}</Text>
            </View>
          )}
          {collapsed ? null : (
            <Ionicons name="lock-closed" size={rail ? 12 : 14} color={colors.muted} style={s.lockIcon} />
          )}
        </View>
      </View>
    );
  }

  const tint = highlight ? colors.onBrand : active ? colors.brand : colors.ink;
  const icon = <Ionicons name={rowIcon(item, active || highlight)} size={16} color={tint} />;
  const badge = (
    <IconBadge
      count={badgeCount}
      size={rail ? 13 : 14}
      offset={rail ? -5 : -6}
      {...(rail ? null : { borderColor: highlight ? colors.brandInk : colors.card })}
    >
      {icon}
    </IconBadge>
  );
  return (
    <View
      style={[
        s.row,
        t?.row,
        depth > 0 && { paddingLeft: nestPad },
        active && { backgroundColor: colors.brandSoft },
        highlight && { backgroundColor: colors.brandInk },
        collapsed && s.rowCollapsed,
        collapsed && t?.rowCollapsed,
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        style={[s.rowMain, t?.rowMain]}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: !!active }}
        nativeID={`module-nav-${item.id}`}
        {...webId}
        {...(Platform.OS === 'web' && rail ? { dataSet: { wpNav: '1', wpNavActive: active ? '1' : '0' } } : null)}
      >
        {rail ? badge : (
          <View style={[s.iconWrap, tone.well, active && tone.wellOn, highlight && s.iconWrapHighlight]}>
            {badge}
          </View>
        )}
        {collapsed ? null : (
          <Text
            style={[
              s.rowLabel,
              tone.title,
              active && s.rowLabelActive,
              active && tone.titleOn,
              highlight && { color: colors.onBrand },
            ]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        )}
      </TouchableOpacity>
      {expandable ? (
        <TouchableOpacity
          onPress={(event) => {
            event?.stopPropagation?.();
            onToggle();
          }}
          style={[s.expandBtn, t?.expandBtn, tone.well, highlight && s.expandBtnHighlight]}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Skjul' : 'Vis'} undermeny, ${item.label}`}
          accessibilityState={{ expanded: !!expanded }}
          nativeID={`module-nav-expand-${item.id}`}
          {...(Platform.OS === 'web' && !rail ? { id: `module-nav-expand-${item.id}` } : null)}
          hitSlop={rail ? { top: 6, bottom: 6, left: 4, right: 6 } : { top: 8, bottom: 8, left: 4, right: 8 }}
        >
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={rail ? 16 : 18}
            color={tint}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Seksjonene med overskrift, grupper (bedriftsmenyen) og rader.
 * sections: navSections(...). state: useNavTreeState(...). onAction(item): menyvalget.
 * rowRef(id, node): skuffen bruker den til å rulle aktiv side frem.
 */
export default function NavTree({
  variant = 'drawer',
  sections,
  state,
  activeTab = null,
  activeSubView = null,
  query = '',
  unreadByModule,
  onAction,
  rowRef,
}) {
  const colors = useColors();
  const tone = useMemo(() => paint(colors), [colors]);
  const { isTouch } = useLayout();
  const rail = variant === 'rail';
  const s = rail ? railStyles : drawerStyles;
  const t = isTouch ? touchStyles : null;
  const searching = !!String(query || '').trim();
  const {
    open, setOpen, groupOpen, setGroupOpen, submenuOpen, setSubmenuOpen,
  } = state;
  const isActive = (item) => isNavItemActive(item, activeTab, activeSubView);
  const chevron = rail ? 14 : 16;

  const renderBranch = (row, depth = 0) => {
    const expandable = !row.locked && drawerHasSubmenuToggle(row);
    const submenuExpanded = searching || drawerSubmenuOpen(row, activeTab, submenuOpen, activeSubView);
    return (
      <View
        key={row.id}
        {...(rowRef ? {
          ref: (node) => rowRef(row.id, node),
          collapsable: false,
        } : null)}
      >
        <NavRow
          variant={variant}
          item={row}
          depth={depth}
          active={isActive(row)}
          badgeCount={countForItem(unreadByModule, row)}
          expanded={submenuExpanded}
          onToggle={expandable ? () => setSubmenuOpen((prev) => ({
            ...prev,
            [row.id]: !drawerSubmenuOpen(row, activeTab, prev, activeSubView),
          })) : undefined}
          onPress={() => onAction?.(row)}
        />
        {expandable && submenuExpanded
          ? (row.children || []).map((child) => renderBranch(child, depth + 1))
          : null}
      </View>
    );
  };

  const renderGroup = (item, index) => {
    if (!item.group) return renderBranch(item);
    const expanded = searching || drawerGroupOpen(item, activeTab, groupOpen, activeSubView);
    const containsActive = (item.children || []).some((child) => isActive(child));
    return (
      <View key={item.id} style={[s.groupBlock, tone.line, index === 0 && s.groupBlockFirst]}>
        <TouchableOpacity
          style={[s.groupHead, t?.groupHead, containsActive && { backgroundColor: colors.brandSoft }]}
          onPress={() => setGroupOpen((prev) => ({
            ...prev,
            [item.id]: !drawerGroupOpen(item, activeTab, prev, activeSubView),
          }))}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${item.label}, ${expanded ? 'åpen' : 'lukket'}`}
          nativeID={`module-nav-${item.id}`}
          {...(Platform.OS === 'web' && !rail ? { id: `module-nav-${item.id}` } : null)}
        >
          <View style={[s.groupIconWrap, tone.well, containsActive && tone.wellOn]}>
            <Ionicons
              name={groupIcon(item, containsActive)}
              size={rail ? 14 : 16}
              color={containsActive ? colors.brand : colors.ink}
            />
          </View>
          <Text style={[s.groupTitle, tone.title, containsActive && tone.titleOn]} numberOfLines={2}>
            {item.label}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={chevron}
            color={containsActive ? colors.brand : colors.muted}
          />
        </TouchableOpacity>
        {expanded ? (
          <View style={[s.groupBody, item.processOrder && s.groupBodyProcess]}>
            {(item.children || []).map((child, childIndex) => (
              <View key={child.id}>
                {item.processOrder && childIndex > 0 ? (
                  <View style={[s.processRail, { backgroundColor: colors.line }]} />
                ) : null}
                {renderBranch(child)}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (sections || []).map((section) => {
    const expanded = navSectionExpanded(section, {
      open, query, activeTab, activeSubView,
    });
    const badge = expanded ? 0 : (section.items || []).reduce(
      (sum, item) => sum + (countForItem(unreadByModule, item) || 0),
      0,
    );
    let head = null;
    if (section.heading && section.foldable) {
      head = (
        <TouchableOpacity
          style={[s.sectionHead, t?.sectionHead, section.appFolder && s.appSectionHead, section.appFolder && tone.appHead]}
          onPress={() => setOpen((prev) => ({ ...prev, [section.id]: !expanded }))}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${section.heading}, ${expanded ? 'åpen' : 'lukket'}`}
          {...(Platform.OS === 'web' && rail ? { dataSet: { wpSection: '1' } } : null)}
        >
          <Text style={[s.sectionTitle, tone.muted, s.sectionTitleFold, section.appFolder && s.appSectionTitle, section.appFolder && tone.title]}>
            {section.heading}
          </Text>
          <View style={s.sectionRight}>
            {badge > 0 ? (
              <View style={[s.sectionBadge, { backgroundColor: colors.brandInk }]}>
                <Text style={[s.sectionBadgeTxt, { color: colors.onBrand }]}>{badge > 9 ? '9+' : String(badge)}</Text>
              </View>
            ) : null}
            <Ionicons
              name={expanded ? 'chevron-down' : 'chevron-forward'}
              size={chevron}
              color={section.appFolder ? colors.ink : colors.muted}
            />
          </View>
        </TouchableOpacity>
      );
    } else if (section.heading) {
      head = <Text style={[s.sectionTitle, tone.muted, s.sectionTitlePlain]} accessibilityRole="header">{section.heading}</Text>;
    }
    return (
      <View
        key={section.id}
        style={[
          s.section,
          section.appFolder && s.appSection,
          section.appFolder && tone.appSection,
          section.id === 'company' && s.companySection,
          section.id === 'company' && tone.line,
        ]}
      >
        {head}
        {expanded ? (section.items || []).map(renderGroup) : null}
      </View>
    );
  });
}

const shared = {
  rowLocked: { opacity: 0.75, cursor: 'not-allowed' },
  lockedText: { flex: 1, minWidth: 0 },
  lockedNote: { fontSize: 11, lineHeight: 14, marginTop: 1 },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeTxt: { fontSize: 10, fontWeight: '400' },
  groupIconWrapActive: { backgroundColor: colors.card },
  groupTitleActive: { color: colors.brandInk },
  rowLabelActive: { color: colors.brandInk },
  appSectionTitle: {
    color: colors.ink,
    textTransform: 'none',
    letterSpacing: 0,
  },
  sectionTitleFold: {},
};

/** PC: tett meny for mus. */
const railStyles = StyleSheet.create({
  ...shared,
  section: { marginBottom: 6 },
  companySection: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  appSection: {
    marginBottom: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 5,
  },
  appSectionHead: {
    paddingVertical: 8,
    backgroundColor: colors.sunken,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '400', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.45,
  },
  sectionTitlePlain: { paddingHorizontal: 8, paddingVertical: 5 },
  appSectionTitle: { ...shared.appSectionTitle, fontSize: 12 },
  groupBlock: {
    marginTop: 6,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  groupBlockFirst: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingVertical: 4,
    paddingLeft: 6,
    paddingRight: 4,
    borderRadius: 5,
  },
  groupIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupTitle: {
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    color: colors.ink,
  },
  groupBody: { paddingLeft: 8, paddingTop: 1 },
  groupBodyProcess: { paddingLeft: 10 },
  processRail: {
    height: 6,
    width: 2,
    marginLeft: 16,
    marginVertical: 0,
    borderRadius: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 5, minHeight: 28, marginBottom: 1,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingLeft: 8,
    paddingRight: 4,
    minHeight: 28,
  },
  expandBtn: {
    width: 28,
    height: 28,
    marginRight: 4,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    flexShrink: 0,
  },
  expandBtnHighlight: {},
  rowCollapsed: { justifyContent: 'center', paddingHorizontal: 6, width: 36 },
  lockIcon: { marginRight: 6 },
  iconWrap: {},
  iconWrapActive: {},
  iconWrapHighlight: {},
  rowLabel: { flex: 1, fontWeight: '400', fontSize: 13, color: colors.ink },
  rowLabelActive: { ...shared.rowLabelActive, fontWeight: '500' },
});

/** Telefon og nettbrett: større treffflater for fingre. */
const drawerStyles = StyleSheet.create({
  ...shared,
  section: { marginTop: 4 },
  companySection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  appSection: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    marginTop: 6,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  appSectionHead: {
    backgroundColor: colors.sunken,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '400', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  sectionTitleFold: { marginBottom: 2, marginLeft: 6, marginTop: 2 },
  sectionTitlePlain: { marginBottom: 2, marginLeft: 6, marginTop: 2 },
  appSectionTitle: {
    ...shared.appSectionTitle, marginBottom: 0, marginLeft: 2, marginTop: 0, fontSize: 14,
  },
  groupBlock: {
    marginTop: 8,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  groupBlockFirst: { marginTop: 2, paddingTop: 0, borderTopWidth: 0 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 4,
    borderRadius: 8,
  },
  groupIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    color: colors.ink,
  },
  groupBody: { paddingLeft: 10, paddingTop: 2, gap: 1 },
  groupBodyProcess: { paddingLeft: 12 },
  processRail: {
    height: 8,
    width: 2,
    marginLeft: 20,
    marginVertical: 1,
    borderRadius: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, marginBottom: 1,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingLeft: 8,
    paddingRight: 8,
    minHeight: 40,
  },
  expandBtn: {
    width: 36,
    height: 36,
    marginRight: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    flexShrink: 0,
  },
  expandBtnHighlight: { backgroundColor: 'rgba(255,255,255,0.22)' },
  rowCollapsed: {},
  lockIcon: {},
  iconWrap: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'visible',
  },
  iconWrapActive: { backgroundColor: colors.card },
  iconWrapHighlight: { backgroundColor: 'rgba(255,255,255,0.2)' },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '400', color: colors.ink },
});

/** Berøringsskjerm: rader og knapper på minst touch.min, også i PC-menyen på iPad (UX-23/UX-26). */
const touchStyles = StyleSheet.create({
  row: { minHeight: touch.min },
  rowMain: { minHeight: touch.min },
  rowCollapsed: { width: touch.min },
  groupHead: { minHeight: touch.min },
  sectionHead: { minHeight: touch.min },
  expandBtn: { width: touch.min, height: touch.min },
});
