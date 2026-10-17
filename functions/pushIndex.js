/**
 * Slim entry for CI: chat inbox backup without Secret Manager.
 */
import './setRegion.js';

export { onChatMessageCreated, onFriendChatMessageCreated } from './chatNotify.js';
