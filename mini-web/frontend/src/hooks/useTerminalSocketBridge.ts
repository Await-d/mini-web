import { useEffect, useRef } from 'react';
import type { Terminal } from 'xterm';

export interface TerminalProtocolAdapter {
  handleIncoming: (data: MessageEvent['data']) => void;
  handleOutgoing?: (input: string) => string | ArrayBuffer | Uint8Array | null;
}

interface TerminalSocketBridgeOptions {
  terminalRef: React.MutableRefObject<Terminal | null>;
  webSocketRef: React.RefObject<WebSocket | null>;
  adapter?: TerminalProtocolAdapter;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onJsonMessage?: (payload: Record<string, unknown>) => void;
}

const defaultIncomingHandler = (
  term: Terminal | null,
  onJsonMessage?: (payload: Record<string, unknown>) => void
) =>
  (data: MessageEvent['data']) => {
    if (!term) return;

    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (onJsonMessage) {
            onJsonMessage(parsed);
            return;
          }
        } catch (error) {
          console.warn('解析终端 JSON 消息失败:', error);
        }
      }
      term.write(data);
      return;
    }

    if (data instanceof Blob) {
      void data.text().then((text) => {
        defaultIncomingHandler(term, onJsonMessage)(text);
      });
      return;
    }

    if (data instanceof ArrayBuffer) {
      const decoded = new TextDecoder('utf-8').decode(data);
      defaultIncomingHandler(term, onJsonMessage)(decoded);
    }
  };

/**
 * 建立 xterm 与 WebSocket 之间的桥接。
 */
export const useTerminalSocketBridge = ({
  terminalRef,
  webSocketRef,
  adapter,
  onOpen,
  onClose,
  onError,
  onJsonMessage
}: TerminalSocketBridgeOptions): void => {
  const dataDisposableRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    const ws = webSocketRef.current;
    const term = terminalRef.current;
    if (!ws || !term) {
      return;
    }

    const incoming = adapter?.handleIncoming ?? defaultIncomingHandler(term, onJsonMessage);

    const handleMessage = (event: MessageEvent) => {
      incoming(event.data);
    };

    const handleOpen = () => {
      onOpen?.();
    };

    const handleClose = (event: CloseEvent) => {
      onClose?.(event);
    };

    const handleError = (event: Event) => {
      console.error('终端 WebSocket 错误:', event);
      onError?.(event);
    };

    ws.addEventListener('open', handleOpen);
    ws.addEventListener('message', handleMessage);
    ws.addEventListener('close', handleClose);
    ws.addEventListener('error', handleError);

    dataDisposableRef.current = term.onData((input) => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const payload = adapter?.handleOutgoing?.(input) ?? input;
      if (payload === null || payload === undefined) {
        return;
      }

      try {
        ws.send(payload);
      } catch (error) {
        console.error('发送终端数据失败:', error);
      }
    });

    return () => {
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('message', handleMessage);
      ws.removeEventListener('close', handleClose);
      ws.removeEventListener('error', handleError);
      dataDisposableRef.current?.dispose?.();
      dataDisposableRef.current = null;
    };
  }, [adapter, onClose, onError, onJsonMessage, onOpen, terminalRef, webSocketRef]);
};

export default useTerminalSocketBridge;

