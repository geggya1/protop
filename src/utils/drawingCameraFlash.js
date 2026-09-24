/**
 * Flash-modus for tegningskamera (Av / Auto / På konstant).
 */

export const FLASH_MODES = ['off', 'auto', 'on'];

/** @typedef {'off'|'auto'|'on'} FlashMode */

export function nextFlashMode(current) {
  const i = FLASH_MODES.indexOf(current);
  return FLASH_MODES[(i < 0 ? 0 : i + 1) % FLASH_MODES.length];
}

export function flashModeLabel(mode) {
  if (mode === 'on') return 'Blitz: På (konstant)';
  if (mode === 'auto') return 'Blitz: Auto';
  return 'Blitz: Av';
}

export function flashModeIcon(mode) {
  if (mode === 'on') return 'flashlight';
  if (mode === 'auto') return 'flash';
  return 'flash-off';
}

/**
 * Skru torch på/av via MediaStreamTrack (web). Returnerer false hvis ikke støttet.
 * @param {MediaStreamTrack|null|undefined} track
 * @param {boolean} on
 */
export async function setWebTorch(track, on) {
  if (!track || typeof track.applyConstraints !== 'function') return false;
  try {
    const caps = typeof track.getCapabilities === 'function'
      ? track.getCapabilities()
      : {};
    if (caps && Object.prototype.hasOwnProperty.call(caps, 'torch') && !caps.torch) {
      return false;
    }
    await track.applyConstraints({ advanced: [{ torch: !!on }] });
    return true;
  } catch {
    return false;
  }
}

export function webTorchSupported(track) {
  if (!track || typeof track.getCapabilities !== 'function') return false;
  try {
    const caps = track.getCapabilities() || {};
    return !!caps.torch;
  } catch {
    return false;
  }
}
