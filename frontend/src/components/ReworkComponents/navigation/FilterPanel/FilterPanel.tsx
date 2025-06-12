import React, { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import style from "./FilterPanel.module.css";
import FilterSearchBar, {
FilterSearchBarIcon,
} from "../FilterSearchBar/FilterSearchBar";

interface FilterPanelProps {
onTagsChange: (tags: string[]) => void;
onUsersChange: (users: string[]) => void;
onDateFilter: (start: Date | null, end: Date | null) => void;
closePanel: () => void;
initialTags: string[];
initialUsers: string[];
initialStartDate: Date | null;
initialEndDate: Date | null;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
onTagsChange,
onUsersChange,
onDateFilter,
closePanel,
initialTags,
initialUsers,
initialStartDate,
initialEndDate,
}) => {
const [tags, setTags] = useState<string[]>(initialTags);
const [users, setUsers] = useState<string[]>(initialUsers);
const [startDate, setStartDate] = useState<Date | null>(initialStartDate);
const [endDate, setEndDate] = useState<Date | null>(initialEndDate);
const [nextTag, setNextTag] = useState<string | null>(null);
const [nextUser, setNextUser] = useState<string | null>(null);

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

return (
<div className={style.panel}>
<div className={style.section}>
<h3 className={style.title}>Tag</h3>
<div>
<FilterSearchBar onClick={handleTagClick} placeholder="Exemple: Tags" type="tag" icon={FilterSearchBarIcon.SEARCH} onSelect={handleTagSelect} />
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
    <h3 className={style.title}>User</h3>
    <div>
      <FilterSearchBar
        onClick={handleUserClick}
        placeholder="Exemple: Marie"
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
    <h3 className={style.title}>Date</h3>
    <div className={style.dateInputs}>
      <div className={style.dateInput}>
        <label className={style.label}>Début</label>
        <DatePicker
          selected={startDate}
          onChange={(date) => setStartDate(date)}
          selectsStart
          startDate={startDate}
          endDate={endDate}
          placeholderText="Choisir une date de début"
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
          dateFormat="dd/MM/yyyy"
          className={style.datePicker}
        />
      </div>
      <div className={style.dateInput}>
        <label className={style.label}>Fin</label>
        <DatePicker
          selected={endDate}
          onChange={(date) => setEndDate(date)}
          selectsEnd
          startDate={startDate}
          endDate={endDate}
          minDate={startDate ?? undefined}
          placeholderText="Choisir une date de fin"
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
          dateFormat="dd/MM/yyyy"
          className={style.datePicker}
        />
      </div>
    </div>
    <button onClick={handleDateSearch} className={style.validateButton}>
      Valider
    </button>
  </div>
</div>

);
};

export default FilterPanel;
