import { Linking, Platform } from 'react-native';

export function documentIsOpenable(doc) {
  return !!(doc?.dataUrl || doc?.url || doc?.uri || String(doc?.text || '').trim());
}

export function openAgreementDocument(doc) {
  const href = doc?.dataUrl || doc?.url || doc?.uri || '';
  if (href) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener,noreferrer');
      return true;
    }
    Linking.openURL(href).catch(() => {});
    return true;
  }
  if (doc?.text && Platform.OS === 'web' && typeof window !== 'undefined') {
    const blob = new Blob([doc.text], { type: 'text/plain;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}
