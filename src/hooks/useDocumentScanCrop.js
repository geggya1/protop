/**
 * Hook: vis DrawingCropModal (auto-ramme) før opplasting av bilde-dokumenter.
 * PDF/andre filer returneres uendret. På native uten canvas hoppes modal over
 * og autoCrop kjøres best-effort via processDrawingImage.
 */
import React, { useCallback, useRef, useState } from 'react';
import DrawingCropModal from '../../components/DrawingCropModal';
import {
  applyDocumentScanCrop,
  canInteractiveScanCrop,
  isImageUpload,
  readPickedBlob,
} from '../utils/documentScanCrop';

/**
 * @param {{ title?: string }} [opts]
 */
export function useDocumentScanCrop({
  title = 'Juster utsnitt',
} = {}) {
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);

  const clearSession = useCallback(() => {
    const cur = sessionRef.current;
    if (cur?.revoke && cur?.uri && typeof URL !== 'undefined') {
      try { URL.revokeObjectURL(cur.uri); } catch { /* ignore */ }
    }
    sessionRef.current = null;
    setSession(null);
  }, []);

  /**
   * Kjør crop-UI for bilder (web). Returnerer cropped pick, original for
   * ikke-bilder, eller null hvis brukeren avbryter.
   * @param {object} picked
   * @returns {Promise<object|null>}
   */
  const prepareUpload = useCallback(async (picked) => {
    if (!picked) return null;
    if (!isImageUpload(picked)) return picked;

    // Native / ingen canvas: auto-crop best-effort uten modal.
    if (!canInteractiveScanCrop()) {
      return applyDocumentScanCrop(picked, { autoCrop: true });
    }

    const blob = await readPickedBlob(picked);
    if (!blob) return picked;

    let uri = picked.uri || null;
    let revoke = false;
    if (!uri && typeof URL !== 'undefined') {
      uri = URL.createObjectURL(blob);
      revoke = true;
    }

    return new Promise((resolve) => {
      const next = {
        uri,
        blob,
        revoke,
        source: picked,
        resolve,
      };
      sessionRef.current = next;
      setSession(next);
    });
  }, []);

  /**
   * Forbered flere filer sekvensielt (bilder får crop én og én).
   * @param {object[]} items
   * @returns {Promise<object[]>}
   */
  const prepareUploads = useCallback(async (items) => {
    const list = Array.isArray(items) ? items : [];
    const out = [];
    for (const item of list) {
      const ready = await prepareUpload(item);
      if (ready) out.push(ready);
    }
    return out;
  }, [prepareUpload]);

  const onCancel = useCallback(() => {
    const cur = sessionRef.current;
    clearSession();
    cur?.resolve?.(null);
  }, [clearSession]);

  const onConfirm = useCallback(async ({ cropQuad, cropRect, blob, uri }) => {
    const cur = sessionRef.current;
    if (!cur) return;
    try {
      const cropped = await applyDocumentScanCrop({
        blob: blob || cur.blob,
        uri: uri || cur.uri,
        name: cur.source?.name,
        mimeType: cur.source?.mimeType,
      }, {
        cropQuad: cropQuad || null,
        cropRect: cropRect || null,
        autoCrop: false,
      });
      clearSession();
      cur.resolve(cropped);
    } catch (err) {
      clearSession();
      cur.resolve(null);
      throw err;
    }
  }, [clearSession]);

  const cropModal = (
    <DrawingCropModal
      visible={!!session}
      imageUri={session?.uri}
      imageBlob={session?.blob}
      title={title}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );

  return {
    prepareUpload,
    prepareUploads,
    cropModal,
    cropping: !!session,
  };
}
