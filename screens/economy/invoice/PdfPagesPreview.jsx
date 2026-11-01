/**
 * PDF-forhåndsvisning som bilder, for mobil og nettbrett i nettleseren.
 * Safari på iPhone/iPad (også som app på hjemskjermen) og Android viser ikke PDF i en iframe,
 * bare en hvit flate. Her tegnes sidene med pdf.js og vises som vanlige bilder.
 * pdf.js hentes fra unpkg første gang, slik kartene henter Leaflet.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { radius, type } from '../../../src/ui/tokens';

const PDFJS = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
const WORKER = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const MAX_PAGES = 10;

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('Kunne ikke hente PDF-visningen.'));
    document.head.appendChild(tag);
  });
}

/** pdf.js med arbeider fra en blob-URL (en arbeider fra et annet domene blokkeres av nettleseren). */
export function loadPdfJs() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Ingen nettleser.'));
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!loading) {
    loading = (async () => {
      await loadScript(PDFJS);
      const lib = window.pdfjsLib;
      if (!lib) throw new Error('PDF-visningen ble ikke lastet.');
      try {
        const res = await fetch(WORKER);
        const code = await res.text();
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      } catch {
        lib.GlobalWorkerOptions.workerSrc = WORKER;
      }
      return lib;
    })().catch((cause) => {
      loading = null;
      throw cause;
    });
  }
  return loading;
}

async function renderPages(url, width) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ url }).promise;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const pages = [];
  const count = Math.min(doc.numPages, MAX_PAGES);
  for (let number = 1; number <= count; number += 1) {
    const page = await doc.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push({ number, src: canvas.toDataURL('image/png'), aspect: viewport.height / viewport.width });
    page.cleanup?.();
  }
  const more = doc.numPages - count;
  doc.destroy?.();
  return { pages, more };
}

export default function PdfPagesPreview({ url, colors, onFailed }) {
  const [width, setWidth] = useState(0);
  const [state, setState] = useState({ url: '', pages: [], more: 0, error: '' });

  useEffect(() => {
    if (!url || !width) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      renderPages(url, width)
        .then((result) => { if (live) setState({ url, ...result, error: '' }); })
        .catch((cause) => {
          if (!live) return;
          setState({ url, pages: [], more: 0, error: String(cause?.message || cause) });
          onFailed?.();
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [url, width]);

  const ready = state.url === url && state.pages.length;
  return (
    <View
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next && Math.abs(next - width) > 8) setWidth(next);
      }}
      style={{ gap: 8 }}
      nativeID="invoice-preview-pages"
    >
      {!ready && !state.error ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      ) : null}
      {ready ? state.pages.map((page) => (
        <View key={page.number} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.control, overflow: 'hidden', backgroundColor: '#fff' }}>
          {React.createElement('img', {
            src: page.src,
            alt: `Side ${page.number}`,
            style: { display: 'block', width: '100%', height: 'auto' },
          })}
        </View>
      )) : null}
      {ready && state.more > 0 ? (
        <Text style={[type.caption, { color: colors.muted }]}>{`${state.more} sider til. Åpne PDF-en for å se alt.`}</Text>
      ) : null}
    </View>
  );
}
