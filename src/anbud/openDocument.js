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
} from './documentAccess.js';

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

export function openAgreementDocument(doc) {
  const href = documentFileHref(doc);
  if (href) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener,noreferrer');
      return true;
    }
    Linking.openURL(href).catch(() => {});
    return true;
  }
  // Binære avtalefiler uten original: ikke åpne ekstrahert tekst som «PDF».
  if (documentLooksBinary(doc)) return false;
  if (doc?.text && Platform.OS === 'web' && typeof window !== 'undefined') {
    const blob = new Blob([doc.text], { type: 'text/plain;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}
