/**
 * Shared TextDecoder / TextEncoder singletons.
 *
 * Both classes are stateless and safe to reuse across calls, so a single
 * instance per process avoids redundant allocations in every module that
 * reads or writes binary-encoded text through the VS Code filesystem API.
 */

export const textDecoder = new TextDecoder();
export const textEncoder = new TextEncoder();
