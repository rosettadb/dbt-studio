import React from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';
import type { NotebookKind } from '../../../types/pythonNotebooks';

/** Simplified Python logo (two interlocking snakes). */
export const PythonLogoIcon: React.FC<SvgIconProps> = (props) => (
  // eslint-disable-next-line react/jsx-props-no-spreading
  <SvgIcon viewBox="0 0 24 24" {...props}>
    <path
      fill="#3776AB"
      d="M11.9 2c-5 0-4.7 2.2-4.7 2.2v2.3h4.8v.7H5.3S2 6.8 2 11.9c0 5 2.8 4.9 2.8 4.9h1.7v-2.4s-.1-2.8 2.8-2.8h4.7s2.7 0 2.7-2.6V4.6S17.1 2 11.9 2zm-2.6 1.5a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z"
    />
    <path
      fill="#FFD43B"
      d="M12.1 22c5 0 4.7-2.2 4.7-2.2v-2.3H12v-.7h6.7S22 17.2 22 12.1c0-5-2.8-4.9-2.8-4.9h-1.7v2.4s.1 2.8-2.8 2.8H10s-2.7 0-2.7 2.6v4.4S6.9 22 12.1 22zm2.6-1.5a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z"
    />
  </SvgIcon>
);

/** Database-cylinder glyph with "SQL" label. */
export const SqlNotebookIcon: React.FC<SvgIconProps> = (props) => (
  // eslint-disable-next-line react/jsx-props-no-spreading
  <SvgIcon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M12 3C7.6 3 4 4.3 4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6c0-1.7-3.6-3-8-3zm0 2c3.9 0 6 1.1 6 1.5S15.9 8 12 8 6 6.9 6 6.5 8.1 5 12 5zm6 13c0 .4-2.1 1.5-6 1.5S6 18.4 6 18v-2.3c1.5.8 3.7 1.3 6 1.3s4.5-.5 6-1.3V18zm0-4.5c0 .4-2.1 1.5-6 1.5s-6-1.1-6-1.5v-2.3c1.5.8 3.7 1.3 6 1.3s4.5-.5 6-1.3v2.3zm0-4.5c0 .4-2.1 1.5-6 1.5S6 9.4 6 9V8.2C7.5 9 9.7 9.5 12 9.5s4.5-.5 6-1.3V9z"
    />
  </SvgIcon>
);

interface NotebookKindIconProps extends SvgIconProps {
  kind?: NotebookKind;
}

/**
 * Icon for a notebook row / tab: SQL notebooks (the default, including every
 * existing file without a `kind`) get the SQL glyph, Python notebooks get the
 * Python logo.
 */
export const NotebookKindIcon: React.FC<NotebookKindIconProps> = ({
  kind,
  ...props
}) =>
  kind === 'python' ? (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <PythonLogoIcon {...props} />
  ) : (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <SqlNotebookIcon {...props} />
  );

export default NotebookKindIcon;
