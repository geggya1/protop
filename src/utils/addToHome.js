export const ADD_HOME_DISMISS_KEY = 'weekplan_add_home_dismiss_v1';
export const ADD_HOME_SEEN_KEY = 'weekplan_add_home_seen_v1';

export const APP_INSTALL = {
  name: 'ProTop',
  host: 'protop.no',
  iconSrc: '/icons/icon-192.png',
};

export function detectMobileWebPlatform() {
  if (typeof navigator === 'undefined') {
    return { isWeb: false, isMobile: false, os: 'other', browser: 'other' };
  }
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIos || isAndroid || /Mobile/i.test(ua);
  let browser = 'other';
  if (/CriOS/i.test(ua)) browser = 'chrome-ios';
  else if (/FxiOS/i.test(ua)) browser = 'firefox-ios';
  else if (/EdgiOS/i.test(ua)) browser = 'edge-ios';
  else if (isIos && /Safari/i.test(ua)) browser = 'safari';
  else if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
  else if (/Edg\//i.test(ua)) browser = 'edge';
  else if (/Chrome/i.test(ua) && !/Edg\//i.test(ua)) browser = 'chrome';
  else if (/Firefox/i.test(ua)) browser = 'firefox';
  return {
    isWeb: true,
    isMobile,
    os: isIos ? 'ios' : isAndroid ? 'android' : 'other',
    browser,
  };
}

function isStandaloneDisplaySafe() {
  if (typeof window === 'undefined') return false;
  if (window.navigator?.standalone === true) return true;
  try {
    return window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  } catch {
    return false;
  }
}

export function shouldOfferAddToHome() {
  if (typeof window === 'undefined') return false;
  if (isStandaloneDisplaySafe()) return false;
  const { isMobile } = detectMobileWebPlatform();
  return isMobile;
}

export function wasAddHomeDismissed() {
  try {
    return !!window.localStorage.getItem(ADD_HOME_DISMISS_KEY);
  } catch {
    return false;
  }
}

export function dismissAddHome() {
  try {
    window.localStorage.setItem(ADD_HOME_DISMISS_KEY, '1');
  } catch { /* ignore */ }
}

export function markAddHomeSeen() {
  try {
    window.localStorage.setItem(ADD_HOME_SEEN_KEY, '1');
  } catch { /* ignore */ }
}

/**
 * Install overlay copy — Smartplan-style numbered steps with inline icons.
 * Each step.parts is a mix of { text } and { icon, label? } for inline UI glyphs.
 */
export function getInstallGuide(platform = detectMobileWebPlatform()) {
  if (platform.os === 'ios') {
    // Matches modern Safari/Chrome iOS bottom chrome: ⋮ → Del → Vis mer → Hjem-skjerm
    return {
      os: 'ios',
      title: 'Installer appen',
      steps: [
        {
          id: 'menu',
          parts: [
            { text: 'Trykk på ' },
            { icon: 'ellipsis-horizontal', chip: true },
            { text: ' for å åpne menyen' },
          ],
        },
        {
          id: 'share',
          parts: [
            { text: 'Trykk på ' },
            { icon: 'share-outline', chip: true },
            { text: ' Del og deretter på ' },
            { icon: 'chevron-down', chip: true },
            { text: ' Vis mer' },
          ],
        },
        {
          id: 'add',
          parts: [
            { text: 'Velg ' },
            { icon: 'add-outline', chip: true },
            { text: ' Legg til på Hjem-skjerm' },
          ],
        },
      ],
      footnote: 'Åpne ProTop fra hjemskjermen for å slå på push-varsler (iOS 16.4+).',
    };
  }

  // Android Chrome / Samsung Internet / Edge
  return {
    os: 'android',
    title: 'Installer appen',
    steps: [
      {
        id: 'menu',
        parts: [
          { text: 'Trykk på ' },
          { icon: 'ellipsis-vertical', chip: true },
          { text: ' øverst til høyre for å åpne menyen' },
        ],
      },
      {
        id: 'add',
        parts: [
          { text: 'Velg ' },
          { icon: 'download-outline', chip: true },
          { text: ' Installer app eller ' },
          { icon: 'phone-portrait-outline', chip: true },
          { text: ' Legg til på startskjerm' },
        ],
      },
      {
        id: 'confirm',
        parts: [
          { text: 'Bekreft med ' },
          { icon: 'checkmark-circle-outline', chip: true },
          { text: ' Installer / Legg til' },
        ],
      },
    ],
    footnote: 'Åpne snarveien fra startskjermen og godta varsler når ProTop ber om det.',
  };
}

/** @deprecated use getInstallGuide */
export function getAddToHomeSteps(platform = detectMobileWebPlatform()) {
  const guide = getInstallGuide(platform);
  return {
    title: guide.title,
    subtitle: guide.footnote,
    steps: guide.steps.map((s) => ({
      id: s.id,
      label: s.parts.map((p) => p.text || '').join('').trim(),
      hint: '',
      target: 'center',
      icon: s.parts.find((p) => p.icon)?.icon || 'phone-portrait-outline',
    })),
  };
}
