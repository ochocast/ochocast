import React, { useEffect, useState } from 'react';
import styles from './ProfileDescription.module.css';
import Card from '../../generic/Cards/Card';
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
  reply = 'reply',
}

const DEFAULT_PERSONA_IMAGE = '/branding/persona.png';

type ProfileDescriptionProps = {
  firstname: string;
  lastname: string;
  username: string;
  email: string;
  description: string;
  image?: string;
  state: ProfileDescriptionState;
  isCurrentUser?: boolean;
};

const ProfileDescription = (props: ProfileDescriptionProps) => {
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const auth = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const fetchMiniatureUrl = async () => {
      setIsLoading(true);
      try {
        const userResponse = await getUsers();
        const user: User | undefined = userResponse.data.find(
          (u: User) => u.email === props.email,
        );

        if (user) {
          const url = await getProfilePicture(user.id);
          if (
            url?.data &&
            typeof url.data === 'string' &&
            !url.data.includes('miniatureundefined')
          ) {
            setPictureUrl(url.data);
          } else {
            setPictureUrl(DEFAULT_PERSONA_IMAGE);
          }
        } else {
          setPictureUrl(DEFAULT_PERSONA_IMAGE);
        }
      } catch (error) {
        console.error('Error fetching profile picture', error);
        setPictureUrl(DEFAULT_PERSONA_IMAGE);
      }
      setIsLoading(false);
    };

    fetchMiniatureUrl();
  }, [props.email, props.image]);

  if (isLoading) {
    return <LoadingCircle />;
  }

  if (props.state === ProfileDescriptionState.tiny) {
    return (
      <div className={styles.profileContainer}>
        <h3 className={styles.namesmall}>
          {props.username && <span>{props.username}</span>}
          {!props.username && <span>{props.firstname}</span> && (
            <span>{props.lastname}</span>
          )}
        </h3>

        <img
          className={styles.imageSmall}
          alt=""
          src={pictureUrl !== null ? pictureUrl : DEFAULT_PERSONA_IMAGE}
        />
      </div>
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
            <h2 className={styles.name}>{props.username || props.firstname}</h2>
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
              <h2 className={styles.name}>
                {props.username || props.firstname}
              </h2>
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
              <h2 className={styles.name}>
                {props.username || props.firstname}
              </h2>
              <h5 className={styles.email}>
                {t('Email')} {props.email}
              </h5>
              <span className={styles.descriptionTitle}>
                {t('Description')}
              </span>
              <span>{props.description}</span>
            </div>
            {props.isCurrentUser && (
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
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (props.state === ProfileDescriptionState.reply) {
    return (
      <img
        className={styles.imageReply}
        alt=""
        src={pictureUrl !== null ? pictureUrl : DEFAULT_PERSONA_IMAGE}
      />
    );
  }

  return <div></div>;
};

export default ProfileDescription;
