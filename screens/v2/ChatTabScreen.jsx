import React from 'react';
import ChatListScreen from './ChatListScreen';

/** Chat-fane — kompakt liste, header kommer fra ShellHeader. */
export default function ChatTabScreen() {
  return <ChatListScreen compactHeader showCompose />;
}
