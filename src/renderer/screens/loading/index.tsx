import React, { useEffect } from 'react';
import { useGetSelectedProject } from '../../controllers';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Button,
  styled,
  useTheme
} from '@mui/material';
import { logo } from '../../../../assets';

const LoadingContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: theme.palette.background.default,
  gap: theme.spacing(4),
}));

const StyledLogo = styled('img')({
  height: '120px',
  width: 'auto',
});

const Loading = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { data: project, isLoading } = useGetSelectedProject();

  useEffect(() => {
    if (project?.id && !isLoading) {
      navigate('/app');
    }
  }, [project?.id, isLoading, navigate]);

  return (
    <LoadingContainer>
      <StyledLogo src={logo} alt="dbt Studio Logo" />
      <CircularProgress
        size={40}
        sx={{
          color: theme.palette.primary.main,
        }}
      />
      <Button
        variant="contained"
        onClick={() => navigate('/app/select-project')}
        sx={{ mt: 2 }}
      >
        Navigate to Select Project
      </Button>
    </LoadingContainer>
  );
};

export default Loading;