import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import style from './FilterPanel.module.css';
import FilterSearchBar, {
  FilterSearchBarIcon,
} from '../FilterSearchBar/FilterSearchBar';
import { useUser } from '../../../../context/UserContext';

interface FilterPanelProps {
  onTagsChange: (tags: string[]) => void;
  onUsersChange: (users: string[]) => void;
  onDateFilter: (start: Date | null, end: Date | null) => void;
  closePanel: () => void;
  onArchivedChange: (archived: boolean) => void;
  onResetFilters?: () => void;
  initialTags: string[];
  initialUsers: string[];
  initialStartDate: Date | null;
  initialEndDate: Date | null;
  initialArchived?: boolean | null;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  onTagsChange,
  onUsersChange,
  onDateFilter,
  closePanel,
  onArchivedChange,
  onResetFilters,
  initialTags,
  initialUsers,
  initialStartDate,
  initialEndDate,
  initialArchived,
}) => {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [users, setUsers] = useState<string[]>(initialUsers);
  const [startDate, setStartDate] = useState<Date | null>(initialStartDate);
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate);
  const [nextTag, setNextTag] = useState<string | null>(null);
  const [nextUser, setNextUser] = useState<string | null>(null);
  const [archived, setArchived] = useState<boolean>(initialArchived ?? false);
  const { t } = useTranslation();
  const { isAdmin } = useUser();

  const handleTagClick = (query: string) => {
    if (nextTag === query) {
      const value = query.trim();
      if (value && !tags.includes(value)) {
        const updated = [...tags, value];
        setTags(updated);
        onTagsChange(updated);
      }
      setNextTag(null);
    } else {
      setNextTag(query);
    }
  };

  const handleUserClick = (query: string) => {
    if (nextUser === query) {
      const value = query.trim();
      if (value && !users.includes(value)) {
        const updated = [...users, value];
        setUsers(updated);
        onUsersChange(updated);
      }
      setNextUser(null);
    } else {
      setNextUser(query);
    }
  };

  const removeTag = (index: number) => {
    const updated = tags.filter((_, i) => i !== index);
    setTags(updated);
    onTagsChange(updated);
  };

  const removeUser = (index: number) => {
    const updated = users.filter((_, i) => i !== index);
    setUsers(updated);
    onUsersChange(updated);
  };

  const handleDateSearch = () => {
    onDateFilter(startDate, endDate);
    closePanel();
  };

  const handleTagSelect = (selectedTag: string) => {
    if (!tags.includes(selectedTag)) {
      const updated = [...tags, selectedTag];
      setTags(updated);
      onTagsChange(updated);
    }
  };

  const handleUserSelect = (selectedUser: string) => {
    if (!users.includes(selectedUser)) {
      const updated = [...users, selectedUser];
      setUsers(updated);
      onUsersChange(updated);
    }
  };

  const handleResetFilters = () => {
    setTags([]);
    setUsers([]);
    setStartDate(null);
    setEndDate(null);
    setArchived(false);
    onTagsChange([]);
    onUsersChange([]);
    onDateFilter(null, null);
    onArchivedChange(false);
    onResetFilters?.();
  };

  return (
    <div className={style.panel}>
      <div className={style.panelHeader}>
        <h2 className={style.panelTitle}>{t('filterPanel.filters')}</h2>
        <button onClick={handleResetFilters} className={style.resetButton}>
          {t('filterPanel.resetFilters')}
        </button>
      </div>

      {isAdmin && (
        <div className={style.section}>
          <h3 className={style.title}>Archive</h3>

          <button
            className={style.toggleArchivedButton}
            onClick={() => {
              const newValue = !archived;
              setArchived(newValue);
              onArchivedChange(newValue);
            }}
          >
            {archived
              ? 'Afficher vidéos NON archivées'
              : 'Afficher vidéos archivées'}
          </button>
        </div>
      )}

      <div className={style.section}>
        <h3 className={style.title}>{t('filterPanel.tag')}</h3>
        <div>
          <FilterSearchBar
            onClick={handleTagClick}
            placeholder={t('filterPanel.tagPlaceholder')}
            type="tag"
            icon={FilterSearchBarIcon.SEARCH}
            onSelect={handleTagSelect}
          />
        </div>
        <div className={style.chipContainer}>
          {tags.map((tag, index) => (
            <span key={index} className={style.chip}>
              {tag}
              <button
                onClick={() => removeTag(index)}
                className={style.closeButton}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className={style.section}>
        <h3 className={style.title}>{t('filterPanel.user')}</h3>
        <div>
          <FilterSearchBar
            onClick={handleUserClick}
            placeholder={t('filterPanel.userPlaceholder')}
            type="user"
            icon={FilterSearchBarIcon.SEARCH}
            onSelect={handleUserSelect}
          />
        </div>
        <div className={style.chipContainer}>
          {users.map((user, index) => (
            <span key={index} className={style.chip}>
              {user}
              <button
                onClick={() => removeUser(index)}
                className={style.closeButton}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className={style.section}>
        <h3 className={style.title}>{t('filterPanel.publicationDate')}</h3>
        <div className={style.dateInputs}>
          <div className={style.dateInput}>
            <DatePicker
              selected={startDate}
              onChange={(date) => setStartDate(date)}
              placeholderText={t('filterPanel.selectDate')}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              dateFormat="dd/MM/yyyy"
              className={style.datePicker}
              maxDate={new Date()}
              isClearable
            />
          </div>
        </div>
        <button onClick={handleDateSearch} className={style.validateButton}>
          {t('filterPanel.validate')}
        </button>
      </div>
    </div>
  );
};

export default FilterPanel;
