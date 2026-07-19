// Plugin Manager
export { PluginManager, getPluginManager, setPluginManager } from './pluginManager';

// Plugin Registry
export { PluginRegistry } from './registry';

// Lifecycle
export { InvalidPluginTransitionError, transitionState, isValidTransition } from './lifecycle';

// Validation
export {
  validatePlugin,
  validateDependencies,
  detectCircularDependencies,
  topologicalSort,
  parseSemVer,
  compareSemVer,
  satisfiesMinVersion,
} from './validation';

// Types
export { PluginLifecycleState } from './types';
export type {
  SemVer,
  PluginCompatibility,
  PluginDependency,
  PluginValidationResult,
  PluginManifest,
  PluginHooks,
  PluginConfig,
  PluginInstance,
  PluginManagerConfig,
  PluginRegistryEntry,
  PluginFactory,
} from './types';
