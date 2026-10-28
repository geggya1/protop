import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../src/context/ThemeContext';
import { useOptionalApp } from '../src/context/AppContext';
import { useLayout } from '../src/theme';
import { companyNavTrail, navTrailSegments } from '../src/navigation/navTrail';

/**
 * Brødsmule bygget fra menyen: «Ansatte og arbeidstid › Timer / arbeid per ansatt › Godkjenninger».
 * Samme kilde som hamburgermenyen og venstremenyen (COMPANY_DRAWER_GROUPS og companyNavItems),
 * så den følger menyen når navnene endres. Modulen er en lenke til modulens startside.
 * Telefon viser modul › side (uten menygruppen).
 *
 * current: et ekstra siste ledd, f.eks. fakturanummeret på en detaljside.
 * onPage: gjør sideleddet til en lenke (f.eks. tilbake til listen fra en detaljside).
 * title: siste ledd vises som sidetittel (kompakt tittelrad på undersider).
 */
export default function Breadcrumb({
  tab,
  subView = null,
  current = '',
  compact,
  onPage = null,
  title = false,
  style,
  nativeID = 'breadcrumb',
}) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const app = useOptionalApp();
  const short = compact ?? isPhone;
  const segments = useMemo(
    () => navTrailSegments(companyNavTrail(tab, subView), { compact: short, current }),
    [tab, subView, short, current],
  );
  if (!segments.length) return null;

  const open = (segment) => {
    if (segment.action) app?.requestShellTab?.(segment.action.tab, segment.action.subView || null);
  };

  return (
    <View
      nativeID={nativeID}
      accessibilityRole="navigation"
      accessibilityLabel="Du er her"
      style={[styles.row, style]}
    >
      {segments.map((segment, index) => {
        // Sideleddet blir en lenke når det finnes et ledd etter det (detaljside med onPage).
        const pageLink = !!onPage && !!current && index === segments.length - 2;
        const link = !segment.current && (segment.action || pageLink);
        const last = index === segments.length - 1;
        return (
          <React.Fragment key={`${segment.id}-${index}`}>
            {index ? <Text style={[styles.sep, { color: colors.muted }]} accessibilityElementsHidden>›</Text> : null}
            {link ? (
              <Text
                onPress={() => (pageLink ? onPage() : open(segment))}
                accessibilityRole="link"
                style={[styles.text, { color: colors.muted }, styles.link]}
              >
                {segment.label}
              </Text>
            ) : (
              <Text
                accessibilityRole={title && last ? 'header' : undefined}
                aria-current={last ? 'page' : undefined}
                style={[
                  styles.text,
                  { color: last ? colors.ink : colors.muted },
                  last && styles.current,
                  title && last && styles.title,
                ]}
              >
                {segment.label}
              </Text>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 6,
    rowGap: 2,
    minWidth: 0,
  },
  text: { fontSize: 12, lineHeight: 18 },
  link: { textDecorationLine: 'underline', textDecorationColor: 'rgba(100, 116, 139, 0.45)' },
  sep: { fontSize: 12, lineHeight: 18 },
  current: { fontWeight: '500' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
});
