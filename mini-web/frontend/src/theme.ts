// theme.ts - Ant Design主题配置
import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    colorTextBase: '#000000d9',
    fontSize: 14,
    borderRadius: 6,
    wireframe: false, // 开启无框风格
  },
  components: {
    Button: {
      colorPrimary: '#1677ff',
      algorithm: true, // 启用算法
    },
    Card: {
      colorBgContainer: '#ffffff',
      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    },
  },
};