// metro.config.js
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
module.exports = config;
