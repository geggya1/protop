import assert from 'node:assert/strict';
import { friendlyWebCameraError, needsCameraUserGesture } from './webCamera.js';

assert.equal(needsCameraUserGesture({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), true);
assert.equal(needsCameraUserGesture({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 }), false);
assert.equal(needsCameraUserGesture({ userAgent: 'Mozilla/5.0', platform: 'MacIntel', maxTouchPoints: 5 }), true);

const denied = friendlyWebCameraError({
  name: 'NotAllowedError',
  message: 'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.',
});
assert.equal(denied.title, 'Kameratilgang trengs');
assert.match(denied.body, /Åpne kamera/);

const insecure = friendlyWebCameraError(new Error('x'), { isSecureContext: false });
assert.equal(insecure.title, 'Usikker tilkobling');

const busy = friendlyWebCameraError({ name: 'NotReadableError', message: 'Could not start video source' });
assert.equal(busy.title, 'Kamera opptatt');

console.log('webCamera ok');
