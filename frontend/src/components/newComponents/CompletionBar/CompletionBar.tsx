  import React, { FC } from 'react';
  import './CompletionBar.css';

  export interface CompletionBarProps {
    name: string;
    filter: () => string[];
    select: (str: string) => void;
  }

  const CompletionBar: FC<CompletionBarProps> = ({
    filter,
    select,
    name,
  }) => {

    const handleEntryChange = () => {
      const inputElement = document.getElementById('search-bar-' + name) as HTMLInputElement;
      const inputValue: string = inputElement.value.toLowerCase();
      const suggestionsList = document.getElementById('suggestions-list-' +name) as HTMLUListElement;

      suggestionsList.innerHTML = '';
      const filteredObjects: string[] = filter();


      if (inputValue && filteredObjects.length != 0) {
          suggestionsList.style.display = 'block';

          filteredObjects.forEach(str => {
              const li = document.createElement('li');
              li.innerText = str;
              li.onclick = () => {
                inputElement.value = '';
                suggestionsList.style.display = 'none';
                select(str);
              };
              suggestionsList.appendChild(li);
          });
      } else {
          suggestionsList.style.display = 'none';
      }
    };
    return (
      <div className="search-container">
        <input
          placeholder={name}
          style={{ marginBottom: '10px', width: '100%' }}
          onKeyUp={handleEntryChange}
          id={`search-bar-${name}`}
          className='search-bar'
        />
        <ul id={`suggestions-list-${name}`} className='suggestions-list'></ul>
      </div>
    );
  };

  export default CompletionBar;
