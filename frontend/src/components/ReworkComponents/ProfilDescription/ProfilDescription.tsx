import React from 'react';
import styles from './ProfilDescription.module.css';
import Card from '../Cards/Card';
import CSS from 'csstype';
import { useAuth } from 'react-oidc-context';
import HomeCardButton from '../Button/HomeCardButton/HomeCardButton';

type ProfilDescriptionProps = {
  name: string;
  email: string;
  description: string;
  image?: string;
  state: ProfilDescriptionState;
};

export enum ProfilDescriptionState {
  tiny = 'tiny',
  minimal = 'minimal',
  standard = 'standard',
  large = 'large',
}

const ProfilDescription = (props: ProfilDescriptionProps) => {
  const tinyPading: CSS.Properties = {
    padding: '1rem',
    maxWidth: 'min-content',
  };
  const auth = useAuth();
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
  if (props.state === ProfilDescriptionState.tiny) {
    return (
      <Card styleAddon={tinyPading}>
        <div className={styles.profilContainer}>
          <img className={styles.imageSmall} alt="" src={imageSrc} />
          <h3 className={styles.name}>{props.name}</h3>
        </div>
      </Card>
    );
  }

  if (props.state === ProfilDescriptionState.minimal) {
    return (
      <Card>
        <div className={styles.profilContainerCol}>
          <img className={styles.image} alt="" src={imageSrc} />
          <div className={styles.titlesCenter}>
            <h2 className={styles.name}>{props.name}</h2>
            <h5 className={styles.email}>Email: {props.email}</h5>
          </div>
        </div>
      </Card>
    );
  }
  if (props.state === ProfilDescriptionState.standard) {
    return (
      <Card>
        <div className={styles.profilContainer}>
          <img className={styles.image} alt="" src={imageSrc} />
          <div>
            <div className={styles.titles}>
              <h2 className={styles.name}>{props.name}</h2>
              <h5 className={styles.email}>Email: {props.email}</h5>
              <span className={styles.descriptionTitle}>Description :</span>
              <span className={styles.descriptionClamp}>
                {props.description}
              </span>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (props.state === ProfilDescriptionState.large) {
    return (
      <Card>
        <div className={styles.profilContainer}>
          <img className={styles.imageLarge} alt="" src={imageSrc} />
          <div className={styles.description}>
            <div className={styles.titles}>
              <h2 className={styles.name}>{props.name}</h2>
              <h5 className={styles.email}>Email: {props.email}</h5>
              <span className={styles.descriptionTitle}>Description :</span>
              <span>{props.description}</span>
            </div>
            <div className={styles.logout}>
              <HomeCardButton
                Title="Déconnexion"
                onClickFunction={() => auth.signoutRedirect()}
              />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return <div></div>;
};

export default ProfilDescription;
