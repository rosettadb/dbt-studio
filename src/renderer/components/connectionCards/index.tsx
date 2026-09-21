import React from 'react';
import { Typography, Tooltip, Chip } from '@mui/material';
import {
  StyledCard,
  ContentWrapper,
  StyledCardContent,
  MediaImage,
  ControlBox,
  ComingSoonBanner,
} from './style';
import connectionIcons from '../../../../assets/connectionIcons';

interface ItemDetails {
  img: keyof typeof connectionIcons.images;
  name: string;
  disabled?: boolean;
  dbtCompatible?: boolean;
}

type Props = {
  itemDetails: ItemDetails;
  onClick: () => void;
};

export const ConnectionCard: React.FC<Props> = ({ itemDetails, onClick }) => {
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
            <Tooltip title="This connection will be available in a future release">
              <MediaImage
                alt="Data source icon"
                src={connectionIcons.images[itemDetails.img]}
              />
            </Tooltip>
          ) : (
            <MediaImage
              alt="Data source icon"
              src={connectionIcons.images[itemDetails.img]}
            />
          )}
          {itemDetails.dbtCompatible && (
            <Tooltip title="Compatible with dbt">
              <Chip
                label="dbt"
                size="small"
                color="primary"
                sx={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  height: 20,
                  fontSize: '11px',
                  fontWeight: 'bold',
                }}
              />
            </Tooltip>
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
