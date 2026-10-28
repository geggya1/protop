import { Linking, Platform } from 'react-native';
import {
  AGREEMENT_IMPORT_ACCEPT,
  documentFileHref,
  documentHasOriginalFile,
  documentIsOpenable,
  documentLooksBinary,
  documentOfficeEmbedUrl,
  documentPreviewKind,
  documentPreviewLabel,
  documentSupportsOfficeEmbed,
  isActiveContentMime,
} from './documentAccess.js';
import {
  loadAgreementBytes,
  peekAgreementBlobUrl,
  publicHttpHref,
  rememberAgreementBlobUrl,
} from './documentFile.js';

export {
  AGREEMENT_IMPORT_ACCEPT,
  documentFileHref,
  documentHasOriginalFile,
  documentIsOpenable,
  documentLooksBinary,
  documentOfficeEmbedUrl,
  documentPreviewKind,
  documentPreviewLabel,
  documentSupportsOfficeEmbed,
};

function clickAnchor(href) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function writeTabMessage(tab, message) {
  try {
    tab.document.open();
    tab.document.write(`<!doctype html><title>Dokument</title><p style="font-family:sans-serif;padding:24px">${message}</p>`);
    tab.document.close();
  } catch {
    // Fanen kan være lukket.
  }
}

const OPEN_FAILED = 'Kunne ikke åpne originalfilen. Last den opp på nytt fra avtalen.';

/**
 * Åpner originalfilen i ny fane.
 * iOS Safari ignorerer window.open når tredje argument er noopener, og Chrome
 * nekter data:-URL-er. Vi åpner fanen i klikket og peker den til en blob-URL.
 */
export function openAgreementDocument(doc) {
  const direct = publicHttpHref(doc);
  const ready = peekAgreementBlobUrl(doc);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (ready) {
      const opened = window.open(ready, '_blank');
      if (opened) return true;
      try {
        clickAnchor(ready);
        return true;
      } catch {
        // fall through
      }
    }

    const tab = window.open('about:blank', '_blank');
    if (!tab && direct) {
      try {
        clickAnchor(direct);
        return true;
      } catch {
        return false;
      }
    }

    void (async () => {
      try {
        const file = await loadAgreementBytes(doc);
        const blobUrl = file ? rememberAgreementBlobUrl(doc, file) : '';
        // Blob-en fra opplastingen har filens egen type. HTML/SVG åpnes aldri derfra (samme opphav).
        const activeDoc = documentPreviewKind(doc) === 'html' || isActiveContentMime(doc?.mimeType) || /\.svg$/i.test(String(doc?.name || ''));
        const sessionBlob = !activeDoc && String(doc?.uri || '').startsWith('blob:') ? String(doc.uri) : '';
        const next = blobUrl || direct || sessionBlob;
        if (next && tab && !tab.closed) {
          try { tab.opener = null; } catch { /* ignore */ }
          tab.location.replace(next);
          return;
        }
        if (next) {
          clickAnchor(next);
          if (tab && !tab.closed) tab.close();
          return;
        }
        if (!documentLooksBinary(doc) && doc?.text && typeof Blob !== 'undefined') {
          const textUrl = URL.createObjectURL(new Blob([doc.text], { type: 'text/plain;charset=utf-8' }));
          if (tab && !tab.closed) tab.location.replace(textUrl);
          else clickAnchor(textUrl);
          return;
        }
        if (tab && !tab.closed) writeTabMessage(tab, OPEN_FAILED);
      } catch {
        if (direct && tab && !tab.closed) tab.location.replace(direct);
        else if (tab && !tab.closed) writeTabMessage(tab, OPEN_FAILED);
      }
    })();
    return !!tab || !!direct;
  }

  const href = direct || documentFileHref(doc);
  if (href && !href.startsWith('data:')) {
    Linking.openURL(href).catch(() => {});
    return true;
  }
  return false;
}
