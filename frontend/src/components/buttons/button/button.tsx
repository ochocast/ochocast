import React, { FC } from 'react';
import "./button.css";

interface ButtonProps {
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
   children?: React.ReactNode
}

const Button: FC<ButtonProps> = ({ 
   className,
   border,
   bcolor="#0E2356",
   tcolor="white",
   tsize="20px",
   height="45px",
   width="240px",
   onClick, 
   radius="50px",
   type,
   children
}) => (
<button 
      className={className}
      onClick={onClick}
      type={type}
      style={{
         backgroundColor: bcolor,
         color: tcolor,
         fontSize: tsize,
         border,
         borderRadius: radius,
         height,
         width
      }}
    >
    {children}
    </button>
);

export default Button;
