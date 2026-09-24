/** Must load before any onCall()/onSchedule() so region is not us-central1. */
import { setGlobalOptions } from 'firebase-functions/v2/options';

// invoker public: callable OPTIONS preflight from protop.no must not 403.
setGlobalOptions({ region: 'europe-west1', invoker: 'public' });
