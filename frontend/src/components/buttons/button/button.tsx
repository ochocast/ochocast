import React, { FC } from 'react';
import './button.css';

export interface ButtonProps {
  className?: string;
  border?: string;
  bcolor?: string;
  tcolor?: string;
  tsize?: string;
  height?: string;
  width?: string;
  onClick?: () => void;
  radius?: string;
  type?: 'submit' | 'reset' | 'button';
  children?: React.ReactNode;
  disabled?: boolean;
}

const Button: FC<ButtonProps> = ({
  className,
  border,
  bcolor = '#0E2356',
  tcolor = 'white',
  tsize = '1em',
  onClick,
  radius = '50px',
  type,
  children,
  disabled,
}) => (
  <button
    className={className}
    onClick={onClick}
    type={type}
    disabled={disabled}
    style={{
      backgroundColor: disabled ? 'gray' : bcolor,
      color: tcolor,
      fontSize: tsize,
      border,
      borderRadius: radius,
    }}
  >
    {children}
  </button>
);

export default Button;
