import React, { useState } from 'react';
import styles from './SideSearchBar.module.css';
import Tag from '../../../generic/Tag/Tag';
import SearchBar, {
  SearchBarIcon,
} from '../../../navigation/SearchBar/SearchBar';
import Card from '../../../generic/Cards/Card';
import Button from '../../../generic/Button/Button';
import { useNavigate } from 'react-router-dom';
import { Tag_video, User } from '../../../../../utils/VideoProperties';

export interface SearchBarProps {
  onSearch: (keyword: string[], tags: string[], users: string[]) => void;
  tags: Tag_video[];
  users: User[];
}

const SideSearchBar = (props: SearchBarProps) => {
  const navigate = useNavigate();

  const [keywords_list, setKeywordsList] = useState<string[]>([]);
  const handleClick_Keywords = (str: string) => {
    setKeywordsList([...keywords_list, str]);
  };
  const handleRemove_Keywords = (str: string) => {
    setKeywordsList(keywords_list.filter((keyword) => keyword !== str));
  };

  const [tags_list, setTagsList] = useState<string[]>([]);
  const handleClick_Tags = (str: string) => {
    setTagsList([...tags_list, str]);
  };
  const handleRemove_Tags = (str: string) => {
    setTagsList(tags_list.filter((tag) => tag !== str));
  };
  const tag_filter = () => {
    const list: string[] = [];
    props.tags.forEach((obj) => {
      const name = obj.name;
      if (!tags_list.includes(name)) list.push(name);
    });
    return list;
  };
  const selectTag = (str: string) => {
    const tag = props.tags.find((obj) => {
      return obj.name === str;
    });
    if (tag !== undefined) {
      setTagsList([...tags_list, tag.name]);
    }
  };

  const [users_list, setUsersList] = useState<string[]>([]);
  const handleClick_Users = (str: string) => {
    setUsersList([...users_list, str]);
  };
  const handleRemove_Users = (str: string) => {
    setUsersList(users_list.filter((user) => user !== str));
  };
  const user_filter = () => {
    const list: string[] = [];
    props.users.forEach((obj) => {
      const name = obj.username || obj.firstName + ' ' + obj.lastName;
      if (!users_list.includes(name)) {
        list.push(name);
      }
    });
    return list;
  };
  const selectUser = (str: string) => {
    const user = props.users.find((obj) => {
      const uname = obj.username || obj.firstName + ' ' + obj.lastName;
      return uname === str;
    });
    if (user) {
      const uname = user.username || user.firstName + ' ' + user.lastName;
      setUsersList([...users_list, uname]);
    }
  };

  return (
    <Card styleAddon={{ height: '100%' }}>
      <div className={styles.property1withcreatevideo}>
        <Button
          label="Créer une vidéo"
          onClick={() => navigate('/video/video-settings')}
        />
        {/* <div className={styles.button}>
          <div className={styles.commingSoon}></div>
        </div> */}
        <div className={styles.vector9Stroke}></div>
        <div className={styles.tagSeach}>
          <SearchBar
            onClick={handleClick_Keywords}
            icon={SearchBarIcon.ADD}
            placeholder="Mot-clé du titre..."
          />
          <div className={styles.tagLists}>
            {keywords_list.map((keyword, index) => (
              <Tag
                content={keyword}
                key={index}
                editable
                delete={handleRemove_Keywords}
              />
            ))}
          </div>
        </div>
        <div className={styles.vector10Stroke}></div>
        <div className={styles.tagSeach}>
          <SearchBar
            onClick={handleClick_Tags}
            icon={SearchBarIcon.ADD}
            placeholder="Tag..."
          />
          <div className={styles.tagLists}>
            {tags_list.map((tag, index) => (
              <Tag
                content={tag}
                key={index}
                editable
                delete={handleRemove_Tags}
              />
            ))}
          </div>
        </div>
        <div className={styles.vector10Stroke}></div>
        <div className={styles.tagSeach}>
          <SearchBar
            onClick={handleClick_Users}
            icon={SearchBarIcon.ADD}
            placeholder="User..."
          />
          <div className={styles.tagLists}>
            {users_list.map((user, index) => (
              <Tag
                content={user}
                key={index}
                editable
                delete={handleRemove_Users}
              />
            ))}
          </div>
        </div>
        <SearchBar
          onClick={() => props.onSearch(keywords_list, tags_list, users_list)}
          needInput={false}
        />
      </div>
    </Card>
  );
};

export default SideSearchBar;
