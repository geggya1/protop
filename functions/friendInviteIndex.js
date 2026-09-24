/**
 * Deploy entry for friend features without Secret Manager.
 * sendFriendInviteV2 / Sms use WEEKPLAN_MAIL_KEY (CI /.env), not defineSecret('MAIL_API_KEY').
 */
import { setGlobalOptions } from 'firebase-functions/v2/options';

setGlobalOptions({ region: 'europe-west1' });

export { lookupFriendProfile } from './friendLookup.js';
export {
  sendFriendInviteV2,
  sendFriendInviteSmsV2,
} from './friendInvite.js';
export {
  listMyFriends,
  listFriendsForUid,
  listFriendRequests,
  listOutgoingFriendRequests,
  createFriendRequestAdmin,
  respondFriendRequestAdmin,
  withdrawFriendRequestAdmin,
  dismissOutgoingFriendRequestAdmin,
  resendFriendRequestAdmin,
  removeFriendAdmin,
  sendFriendChatAdmin,
  listFriendChatMessagesAdmin,
  createPendingFriendInviteAdmin,
  claimFriendInviteAdmin,
  shareWithFriendsAdmin,
  listSharedAlbumsAdmin,
  listSharedWishlistsAdmin,
  respondFriendGameInviteAdmin,
  notifyFriendGameInvitesAdmin,
} from './friendCallables.js';
