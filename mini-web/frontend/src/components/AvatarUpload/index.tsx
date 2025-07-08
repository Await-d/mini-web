import { useState } from 'react';
import { Upload, Avatar, Button, message, Modal, Spin } from 'antd';
import { LoadingOutlined, PlusOutlined, UserOutlined, CameraOutlined } from '@ant-design/icons';
import type { RcFile, UploadProps } from 'antd/es/upload';
import { userAPI } from '../../services/api';

interface AvatarUploadProps {
  userId: number;
  currentAvatar?: string;
  size?: number;
  onAvatarChange?: (avatarUrl: string) => void;
  showUploadButton?: boolean;
  disabled?: boolean;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  userId,
  currentAvatar,
  size = 100,
  onAvatarChange,
  showUploadButton = true,
  disabled = false
}) => {
  const [loading, setLoading] = useState(false);
  const [avatar, setAvatar] = useState<string | undefined>(currentAvatar);

  // 上传前的文件校验
  const beforeUpload = (file: RcFile) => {
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/gif';
    if (!isJpgOrPng) {
      message.error('只能上传 JPG/PNG/GIF 格式的图片!');
      return false;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('图片大小不能超过 5MB!');
      return false;
    }
    return true;
  };

  // 处理上传
  const handleUpload = async (file: RcFile) => {
    setLoading(true);
    
    try {
      const response = await userAPI.uploadAvatar(userId, file);
      if (response.data && response.data.code === 200) {
        const avatarUrl = response.data.data.avatar_url;
        setAvatar(avatarUrl);
        onAvatarChange?.(avatarUrl);
        message.success('头像上传成功!');
      } else {
        message.error(response.data?.message || '头像上传失败');
      }
    } catch (error) {
      console.error('头像上传失败:', error);
      message.error('头像上传失败，请稍后重试');
    } finally {
      setLoading(false);
    }
    
    return false; // 阻止默认上传行为
  };

  // 上传按钮样式
  const uploadButton = (
    <div style={{ textAlign: 'center' }}>
      {loading ? <LoadingOutlined /> : <PlusOutlined />}
      <div style={{ marginTop: 8, fontSize: '12px' }}>上传头像</div>
    </div>
  );

  const uploadProps: UploadProps = {
    name: 'avatar',
    showUploadList: false,
    beforeUpload,
    customRequest: ({ file }) => handleUpload(file as RcFile),
    disabled: disabled || loading,
  };

  // 大尺寸头像显示（带上传功能）
  if (size >= 80 && showUploadButton) {
    return (
      <div style={{ textAlign: 'center' }}>
        <Upload {...uploadProps}>
          <div style={{ 
            position: 'relative', 
            display: 'inline-block',
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}>
            <Avatar
              size={size}
              src={avatar}
              icon={loading ? <LoadingOutlined /> : <UserOutlined />}
              style={{ 
                border: '2px dashed #d9d9d9',
                backgroundColor: avatar ? 'transparent' : '#fafafa'
              }}
            />
            {!disabled && (
              <div style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                background: '#1890ff',
                borderRadius: '50%',
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                border: '2px solid white'
              }}>
                <CameraOutlined />
              </div>
            )}
          </div>
        </Upload>
        {!disabled && (
          <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
            点击更换头像
          </div>
        )}
      </div>
    );
  }

  // 小尺寸头像显示（仅显示）
  return (
    <Avatar
      size={size}
      src={avatar}
      icon={<UserOutlined />}
    />
  );
};

export default AvatarUpload;