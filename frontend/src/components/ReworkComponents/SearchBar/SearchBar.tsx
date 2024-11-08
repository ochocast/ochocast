import React, { useState } from 'react';
import styles from './SearchBar.module.css';

export interface SearchBarProps {
  onSearch: (query: string) => void;
}

const SearchBar = ({ onSearch }: SearchBarProps) => {
  const [query, setQuery] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleSearch = () => {
    console.log('Searching for:', query);
    onSearch(query);
  };
  return (
    <div className={styles.searchBar}>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        placeholder="Recherche une vidéo ici..."
        className={styles.searchInput}
      />
      <button onClick={handleSearch} className={styles.searchButton}>
        <img className={styles.searchIcon} alt="Search" src="search.svg" />
      </button>
    </div>
  );
};

export default SearchBar;
