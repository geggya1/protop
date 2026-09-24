/**
 * Layout helpers for immersive home photo backdrops.
 *
 * Built-in mobile banners are authored near 9:16 (≈0.563). Modern phones are
 * often taller (≈0.46). CSS/RN `cover` then zooms past the authored frame to
 * fill height. These helpers scale uniformly so the image fits the viewport
 * with the smallest zoom that still shows the full picture (contain).
 */

/**
 * @param {number} viewW
 * @param {number} viewH
 * @param {number} imageAspect width/height
 * @returns {{ left: number, top: number, width: number, height: number, scale: number }}
 */
export function containBackdropBox(viewW, viewH, imageAspect) {
  const vw = Math.max(1, Number(viewW) || 1);
  const vh = Math.max(1, Number(viewH) || 1);
  const ia = Math.max(0.05, Number(imageAspect) || 1);

  // Uniform scale that fits the entire image inside the viewport (min zoom).
  const scale = Math.min(vw / ia, vh / 1);
  const width = ia * scale;
  const height = 1 * scale;

  return {
    left: (vw - width) / 2,
    top: (vh - height) / 2,
    width,
    height,
    scale,
  };
}

/**
 * Same math as cover: fills the viewport, cropping overflow.
 * Kept for comparisons/tests — prefer containBackdropBox for home photos.
 */
export function coverBackdropBox(viewW, viewH, imageAspect) {
  const vw = Math.max(1, Number(viewW) || 1);
  const vh = Math.max(1, Number(viewH) || 1);
  const ia = Math.max(0.05, Number(imageAspect) || 1);

  const scale = Math.max(vw / ia, vh / 1);
  const width = ia * scale;
  const height = 1 * scale;

  return {
    left: (vw - width) / 2,
    top: (vh - height) / 2,
    width,
    height,
    scale,
  };
}

/**
 * How much larger cover is vs contain for this pair of aspects (≥ 1).
 * 1 = identical; ~1.22 on a tall phone with a 9:16 banner.
 */
export function backdropCoverZoomFactor(viewAspect, imageAspect) {
  const va = Math.max(0.05, Number(viewAspect) || 1);
  const ia = Math.max(0.05, Number(imageAspect) || 1);
  // cover/contain scale ratio = max(sW,sH)/min(sW,sH) with unit image height.
  const scaleW = va / ia;
  const scaleH = 1;
  const cover = Math.max(scaleW, scaleH);
  const contain = Math.min(scaleW, scaleH);
  return cover / contain;
}

/**
 * Resolve width/height from a RN Image source (require() or { uri }).
 * Returns null when size is unknown (remote URI without getSize yet).
 */
export function resolveSourceAspect(source, ImageModule) {
  if (!source) return null;
  if (typeof source === 'number' && ImageModule?.resolveAssetSource) {
    const resolved = ImageModule.resolveAssetSource(source);
    if (resolved?.width > 0 && resolved?.height > 0) {
      return resolved.width / resolved.height;
    }
  }
  if (source?.width > 0 && source?.height > 0) {
    return source.width / source.height;
  }
  return null;
}
