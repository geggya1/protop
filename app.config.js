const fs = require('fs');
const path = require('path');

function optionalFile(relPath) {
  const full = path.join(__dirname, relPath);
  return fs.existsSync(full) ? relPath : undefined;
}

module.exports = ({ config }) => {
  const iosGoogleServices = optionalFile('./GoogleService-Info.plist');
  const androidGoogleServices = optionalFile('./google-services.json');
  const easProjectId =
    process.env.EAS_PROJECT_ID
    || process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    || config.extra?.eas?.projectId
    || '';

  return {
    ...config,
    ios: {
      ...(config.ios || {}),
      ...(iosGoogleServices ? { googleServicesFile: iosGoogleServices } : {}),
    },
    android: {
      ...(config.android || {}),
      ...(androidGoogleServices ? { googleServicesFile: androidGoogleServices } : {}),
    },
    extra: {
      ...(config.extra || {}),
      EXPO_PUBLIC_RECAPTCHA_V3_KEY: process.env.EXPO_PUBLIC_RECAPTCHA_V3_KEY || '',
      EXPO_PUBLIC_VEGVESEN_API_KEY: process.env.EXPO_PUBLIC_VEGVESEN_API_KEY || '',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
      EXPO_PUBLIC_MICROSOFT_CLIENT_ID: process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID || '',
      EXPO_PUBLIC_MICROSOFT_TENANT_ID: process.env.EXPO_PUBLIC_MICROSOFT_TENANT_ID || 'common',
      privacyPolicyUrl: 'https://protop.no/personvern',
      supportUrl: 'https://protop.no',
      eas: {
        ...(config.extra?.eas || {}),
        projectId: easProjectId || undefined,
      },
    },
  };
};
