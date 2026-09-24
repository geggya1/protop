/** Country dial codes for phone input (E.164-ready). */
export const PHONE_COUNTRIES = [
  { code: 'NO', dial: '+47', name: 'Norge', flag: '🇳🇴' },
  { code: 'SE', dial: '+46', name: 'Sverige', flag: '🇸🇪' },
  { code: 'DK', dial: '+45', name: 'Danmark', flag: '🇩🇰' },
  { code: 'FI', dial: '+358', name: 'Finland', flag: '🇫🇮' },
  { code: 'IS', dial: '+354', name: 'Island', flag: '🇮🇸' },
  { code: 'GB', dial: '+44', name: 'Storbritannia', flag: '🇬🇧' },
  { code: 'DE', dial: '+49', name: 'Tyskland', flag: '🇩🇪' },
  { code: 'NL', dial: '+31', name: 'Nederland', flag: '🇳🇱' },
  { code: 'BE', dial: '+32', name: 'Belgia', flag: '🇧🇪' },
  { code: 'FR', dial: '+33', name: 'Frankrike', flag: '🇫🇷' },
  { code: 'ES', dial: '+34', name: 'Spania', flag: '🇪🇸' },
  { code: 'IT', dial: '+39', name: 'Italia', flag: '🇮🇹' },
  { code: 'PL', dial: '+48', name: 'Polen', flag: '🇵🇱' },
  { code: 'US', dial: '+1', name: 'USA / Canada', flag: '🇺🇸' },
  { code: 'AU', dial: '+61', name: 'Australia', flag: '🇦🇺' },
];

const DIAL_SORTED = [...PHONE_COUNTRIES].sort(
  (a, b) => b.dial.replace(/\D/g, '').length - a.dial.replace(/\D/g, '').length,
);

export const DEFAULT_DIAL_BY_LANG = {
  nb: '+47',
  da: '+45',
  sv: '+46',
  fi: '+358',
  pl: '+48',
  en: '+47',
  es: '+34',
  fr: '+33',
  de: '+49',
};

export function defaultDialCode(lang) {
  return DEFAULT_DIAL_BY_LANG[lang] || '+47';
}

export function parsePhoneInput(dialCode, national) {
  const digits = String(national || '').replace(/\D/g, '');
  const dialDigits = String(dialCode || '+47').replace(/\D/g, '');
  if (!digits) return '';
  return `+${dialDigits}${digits}`;
}

export function splitPhone(phone, fallbackDial = '+47') {
  const raw = String(phone || '').trim();
  if (!raw) return { dialCode: fallbackDial, national: '' };

  if (raw.startsWith('+')) {
    const allDigits = raw.replace(/\D/g, '');
    for (const c of DIAL_SORTED) {
      const d = c.dial.replace(/\D/g, '');
      if (allDigits.startsWith(d) && allDigits.length > d.length) {
        return { dialCode: c.dial, national: allDigits.slice(d.length) };
      }
    }
    return { dialCode: fallbackDial, national: allDigits };
  }

  return { dialCode: fallbackDial, national: raw.replace(/\D/g, '') };
}

export function normalizePhone(phone, fallbackDial = '+47') {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : '';
  }
  return parsePhoneInput(fallbackDial, raw);
}

/** Valid E.164 number (8–15 digits including country code). */
export function isValidPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw.startsWith('+')) return false;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

/** Accept E.164 or legacy local numbers with 8+ digits. */
export function hasValidPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return false;
  if (raw.startsWith('+')) return isValidPhone(raw);
  return raw.replace(/\D/g, '').length >= 8;
}
