/**
 * iOS Home Screen web apps keep an in-app window only while navigation stays
 * on the install origin and inside the manifest scope. A full document load
 * onto another host (protop.no ↔ www.protop.no) is a different origin, and
 * iOS presents that page in Safari View Controller: address bar, share,
 * reload and the compass that opens Safari. The app's own bottom menu is
 * then the page inside that browser, covered by the system toolbar.
 */

export function isProtopAppHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return host === 'protop.no' || host === 'www.protop.no';
}

/**
 * Apex → www was added so OAuth matched one registered origin. In an
 * installed web app that hop is a new origin, so iOS leaves standalone.
 * Safari tabs can still bounce. The installed app must stay on the host
 * the icon was added from.
 */
export function shouldBounceApexToWww({ hostname, standalone } = {}) {
  if (standalone) return false;
  return String(hostname || '').toLowerCase() === 'protop.no';
}

/** Keep protop.no and www.protop.no on the host that is already open. */
export function urlOnCurrentHost(target, currentHref) {
  const current = new URL(currentHref);
  const next = new URL(target, current);
  if (
    isProtopAppHost(current.hostname)
    && isProtopAppHost(next.hostname)
    && next.hostname !== current.hostname
  ) {
    next.protocol = current.protocol;
    next.hostname = current.hostname;
    next.port = current.port;
  }
  return next;
}

/**
 * Cold start of an installed app must not call location.replace. That starts
 * a new document. iOS opens it in Safari View Controller when it is not the
 * captured start URL. history.replaceState stays in the same web app.
 * Ordinary Safari tabs keep the full navigation.
 */
export function bootNavigationKind({ standalone } = {}) {
  return standalone ? 'replaceState' : 'replace';
}

export function applyBootNavigation(win, path, { standalone } = {}) {
  const next = urlOnCurrentHost(path, win.location.href);
  const same = next.pathname === win.location.pathname
    && next.search === (win.location.search || '')
    && next.hash === (win.location.hash || '')
    && next.hostname === win.location.hostname;
  if (same) return { kind: 'none', href: next.href };
  const kind = bootNavigationKind({ standalone });
  const relative = `${next.pathname}${next.search}${next.hash}`;
  if (kind === 'replaceState') {
    win.history.replaceState(win.history.state || {}, '', relative);
    return { kind, href: relative };
  }
  win.location.replace(next.href);
  return { kind, href: next.href };
}

export function launchDiagnostics(win) {
  const nav = win.navigator || {};
  let displayStandalone = false;
  let displayFullscreen = false;
  try {
    displayStandalone = win.matchMedia?.('(display-mode: standalone)')?.matches === true;
    displayFullscreen = win.matchMedia?.('(display-mode: fullscreen)')?.matches === true;
  } catch { /* ignore */ }
  const manifest = win.document?.querySelector?.('link[rel="manifest"]')?.href || '';
  return {
    href: win.location?.href || '',
    origin: win.location?.origin || '',
    manifest,
    navigatorStandalone: nav.standalone === true,
    displayModeStandalone: displayStandalone,
    displayModeFullscreen: displayFullscreen,
    standalone: nav.standalone === true || displayStandalone || displayFullscreen,
  };
}

/**
 * Installed app: internal ProTop links stay on this host and in this window.
 * Other sites (OAuth, payment, files on another origin) are left alone.
 */
export function installStandaloneNavigationGuard(win) {
  if (!win || win.__protopPwaGuard) return;
  win.__protopPwaGuard = true;
  const diag = launchDiagnostics(win);
  try {
    win.console?.info?.('[protop-pwa]', diag);
  } catch { /* ignore */ }

  const standaloneNow = () => launchDiagnostics(win).standalone;

  win.document?.addEventListener?.('click', (event) => {
    if (!standaloneNow()) return;
    const el = event.target?.closest ? event.target : event.target?.parentElement;
    const anchor = el?.closest?.('a[href]');
    if (!anchor) return;
    const raw = anchor.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^(mailto:|tel:|sms:)/i.test(raw)) return;
    let url;
    try { url = new URL(raw, win.location.href); } catch { return; }
    if (!isProtopAppHost(url.hostname)) return;
    const same = urlOnCurrentHost(url, win.location.href);
    const blank = String(anchor.getAttribute('target') || '').toLowerCase() === '_blank';
    const hostChanged = same.hostname !== url.hostname;
    if (!blank && !hostChanged) return;
    event.preventDefault();
    win.location.assign(`${same.pathname}${same.search}${same.hash}`);
  }, true);

  if (typeof win.open === 'function') {
    const origOpen = win.open.bind(win);
    win.open = (url, target, features) => {
      if (!standaloneNow() || url == null || url === '') return origOpen(url, target, features);
      try {
        const next = new URL(url, win.location.href);
        if (isProtopAppHost(win.location.hostname) && isProtopAppHost(next.hostname)) {
          const same = urlOnCurrentHost(next, win.location.href);
          if (same.hostname !== next.hostname) {
            win.location.assign(same.href);
            return null;
          }
        }
      } catch { /* external or invalid — keep the original open */ }
      return origOpen(url, target, features);
    };
  }
}
