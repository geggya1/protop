import React, { useCallback } from 'react';
import BarcodeScannerModal from './BarcodeScannerModal';
import { isValidIsbn, normalizeIsbn } from '../src/utils/isbn';

export default function IsbnScannerModal({ visible, onClose, onScan }) {
  const normalize = useCallback((raw) => {
    const normalized = normalizeIsbn(raw);
    return isValidIsbn(normalized) ? normalized : null;
  }, []);

  const handleScan = useCallback((isbn) => {
    onScan?.(isbn);
  }, [onScan]);

  return (
    <BarcodeScannerModal
      visible={visible}
      onClose={onClose}
      onScan={handleScan}
      title="Skann ISBN"
      hint="Hold strekkoden (ISBN) i rammen. Skanning skjer automatisk."
      permissionText="Vi trenger kamera for å lese ISBN-strekkoden på boka."
      normalize={normalize}
    />
  );
}
