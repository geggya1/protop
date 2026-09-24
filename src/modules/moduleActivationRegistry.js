import catalog from './moduler.catalog.js';
import { createModuleRegistry, SHELL_SKIP_MODULE_IDS, STACK_MODULE_IDS } from './moduleActivationLogic.js';

const registry = createModuleRegistry(catalog);

export const MODULE_CATALOG = catalog;
export const ACTIVATABLE_MODULE_IDS = registry.ACTIVATABLE_MODULE_IDS;
export const getModuleConfig = registry.getModuleConfig;
export const isActivatableModule = registry.isActivatableModule;
export const listModulesByCategory = registry.listModulesByCategory;
export const activationModuleIdForShell = registry.activationModuleIdForShell;
export const activationModuleIdForStack = registry.activationModuleIdForStack;
export { SHELL_SKIP_MODULE_IDS, STACK_MODULE_IDS };
export {
  reassuranceForRole,
  CATEGORY_ORDER,
  ILLUSTRATION_DIR,
  ILLUSTRATION_CACHE,
  ILLUSTRATION_FILES,
  withIllustrationCache,
  publicIllustrationPathForId,
} from './moduleActivationLogic.js';
