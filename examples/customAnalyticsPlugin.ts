/**
 * ─── Sample Plugin: Custom Logger & Analytics ──────────────────────────
 *
 * Demonstrates the full plugin architecture:
 *  - Plugin manifest with compatibility constraints
 *  - Lifecycle hooks (onRegister, onInstall, onEnable, onDisable, onUninstall)
 *  - Client hooks (beforeClientInit, afterClientInit)
 *  - Service overrides (custom logger)
 *  - Middleware registration
 *  - Error handling
 *
 * Usage:
 *   import { customAnalyticsPlugin } from './examples/customAnalyticsPlugin';
 *   const manager = new PluginManager({ autoInstall: true, sdkVersion: '2.0.0' });
 *   manager.register(customAnalyticsPlugin());
 */

import {
  PluginConfig,
  PluginLifecycleState,
  type Middleware,
  type MiddlewareContext,
  type StellarClient,
  type StellarClientOptions,
  type LoggerService,
} from '../src';

// ─── Custom Logger Implementation ──────────────────────────────────────

class AnalyticsLogger implements LoggerService {
  private events: Array<{ timestamp: Date; level: string; message: string }> = [];

  debug(message: string, ...args: unknown[]): void {
    this.events.push({ timestamp: new Date(), level: 'debug', message });
    console.debug(`[AnalyticsPlugin] ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.events.push({ timestamp: new Date(), level: 'info', message });
    console.info(`[AnalyticsPlugin] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.events.push({ timestamp: new Date(), level: 'warn', message });
    console.warn(`[AnalyticsPlugin] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.events.push({ timestamp: new Date(), level: 'error', message });
    console.error(`[AnalyticsPlugin] ${message}`, ...args);
  }

  /** Export collected events for analysis */
  getEvents(): ReadonlyArray<{ timestamp: Date; level: string; message: string }> {
    return this.events;
  }

  /** Clear the event buffer */
  clear(): void {
    this.events = [];
  }
}

// ─── Analytics Middleware ──────────────────────────────────────────────

const analyticsMiddleware: Middleware = {
  name: 'analytics-timing',

  async pre(context: MiddlewareContext): Promise<void> {
    (context.metadata as Record<string, unknown>).__analyticsStart = Date.now();
    console.debug(
      `[AnalyticsPlugin] → ${context.workflow}:${context.operation}`,
    );
  },

  async post(context: MiddlewareContext): Promise<void> {
    const start = (context.metadata as Record<string, unknown>)
      .__analyticsStart as number;
    const duration = Date.now() - start;
    console.debug(
      `[AnalyticsPlugin] ← ${context.workflow}:${context.operation} (${duration}ms)`,
    );
  },

  async onError(context: MiddlewareContext): Promise<void> {
    const start = (context.metadata as Record<string, unknown>)
      .__analyticsStart as number;
    const duration = Date.now() - start;
    console.error(
      `[AnalyticsPlugin] ✗ ${context.workflow}:${context.operation} (${duration}ms)`,
      context.error,
    );
  },
};

// ─── Plugin Factory ────────────────────────────────────────────────────

export interface AnalyticsPluginOptions {
  /** API endpoint to flush analytics to (optional) */
  endpoint?: string;
  /** Flush interval in ms (default: 30000) */
  flushIntervalMs?: number;
}

export function customAnalyticsPlugin(
  options: AnalyticsPluginOptions = {},
): PluginConfig {
  const logger = new AnalyticsLogger();
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  return {
    // ── Manifest ──
    id: 'com.axionvera.analytics',
    name: 'Custom Analytics Plugin',
    version: '1.0.0',
    description: 'Demonstrates the plugin architecture with custom logging, middleware, and lifecycle hooks.',
    author: 'Axionvera Community',
    license: 'MIT',
    keywords: ['analytics', 'logging', 'telemetry', 'example'],

    compatibility: {
      minSDKVersion: '1.0.0',
      maxSDKVersion: '3.0.0',
      testedSDKVersions: ['2.0.0'],
      environments: ['node', 'browser'],
    },

    // ── Hooks ──
    hooks: {
      onRegister(): void {
        console.log('[AnalyticsPlugin] Registered with PluginManager');
      },

      async onInstall(): Promise<void> {
        console.log('[AnalyticsPlugin] Installing...');
        // Simulate async setup (e.g., connecting to analytics backend)
        await new Promise((resolve) => setTimeout(resolve, 50));
        console.log('[AnalyticsPlugin] Installed successfully');
      },

      async onEnable(): Promise<void> {
        console.log('[AnalyticsPlugin] Enabled — starting flush timer');
        // Periodic flush to analytics endpoint
        if (options.endpoint) {
          flushTimer = setInterval(() => {
            const events = logger.getEvents();
            if (events.length > 0) {
              console.log(
                `[AnalyticsPlugin] Flushing ${events.length} events to ${options.endpoint}`,
              );
              logger.clear();
            }
          }, options.flushIntervalMs ?? 30_000);
        }
      },

      async onDisable(): Promise<void> {
        console.log('[AnalyticsPlugin] Disabled — stopping flush timer');
        if (flushTimer) {
          clearInterval(flushTimer);
          flushTimer = null;
        }
      },

      async onUninstall(): Promise<void> {
        console.log('[AnalyticsPlugin] Uninstalled — cleaning up');
        if (flushTimer) {
          clearInterval(flushTimer);
          flushTimer = null;
        }
        logger.clear();
      },

      beforeClientInit(
        opts: StellarClientOptions,
      ): StellarClientOptions {
        console.log('[AnalyticsPlugin] Modifying client options');
        return {
          ...opts,
          // Example: inject default settings
          allowHttp: opts.allowHttp ?? false,
        };
      },

      afterClientInit(client: StellarClient): void {
        console.log('[AnalyticsPlugin] Client initialized — registering middleware');
        client.use(analyticsMiddleware);
      },

      onError(error: Error): void {
        console.error('[AnalyticsPlugin] Error:', error.message);
      },
    },

    // ── Service Overrides ──
    services: {
      loggerFactory: () => logger,
      logger: logger,
    },

    // ── Middleware ──
    middleware: [analyticsMiddleware],
  };
}
