/**
 * Deploy entry for import-tolking.
 * setRegion must load before the callable is created.
 */
import './setRegion.js';
import './geminiEnv.js';

export { interpretImport } from './importCallable.js';
