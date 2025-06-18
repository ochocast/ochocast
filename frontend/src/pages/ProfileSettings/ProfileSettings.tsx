import React, { useCallback, useRef, ChangeEvent, useEffect, useState } from 'react';
import style from './profileSetting.module.css'; 
import { useNavigate } from 'react-router-dom';
import { User } from '../../utils/VideoProperties';
import { useTranslation } from 'react-i18next';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import {
  getUsers,
  updateProfile,
  updateProfileWithoutImage,
  getProfilePicture,
} from '../../utils/api';
import Card from '../../components/ReworkComponents/generic/Cards/Card';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import ImagePlus from '../../assets/image_plus.svg';

const ProfileSetting = () => {
  const navigate = useNavigate();
  const [pseudo, setPseudo] = useState('');
  const [description, setDescription] = useState('');
  const userString = localStorage.getItem('backendUser');
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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

  const [picture, setPicture] = useState<File>();
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);

    useEffect(() => {
      const fetchMiniatureUrl = async () => {
        if (currentUser && currentUser.email) {
          try {
            const url = await getProfilePicture(currentUser.id);
            // TODO: rework this condition
            if (url?.data.includes('miniatureundefined')) {
              return;
            }
            setPictureUrl(url?.data || '/persona.png');
          } catch (error) {
            console.error('Error fetching miniature URL', error);
          }
        }
      };
    fetchMiniatureUrl();
  }, [currentUser]);

  const handleConfirm = () => {
    setIsLoading(true);

    if (picture != undefined) {
      const form = new FormData();

      if (pseudo) form.append('firstName', pseudo);
      else if (currentUser) form.append('firstName', currentUser?.firstName);
      form.append('description', description);
      form.append('file', picture);
      form.append('picture_id', picture.name);

      updateProfile(form)
        .then(async (response) => {
          if (
            response.status === 202 ||
            response.status === 201 ||
            response.status === 204 ||
            response.status === 200
          ) {
            alert('Profil mis à jour !');
            navigate('/profile');
          } else {
            alert('Erreur lors de la modification du profil');
          }
        })
        .catch((error) => {
          console.error('Erreur lors de la modification du profil', error);
          alert('Erreur lors de la modification du profil');
        }
      );
    }
    else {
      updateProfileWithoutImage(
        {
          'firstName': pseudo || currentUser?.firstName,
          'description': description,
          'picture_id': currentUser?.picture_id,
        }
      )
        .then(async (response) => {
          if (
            response.status === 202 ||
            response.status === 201 ||
            response.status === 204 ||
            response.status === 200
          ) {
            alert('Profil mis à jour !');
            navigate('/profile');
          } else {
            alert('Erreur lors de la modification du profil');
          }
        })
        .catch((error) => {
          console.error('Erreur lors de la modification du profil', error);
          alert('Erreur lors de la modification du profil');
        }
      );
    }
    setIsLoading(false);
  };

      
  const handleCancel = () => {
    navigate('/profile');
  };


  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadNewimg = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files != null && e.target.files != undefined) {
      const picture_tmp = e.target.files[0];
      const reader = new FileReader();

      reader.onload = () => {
        // Vérifie explicitement que reader.result est bien une chaîne
        if (typeof reader.result === 'string') {
          setPictureUrl(reader.result); // Affecte l'URL de la preview
        } else {
          console.error("Le résultat du FileReader n'est pas une chaîne !");
        }
      };
      
      reader.readAsDataURL(picture_tmp);
      if (picture_tmp != undefined) setPicture(picture_tmp);
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };
  
  if (isLoading) {
    return <LoadingCircle />;
  }

  return (
    <div className={style.display_with_margin}>
      <Card>
        <div className={style.profileContainer}>
          <div className={style.relativeContainer}>
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleLoadNewimg}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <div className={style.overlay} onClick={handleImageClick}>
              <img src={ImagePlus} alt="Ajouter image" />
            </div>
            <img 
              className={style.imageLarge} 
              alt=""
              src={
              pictureUrl !== null
                ? pictureUrl
                : '/persona.png'
              } 
              onClick={handleImageClick}
            />
          </div>
          <div className={style.description}>
            <div className={style.titles}>
              <h2 className={style.name}>
                <input
                  type="text"
                  placeholder={currentUser?.firstName || 'Pseudo'}
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  className={style.input}
                style={{
                  border: '1px solid var(--theme-color-2000)',
                  borderRadius: 'inherit',
                  width: '-webkit-fill-available',
                  height: '-webkit-fill-available',
                  textAlign: 'left',
                }}
                />
              </h2>
              <h5 className={style.email}>{t('Email')} {currentUser?.email}</h5>
              <span className={style.descriptionTitle}>{t('Description')}</span>
              <input
                type="text"
                placeholder={currentUser?.description || ''}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={style.input}
                style={{
                  border: '1px solid var(--theme-color-2000)',
                  borderRadius: 'inherit',
                  width: '-webkit-fill-available',
                  height: '-webkit-fill-available',
                  textAlign: 'left',
                }}
              />
            </div>
            <div className={style.button_line}>
              <Button
                onClick={handleConfirm}
                label={t('Confirm')}
                type={ButtonType.primary}
              ></Button>
              
              <Button
                onClick={handleCancel}
                label={t('cancel')}
                type={ButtonType.secondary}
              ></Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ProfileSetting;
