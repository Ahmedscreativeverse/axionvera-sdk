import { PluginLifecycleState } from './types';

/**
 * Valid lifecycle transitions for a plugin.
 *
 * ```
 * Unregistered ──→ Registered ──→ Installed ──→ Active
 *                                    ↑               │
 *                                    │               ↓
 *                                    └── Disabled ←──┘
 *
 * Any state ──→ Error
 * Error     ──→ Registered (recovery)
 * Any state ──→ Uninstalled (terminal)
 * ```
 */
const VALID_TRANSITIONS: Map<PluginLifecycleState, Set<PluginLifecycleState>> = new Map([
  [
    PluginLifecycleState.Unregistered,
    new Set([PluginLifecycleState.Registered]),
  ],
  [
    PluginLifecycleState.Registered,
    new Set([PluginLifecycleState.Installed, PluginLifecycleState.Uninstalled]),
  ],
  [
    PluginLifecycleState.Installed,
    new Set([
      PluginLifecycleState.Active,
      PluginLifecycleState.Disabled,
      PluginLifecycleState.Uninstalled,
    ]),
  ],
  [
    PluginLifecycleState.Active,
    new Set([
      PluginLifecycleState.Disabled,
      PluginLifecycleState.Uninstalled,
      PluginLifecycleState.Error,
    ]),
  ],
  [
    PluginLifecycleState.Disabled,
    new Set([
      PluginLifecycleState.Active,
      PluginLifecycleState.Uninstalled,
      PluginLifecycleState.Error,
    ]),
  ],
  [
    PluginLifecycleState.Error,
    new Set([
      PluginLifecycleState.Registered, // recover by re-registering
      PluginLifecycleState.Uninstalled,
    ]),
  ],
  [PluginLifecycleState.Uninstalled, new Set()],
]);

/**
 * Error thrown when an invalid lifecycle transition is attempted.
 */
export class InvalidPluginTransitionError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly from: PluginLifecycleState,
    public readonly to: PluginLifecycleState,
  ) {
    super(
      `Invalid plugin lifecycle transition for "${pluginId}": ${from} → ${to}`,
    );
    this.name = 'InvalidPluginTransitionError';
  }
}

/**
 * Transition a plugin's state, throwing if the transition is invalid.
 * Returns the new state.
 */
export function transitionState(
  pluginId: string,
  currentState: PluginLifecycleState,
  targetState: PluginLifecycleState,
): PluginLifecycleState {
  const allowed = VALID_TRANSITIONS.get(currentState);

  if (!allowed || !allowed.has(targetState)) {
    throw new InvalidPluginTransitionError(pluginId, currentState, targetState);
  }

  return targetState;
}

/**
 * Check if a transition is valid without throwing.
 */
export function isValidTransition(
  from: PluginLifecycleState,
  to: PluginLifecycleState,
): boolean {
  const allowed = VALID_TRANSITIONS.get(from);
  return allowed ? allowed.has(to) : false;
}
