/**
 * Automatisk purring og inkasso, morgen og ettermiddag. Egen inngang slik at scheduler
 * ikke ligger i samme deploy som de kallbare funksjonene (se scripts/deploy-slim-functions.sh).
 */
import './setRegion.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { runCollectionAutomation } from './collectionAuto.js';

export const collectionAutoScheduled = onSchedule(
  {
    schedule: '30 7,13 * * *',
    timeZone: 'Europe/Oslo',
    region: 'europe-west1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    try {
      const result = await runCollectionAutomation();
      if (result.companies) logger.info('Automatisk purring', result);
    } catch (error) {
      logger.error('Automatisk purring feilet', { message: error?.message });
    }
  },
);
