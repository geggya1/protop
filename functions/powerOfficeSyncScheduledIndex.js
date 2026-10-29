/**
 * Automatisk synk mot PowerOffice Go: betaling, fakturanummer og KID oppdateres uten at
 * noen trykker «Synk nå». Egen inngang slik at scheduler ikke ligger i samme deploy som
 * de kallbare funksjonene (se scripts/deploy-slim-functions.sh).
 */
import './setRegion.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { syncAllCompanies } from './powerOffice.js';

export const powerOfficeSyncScheduled = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Europe/Oslo',
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    try {
      const result = await syncAllCompanies();
      if (result.companies) logger.info('PowerOffice automatisk synk', result);
    } catch (error) {
      logger.error('PowerOffice automatisk synk feilet', { message: error?.message });
    }
  },
);
