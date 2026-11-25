/** Technical details are logged only in development builds. */
export const logger = {
  debug(...args: unknown[]) {
    if (__DEV__) console.log('[omni-export]', ...args);
  },
  warn(...args: unknown[]) {
    if (__DEV__) console.warn('[omni-export]', ...args);
  },
  error(...args: unknown[]) {
    if (__DEV__) console.error('[omni-export]', ...args);
  },
};
