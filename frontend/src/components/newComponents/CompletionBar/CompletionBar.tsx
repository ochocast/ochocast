  import React, { FC, useState } from 'react';
  import './CompletionBar.css';

  export interface CompletionBarProps {
    name: string;
    filter: () => string[];
    select: (str: string) => void;
    add?: (str: string) => void;
  }

  const CompletionBar: FC<CompletionBarProps> = ({
    filter,
    select,
    add,
    name,
  }) => {
    const [newEntry, setNewEntry] = useState(false);

    const handleEntryChange = () => {
      const inputElement = document.getElementById('search-bar-' + name) as HTMLInputElement;
      const inputValue: string = inputElement.value.toLowerCase();
      const suggestionsList = document.getElementById('suggestions-list-' +name) as HTMLUListElement;
      suggestionsList.innerHTML = '';
      const filteredObjects: string[] = filter();

      if(filteredObjects.length == 0 && add !== undefined){
        filteredObjects.push(inputValue);
        setNewEntry(true);
      }

      if (inputValue && filteredObjects.length != 0) {
          suggestionsList.style.display = 'block';
          setNewEntry(false);

          filteredObjects.forEach(str => {
              const li = document.createElement('li');
              li.innerText = str;
              const addButton = document.createElement('button');
              addButton.innerText = '+';
              addButton.className = 'add-button';
              addButton.onclick = (e) => {e.stopPropagation(); addValue()};
              li.onclick = () => {
                inputElement.value = '';
                suggestionsList.style.display = 'none';
                select(str);
              };
              li.appendChild(addButton);
              suggestionsList.appendChild(li);
          });
      }
      else{
        suggestionsList.style.display = 'none';
      }
    };
    const addValue = () => {
      const inputElement = document.getElementById('search-bar-' + name) as HTMLInputElement;
      const suggestionsList = document.getElementById('suggestions-list-' +name) as HTMLUListElement;
      const val = inputElement.value;
      inputElement.value = '';
      suggestionsList.style.display = 'none';
      if(add !== undefined)
        add(val);
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
        <ul id={`suggestions-list-${name}`} className='suggestions-list'>
        </ul>
      </div>
    );
  };

  export default CompletionBar;
