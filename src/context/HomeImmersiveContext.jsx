import React, { createContext, useContext } from 'react';

const HomeImmersiveContext = createContext(false);
/** "r, g, b" for mørkt glass i bildets egen farge, eller null (vanlige ProTop-kort). */
const HomeGlassTintContext = createContext(null);

export function HomeImmersiveProvider({ value = false, tint = null, children }) {
  return (
    <HomeImmersiveContext.Provider value={!!value}>
      <HomeGlassTintContext.Provider value={value && tint ? tint : null}>
        {children}
      </HomeGlassTintContext.Provider>
    </HomeImmersiveContext.Provider>
  );
}

export function useHomeImmersive() {
  return useContext(HomeImmersiveContext);
}

/** Tonen til det mørke glasset når Hjem har bakgrunnsbilde, ellers null. */
export function useHomeGlassTint() {
  return useContext(HomeGlassTintContext);
}
