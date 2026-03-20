import { useCallback, useEffect, useState } from 'react';

interface UseTerminalFullscreenOptions {
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

export const useTerminalFullscreen = ({
  containerRef
}: UseTerminalFullscreenOptions) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggle = useCallback(async () => {
    if (!containerRef.current) {
      return;
    }

    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (error) {
        console.error('进入全屏失败', error);
      }
      return;
    }

    try {
      await document.exitFullscreen();
      setIsFullscreen(false);
    } catch (error) {
      console.error('退出全屏失败', error);
    }
  }, [containerRef]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const currentFullscreen = document.fullscreenElement === containerRef.current;
      setIsFullscreen(currentFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [containerRef]);

  return {
    isFullscreen,
    toggle
  };
};

export default useTerminalFullscreen;
