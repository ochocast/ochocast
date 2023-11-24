import { User } from "../../utils/EventsProperties";
import React, {FC} from "react";
import "./CheckBoxList.css";

interface CheckBoxListProps {
    allUsers: User[];
    category: User[];
    setCategory: (speakers: User[]) => void;
    title: string;
}

export const CheckBoxList: FC<CheckBoxListProps> = ({
    allUsers = [] ,
    category = [],
    setCategory,
    title = "",
}) => {
    const [searchedQuery, setSearchedQuery] = React.useState("");

    const filteredUsers = allUsers.filter((user) => {
        const fullName = `${user.firstName} ${user.lastName}`;
        return fullName.toLowerCase().includes(searchedQuery.toLowerCase());
    });

    return (
        <div className="checkListContainer">
            <div className="topContainer">
                <h3 className='categoryTitle'>{title}</h3>
                <input
                    type="text"
                    placeholder="Chercher..."
                    value={searchedQuery}
                    onChange={(e) => setSearchedQuery(e.target.value)} 
                />
            </div>
            <div className="overflowContainer">
                {filteredUsers.map((user, index) => (
                    <label key={index} className="checkList">
                        <input
                            className="checkBox"
                            type="checkbox"
                            checked={category.includes(user)}
                            onChange={(e) => {
                                if (e.target.checked) {
                                        setCategory([...category, user]);
                                } else {
                                        setCategory(category.filter((cUser) => cUser.id !== user.id));
                                }
                            }}
                        />
                        {user.firstName} {user.lastName}
                    </label>
                ))}
            </div>
        </div>
    );

};