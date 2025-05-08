/*
 * @Author: Await
 * @Date: 2025-05-08 18:19:21
 * @LastEditors: Await
 * @LastEditTime: 2025-05-08 20:34:51
 * @Description: 请填写简介
 */
// 终端工具函数索引文件

// 导出所有工具函数和常量
export * from './terminalConfig';
export * from './terminalInit';

// 导入并导出WebSocket相关函数
import { connectWebSocket, handleWebSocketMessage } from './websocket';
// 导出WebSocket函数
export { connectWebSocket, handleWebSocketMessage };

// 导出终端工具函数
export * from './terminalUtils';
export * from './networkUtils';

import { sessionAPI } from '../../../services/api';
import type { TerminalTab } from '../../../contexts/TerminalContext';

/**
 * 关闭所有会话
 * @param tabs 标签列表
 * @returns 是否成功关闭所有会话
 */
export const closeAllSessions = async (tabs: TerminalTab[]): Promise<boolean> => {
  if (!tabs || tabs.length === 0) {
    console.log('没有会话需要关闭');
    return true;
  }

  try {
    console.log(`开始关闭 ${tabs.length} 个会话...`);

    // 关闭所有WebSocket连接
    for (const tab of tabs) {
      try {
        // 关闭WebSocket连接
        if (tab.webSocketRef?.current) {
          tab.webSocketRef.current.close();
          console.log(`已关闭会话 ${tab.sessionId} 的WebSocket连接`);
        }

        // 调用API关闭会话
        if (tab.sessionId) {
          await sessionAPI.closeSession(tab.sessionId);
          console.log(`已关闭会话 ID: ${tab.sessionId}`);
        }
      } catch (error) {
        console.error(`关闭会话 ${tab.sessionId} 失败:`, error);
      }
    }

    return true;
  } catch (error) {
    console.error('关闭所有会话失败:', error);
    return false;
  }
};

/**
 * 创建新会话
 * @param connectionId 连接ID
 * @returns 新创建的会话ID
 */
export const createNewSession = async (connectionId: number): Promise<number | null> => {
  try {
    console.log(`创建新会话，连接ID: ${connectionId}`);
    const response = await sessionAPI.createSession(connectionId);

    if (response.data && response.data.code === 200) {
      const sessionId = response.data.data.id;
      console.log(`创建会话成功，会话ID: ${sessionId}`);
      return sessionId;
    } else {
      console.error('创建会话失败:', response.data);
      return null;
    }
  } catch (error) {
    console.error('创建会话API调用失败:', error);
    return null;
  }
};