/**
 * lazyScreen for render-testene: modulen lastes synkront med samme require som testen har
 * hektet seg på, så mockene gjelder også komponenter som appen laster ved behov (egen bit på web).
 * Bruk i en require-krok: if (id.includes('ui/lazyScreen')) return syncLazyScreen(req);
 */
const React = require('react');

module.exports = function syncLazyScreen(req) {
  function lazyScreen(load, { name, pick = 'default' } = {}) {
    const match = /(?:require|import)\(\s*['"`]([^'"`]+)['"`]\s*\)/.exec(String(load));
    if (!match) throw new Error(`syncLazyScreen: fant ikke modulstien i ${String(load)}`);
    let Component = null;
    function SyncLazy(props) {
      if (!Component) {
        const mod = req(match[1]);
        Component = (mod && (mod[pick] || mod.default)) || mod;
      }
      return React.createElement(Component, props);
    }
    SyncLazy.displayName = `Lazy(${name || pick})`;
    SyncLazy.preload = async () => {};
    return SyncLazy;
  }
  return { lazyScreen, preloadScreens: () => () => {} };
};
