/**
 * «Husk – det som gjenstår» på Hjem.
 * Middag og dagligvarer hører til familiemodulene (måltider og handleliste), som ProTop
 * ikke har. Før stod «Planlegg middag» alltid på Hjem, og Notater-kortet viste den som
 * et notat når brukeren ikke hadde notater (SOS-15). Nå tas et hint bare med når modulen
 * finnes i skallet.
 */
import { isProtopShellModule } from '../navigation/protopShell.js';

export function homeRemainingHints({
  shopCount = 0,
  hasDinner = false,
  taskCount = 0,
  hasModule = isProtopShellModule,
} = {}) {
  const shop = hasModule('shop') && Number(shopCount) > 0;
  const dinner = hasModule('meals') && !hasDinner;
  const tasks = Number(taskCount) > 0;
  const hints = [];
  if (shop) hints.push('Dagligvarer');
  if (dinner) hints.push('Planlegg middag');
  if (tasks && hints.length < 2) hints.push('Oppgaver');
  return {
    hints: hints.slice(0, 2),
    count: (tasks ? 1 : 0) + (shop ? 1 : 0) + (dinner ? 1 : 0),
  };
}
