import React from 'react';
import { Chip, Typography, Tooltip } from '@mui/material';
import {
  StyledCard,
  ContentWrapper,
  StyledCardContent,
  MediaImage,
  ControlBox,
  ComingSoonBanner,
} from '../connectionCards/style';
import { icons } from '../../../../assets';

interface DataLakeTypeDetails {
  id: string;
  name: string;
  description: string;
  img: keyof typeof icons;
  disabled?: boolean;
  beta?: boolean;
}

type Props = {
  itemDetails: DataLakeTypeDetails;
  onClick: () => void;
};

export const DataLakeCard: React.FC<Props> = ({ itemDetails, onClick }) => {
  const handleClick = () => {
    if (!itemDetails.disabled) {
      onClick();
    }
  };

  return (
    <ControlBox>
      <StyledCard onClick={handleClick}>
        <ContentWrapper>
          {itemDetails.disabled ? (
            <Tooltip title="This data lake type will be available in a future release">
              <MediaImage alt={itemDetails.name} src={icons[itemDetails.img]} />
            </Tooltip>
          ) : (
            <MediaImage alt={itemDetails.name} src={icons[itemDetails.img]} />
          )}
          {itemDetails.disabled && <ComingSoonBanner>Soon</ComingSoonBanner>}
        </ContentWrapper>
        <StyledCardContent>
          <Typography
            gutterBottom
            variant="h5"
            component="h2"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            {itemDetails.name}
            {itemDetails.beta && (
              <Chip
                label="BETA"
                color="primary"
                size="small"
                sx={{ height: 20, fontSize: '0.625rem', fontWeight: 700 }}
              />
            )}
          </Typography>
        </StyledCardContent>
      </StyledCard>
    </ControlBox>
  );
};
