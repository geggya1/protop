/**
 * Maps the current module to the same welcome card used on first activation,
 * with help-only CTA labels. Family catalog copy is reused as-is.
 */
import { getModuleConfig, publicIllustrationPathForId } from '../modules/moduleActivationRegistry.js';

export function buildHelpWelcomeModule({
  scope = 'family',
  moduleId,
  copy = null,
  walkthroughLabel = 'Ta meg gjennom skrittene',
  closeLabel = 'Lukk',
} = {}) {
  const labels = {
    activationLabel: walkthroughLabel,
    backLabel: closeLabel,
  };
  const catalog = scope === 'family' ? getModuleConfig(moduleId) : null;
  const illustrationPath = scope === 'family'
    ? publicIllustrationPathForId(moduleId, catalog?.illustrationPath)
    : (catalog?.illustrationPath || '');
  if (catalog) {
    return {
      ...catalog,
      illustration: illustrationPath || catalog.illustrationPath
        || (catalog.illustration ? `/assets/module-activation/${catalog.illustration}` : ''),
      illustrationPath: illustrationPath || catalog.illustrationPath,
      ...labels,
    };
  }
  if (!copy) return null;
  return {
    id: moduleId || 'help',
    eyebrow: copy.kicker || '',
    headline: copy.title || '',
    pitch: copy.pitch || '',
    benefits: Array.isArray(copy.steps) ? copy.steps.filter(Boolean).slice(0, 3) : [],
    illustration: illustrationPath || '',
    illustrationPath: illustrationPath || '',
    ...labels,
  };
}
