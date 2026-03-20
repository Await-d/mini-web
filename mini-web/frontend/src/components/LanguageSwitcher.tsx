import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Space } from 'antd';

const LanguageSwitcher: React.FC = () => {
    const { i18n } = useTranslation();

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
    };

    return (
        <Space>
            <Button
                onClick={() => changeLanguage('en')}
                type={i18n.language === 'en' ? 'primary' : 'default'}
            >
                English
            </Button>
            <Button
                onClick={() => changeLanguage('zh')}
                type={i18n.language === 'zh' ? 'primary' : 'default'}
            >
                中文
            </Button>
        </Space>
    );
};

export default LanguageSwitcher;
