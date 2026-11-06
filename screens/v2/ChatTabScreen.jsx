import React from 'react';
import { lazyScreen } from '../../src/ui/lazyScreen';
const ChatListScreen = lazyScreen(() => import('./ChatListScreen'), { name: 'ChatListScreen' });

/** Chat-fane — kompakt liste, header kommer fra ShellHeader. */
export default function ChatTabScreen() {
  return <ChatListScreen compactHeader showCompose />;
}
