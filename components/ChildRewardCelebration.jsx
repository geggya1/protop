import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, Modal, Pressable, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  dateKey, parseDateKey, getISOWeek, appliesOnDate,
} from '../src/utils/dates';
import { valueForTask, isDoneOn } from '../src/utils/todos';
import { normalizeRewardMode, rewardUnitLabel, showsNumericReward } from '../src/utils/rewardModes';
import WeekSummaryModal from './WeekSummaryModal';

const COIN_IMG = require('../assets/gold-coin.png');
const NATIVE_DRIVER = Platform.OS !== 'web';

/** Antall partikler: 1–10 = verdi, over 10 = tett haug (12). */
export function particleCountForReward(value) {
  const v = Math.max(0, Math.round(Number(value) || 0));
  if (v <= 0) return 0;
  if (v <= 10) return v;
  return 12;
}

/**
 * Mynt-/stjernedryss inn i pengesekken.
 * Web: fixed portal så animasjonen ikke klippes / dekkes.
 */
function RewardRain({
  triggerKey, count = 0, targetLayout, kind = 'money', dense = false,
}) {
  const { width: winW, height: winH } = Dimensions.get('window');
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!triggerKey || !count || !targetLayout) {
      setParticles([]);
      return undefined;
    }

    const c = Math.min(14, Math.max(0, Math.round(count)));
    const bagCX = targetLayout.x + targetLayout.width / 2;
    const bagCY = targetLayout.y + targetLayout.height * 0.55;
    const screenCX = winW / 2;
    const startBaseY = Math.max(40, Math.min(bagCY - 140, winH * 0.25));

    const next = Array.from({ length: c }, (_, i) => {
      const spread = dense ? (40 + Math.random() * 100) : (50 + Math.random() * 90);
      const angle = (i / Math.max(c, 1)) * Math.PI * 2 + Math.random() * 0.5;
      const stagger = dense
        ? i * 28 + Math.round(Math.random() * 30)
        : i * 55 + Math.round(Math.random() * 45);
      const dur = dense
        ? 520 + Math.round(Math.random() * 180)
        : 780 + Math.round(Math.random() * 280);
      return {
        id: `${triggerKey}-${i}`,
        p: new Animated.Value(0),
        op: new Animated.Value(0),
        size: dense ? (18 + Math.round(Math.random() * 10)) : (22 + Math.round(Math.random() * 12)),
        startX: screenCX + Math.cos(angle) * spread * 0.85,
        startY: startBaseY + Math.sin(angle) * 18 - Math.random() * 40,
        delay: stagger,
        dur,
        rot: new Animated.Value(0),
        scale: 0.75 + Math.random() * 0.45,
        endX: bagCX + (Math.random() - 0.5) * (dense ? 28 : 16),
        endY: bagCY + (Math.random() - 0.5) * (dense ? 18 : 10),
      };
    });

    setParticles(next);

    const timers = [];
    next.forEach((coin) => {
      coin.p.setValue(0);
      coin.op.setValue(0);
      coin.rot.setValue(0);
      Animated.parallel([
        Animated.timing(coin.op, {
          toValue: 1, duration: 90, delay: coin.delay, useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(coin.p, {
          toValue: 1, duration: coin.dur, delay: coin.delay, useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(coin.rot, {
          toValue: 1, duration: coin.dur, delay: coin.delay, useNativeDriver: NATIVE_DRIVER,
        }),
      ]).start(() => {
        Animated.timing(coin.op, {
          toValue: 0, duration: dense ? 120 : 200, useNativeDriver: NATIVE_DRIVER,
        }).start();
      });
    });

    // Rydd state etter animasjonen
    const clearAfter = dense ? 1100 : 1600;
    const t = setTimeout(() => setParticles([]), clearAfter + c * 40);
    timers.push(t);

    return () => {
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  if (!particles.length) return null;

  const layer = (
    <View pointerEvents="none" style={styles.coinLayer}>
      {particles.map((coin, idx) => {
        const translateX = coin.p.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [
            coin.startX,
            coin.startX + (coin.endX - coin.startX) * 0.2,
            coin.endX,
          ],
        });
        const translateY = coin.p.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [
            coin.startY,
            coin.startY - (dense ? 18 : 36),
            coin.endY,
          ],
        });
        const rotate = coin.rot.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${280 + idx * 40}deg`],
        });
        const transform = [
          { translateX }, { translateY }, { rotate }, { scale: coin.scale },
        ];

        if (kind === 'points') {
          return (
            <Animated.View
              key={coin.id}
              style={[styles.coinImg, {
                width: coin.size + 8,
                height: coin.size + 8,
                opacity: coin.op,
                transform,
                alignItems: 'center',
                justifyContent: 'center',
              }]}
            >
              <Text style={{ fontSize: coin.size }}>{'⭐'}</Text>
            </Animated.View>
          );
        }

        // Penger: bilde + emoji-fallback lag
        return (
          <Animated.View
            key={coin.id}
            style={[styles.coinImg, {
              width: coin.size,
              height: coin.size,
              opacity: coin.op,
              transform,
            }]}
          >
            <Image
              source={COIN_IMG}
              style={{ width: coin.size, height: coin.size }}
              resizeMode="contain"
            />
          </Animated.View>
        );
      })}
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webPortal} pointerEvents="none">
        {layer}
      </View>
    );
  }
  return layer;
}

function CongratsCard({
  visible, onClose, lastEarned, bagUnit, weekEarnedSum, weekPossibleTotal, allDoneToday,
  quiet = false,
}) {
  if (!visible) return null;

  const card = (
    <Pressable style={styles.congratsCard} onStartShouldSetResponder={() => true}>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Lukk">
        <Ionicons name="close" size={20} color="#334155" />
      </TouchableOpacity>
      <Text style={{ fontSize: 52, textAlign: 'center' }}>
        {quiet ? '👏' : (bagUnit === 'kr' ? '💰' : '⭐')}
      </Text>
      <Text style={styles.congratsTitle}>{quiet ? 'Bra jobba!' : 'Bra jobba! 🎉'}</Text>
      {!quiet && lastEarned > 0 ? (
        <Text style={styles.congratsText}>
          +{lastEarned} {bagUnit}
        </Text>
      ) : (
        <Text style={styles.congratsQuiet}>
          {allDoneToday ? 'Alt for i dag er krysset av.' : 'Gjøremålet er krysset av.'}
        </Text>
      )}
      {!quiet && (
        <>
          <View style={styles.congratsBar}>
            <View style={[styles.congratsBarFill, {
              width: `${weekPossibleTotal
                ? Math.min(100, Math.round((weekEarnedSum / weekPossibleTotal) * 100))
                : 0}%`,
            }]}
            />
          </View>
          <Text style={styles.congratsProgress}>
            {weekEarnedSum} av {weekPossibleTotal} {bagUnit} denne uken
          </Text>
        </>
      )}
      {allDoneToday && (
        <Text style={styles.congratsBonus}>
          {quiet ? 'Alt ferdig i dag — digg!' : '🏆 Alle oppgaver i dag er ferdig!'}
        </Text>
      )}
    </Pressable>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.congratsWebPortal} pointerEvents="box-none">
        <Pressable style={styles.congratsOverlay} onPress={onClose} />
        <View style={styles.congratsWebCenter} pointerEvents="box-none">
          {card}
        </View>
      </View>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.congratsOverlay} onPress={onClose}>
        {card}
      </Pressable>
    </Modal>
  );
}

/**
 * Belønnings-UX for barn: penge-/poengdryss inn i sekken + «Bra jobba» + ukeoppsummering.
 */
export function useChildRewardCelebration({
  todos = [],
  rewardMode = 'points',
  weekKeys = [],
  anchorDate = new Date(),
}) {
  const bagRef = useRef(null);
  const bagScale = useRef(new Animated.Value(1)).current;
  const lastBagLayoutRef = useRef(null);
  const [bagScreenLayout, setBagScreenLayout] = useState(null);
  const [congratsVisible, setCongratsVisible] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [lastEarned, setLastEarned] = useState(0);
  const [celebratingTaskId, setCelebratingTaskId] = useState(null);
  const [burst, setBurst] = useState({
    key: 0, count: 0, layout: null, dense: false, kind: 'money',
  });

  const mode = normalizeRewardMode(rewardMode);
  const numeric = showsNumericReward(mode);
  const bagUnit = rewardUnitLabel(mode) || 'stjerner';
  const weekDates = useMemo(
    () => (weekKeys || []).map((k) => parseDateKey(k)),
    [weekKeys],
  );
  const wk = useMemo(() => getISOWeek(anchorDate), [anchorDate]);
  const dayKey = dateKey(anchorDate);

  const perDayTotals = useMemo(() => {
    const totals = Object.fromEntries((weekKeys || []).map((k) => [k, 0]));
    (todos || []).forEach((t) => {
      const v = valueForTask(t);
      (t.completedDates || []).forEach((k) => {
        if (totals[k] == null) return;
        const d = parseDateKey(k);
        if (appliesOnDate(t, d)) totals[k] += v;
      });
    });
    Object.keys(totals).forEach((k) => {
      totals[k] = Math.max(0, Math.round(totals[k]));
    });
    return totals;
  }, [todos, weekKeys]);

  const perDayPossible = useMemo(() => {
    const totals = Object.fromEntries((weekKeys || []).map((k) => [k, 0]));
    weekDates.forEach((d) => {
      const k = dateKey(d);
      (todos || []).forEach((t) => {
        if (appliesOnDate(t, d)) totals[k] += valueForTask(t);
      });
    });
    Object.keys(totals).forEach((k) => {
      totals[k] = Math.max(0, Math.round(totals[k]));
    });
    return totals;
  }, [todos, weekDates, weekKeys]);

  const weekPossibleTotal = useMemo(
    () => (weekKeys || []).reduce((a, k) => a + (perDayPossible[k] || 0), 0),
    [perDayPossible, weekKeys],
  );

  const weekEarnedSum = useMemo(
    () => (weekKeys || []).reduce((a, k) => a + (perDayTotals[k] || 0), 0),
    [perDayTotals, weekKeys],
  );

  const tasksForDay = useMemo(
    () => (todos || []).filter((t) => appliesOnDate(t, anchorDate)),
    [todos, anchorDate],
  );

  const allDoneToday = tasksForDay.length > 0
    && tasksForDay.every((t) => isDoneOn(t, dayKey) || t.id === celebratingTaskId);

  const weekTaskBreakdown = useMemo(() => {
    const out = [];
    for (const t of todos || []) {
      const v = valueForTask(t);
      const completed = Array.isArray(t.completedDates) ? t.completedDates : [];
      const possibleCount = weekDates.filter((d) => appliesOnDate(t, d)).length;
      let completedCount = 0;
      for (const k of completed) {
        if ((weekKeys || []).includes(k)) {
          const d = parseDateKey(k);
          if (appliesOnDate(t, d)) completedCount += 1;
        }
      }
      if (possibleCount > 0) {
        out.push({
          id: t.id,
          title: t.title || 'Gjøremål',
          earnedSum: Math.round(completedCount * v),
          possibleSum: Math.round(possibleCount * v),
          completed: completedCount,
          possibleCount,
        });
      }
    }
    out.sort((a, b) => b.earnedSum - a.earnedSum);
    return out;
  }, [todos, weekKeys, weekDates]);

  const bumpBag = useCallback(() => {
    Animated.sequence([
      Animated.timing(bagScale, { toValue: 1.14, duration: 110, useNativeDriver: NATIVE_DRIVER }),
      Animated.spring(bagScale, { toValue: 1, useNativeDriver: NATIVE_DRIVER, speed: 14, bounciness: 8 }),
    ]).start();
  }, [bagScale]);

  const measureBag = useCallback(() => new Promise((resolve) => {
    const node = bagRef.current;
    if (!node?.measureInWindow) {
      resolve(lastBagLayoutRef.current || bagScreenLayout);
      return;
    }
    try {
      node.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) {
          const next = { x, y, width: w, height: h };
          lastBagLayoutRef.current = next;
          setBagScreenLayout(next);
          resolve(next);
        } else {
          resolve(lastBagLayoutRef.current || bagScreenLayout);
        }
      });
    } catch {
      resolve(lastBagLayoutRef.current || bagScreenLayout);
    }
  }), [bagScreenLayout]);

  const onBagLayout = useCallback(() => {
    measureBag();
  }, [measureBag]);

  const fireBurst = useCallback((layout, value) => {
    if (!numeric) return;
    const particles = particleCountForReward(value);
    if (!particles || !layout) return;
    setBurst((prev) => ({
      key: prev.key + 1,
      count: particles,
      layout,
      dense: value > 10,
      kind: mode === 'money' ? 'money' : 'points',
    }));
    bumpBag();
  }, [bumpBag, mode, numeric]);

  const triggerCoins = useCallback(async (value) => {
    if (!numeric) return;
    const layout = await measureBag();
    if (layout) {
      fireBurst(layout, value);
      return;
    }
    // Fallback: midten øverst på skjermen som «sekk» hvis measure mangler
    const { width, height } = Dimensions.get('window');
    fireBurst({
      x: width * 0.15, y: height * 0.18, width: width * 0.7, height: 120,
    }, value);
  }, [fireBurst, measureBag, numeric]);

  const closeCongrats = useCallback(() => {
    setCongratsVisible(false);
    setCelebratingTaskId(null);
  }, []);

  /** Kall etter vellykket fullføring (ikke ved avkryssing). */
  const celebrateComplete = useCallback((task, { willBeDone = true } = {}) => {
    if (!willBeDone) return;
    const value = Math.round(valueForTask(task));
    setCelebratingTaskId(task?.id || null);
    if (!numeric) {
      setLastEarned(0);
      setTimeout(() => setCongratsVisible(true), 120);
      return;
    }
    if (value <= 0) return;
    setLastEarned(value);
    // Dryss først — popup litt etter så animasjonen synes
    triggerCoins(value);
    setTimeout(() => setCongratsVisible(true), 280);
  }, [triggerCoins, numeric]);

  const openSummary = useCallback(() => setSummaryVisible(true), []);
  const closeSummary = useCallback(() => setSummaryVisible(false), []);

  const overlay = (
    <>
      <RewardRain
        triggerKey={burst.key}
        count={burst.count}
        targetLayout={burst.layout}
        kind={burst.kind}
        dense={burst.dense}
      />

      <CongratsCard
        visible={congratsVisible}
        onClose={closeCongrats}
        lastEarned={lastEarned}
        bagUnit={bagUnit}
        weekEarnedSum={weekEarnedSum}
        weekPossibleTotal={weekPossibleTotal}
        allDoneToday={allDoneToday}
        quiet={!numeric}
      />

      <WeekSummaryModal
        visible={summaryVisible}
        onClose={closeSummary}
        weekNumber={wk.week}
        weekDates={weekDates}
        perDayTotals={numeric ? perDayTotals : Object.fromEntries((weekKeys || []).map((k) => {
          const dayTodos = (todos || []).filter((t) => {
            const d = parseDateKey(k);
            return appliesOnDate(t, d);
          });
          return [k, dayTodos.filter((t) => isDoneOn(t, k)).length];
        }))}
        perDayPossible={numeric ? perDayPossible : Object.fromEntries((weekKeys || []).map((k) => {
          const d = parseDateKey(k);
          return [k, (todos || []).filter((t) => appliesOnDate(t, d)).length];
        }))}
        earnedSum={numeric ? weekEarnedSum : (weekKeys || []).reduce((a, k) => {
          const dayTodos = (todos || []).filter((t) => appliesOnDate(t, parseDateKey(k)));
          return a + dayTodos.filter((t) => isDoneOn(t, k)).length;
        }, 0)}
        weekPossibleTotal={numeric ? weekPossibleTotal : (weekKeys || []).reduce((a, k) => {
          const d = parseDateKey(k);
          return a + (todos || []).filter((t) => appliesOnDate(t, d)).length;
        }, 0)}
        weekTaskBreakdown={numeric ? weekTaskBreakdown : weekTaskBreakdown.map((row) => ({
          ...row,
          earnedSum: row.completed,
          possibleSum: row.possibleCount,
        }))}
        bagUnit={numeric ? bagUnit : 'ferdig'}
        anchorDate={anchorDate}
        taskLabel="gjøremål"
      />
    </>
  );

  return {
    bagRef,
    bagScale,
    onBagLayout,
    openSummary,
    celebrateComplete,
    overlay,
    bagUnit: numeric ? bagUnit : 'ferdig',
    weekEarnedSum,
    weekPossibleTotal,
    quietReward: !numeric,
  };
}

const styles = StyleSheet.create({
  webPortal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100050,
    elevation: 100050,
    pointerEvents: 'none',
  },
  coinLayer: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    zIndex: 9999, elevation: 10, pointerEvents: 'none',
  },
  coinImg: { position: 'absolute', top: 0, left: 0 },
  congratsWebPortal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100040,
    elevation: 100040,
  },
  congratsWebCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  congratsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  congratsCard: {
    backgroundColor: '#fff', padding: 18, borderRadius: 16,
    width: '80%', maxWidth: 380, alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0', position: 'relative',
    ...(Platform.OS === 'web' ? { boxShadow: '0 18px 40px rgba(15,23,42,0.22)' } : {}),
  },
  closeBtn: {
    alignSelf: 'flex-start',
    position: 'absolute', right: 10, top: 10, padding: 6,
    borderRadius: 12, backgroundColor: '#f1f5f9',
  },
  congratsTitle: { fontSize: 22, fontWeight: '400', color: '#0f172a', marginTop: 4 },
  congratsText: {
    marginTop: 4, color: '#0b74d1', fontWeight: '400',
    textAlign: 'center', fontSize: 28,
  },
  congratsQuiet: {
    marginTop: 6, color: '#475569', fontWeight: '400',
    textAlign: 'center', fontSize: 15, lineHeight: 22,
  },
  congratsBar: {
    marginTop: 14, height: 10, width: '100%',
    backgroundColor: '#e7effe', borderRadius: 999, overflow: 'hidden',
  },
  congratsBarFill: { height: 10, backgroundColor: '#10b981', borderRadius: 999 },
  congratsProgress: {
    marginTop: 6, color: '#334155', fontWeight: '400',
    textAlign: 'center', fontSize: 14,
  },
  congratsBonus: {
    marginTop: 10, color: '#d97706', fontWeight: '400',
    textAlign: 'center', fontSize: 16,
  },
});
