import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';

/** Under denne bredden står kortene alene, én i bredden. */
export const ECONOMY_GRID_TWO_COLUMNS = 1200;
export const ECONOMY_GRID_GAP = 14;

const GridContext = createContext({ wide: false, basis: 0 });
const TileContext = createContext({ half: false });

/** Kortet ligger i halv bredde akkurat nå. Grafer kan da pakkes litt tettere. */
export function useEconomyTileHalf() {
  return useContext(TileContext).half;
}

/**
 * Rutenett for økonomioversikten. På brede skjermer står kortene to i
 * bredden, og hvert kort kan utvides til full bredde.
 */
export function EconomyGrid({ children, nativeID }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (typeof node?.getBoundingClientRect !== 'function') return;
    const next = node.getBoundingClientRect().width;
    if (next > 0) setWidth(next);
  }, []);
  const wide = width >= ECONOMY_GRID_TWO_COLUMNS;
  const basis = wide ? Math.floor((width - ECONOMY_GRID_GAP) / 2) : 0;
  return (
    <GridContext.Provider value={{ wide, basis }}>
      <View
        ref={ref}
        nativeID={nativeID}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={styles.grid}
      >
        {children}
      </View>
    </GridContext.Provider>
  );
}

export function EconomyTile({ children, label }) {
  const colors = useColors();
  const { wide, basis } = useContext(GridContext);
  const [open, setOpen] = useState(false);
  const half = wide && !open;
  const size = !wide
    ? styles.full
    : { flexBasis: open ? '100%' : basis, flexGrow: 1, minWidth: 0 };
  const name = label ? ` ${label}` : '';
  return (
    <TileContext.Provider value={{ half }}>
      <View style={[styles.tile, size]}>
        {children}
        {wide ? (
          <Pressable
            onPress={() => setOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={open ? `Gjør${name} mindre` : `Utvid${name}`}
            accessibilityState={{ expanded: open }}
            hitSlop={6}
            style={[styles.toggle, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Ionicons name={open ? 'contract-outline' : 'expand-outline'} size={15} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
    </TileContext.Provider>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: ECONOMY_GRID_GAP, alignItems: 'stretch' },
  full: { width: '100%' },
  tile: { position: 'relative' },
  toggle: {
    position: 'absolute', top: 7, right: 8, zIndex: 6,
    width: 28, height: 28, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
