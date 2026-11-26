import React from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';

/** Greyscale Python logo that takes the surrounding text color. */
export const PythonMonoIcon: React.FC<SvgIconProps> = (props) => (
  // eslint-disable-next-line react/jsx-props-no-spreading
  <SvgIcon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M11.9 2c-5 0-4.7 2.2-4.7 2.2v2.3h4.8v.7H5.3S2 6.8 2 11.9c0 5 2.8 4.9 2.8 4.9h1.7v-2.4s-.1-2.8 2.8-2.8h4.7s2.7 0 2.7-2.6V4.6S17.1 2 11.9 2zm-2.6 1.5a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z"
    />
    <path
      fill="currentColor"
      d="M12.1 22c5 0 4.7-2.2 4.7-2.2v-2.3H12v-.7h6.7S22 17.2 22 12.1c0-5-2.8-4.9-2.8-4.9h-1.7v2.4s.1 2.8-2.8 2.8H10s-2.7 0-2.7 2.6v4.4S6.9 22 12.1 22zm2.6-1.5a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z"
    />
  </SvgIcon>
);
