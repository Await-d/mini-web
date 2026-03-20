import { useEffect } from 'react';
import type { FitAddon } from 'xterm-addon-fit';

interface UseTerminalResizeOptions {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  fitAddonRef: React.MutableRefObject<FitAddon | null>;
}

/**
 * 监听窗口及容器尺寸变化，自动触发 xterm re-fit。
 */
export const useTerminalResize = ({
  containerRef,
  fitAddonRef
}: UseTerminalResizeOptions): void => {
  useEffect(() => {
    const handleWindowResize = () => {
      fitAddonRef.current?.fit();
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [fitAddonRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      fitAddonRef.current?.fit();
      return;
    }

    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });

    observer.observe(container);
    fitAddonRef.current?.fit();

    return () => {
      observer.disconnect();
    };
  }, [containerRef, fitAddonRef]);
};

export default useTerminalResize;

