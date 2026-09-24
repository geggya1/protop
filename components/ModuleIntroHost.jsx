import { useEffect } from 'react';
import { useHelp } from '../src/context/HelpContext';

/**
 * Registers the current shell module with the shared help overlay.
 * First-visit auto-popup is a single welcome tour (not one popup per module).
 */
export default function ModuleIntroHost({
  scope = 'family',
  moduleId,
  enabled = true,
}) {
  const { registerModule } = useHelp();

  useEffect(() => {
    if (!enabled || !moduleId) return undefined;
    return registerModule(scope, moduleId, enabled);
  }, [enabled, scope, moduleId, registerModule]);

  return null;
}
