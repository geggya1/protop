import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import ModuleHero from './ModuleHero';

/**
 * En side kan bytte ut teksten i modulbåndet mens den er åpen. Ansatte bruker det
 * til personens navn med personvelger, så navnet ikke står i en egen rad under båndet.
 * Skallet eier båndet. Siden sier bare hva som skal stå der, og tar det bort når den lukkes.
 */
const ShellHeroOverrideContext = createContext(null);

export function ShellHeroOverrideProvider({ children }) {
  const [override, setOverride] = useState(null);
  const ownerRef = useRef(null);
  const api = useMemo(() => ({
    set(owner, value) {
      ownerRef.current = owner;
      setOverride(value);
    },
    clear(owner) {
      if (ownerRef.current !== owner) return;
      ownerRef.current = null;
      setOverride(null);
    },
  }), []);
  const value = useMemo(() => ({ api, override }), [api, override]);
  return <ShellHeroOverrideContext.Provider value={value}>{children}</ShellHeroOverrideContext.Provider>;
}

/** Det skallet skal vise i båndet nå, eller null. */
export function useShellHeroOverrideValue() {
  return useContext(ShellHeroOverrideContext)?.override || null;
}

/**
 * Setter båndets tekst så lenge siden er montert. `value` null tar overstyringen bort.
 * Returnerer true når et skall viser båndet, så siden kan droppe sin egen navnerad.
 */
export function useShellHeroOverride(value) {
  const ctx = useContext(ShellHeroOverrideContext);
  const ownerRef = useRef({});
  const api = ctx?.api || null;
  useEffect(() => {
    if (!api) return;
    if (value) api.set(ownerRef.current, value);
    else api.clear(ownerRef.current);
  }, [api, value]);
  useEffect(() => () => { api?.clear(ownerRef.current); }, [api]);
  return !!api;
}

/** Modulbåndet slik skallet viser det: med sidens overstyring når den finnes. */
export function HostedModuleHero(props) {
  const override = useShellHeroOverrideValue();
  if (!override) return <ModuleHero {...props} />;
  return (
    <ModuleHero
      {...props}
      title={override.title}
      subtitle={override.subtitle}
      kicker={override.kicker}
      onKickerPress={override.onKickerPress}
      onTitlePress={override.onTitlePress}
      titleA11y={override.titleA11y}
      titleAccessory={override.titleAccessory}
      compact={override.compact}
    />
  );
}
