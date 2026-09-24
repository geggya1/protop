/** Stay inside AppShell so the hamburger menu remains visible. */
export function openNotifications(nav) {
  nav?.navigate('Home', { openShell: { tab: 'more', subView: 'notifications' } });
}
