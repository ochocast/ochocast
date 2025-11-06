import React, { useEffect, useState } from 'react';
import style from './community.module.css';
import { useTranslation } from 'react-i18next';
import { FC } from 'react';
import { getUsers } from '../../utils/api';
import { User } from '../../utils/VideoProperties';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import UserCard from '../../components/ReworkComponents/user/UserCard/UserCard';
import SearchBar, {
  SearchBarIcon,
} from '../../components/ReworkComponents/navigation/SearchBar/SearchBar';
import logger from '../../utils/logger';

interface CommunityProps {}

const Community: FC<CommunityProps> = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const res = await getUsers();
        const allUsers = res.data || [];
        setUsers(allUsers);
        setFilteredUsers(allUsers);
      } catch (error) {
        logger.error('Error fetching users:', error);
      }
      setIsLoading(false);
    };

    fetchUsers();
  }, []);

  const handleSearch = (query: string) => {
    if (query.trim() === '') {
      setFilteredUsers(users);
      return;
    }

    const lowercaseQuery = query.toLowerCase();
    const filtered = users.filter(
      (user) =>
        user.firstName?.toLowerCase().includes(lowercaseQuery) ||
        user.username?.toLowerCase().includes(lowercaseQuery) ||
        user.lastName?.toLowerCase().includes(lowercaseQuery) ||
        user.email?.toLowerCase().includes(lowercaseQuery) ||
        user.description?.toLowerCase().includes(lowercaseQuery),
    );
    setFilteredUsers(filtered);
  };

  if (isLoading) {
    return <LoadingCircle />;
  }

  return (
    <div className={style.community}>
      <div className={style.display}>
        <div className={style.display1}>
          <SearchBar
            onClick={(query) => handleSearch(query)}
            needInput={true}
            placeholder={t('searchUsers')}
            icon={SearchBarIcon.SEARCH}
          />
        </div>

        <div className={style.users_list}>
          {filteredUsers.length > 0 ? (
            filteredUsers.map((user) => (
              <UserCard
                key={user.id}
                id={user.id}
                firstName={user.firstName}
                lastName={user.lastName}
                username={user.username}
                description={user.description}
                picture_id={user.picture_id}
              />
            ))
          ) : (
            <h1>{t('noUserFound')}</h1>
          )}
        </div>
      </div>
    </div>
  );
};

export default Community;
