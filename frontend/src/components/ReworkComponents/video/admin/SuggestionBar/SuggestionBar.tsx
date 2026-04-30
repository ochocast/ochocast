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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null); // Référence pour l'élément d'entrée
  const [filteredObjects, setFilteredObjects] = useState<
    {
      name: string;
      reference?: Suggestion;
      isAddable: boolean;
    }[]
  >([]);

  const findSuggestions = async (query_enter: string) => {
    try {
      const response = await (type === SuggestionType.TAG
        ? findTags(query_enter)
        : findUsers(query_enter));
      setSuggestion(response.data === null ? [] : response.data);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching users and tags');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value !== '') findSuggestions(e.target.value);
    setQuery(e.target.value);
    setSelectedIndex(0); // Reset selection when typing
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const suggestionsList = document.getElementById(
      `suggestions_list_${name}`,
    ) as HTMLUListElement;

    if (
      suggestionsList.style.display === 'none' ||
      filteredObjects.length === 0
    ) {
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      if (
        filteredObjects.length > 0 &&
        selectedIndex < filteredObjects.length
      ) {
        const selectedObj = filteredObjects[selectedIndex];

        if (inputRef.current) {
          inputRef.current.value = '';
        }
        suggestionsList.style.display = 'none';
        setSuggestion([]);

        if (selectedObj.isAddable && onAdd !== undefined) {
          onAdd(selectedObj.name);
        } else {
          onClick(selectedObj.reference as Suggestion);
        }

        setQuery('');
        setSelectedIndex(0);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredObjects.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Escape') {
      suggestionsList.style.display = 'none';
      setQuery('');
      setSelectedIndex(0);
    }
  };

  useEffect(() => {
    const suggestionsList = document.getElementById(
      `suggestions_list_${name}`,
    ) as HTMLUListElement;
    if (query === '') {
      suggestionsList.style.display = 'none';
      return;
    }
    const newFilteredObjects: {
      name: string;
      reference?: Suggestion;
      isAddable: boolean;
    }[] = [];

    if (onAdd !== undefined && suggestions.length === 0 && query !== '') {
      newFilteredObjects.push({
        name: query,
        reference: undefined,
        isAddable: true,
      });
    }
    suggestions.slice(0, 3).forEach((tmp) => {
      let obj;
      if (type === SuggestionType.TAG) {
        const tag = tmp as Tag_video;
        obj = { name: tag.name, reference: tag, isAddable: false };
      } else {
        const user = tmp as User;
        obj = {
          name: user.firstName + ' ' + user.lastName,
          reference: user,
          isAddable: false,
        };
      }
      newFilteredObjects.push(obj);
      return newFilteredObjects;
    });

    setFilteredObjects(newFilteredObjects);

    suggestionsList.innerHTML = '';
    if (newFilteredObjects.length === 0) {
      suggestionsList.style.display = 'none';
      return;
    }
    suggestionsList.style.display = 'block';
    newFilteredObjects.forEach((obj, index) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '8px';

      // Highlight selected item
      if (index === selectedIndex) {
        li.style.backgroundColor = 'var(--primary-color)';
        li.style.color = 'white';
      }

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
        if (obj.isAddable && onAdd !== undefined) onAdd(obj.name);
        else onClick(obj.reference as Suggestion);
        setQuery('');
        setSelectedIndex(0);
      };

      // Hover effect
      li.onmouseenter = () => {
        setSelectedIndex(index);
      };

      if (obj.isAddable) li.appendChild(addButton);
      suggestionsList.appendChild(li);
    });
  }, [suggestions, onClick, name, query, onAdd, type, selectedIndex]);

  return (
    <div className={styles.searchcontainer}>
      <input
        value={query}
        placeholder={placeholder}
        style={{ marginBottom: '10px', width: '100%' }}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        id={`search-bar`}
        className={styles.searchBar}
        ref={inputRef}
      />
      <ul
        id={`suggestions_list_${name}`}
        className={styles.suggestions_list}
      ></ul>
    </div>
  );
};

export default SuggestionBar;
