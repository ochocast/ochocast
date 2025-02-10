import React, { FC } from 'react';

import styles from './Tag.module.css';

export enum TagType {
  DEFAULT,
  DISABLE,
  COLORED,
}

export interface TagProps {
  content: string;
  type?: TagType;
  editable?: boolean;
  delete?: (str: string) => void;
}

// Helper function to map enum to class names
const getTagTypeClass = (type: TagType): string => {
  switch (type) {
    case TagType.DEFAULT:
      return styles.default;
    case TagType.DISABLE:
      return styles.disable;
    case TagType.COLORED:
      return styles.colored;
  }
};

const Tag: FC<TagProps> = (props) => {

  const handleClick = () => {
    if(props.editable && props.delete !== undefined)
      props.delete(props.content);
  };

  return (
    <div
      className={`${styles.base} ${getTagTypeClass(
        props.type || TagType.DEFAULT,
      )}`}
    >
      <div className={styles.textButton}>
        <span>{props.content}</span>
      </div>
      {props.editable ? (
        <img className={styles.icons} alt="" src="/cross.svg" onClick={handleClick}/>
      ) : null}
    </div>
  );
};
export default Tag;
