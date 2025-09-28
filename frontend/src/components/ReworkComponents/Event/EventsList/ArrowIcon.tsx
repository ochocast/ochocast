import React from 'react';

interface ArrowIconProps {
  direction: 'left' | 'right';
  color?: string;
  size?: number;
  className?: string;
  onClick?: () => void;
}

const ArrowIcon: React.FC<ArrowIconProps> = ({
  direction,
  color = 'currentColor',
  size = 24,
  className,
  onClick,
}) => {
  const transform = direction === 'left' ? 'rotate(180)' : '';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      transform={transform}
    >
      <path
        d="M9 18L15 12L9 6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default ArrowIcon;
