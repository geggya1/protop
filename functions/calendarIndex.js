/**
 * Deploy entry for calendar functions only.
 * Does not import MAIL_API_KEY / GEMINI_API_KEY, so GitHub's deploy SA can
 * update Outlook sync without Secret Manager access.
 */
import { setGlobalOptions } from 'firebase-functions/v2/options';

setGlobalOptions({ region: 'europe-west1', invoker: 'public' });

export {
  addIcsCalendar,
  exchangeCalendarOAuth,
  exchangeMicrosoftSignIn,
  fetchExternalCalendarEvents,
  getCalendarOAuthConfig,
  listCalendarConnections,
  removeCalendarConnection,
  listMailFolders,
  listMailMessages,
  syncOutlookMailbox,
  getMailMessage,
  sendOutlookMail,
  replyOutlookMail,
  forwardOutlookMail,
  deleteOutlookMail,
} from './calendarCallables.js';
