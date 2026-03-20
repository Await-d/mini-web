export const enableXtermTerminal =
  (import.meta.env.VITE_TERMINAL_USE_XTERM ?? 'false').toLowerCase() === 'true';
