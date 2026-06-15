import { transform } from "sucrase";

// Blocked Node.js built-ins that sandbox files must not require.
export const BLOCKED_MODULES = new Set([
    "fs", "child_process", "net", "os", "http", "https",
    "dgram", "cluster", "worker_threads", "vm",
]);

export interface SandboxAllowConfig {
    /** The single module name that is importable (e.g. "memoria-snippets" or "memoria-templates"). */
    module: string;
    /** The object that is returned when the allowed module is required. */
    payload: Record<string, unknown>;
}

/**
 * Compiles a TypeScript source string and evaluates it in a restricted sandbox.
 * Only the single module declared in `allow` is importable; Node built-ins are blocked.
 *
 * Returns the array of default-exported values (or the whole exports object if
 * the default export is not an array).
 */
export function compileSource(source: string, allow: SandboxAllowConfig): unknown[] {
    const result = transform(source, {
        transforms: ["typescript", "imports"],
    });

    const module = { exports: {} as Record<string, unknown> };
    const fn = new Function("module", "exports", "require", result.code);
    fn(module, module.exports, createSafeRequire(allow));

    const exported = (module.exports as Record<string, unknown>)["default"] ?? module.exports;
    return Array.isArray(exported) ? exported : [exported];
}

function createSafeRequire(allow: SandboxAllowConfig): (id: string) => unknown {
    return (id: string): unknown => {
        if (id === allow.module) {
            return allow.payload;
        }
        if (BLOCKED_MODULES.has(id)) {
            throw new Error(`Sandbox files cannot require "${id}".`);
        }
        throw new Error(`Unknown module "${id}" — sandbox files can only import "${allow.module}".`);
    };
}
