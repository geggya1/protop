/**
 * Daglig påminnelse, purring og lås. Egen inngang slik at scheduler
 * ikke ligger i samme deploy som kallbare funksjoner.
 */
import './setRegion.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { runVacationPlanSweep } from './vacationPlan.js';

export const vacationPlanDaily = onSchedule(
  {
    schedule: 'every day 07:10',
    timeZone: 'Europe/Oslo',
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    try {
      await runVacationPlanSweep();
    } catch (error) {
      logger.error('ferieplan sweep feilet', { message: error?.message });
    }
  },
);
