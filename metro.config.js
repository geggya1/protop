// metro.config.js
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// Sier tydelig fra i terminalen når mappen er bak origin/main, så 8081 ikke viser gammel kode
// uten at noen merker det (scripts/check-base.js). Bare lokalt, og bare én gang per start.
if (!process.env.CI && !process.env.PROTOP_NO_BASE_CHECK && !global.__protopBaseChecked) {
  global.__protopBaseChecked = true;
  try {
    const { readBaseStatus, report } = require('./scripts/check-base');
    report(readBaseStatus({ cwd: __dirname }));
  } catch {
    // Sjekken skal aldri stoppe Metro.
  }
}

const config = getDefaultConfig(__dirname);

// Hovedinngangen til @expo/vector-icons laster alle ikonsettene. Appens egen kode får bare
// settene den bruker (src/ui/vectorIcons.js); pakker i node_modules beholder originalen.
const VECTOR_ICONS_SHIM = path.join(__dirname, 'src', 'ui', 'vectorIcons.js');
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@expo/vector-icons'
    && !context.originModulePath.includes(`${path.sep}node_modules${path.sep}`)
    && context.originModulePath !== VECTOR_ICONS_SHIM) {
    return { type: 'sourceFile', filePath: VECTOR_ICONS_SHIM };
  }
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
