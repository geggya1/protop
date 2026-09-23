/** Re-export from the JSON-backed registry so UI never hardcodes sales copy. */
export {
  MODULE_CATALOG as MODULE_ACTIVATION_CATALOG,
  ACTIVATABLE_MODULE_IDS as GATED_MODULE_IDS,
  getModuleConfig as getModuleActivationConfig,
  isActivatableModule as isGatedModule,
} from '../modules/moduleActivationRegistry.js';
