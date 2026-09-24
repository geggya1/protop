export const MAIL_FOLDER_PANE_DEFAULT = 248;
export const MAIL_LIST_PANE_DEFAULT = 352;
export const MAIL_FOLDER_PANE_MIN = 180;
export const MAIL_FOLDER_PANE_MAX = 420;
export const MAIL_LIST_PANE_MIN = 240;
export const MAIL_LIST_PANE_MAX = 560;

export function clampMailPaneWidth(width, min, max) {
  const n = Number(width);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function applyMailPaneDrag(originWidth, dx, min, max) {
  return clampMailPaneWidth(originWidth + Number(dx || 0), min, max);
}
