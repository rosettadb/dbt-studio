import React from 'react';
import { styled } from '@mui/material/styles';
import { Typography, Box } from '@mui/material';
import { getInitials, getRandomColor } from '../../helpers/utils';

interface LetterAvatarProps {
  name: string;
  size?: number;
}

const AvatarWrapper = styled(Box)<{ bgcolor: string; size: number }>(
  ({ bgcolor, size }) => ({
    backgroundColor: bgcolor,
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
);

export const LetterAvatar: React.FC<LetterAvatarProps> = ({
  name,
  size = 40,
}) => {
  const initials = getInitials(name);
  const color = getRandomColor(name);

  return (
    <AvatarWrapper bgcolor={color} size={size}>
      <Typography sx={{ color: '#fff', fontWeight: 500 }} fontSize={size / 2}>
        {initials}
      </Typography>
    </AvatarWrapper>
  );
};
