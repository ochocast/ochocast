import './video.css';

import { FC } from 'react';
import React from 'react';

import { useParams } from 'react-router-dom';
import Card from '../../components/newComponents/Card/Card';

import Button from '../../components/buttons/button/button';
import Toggle from '../../components/newComponents/Toggle/Toggle';
import InputFile from '../../components/newComponents/inputFile/InputFile';
import UserProfile from '../../components/newComponents/User profile/UserProfile';
import Tag from '../../components/newComponents/Tag/Tag';
import Lock_Open from '../../assets/Opened_PNG.png';
import Lock_Close from '../../assets/Locked_PNG.png';
import PreviewMinia from '../../components/newComponents/Preview miniature/PrewiewMinia';

interface VideoProps {}

const TrackSettings: FC<VideoProps> = () => {
  const { eventId, trackId } = useParams();
  console.log(eventId, trackId);

  return (
    <div className="mainvideo">
      <div className="container">
        <Card style={{ flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
              height: 'fit-content',
            }}
          >
            <div></div>
            <Card
              style={{
                height: 'fit-content',
                width: 'fit-content',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <input placeholder="Title" />
            </Card>
            <img className="Closed Lock" src={Lock_Close} alt="Closed Lock" />
            <Toggle />
            <img className="Opened Lock" src={Lock_Open} alt="Opened Lock" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <Card>
              <InputFile placeholder="Glissez ou choisissez votre Média" />
            </Card>
            <Card>
              <InputFile placeholder="Glissez ou choisissez votre Support" />
            </Card>
            <Card>
              <InputFile placeholder="Glissez ou choisissez votre Miniature" />
            </Card>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <Card style={{ flexDirection: 'column', height: 'auto' }}>
              <div style={{ display: 'flex' }}>
                <input
                  placeholder="Tags"
                  style={{
                    marginBottom: '10px',
                    width: '100%',
                  }}
                />
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
            <Card style={{ flexDirection: 'column', height: 'auto' }}>
              <div style={{ display: 'flex' }}>
                <input
                  placeholder="Intern"
                  style={{ marginBottom: '10px', width: '100%' }}
                />
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
            <Card style={{ flexDirection: 'column', height: 'auto' }}>
              <div>Externe</div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '10px',
                  width: '100%',
                  height: '100%',
                }}
              >
                <textarea style={{ resize: 'none' }}></textarea>
              </div>
            </Card>
          </div>
          <Card bcolor="#EDEDED">
            <textarea placeholder="Description" style={{ resize: 'none' }} />
          </Card>
          <div className="buttonContainer">
            <Button>Enregistrer en Brouillon</Button>
            <Button>Publier la vidéo</Button>
          </div>
        </Card>
      </div>
      <div className="generalinfo">
        <UserProfile></UserProfile>
        <PreviewMinia></PreviewMinia>
      </div>
      {/* 
      <Tag className='primary' >Test Primary</Tag>
      <Tag className='secondary' tsize='15px' >Test Secondary</Tag> */}
    </div>
  );
};

export default TrackSettings;
