import React from 'react';
import { Box } from '@mui/material';
import { icons } from '../../../../../assets';

export const IcebergIcon: React.FC<{
  size?: number;
  alt?: string;
}> = ({ size = 18, alt = 'Apache Iceberg' }) => (
  <Box
    component="img"
    src={icons.apacheIcebergLake}
    alt={alt}
    sx={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
  />
);
