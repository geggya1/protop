import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import WebImageCropperModal from '../WebImageCropperModal';
import { pickImage, uploadImage } from '../../src/utils/media';

function photoMessage(err) {
  const msg = String(err?.message || '');
  if (msg === 'library-denied' || msg === 'camera-denied') {
    return 'Gi tilgang til bilder for å laste opp.';
  }
  return msg || 'Kunne ikke laste opp bildet.';
}

/**
 * Velg bilde, beskjær (samme cropper som logo) og last opp til bedriftens lager.
 * choose() må kalles direkte fra et trykk, så filvelgeren på nett får lov.
 */
export function useCroppedUpload({
  familyId,
  folder,
  aspect = 16 / 9,
  aspectPair = [16, 9],
  aspects = null,
  title = 'Beskjær bilde',
  maxEdge = 1600,
}) {
  const [cropUri, setCropUri] = useState('');
  const [aspectValue, setAspectValue] = useState(aspect);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resolver = useRef(null);

  function finish(url, uri) {
    if (uri && String(uri).startsWith('blob:') && typeof URL !== 'undefined') {
      try { URL.revokeObjectURL(uri); } catch { /* ignore */ }
    }
    const done = resolver.current;
    resolver.current = null;
    setCropUri('');
    done?.(url || null);
  }

  async function upload(file) {
    const path = `families/${familyId}/${folder}/${Date.now()}.jpg`;
    return uploadImage(path, file);
  }

  function choose() {
    if (!familyId || busy || cropUri) return Promise.resolve(null);
    setError('');
    if (Platform.OS !== 'web') {
      setBusy(true);
      return pickImage({ edit: true, aspect: aspectPair })
        .then(async (picked) => {
          if (!picked) return null;
          return upload(picked);
        })
        .catch((err) => {
          setError(photoMessage(err));
          return null;
        })
        .finally(() => setBusy(false));
    }
    return new Promise((resolve) => {
      resolver.current = resolve;
      pickImage({ edit: false }).then((picked) => {
        if (!picked?.uri) {
          finish(null, '');
          return;
        }
        setAspectValue(aspect);
        setCropUri(picked.uri);
      }).catch((err) => {
        setError(photoMessage(err));
        finish(null, '');
      });
    });
  }

  async function confirmCrop(blob) {
    const uri = cropUri;
    if (!familyId) {
      finish(null, uri);
      return;
    }
    setBusy(true);
    try {
      const url = await upload(blob);
      finish(url, uri);
    } catch (err) {
      setError(photoMessage(err));
      finish(null, uri);
    } finally {
      setBusy(false);
    }
  }

  const modal = (
    <WebImageCropperModal
      visible={!!cropUri}
      imageUri={cropUri}
      aspect={aspectValue}
      aspects={aspects}
      onAspect={setAspectValue}
      title={title}
      output={{ type: 'image/jpeg', quality: 0.86, maxEdge }}
      onCancel={() => finish(null, cropUri)}
      onConfirm={confirmCrop}
    />
  );

  return { choose, busy: busy || !!cropUri, error, modal };
}
