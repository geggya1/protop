import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  documentFileHref,
  documentHasOriginalFile,
  documentIsOpenable,
  documentOfficeEmbedUrl,
  documentPreviewKind,
  documentPreviewLabel,
  documentSupportsOfficeEmbed,
} from '../../src/anbud/documentAccess';
import {
  loadAgreementBytes,
  peekAgreementBlobUrl,
  publicHttpHref,
  rememberAgreementBlobUrl,
} from '../../src/anbud/documentFile';
import { openAgreementDocument } from '../../src/anbud/openDocument';

function PreviewFrame({ title, children, colors, minHeight = 420 }) {
  return (
    <View style={[styles.frame, { borderColor: colors.line, backgroundColor: colors.sunken || colors.bg, minHeight }]}>
      {children || (
        <Text style={{ color: colors.muted, padding: 16 }}>{title || 'Ingen forhåndsvisning'}</Text>
      )}
    </View>
  );
}

function TextPreview({ text, colors }) {
  const body = String(text || '').trim();
  if (!body) {
    return <Text style={{ color: colors.muted, padding: 16 }}>Ingen tekst å vise i denne filen.</Text>;
  }
  return (
    <ScrollView style={styles.textScroll} contentContainerStyle={styles.textInner}>
      <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20, fontFamily: Platform.OS === 'web' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}>
        {body}
      </Text>
    </ScrollView>
  );
}

function WebIframe({ src, srcDoc, title, minHeight = 420 }) {
  if (Platform.OS !== 'web' || (!src && !srcDoc)) {
    return null;
  }
  return React.createElement('iframe', {
    title: title || 'Dokumentforhåndsvisning',
    src: src || undefined,
    srcDoc: srcDoc || undefined,
    style: {
      display: 'block',
      width: '100%',
      height: `${minHeight}px`,
      border: 0,
      backgroundColor: '#fff',
    },
  });
}

function previewKey(doc) {
  if (!doc) return '';
  return [
    doc.id || '',
    doc.url || '',
    doc.storagePath || '',
    doc.uri || '',
    doc.size || 0,
    doc.mimeType || '',
    String(doc.dataUrl || '').length,
    doc.name || '',
  ].join('|');
}

function useAgreementPreview(doc) {
  const kind = documentPreviewKind(doc);
  const embedLocally = kind === 'pdf' || kind === 'image' || kind === 'html';
  const key = previewKey(doc);
  const [state, setState] = useState({ status: 'idle', src: '', message: '' });

  useEffect(() => {
    if (!doc || !embedLocally) {
      setState({ status: 'idle', src: '', message: '' });
      return undefined;
    }
    let cancelled = false;
    const cached = peekAgreementBlobUrl(doc);
    const http = publicHttpHref(doc);
    setState(cached
      ? { status: 'ready', src: cached, message: '' }
      : { status: 'loading', src: '', message: '' });
    const timer = setTimeout(() => {
      if (cancelled || cached) return;
      setState((current) => (
        current.status === 'loading'
          ? {
            status: http ? 'remote' : 'error',
            src: http,
            message: http
              ? 'Forhåndsvisningen lot seg ikke hente inn. Bruk Åpne original.'
              : 'Originalfilen er ikke tilgjengelig. Last den opp på nytt.',
          }
          : current
      ));
    }, 20000);
    loadAgreementBytes(doc).then((file) => {
      if (cancelled) return;
      if (file?.bytes) {
        const src = rememberAgreementBlobUrl(doc, file) || http;
        if (src) {
          setState({ status: 'ready', src, message: '' });
          return;
        }
      }
      setState({
        status: http ? 'remote' : 'error',
        src: http,
        message: http
          ? 'Forhåndsvisningen lot seg ikke hente inn. Bruk Åpne original.'
          : 'Originalfilen er ikke tilgjengelig. Last den opp på nytt.',
      });
    }).catch(() => {
      if (cancelled) return;
      setState({
        status: http ? 'remote' : 'error',
        src: http,
        message: http
          ? 'Forhåndsvisningen lot seg ikke hente inn. Bruk Åpne original.'
          : 'Originalfilen er ikke tilgjengelig. Last den opp på nytt.',
      });
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, embedLocally]);

  return state;
}

export function AgreementOriginalLink({ doc, colors, label = 'Åpne original', previewSrc = '', style }) {
  const href = previewSrc || peekAgreementBlobUrl(doc) || publicHttpHref(doc);
  if (Platform.OS === 'web' && href) {
    return React.createElement('a', {
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      style: { color: colors.brand, textDecoration: 'none', ...(style || {}) },
      onClick: (event) => {
        const fresh = peekAgreementBlobUrl(doc);
        if (fresh && href === fresh) return;
        event.preventDefault();
        openAgreementDocument(doc);
      },
    }, label);
  }
  return (
    <TouchableOpacity onPress={() => openAgreementDocument(doc)} accessibilityRole="button">
      <Text style={{ color: colors.brand }}>{label}</Text>
    </TouchableOpacity>
  );
}

function DocumentBody({ doc, colors, preview, minHeight = 420, onUploadOriginal }) {
  const kind = documentPreviewKind(doc);
  const href = preview?.src || documentFileHref(doc);
  const label = documentPreviewLabel(kind);
  const localKind = kind === 'pdf' || kind === 'image' || kind === 'html';

  if (localKind && preview?.status === 'loading') {
    return (
      <PreviewFrame colors={colors} title={label} minHeight={minHeight}>
        <Text style={{ color: colors.muted, padding: 16 }}>Henter dokumentet…</Text>
      </PreviewFrame>
    );
  }

  if (kind === 'pdf' && Platform.OS === 'web' && href) {
    return (
      <PreviewFrame colors={colors} title={label} minHeight={minHeight}>
        {preview?.message ? (
          <Text style={{ color: colors.muted, padding: 16 }}>{preview.message}</Text>
        ) : null}
        <WebIframe src={href} title={doc.name || 'PDF'} minHeight={minHeight} />
      </PreviewFrame>
    );
  }

  if (kind === 'image' && href) {
    return (
      <PreviewFrame colors={colors} title={label} minHeight={minHeight}>
        <Image source={{ uri: href }} style={styles.image} resizeMode="contain" accessibilityLabel={doc.name || 'Bilde'} />
      </PreviewFrame>
    );
  }

  if (documentSupportsOfficeEmbed(doc) && Platform.OS === 'web') {
    return (
      <PreviewFrame colors={colors} title={label} minHeight={Math.max(minHeight, 480)}>
        <WebIframe src={documentOfficeEmbedUrl(doc)} title={doc.name || label} minHeight={Math.max(minHeight, 480)} />
      </PreviewFrame>
    );
  }

  if (kind === 'html' && Platform.OS === 'web') {
    if (href && !href.startsWith('data:')) {
      return (
        <PreviewFrame colors={colors} title={label} minHeight={minHeight}>
          <WebIframe src={href} title={doc.name || 'HTML'} minHeight={minHeight} />
        </PreviewFrame>
      );
    }
    if (doc.text) {
      return (
        <PreviewFrame colors={colors} title={label} minHeight={minHeight}>
          <WebIframe srcDoc={String(doc.text)} title={doc.name || 'HTML'} minHeight={minHeight} />
        </PreviewFrame>
      );
    }
  }

  if (kind === 'email' || kind === 'text' || kind === 'word' || kind === 'excel' || kind === 'other') {
    return (
      <PreviewFrame colors={colors} title={label}>
        <View style={styles.fallbackHead}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{label}-forhåndsvisning</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {href && ['word', 'excel', 'powerpoint'].includes(kind)
              ? 'Originalfilen er lagret. Forhåndsvisningen viser lest tekst når Office-visning ikke er tilgjengelig.'
              : kind === 'email'
                ? 'E-postinnholdet vises som tekst.'
                : 'Viser tilgjengelig tekst fra dokumentet.'}
          </Text>
        </View>
        <TextPreview text={doc.text} colors={colors} />
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame colors={colors} minHeight={minHeight}>
      <Text style={{ color: colors.muted, padding: 16 }}>
        {preview?.message || `Forhåndsvisning for ${label.toLowerCase()} er ikke tilgjengelig her.`}
        {!preview?.message && documentIsOpenable(doc) ? ' Åpne originalfilen i stedet.' : ''}
      </Text>
      {preview?.status === 'error' && onUploadOriginal ? (
        <TouchableOpacity onPress={() => onUploadOriginal(doc)} accessibilityRole="button" style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Text style={{ color: colors.brand }}>Last opp originalfil</Text>
        </TouchableOpacity>
      ) : null}
    </PreviewFrame>
  );
}

/**
 * Høyre panel ved registrering av avtale: forhåndsvis første dokument,
 * bytt mellom flere vedlegg (PDF, Word, Excel, e-post, bilde, tekst).
 */
export default function AgreementDocumentPreview({
  colors,
  documents = [],
  selectedId = '',
  onSelect,
  minHeight = 420,
  onUploadOriginal,
}) {
  const selected = useMemo(() => {
    if (!documents.length) return null;
    return documents.find((doc) => doc.id === selectedId) || documents[0];
  }, [documents, selectedId]);
  const preview = useAgreementPreview(selected);

  if (!documents.length) {
    return (
      <View style={[styles.pane, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Dokument</Text>
        <Text style={{ color: colors.muted, lineHeight: 20 }}>
          Last opp avtalen for å lagre originalfilen og se forhåndsvisning her. PDF, Word, Excel, e-post og vanlige bilder/tekstfiler støttes.
        </Text>
        <PreviewFrame colors={colors} minHeight={minHeight}>
          <Text style={{ color: colors.muted, padding: 16 }}>Ingen fil er lastet opp ennå.</Text>
        </PreviewFrame>
      </View>
    );
  }

  return (
    <View style={[styles.pane, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.ink }]}>Dokument</Text>
        {selected && documentIsOpenable(selected) ? (
          <AgreementOriginalLink doc={selected} colors={colors} previewSrc={preview.src} />
        ) : null}
      </View>

      {documents.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {documents.map((doc, index) => {
            const on = (selected?.id || '') === doc.id;
            const kind = documentPreviewKind(doc);
            return (
              <TouchableOpacity
                key={doc.id}
                onPress={() => onSelect?.(doc.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  styles.tab,
                  {
                    borderColor: on ? colors.brand : colors.line,
                    backgroundColor: on ? (colors.brandSoft || colors.bg) : colors.bg,
                  },
                ]}
              >
                <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: on ? '600' : '400' }} numberOfLines={1}>
                  {index === 0 ? 'Hoved' : `Vedlegg ${index}`}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                  {documentPreviewLabel(kind)} · {doc.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : selected && documentIsOpenable(selected) ? (
        <AgreementOriginalLink
          doc={selected}
          colors={colors}
          previewSrc={preview.src}
          style={{ fontSize: 13 }}
          label={`${documentPreviewLabel(documentPreviewKind(selected))} · ${selected.name || 'Dokument'}${documentHasOriginalFile(selected) ? '' : ' · mangler originalfil'}`}
        />
      ) : (
        <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={2}>
          {documentPreviewLabel(documentPreviewKind(selected))}
          {selected?.name ? ` · ${selected.name}` : ''}
          {documentHasOriginalFile(selected) ? '' : ' · mangler originalfil'}
        </Text>
      )}

      {selected ? (
        <DocumentBody
          doc={selected}
          colors={colors}
          preview={preview}
          minHeight={minHeight}
          onUploadOriginal={onUploadOriginal}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  tabs: { gap: 8, paddingVertical: 2 },
  tab: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 220,
    gap: 2,
  },
  frame: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  image: { width: '100%', height: '100%', minHeight: 360 },
  textScroll: { flex: 1, maxHeight: 520 },
  textInner: { padding: 14 },
  fallbackHead: { paddingHorizontal: 14, paddingTop: 12, gap: 4 },
});
