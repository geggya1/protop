import { touch } from './tokens.js';

/**
 * Trykkflate på minst touch.min (44 × 44) rundt noe som ser mindre ut (UX-26).
 *
 * Native bruker hitSlop. RN-web tegner ikke hitSlop (flaten blir like liten som ikonet),
 * så på web blir boksen større med padding og like stor negativ margin: knappen ser lik ut
 * og tar like mye plass i raden, men fingeren treffer 44 × 44.
 *
 * width/height: innholdet (ikonet) uten egen padding. inset: padding knappen har fra før
 * (den erstattes, og marginen regnes slik at plassen i raden blir den samme).
 * fixed: knappen har fast width/height uten bakgrunn; da blir selve boksen 44 × 44.
 * Knapper med bakgrunn eller ramme legger stilen på en gjennomsiktig ytre trykkflate
 * og tegner sirkelen inni.
 * touch: bare på berøringsskjerm (useLayout().isTouch); med mus er alt som før.
 */
export function touchHit(width, height = width, {
  touch: on = true, os = 'web', inset = 0, fixed = false, min = touch.min,
} = {}) {
  const none = { style: null, hitSlop: undefined };
  if (!on) return none;
  const x = Math.max(0, Math.ceil((min - width) / 2));
  const y = Math.max(0, Math.ceil((min - height) / 2));
  if (x <= inset && y <= inset) return none;
  const padX = Math.max(x, inset);
  const padY = Math.max(y, inset);
  if (os !== 'web') {
    return { style: null, hitSlop: { top: padY - inset, bottom: padY - inset, left: padX - inset, right: padX - inset } };
  }
  if (fixed) {
    return {
      style: {
        width: Math.max(width, min),
        height: Math.max(height, min),
        marginHorizontal: -x,
        marginVertical: -y,
      },
      hitSlop: undefined,
    };
  }
  return {
    style: {
      paddingHorizontal: padX,
      paddingVertical: padY,
      marginHorizontal: inset - padX,
      marginVertical: inset - padY,
    },
    hitSlop: undefined,
  };
}
