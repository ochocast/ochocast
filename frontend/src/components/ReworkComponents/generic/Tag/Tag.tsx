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
  className?: string;
  style?: React.CSSProperties;
}

// Helper function to map enum to class names
const getTagTypeClass = (type: TagType): string => {
  switch (type) {
    case TagType.DISABLE:
      return styles.disable;
    case TagType.COLORED:
      return styles.colored;
    case TagType.DEFAULT:
    default:
      return styles.default;
  }
};

const Tag: FC<TagProps> = ({
  content,
  type = TagType.DEFAULT,
  editable = false,
  delete: handleDelete,
  className = '',
  style = {},
}) => {
  const onClick = () => {
    if (editable && handleDelete) handleDelete(content);
  };

  return (
    <div
      className={`${styles.base} ${getTagTypeClass(type)} ${className}`}
      style={style}
    >
      <div className={styles.textButton}>
        <span>{content}</span>
      </div>
      {editable && (
        <img
          className={styles.icons}
          alt="delete"
          src="/cross.svg"
          onClick={onClick}
        />
      )}
    </div>
  );
};

export default Tag;