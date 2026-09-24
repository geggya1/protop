import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { Platform } from 'react-native';
import { useLayout } from '../theme';
import {
  registerChatDockBridge,
  subscribePendingChatDockThread,
  consumePendingChatDockThread,
} from '../utils/chatDockBridge';
import { isFriendChatNavPayload, friendUidFromNavPayload } from '../utils/friendsLogic';
import { auth } from '../../firebase';

const Ctx = createContext(null);

/**
 * Chat-dock: desktop = Facebook-stil vinduer; mobil/web = høyre-skuff (4/5).
 */
export function ChatDockProvider({ children }) {
  const { isDesktop } = useLayout();
  const [windows, setWindows] = useState([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Prefer dock/drawer on web (desktop windows + mobile drawer). Native keeps stack.
  const preferred = Platform.OS === 'web';
  const mobileDrawer = preferred && !isDesktop;

  const openThread = useCallback((thread) => {
    if (!thread?.chatId) return;
    const myUid = auth.currentUser?.uid || null;
    let friendUid = thread.friendUid || null;
    const kind = isFriendChatNavPayload(thread)
      ? 'friend'
      : (thread.kind || (friendUid ? 'friend' : 'family'));
    if (kind === 'friend' && !friendUid && myUid) {
      friendUid = friendUidFromNavPayload(thread, myUid) || null;
    }
    const memberIds = Array.isArray(thread.memberIds) && thread.memberIds.length
      ? thread.memberIds
      : (myUid && friendUid ? [myUid, friendUid] : (friendUid ? [friendUid] : []));
    setWindows((prev) => {
      const existing = prev.find((w) => w.chatId === thread.chatId);
      if (existing) {
        return prev.map((w) => (
          w.chatId === thread.chatId
            ? {
              ...w,
              ...thread,
              kind,
              friendUid,
              memberIds: memberIds.length ? memberIds : (w.memberIds || []),
              minimized: false,
            }
            : w
        ));
      }
      const next = [
        ...prev,
        {
          kind,
          familyId: kind === 'friend' ? null : (thread.familyId || null),
          friendUid,
          chatId: thread.chatId,
          title: thread.title || 'Chat',
          memberIds,
          photoURL: thread.photoURL || null,
          avatarId: thread.avatarId || null,
          minimized: false,
        },
      ];
      return next.slice(-3);
    });
    setComposeOpen(false);
    setDrawerOpen(true);
  }, []);

  const closeThread = useCallback((chatId) => {
    setWindows((prev) => prev.filter((w) => w.chatId !== chatId));
  }, []);

  const minimizeThread = useCallback((chatId) => {
    setWindows((prev) => prev.map((w) => (
      w.chatId === chatId ? { ...w, minimized: true } : w
    )));
  }, []);

  const restoreThread = useCallback((chatId) => {
    setWindows((prev) => prev.map((w) => (
      w.chatId === chatId ? { ...w, minimized: false } : w
    )));
    setDrawerOpen(true);
  }, []);

  /** Åpne chat-skuff på kontakt-/tråd-oversikt — ikke gjenopprett siste samtale. */
  const openDrawer = useCallback(() => {
    setWindows([]);
    setComposeOpen(true);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setComposeOpen(false);
    // Nullstill tråd slik at neste åpning ikke hopper tilbake til siste chat.
    setWindows([]);
  }, []);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((open) => {
      if (open) {
        setComposeOpen(false);
        setWindows([]);
        return false;
      }
      // Alltid start på oversikten når brukeren åpner Chat.
      setWindows([]);
      setComposeOpen(true);
      return true;
    });
  }, []);

  useEffect(() => {
    registerChatDockBridge({
      openThread,
      isPreferred: () => preferred,
    });
    return () => registerChatDockBridge({ openThread: null, isPreferred: null });
  }, [openThread, preferred]);

  // Deep links queued before the dock mounted (or before auth) — open when ready.
  useEffect(() => {
    if (!preferred) return undefined;
    const flush = () => {
      const pending = consumePendingChatDockThread();
      if (pending) openThread(pending);
    };
    flush();
    return subscribePendingChatDockThread(() => flush());
  }, [preferred, openThread]);

  const value = useMemo(() => ({
    windows,
    composeOpen,
    setComposeOpen,
    drawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    openThread,
    closeThread,
    minimizeThread,
    restoreThread,
    preferred,
    mobileDrawer,
  }), [
    windows, composeOpen, drawerOpen, openDrawer, closeDrawer, toggleDrawer,
    openThread, closeThread, minimizeThread, restoreThread, preferred, mobileDrawer,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChatDock() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      windows: [],
      composeOpen: false,
      setComposeOpen: () => {},
      drawerOpen: false,
      openDrawer: () => {},
      closeDrawer: () => {},
      toggleDrawer: () => {},
      openThread: () => false,
      closeThread: () => {},
      minimizeThread: () => {},
      restoreThread: () => {},
      preferred: false,
      mobileDrawer: false,
      enabled: false,
    };
  }
  return { ...ctx, enabled: true };
}

/** True when dock/drawer should be used instead of full-screen ChatThread. */
export function useChatDockPreferred() {
  return Platform.OS === 'web';
}
