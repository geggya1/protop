import React, { createContext, useContext } from 'react';

const HomeImmersiveContext = createContext(false);

export function HomeImmersiveProvider({ value = false, children }) {
  return (
    <HomeImmersiveContext.Provider value={!!value}>
      {children}
    </HomeImmersiveContext.Provider>
  );
}

export function useHomeImmersive() {
  return useContext(HomeImmersiveContext);
}
