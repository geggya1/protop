import React, { useMemo } from 'react';
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

function WebIframe({ src, srcDoc, title }) {
  if (Platform.OS !== 'web') {
    return null;
  }
  return React.createElement('iframe', {
    title: title || 'Dokumentforhåndsvisning',
    src: src || undefined,
    srcDoc: srcDoc || undefined,
    style: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100%',
      border: 0,
      backgroundColor: '#e6ebf1',
      borderRadius: 8,
    },
  });
}

function DocumentBody({ doc, colors }) {
  const kind = documentPreviewKind(doc);
  const href = documentFileHref(doc);
  const label = documentPreviewLabel(kind);

  if (kind === 'pdf' && href && Platform.OS === 'web') {
    return (
      <PreviewFrame colors={colors} title={label}>
        <WebIframe src={href} title={doc.name || 'PDF'} />
      </PreviewFrame>
    );
  }

  if (kind === 'image' && href) {
    return (
      <PreviewFrame colors={colors} title={label}>
        <Image source={{ uri: href }} style={styles.image} resizeMode="contain" accessibilityLabel={doc.name || 'Bilde'} />
      </PreviewFrame>
    );
  }

  if (documentSupportsOfficeEmbed(doc) && Platform.OS === 'web') {
    return (
      <PreviewFrame colors={colors} title={label} minHeight={480}>
        <WebIframe src={documentOfficeEmbedUrl(doc)} title={doc.name || label} />
      </PreviewFrame>
    );
  }

  if (kind === 'html' && Platform.OS === 'web') {
    if (href && !href.startsWith('data:')) {
      return (
        <PreviewFrame colors={colors} title={label}>
          <WebIframe src={href} title={doc.name || 'HTML'} />
        </PreviewFrame>
      );
    }
    if (doc.text) {
      return (
        <PreviewFrame colors={colors} title={label}>
          <WebIframe srcDoc={String(doc.text)} title={doc.name || 'HTML'} />
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
    <PreviewFrame colors={colors}>
      <Text style={{ color: colors.muted, padding: 16 }}>
        Forhåndsvisning for {label.toLowerCase()} er ikke tilgjengelig her.
        {documentIsOpenable(doc) ? ' Åpne originalfilen i stedet.' : ''}
      </Text>
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
}) {
  const selected = useMemo(() => {
    if (!documents.length) return null;
    return documents.find((doc) => doc.id === selectedId) || documents[0];
  }, [documents, selectedId]);

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
          <TouchableOpacity
            onPress={() => openAgreementDocument(selected)}
            accessibilityRole="button"
          >
            <Text style={{ color: colors.brand }}>Åpne original</Text>
          </TouchableOpacity>
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
      ) : (
        <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={2}>
          {documentPreviewLabel(documentPreviewKind(selected))}
          {selected?.name ? ` · ${selected.name}` : ''}
          {documentHasOriginalFile(selected) ? '' : ' · mangler originalfil'}
        </Text>
      )}

      {selected ? <DocumentBody doc={selected} colors={colors} /> : null}
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
    position: 'relative',
    flex: 1,
  },
  image: { width: '100%', height: '100%', minHeight: 360 },
  textScroll: { flex: 1, maxHeight: 520 },
  textInner: { padding: 14 },
  fallbackHead: { paddingHorizontal: 14, paddingTop: 12, gap: 4 },
});
