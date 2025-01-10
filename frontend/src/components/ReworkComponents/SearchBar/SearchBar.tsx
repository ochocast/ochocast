import React, { useState } from 'react';
import styles from './SearchBar.module.css';
import { Tag_video, User} from '../../../utils/VideoProperties';
import { findTags, findUsers } from '../../../utils/api';
import logger from '../../../utils/logger';
import Tag_Logo from '../../../assets/Tag_Logo.png';

export enum SearchBarIcon {
  SEARCH = 'search.svg',
  ADD = 'add.svg',
}

export interface SearchBarProps {
  onClick: (query: string) => void;
  placeholder?: string;
  needInput?: boolean;
  icon?: SearchBarIcon;
}

const SearchBar = ({
  onClick,
  needInput,
  placeholder,
  icon,
}: SearchBarProps) => {
  const [query, setQuery] = useState('');


  const [tag_suggestions, setTag] = useState<Tag_video[]>([]);
  const [user_suggestions, setUser] = useState<User[]>([]);

  if (needInput === undefined) {
    needInput = true;
  }

  const findSuggestions = async () =>{
    try {
      const tagResponse = await findTags();
      setTag(tagResponse.data);
      const userResponse  = await findUsers();
      setUser(userResponse.data);
    }catch (error){
      logger.error('Error fetching users and tags:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    findSuggestions();
  };

  const handleClick = () => {
    if (!needInput || query !== '') onClick(query);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleClick();
    }
  };

  const handleEntryChange = (e: React.KeyboardEvent<HTMLInputElement>) => {

    const inputElement = e.target as HTMLInputElement;
    const suggestionsList = document.getElementById(
      'suggestions_list',
    ) as HTMLUListElement;

    suggestionsList.innerHTML = '';
    const filteredObjects: { name: string; img: string }[] = [];

    tag_suggestions.slice(0,3).forEach((tag) => {
      const obj = { name: tag.name, img: Tag_Logo };
      filteredObjects.push(obj);
    });   

    user_suggestions.slice(0,3).forEach((usr) => {
      const obj = { name: usr.firstName + " " + usr.lastName , img: "imgTag" };
      filteredObjects.push(obj);
    });

    if (query && filteredObjects.length != 0) {
      suggestionsList.style.display = 'block';
      suggestionsList.innerHTML = '';
    
      filteredObjects.forEach((obj) => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '8px';

        const img = document.createElement('img');
        img.src = obj.img;
        img.alt = obj.name;
        img.style.width = '24px';
        img.style.height = '24px';
        img.style.borderRadius = '50%';
    
        li.innerText = obj.name;
    
        li.onclick = () => {
          inputElement.value = '';
          suggestionsList.style.display = 'none';
          setQuery("");
          onClick(li.innerHTML);
        };

        li.prepend(img);
    
        suggestionsList.appendChild(li);
      });
    
    } else {
      suggestionsList.style.display = 'none';
    }
  };


  return (
    <>
      <div className={styles.searchBar}>
        {needInput && (
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyUp={handleEntryChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ? placeholder : 'Recherche ...'}
            className={styles.searchInput}
          />
        )}
        <button onClick={handleClick} className={styles.searchButton}>
          <img
            className={styles.searchIcon}
            alt="Search"
            src={
              icon == SearchBarIcon.ADD ? SearchBarIcon.ADD : SearchBarIcon.SEARCH
            }
          />
        </button>
      </div>
     <ul id={`suggestions_list`} className="suggestions_list"></ul>
    </>
    

  );
};

export default SearchBar;
