import React from 'react';
import { Typography, Tooltip } from '@mui/material';
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
          <Typography gutterBottom variant="h5" component="h2">
            {itemDetails.name}
          </Typography>
        </StyledCardContent>
      </StyledCard>
    </ControlBox>
  );
};
