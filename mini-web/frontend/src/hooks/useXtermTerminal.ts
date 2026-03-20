import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Terminal, type ITerminalOptions } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';

interface UseXtermTerminalOptions {
  /** 传递给 xterm 的额外配置 */
  options?: ITerminalOptions;
}

interface UseXtermTerminalResult {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  terminalRef: React.MutableRefObject<Terminal | null>;
  fitAddonRef: React.MutableRefObject<FitAddon | null>;
  fit: () => void;
  focus: () => void;
  clear: () => void;
  write: (data: string) => void;
}

/**
 * 负责创建与销毁 xterm 实例的 Hook。
 * 保持终端渲染逻辑简单，遵循 SRP。
 */
export const useXtermTerminal = (
  { options }: UseXtermTerminalOptions = {}
): UseXtermTerminalResult => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0b0c10',
        foreground: '#c5c6c7',
        cursor: '#66fcf1',
        selectionBackground: '#45a29e55'
      },
      allowTransparency: true,
      ...options
    } as ITerminalOptions);

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const container = containerRef.current;
    if (container) {
      terminal.open(container);
      fitAddon.fit();
      terminal.focus();
    }

    return () => {
      terminal.dispose();
      fitAddon.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [options]);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const focus = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const write = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  return useMemo(
    () => ({
      containerRef,
      terminalRef,
      fitAddonRef,
      fit,
      focus,
      clear,
      write
    }),
    [clear, fit, focus, write]
  );
};

export default useXtermTerminal;
