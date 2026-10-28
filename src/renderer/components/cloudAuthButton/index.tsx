import React from 'react';
import {
  Button,
  CircularProgress,
  SxProps,
  Theme,
  Tooltip,
  useTheme,
} from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { rosettaIcon } from '../../../../assets';
import { utils } from '../../helpers';
import { ROSETTA_CLOUD_BASE_URL } from '../../../main/utils/constants';
import {
  useApiKey,
  useAuthLogin,
  useAuthSubscription,
  useProfileSubscription,
} from '../../controllers';
import { AuthButtonContent, AuthIcon, AuthLabel } from './styles';

type CloudAuthButtonProps = {
  compact?: boolean;
};

export const CloudAuthButton: React.FC<CloudAuthButtonProps> = ({
  compact = false,
}) => {
  const theme = useTheme();
  const { data: apiKey, isLoading: apiKeyLoading } = useApiKey();
  const { mutate: login, isLoading: loginLoading } = useAuthLogin({
    onSuccess: () => {
      toast.success(
        'Login initiated! Please complete authentication in your browser.',
      );
    },
    onError: (error) => {
      toast.error(`Login failed: ${error.message || 'Unknown error'}`);
    },
  });

  useAuthSubscription();
  useProfileSubscription();

  const isLoading = apiKeyLoading || loginLoading;

  const buttonSx: SxProps<Theme> = compact
    ? {
        borderRadius: '4px',
        padding: '2px 8px',
        minWidth: 'auto',
        textTransform: 'none',
        height: '24px',
        fontSize: '0.7rem',
        '&:hover': {
          borderColor: theme.palette.primary.main,
        },
        transition: 'all 0.2s ease',
      }
    : {
        borderColor: theme.palette.divider,
        color: theme.palette.text.primary,
        fontWeight: 600,
        textTransform: 'none',
        borderRadius: 2,
        '&:hover': {
          borderColor: theme.palette.primary.main,
          color: theme.palette.primary.main,
        },
      };

  if (apiKey) {
    return (
      <Tooltip
        title="Open Rosetta Cloud Dashboard"
        enterDelay={800}
        enterNextDelay={800}
      >
        <Button
          onClick={(e) => {
            utils.handleExternalLink(
              e as any,
              `${ROSETTA_CLOUD_BASE_URL}/dashboard`,
            );
          }}
          variant="outlined"
          size={compact ? 'small' : 'medium'}
          startIcon={<AuthIcon src={rosettaIcon} alt="Rosetta" />}
          endIcon={<OpenInNew sx={{ fontSize: compact ? 14 : 18 }} />}
          sx={buttonSx}
        >
          Cloud Dashboard
        </Button>
      </Tooltip>
    );
  }

  const renderConnectContent = () => {
    if (isLoading) {
      return <CircularProgress size={compact ? 12 : 16} />;
    }
    if (compact) {
      return (
        <AuthButtonContent>
          <AuthIcon src={rosettaIcon} alt="Rosetta" />
          <AuthLabel>Connect to Cloud</AuthLabel>
        </AuthButtonContent>
      );
    }
    return (
      <>
        <AuthIcon
          src={rosettaIcon}
          alt="Rosetta"
          style={{ width: 18, height: 18, marginRight: 8 }}
        />
        Connect to Cloud
      </>
    );
  };

  return (
    <Tooltip
      title="Run your DBT Studio pipelines on Google Cloud Run, AWS, or Azure with ease."
      enterDelay={800}
      enterNextDelay={800}
    >
      <Button
        onClick={() => login()}
        disabled={isLoading}
        variant="outlined"
        size={compact ? 'small' : 'medium'}
        sx={buttonSx}
      >
        {renderConnectContent()}
      </Button>
    </Tooltip>
  );
};
