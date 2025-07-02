import React, { useCallback, useEffect, useState } from 'react';
import styles from './ProfileDescription.module.css';
import Card from '../../generic/Cards/Card';
import CSS from 'csstype';
import { useAuth } from 'react-oidc-context';
import Button from '../../generic/Button/Button';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getUsers, getProfilePicture } from '../../../../utils/api';
import { User } from '../../../../utils/VideoProperties';
import LoadingCircle from '../../LoadingCircle/LoadingCircle';

export enum ProfileDescriptionState {
  tiny = 'tiny',
  minimal = 'minimal',
  standard = 'standard',
  large = 'large',
}

const DEFAULT_PERSONA_IMAGE = '/persona.png';

type ProfileDescriptionProps = {
  firstname: string;
  lastname: string;
  email: string;
  description: string;
  image?: string;
  state: ProfileDescriptionState;
};

const ProfileDescription = (props: ProfileDescriptionProps) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const userString = localStorage.getItem('backendUser');
  const navigate = useNavigate();
  const auth = useAuth();
  const { t } = useTranslation();

  const getMe = useCallback(async () => {
    setIsLoading(true);
    try {
      const backendUser = JSON.parse(userString!);

      const userResponse = await getUsers();
      const user = userResponse.data.find((u: User) => u.id === backendUser.id);
      setCurrentUser(user || null);
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
    setIsLoading(false);
  }, [userString]);

  useEffect(() => {
    getMe();
  }, [getMe]);

  const [pictureUrl, setPictureUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchMiniatureUrl = async () => {
      setIsLoading(true);
      if (currentUser && currentUser.email) {
        try {
          const url = await getProfilePicture(currentUser.id);
          // TODO: rework this condition
          if (url?.data.includes('miniatureundefined')) {
            return;
          }
          setPictureUrl(url?.data || DEFAULT_PERSONA_IMAGE);
        } catch (error) {
          console.error('Error fetching miniature URL', error);
        }
      }
    };
    fetchMiniatureUrl();
    setIsLoading(false);
  }, [currentUser]);

  if (isLoading) {
    return <LoadingCircle />;
  }

  const tinyPading: CSS.Properties = {
    padding: '1rem',
    maxWidth: 'min-content',
  };

  if (props.state === ProfileDescriptionState.tiny) {
    return (
      <Card styleAddon={tinyPading}>
        <div className={styles.profileContainer}>
          <h3 className={styles.namesmall}>
            <span>{props.firstname}</span>
            <span>{props.lastname}</span>
          </h3>

          <img
            className={styles.imageSmall}
            alt=""
            src={pictureUrl !== null ? pictureUrl : DEFAULT_PERSONA_IMAGE}
          />
        </div>
      </Card>
    );
  }

  if (props.state === ProfileDescriptionState.minimal) {
    return (
      <Card>
        <div className={styles.profileContainerCol}>
          <img
            className={styles.image}
            alt=""
            src={pictureUrl !== null ? pictureUrl : DEFAULT_PERSONA_IMAGE}
          />
          <div className={styles.titlesCenter}>
            <h2 className={styles.name}>{props.firstname}</h2>
            <h5 className={styles.email}>
              {t('Email')} {props.email}
            </h5>
          </div>
        </div>
      </Card>
    );
  }
  if (props.state === ProfileDescriptionState.standard) {
    return (
      <Card>
        <div className={styles.profileContainer}>
          <img
            className={styles.image}
            alt=""
            src={pictureUrl !== null ? pictureUrl : DEFAULT_PERSONA_IMAGE}
          />
          <div>
            <div className={styles.titles}>
              <h2 className={styles.name}>{props.firstname}</h2>
              <h5 className={styles.email}>
                {t('Email')} {props.email}
              </h5>
              <span className={styles.descriptionTitle}>
                {t('Description')}
              </span>
              <span className={styles.descriptionClamp}>
                {props.description}
              </span>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (props.state === ProfileDescriptionState.large) {
    return (
      <Card>
        <div className={styles.profileContainer}>
          <img
            className={styles.image}
            alt=""
            src={pictureUrl !== null ? pictureUrl : DEFAULT_PERSONA_IMAGE}
          />
          <div className={styles.description}>
            <div className={styles.titles}>
              <h2 className={styles.name}>{props.firstname}</h2>
              <h5 className={styles.email}>
                {t('Email')} {props.email}
              </h5>
              <span className={styles.descriptionTitle}>
                {t('Description')}
              </span>
              <span>{props.description}</span>
            </div>
            <div className={styles.logout}>
              <Button
                onClick={() => navigate(`/profile/profile-settings`)}
                label={t('modifyProfile')}
              ></Button>
              <Button
                label={t('disconnection')}
                onClick={() => auth.signoutRedirect()}
              />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return <div></div>;
};

export default ProfileDescription;
