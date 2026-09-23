/** Bridge så varselmeny / toast kan gjenåpne bursdagsforberedelse-popup. */

let resumeFn = null;

export function registerBirthdayPrepResume(fn) {
  resumeFn = typeof fn === 'function' ? fn : null;
}

export function requestBirthdayPrepResume(payload = {}) {
  if (typeof resumeFn !== 'function') return false;
  resumeFn(payload);
  return true;
}
