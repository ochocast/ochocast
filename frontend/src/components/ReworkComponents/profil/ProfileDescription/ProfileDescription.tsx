import React from 'react';
import styles from './ProfileDescription.module.css';
import Card from '../../generic/Cards/Card';
import CSS from 'csstype';
import { useAuth } from 'react-oidc-context';
import Button from '../../generic/Button/Button';
import { useTranslation } from 'react-i18next';

export enum ProfileDescriptionState {
  tiny = 'tiny',
  minimal = 'minimal',
  standard = 'standard',
  large = 'large',
}

type ProfileDescriptionProps = {
  name: string;
  email: string;
  description: string;
  image?: string;
  state: ProfileDescriptionState;
};

const ProfileDescription = (props: ProfileDescriptionProps) => {
  const tinyPading: CSS.Properties = {
    padding: '1rem',
    maxWidth: 'min-content',
  };
  const auth = useAuth();
  const { t } = useTranslation();
  const imageSrc = props.image === undefined ? '/persona.png' : props.image;
  // const imageSrc = props.image
  //   ? props.image
  //   : process.env.DEFAULT_PERSONA_IMAGE;
  // console.log(
  //   props.image,
  //   props.image ? props.image : process.env.DEFAULT_PERSONA_IMAGE,
  //   process.env.DEFAULT_PERSONA_IMAGE,
  //   imageSrc,
  // );
  if (props.state === ProfileDescriptionState.tiny) {
    return (
      <Card styleAddon={tinyPading}>
        <div className={styles.profileContainer}>
          <img className={styles.imageSmall} alt="" src={imageSrc} />
          <h3 className={styles.name}>{props.name}</h3>
        </div>
      </Card>
    );
  }

  if (props.state === ProfileDescriptionState.minimal) {
    return (
      <Card>
        <div className={styles.profileContainerCol}>
          <img className={styles.image} alt="" src={imageSrc} />
          <div className={styles.titlesCenter}>
            <h2 className={styles.name}>{props.name}</h2>
            <h5 className={styles.email}>{t('Email')} {props.email}</h5>
          </div>
        </div>
      </Card>
    );
  }
  if (props.state === ProfileDescriptionState.standard) {
    return (
      <Card>
        <div className={styles.profileContainer}>
          <img className={styles.image} alt="" src={imageSrc} />
          <div>
            <div className={styles.titles}>
              <h2 className={styles.name}>{props.name}</h2>
              <h5 className={styles.email}>{t('Email')} {props.email}</h5>
              <span className={styles.descriptionTitle}>{t('Description')}</span>
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
          <img className={styles.imageLarge} alt="" src={imageSrc} />
          <div className={styles.description}>
            <div className={styles.titles}>
              <h2 className={styles.name}>{props.name}</h2>
              <h5 className={styles.email}>{t('Email')} {props.email}</h5>
              <span className={styles.descriptionTitle}>{t('Description')}</span>
              <span>{props.description}</span>
            </div>
            <div className={styles.logout}>
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
