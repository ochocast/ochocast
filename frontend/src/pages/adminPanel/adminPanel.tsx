import React, { FC, useEffect, useState } from 'react';
import styles from './adminPanel.module.css';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../context/UserContext';
import NotFoundPage from '../notFound/notFound';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import ThemeConfiguration from './themeConfiguration/themeConfiguration';
import ContentManagement from './contentManagement/contentManagement';
import { useNavigate, useLocation } from 'react-router-dom';

export interface AdminPanelProps {}

type AdminSection = 'theme' | 'content';

const AdminPanel: FC<AdminPanelProps> = () => {
  const { isAdmin } = useUser();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<AdminSection>('theme');

  useEffect(() => {
    // Déterminer la section active en fonction de l'URL
    if (location.pathname.includes('/admin/content')) {
      setActiveSection('content');
    } else if (location.pathname.includes('/admin/theme')) {
      setActiveSection('theme');
    } else if (location.pathname === '/admin') {
      setActiveSection('theme');
    }
  }, [location.pathname]);

  if (!isAdmin) {
    return <NotFoundPage />;
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'theme':
        return <ThemeConfiguration />;
      case 'content':
        return <ContentManagement />;
      default:
        return <ThemeConfiguration />;
    }
  };

  return (
    <div className={styles.adminPanel}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('adminPanel')}</h1>
      </div>

      <div className={styles.navigation}>
        <Button
          label={t('themeConfiguration')}
          type={
            activeSection === 'theme'
              ? ButtonType.primary
              : ButtonType.secondary
          }
          onClick={() => navigate('/admin/theme')}
        />
        <Button
          label={t('contentManagement')}
          type={
            activeSection === 'content'
              ? ButtonType.primary
              : ButtonType.secondary
          }
          onClick={() => navigate('/admin/content')}
        />
      </div>

      <div className={styles.content}>{renderContent()}</div>
    </div>
  );
};

export default AdminPanel;
