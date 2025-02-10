import styles from './SuggestionBar.module.css';
import { findTags, findUsers } from '../../../../../utils/api';
import logger from '../../../../../utils/logger';
import React, { useEffect, useState, useRef } from 'react';
import { Tag_video, User } from '../../../../../utils/VideoProperties';

export enum SuggestionType {
  TAG = 'tag',
  USER = 'user',
}

export type Suggestion = Tag_video | User;

export interface SuggestionBarProps {
  onClick: (query: Suggestion) => void;
  placeholder: string;
  type: SuggestionType;
  name: string;
  onAdd?: (object: string) => void;
}

const SuggestionBar = ({
  onClick,
  placeholder,
  type,
  name,
  onAdd,
}: SuggestionBarProps) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestion] = useState<Suggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null); // Référence pour l'élément d'entrée

  const findSuggestions = async (query_enter: string) => {
    try {
      const response = await ((type === SuggestionType.TAG )? findTags(query_enter) : findUsers(query_enter));
      setSuggestion((response.data === null) ? [] : response.data);
    } catch (error) {
      logger.error('Error fetching users and tags:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value !== '')
      findSuggestions(e.target.value);
    setQuery(e.target.value);
  };

  useEffect(() => {
    const suggestionsList = document.getElementById(`suggestions_list_${name}`) as HTMLUListElement;
    if(query === ""){
      suggestionsList.style.display = "none";
      return;
    }
    const filteredObjects: { name: string;  reference?: Suggestion; isAddable: boolean}[] = [];

    if (onAdd !== undefined && suggestions.length === 0 && query !== ""){
      filteredObjects.push({name: query, reference: undefined, isAddable: true});
    }
    suggestions.slice(0, 3).forEach((tmp) => {
      let obj;
      if(type == SuggestionType.TAG){
        const tag = tmp as Tag_video;
        obj = { name: tag.name, reference: tag, isAddable: false};
      }
      else{
        const user = tmp as User;
        obj = { name: user.firstName + ' ' + user.lastName, reference: user, isAddable: false};
      }
      filteredObjects.push(obj);
    return filteredObjects;
    });

    suggestionsList.innerHTML = '';
    if(filteredObjects.length === 0){
      suggestionsList.style.display = 'none';
      return;
    }
    suggestionsList.style.display = 'block';
    filteredObjects.forEach((obj) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '8px';
      const addButton = document.createElement('button');
      addButton.innerText = '+';
      addButton.className = styles.addbutton;

      li.innerText = obj.name;
      li.onclick = () => {
        if (inputRef.current) {
          inputRef.current.value = ''; // Utilisation de la référence pour manipuler l'élément
        }
        suggestionsList.style.display = 'none';

        setSuggestion([]);
        if(obj.isAddable && onAdd !== undefined)
          onAdd(obj.name);
        else
          onClick(obj.reference as Suggestion);
        setQuery('');
      };
      if(obj.isAddable)
        li.appendChild(addButton);
      suggestionsList.appendChild(li);
    });
  }, [suggestions, onClick, name , query, onAdd, type]);

  return (
    <div className={styles.searchcontainer}>
    <input
      value={query}
      placeholder={placeholder}
      style={{ marginBottom: '10px', width: '100%' }}
      onChange={handleInputChange}
      id={`search-bar`}
      className={styles.searchBar}
      ref={inputRef}
    />
    <ul id={`suggestions_list_${name}`} className={styles.suggestions_list}></ul>
  </div>
  );
};

export default SuggestionBar;
