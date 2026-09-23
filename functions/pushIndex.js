/**
 * Slim entry for CI: chat inbox backup without Secret Manager.
 */
import { setGlobalOptions } from 'firebase-functions/v2/options';

setGlobalOptions({
  region: 'europe-west1',
});

export { onChatMessageCreated, onFriendChatMessageCreated } from './chatNotify.js';
