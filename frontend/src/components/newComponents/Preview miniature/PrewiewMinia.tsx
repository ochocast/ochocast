import React, { FC } from 'react';

import './PreviewMinia.css';
import Tag from '../Tag/Tag';
import Card from '../Card/Card';
import Miniature from './Miniature.png';

interface PreviewMiniaProps {
  className?: string;
  style?: React.CSSProperties;
  tcolor?: string;
  tsize?: string;
  height?: string;
  width?: string;
}

const PreviewMinia: FC<PreviewMiniaProps> = ({
  style,
  tcolor = 'black',
  tsize = '1em',
}) => {
  return (
    <Card style={{ flexDirection: 'column' }}>
      <h1
        style={{
          ...style,
          color: tcolor,
          fontSize: tsize,
          textAlign: 'center'
        }} > 
      Preview de la miniature de la vidéo
      </h1>
      <img className="Miniature"
        src={Miniature}
        alt="Miniature"/>
      <div className='Titre'
        style={{
          ...style,
          color: tcolor,
        }} > 
      Title
      </div>
      <div className='Creator'
        style={{
          ...style,
          color: tcolor,
        }}
      > Créer par: Nom Prenom
      </div>
      <div className='VueDate'
        style={{
          ...style,
          color: tcolor,
        }}
      > nb vue - posté le jj/mm/yyyy
      </div>
      <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
        </div>
    </Card>
  );
};

export default PreviewMinia;