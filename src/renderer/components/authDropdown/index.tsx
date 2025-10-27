import React, { useState, useEffect, useRef } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Avatar,
  Divider,
  Typography,
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Alert,
  Button,
} from '@mui/material';
import {
  CloudOutlined,
  LogoutOutlined,
  LoginOutlined,
  Close,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import AuthService, { User } from '../../services/auth.service';

export const AuthDropdown: React.FC = () => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [userCode, setUserCode] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  // eslint-disable-next-line no-undef
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const checkAuth = async () => {
    setLoading(true);
    try {
      const authenticated = await AuthService.isAuthenticated();
      setIsAuthenticated(authenticated);
      if (authenticated) {
        const userData = await AuthService.getUser();
        setUser(userData);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const startLoginTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setShowRetry(true);
      setLoginLoading(false);
      setStatus('Authentication is taking longer than expected');
    }, 30000);
  };

  const clearLoginTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const initiateLogin = () => {
    setLoginLoading(true);
    setError('');
    setStatus('Initiating authentication...');
    setShowRetry(false);
    startLoginTimeout();
    AuthService.login();
  };

  const handleLogin = () => {
    handleMenuClose();
    setLoginModalOpen(true);
    initiateLogin();
  };

  const handleCloseLoginModal = () => {
    setLoginModalOpen(false);
    setUserCode('');
    setStatus('');
    setError('');
    setLoginLoading(false);
    setShowRetry(false);
    clearLoginTimeout();
  };

  const handleRetry = () => {
    setUserCode('');
    setError('');
    initiateLogin();
  };

  const handleLogout = async () => {
    handleMenuClose();
    try {
      await AuthService.logout();
      setIsAuthenticated(false);
      setUser(null);
      toast.success('Logged out successfully');
    } catch {
      toast.error('Logout failed');
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // eslint-disable-next-line consistent-return
  useEffect(() => {
    if (loginModalOpen) {
      AuthService.onAuthCode((data) => {
        setUserCode(data.userCode);
        setStatus('Enter this code in your browser');
        setLoginLoading(false);
        clearLoginTimeout();
      });

      AuthService.onAuthSuccess(() => {
        clearLoginTimeout();
        toast.success('Successfully signed in to cloud');
        checkAuth();
        handleCloseLoginModal();
      });

      AuthService.onAuthError((err) => {
        clearLoginTimeout();
        setError(err);
        setStatus('');
        setLoginLoading(false);
        setUserCode('');
        setShowRetry(true);
      });

      return () => {
        AuthService.removeAuthListeners();
        clearLoginTimeout();
      };
    }
  }, [loginModalOpen]);

  useEffect(() => {
    return () => {
      clearLoginTimeout();
    };
  }, []);

  if (loading) {
    return (
      <IconButton disabled>
        <CircularProgress size={20} />
      </IconButton>
    );
  }

  return (
    <>
      <Tooltip title={isAuthenticated ? 'Cloud Account' : 'Sign In to Cloud'}>
        <IconButton onClick={handleMenuOpen} color="primary">
          {isAuthenticated && user ? (
            <Avatar
              sx={{
                width: 28,
                height: 28,
                fontSize: 14,
                bgcolor: 'primary.main',
              }}
            >
              {getInitials(user.firstName, user.lastName)}
            </Avatar>
          ) : (
            <CloudOutlined sx={{ fontSize: 22 }} />
          )}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        {isAuthenticated && user ? (
          <>
            <Box sx={{ px: 2, py: 1.5, minWidth: 200 }}>
              <Typography variant="subtitle2" fontWeight="bold">
                {user.firstName} {user.lastName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user.email}
              </Typography>
            </Box>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutOutlined sx={{ mr: 1, fontSize: 20 }} />
              Sign Out
            </MenuItem>
          </>
        ) : (
          <MenuItem onClick={handleLogin}>
            <LoginOutlined sx={{ mr: 1, fontSize: 20 }} />
            Sign In to Cloud
          </MenuItem>
        )}
      </Menu>

      <Dialog
        open={loginModalOpen}
        onClose={handleCloseLoginModal}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="h6">Rosetta Cloud</Typography>
          <IconButton onClick={handleCloseLoginModal} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              textAlign="center"
              mb={3}
            >
              Sign in to access cloud services
            </Typography>

            {userCode && (
              <Box
                sx={{
                  mt: 2,
                  p: 3,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  textAlign: 'center',
                }}
              >
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Enter this code in your browser:
                </Typography>
                <Typography
                  variant="h3"
                  sx={{
                    letterSpacing: '0.3em',
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    my: 2,
                  }}
                >
                  {userCode}
                </Typography>
              </Box>
            )}

            {status && !error && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mt: 2,
                }}
              >
                {loginLoading && <CircularProgress size={20} sx={{ mr: 1 }} />}
                <Typography variant="body2" color="text.secondary">
                  {status}
                </Typography>
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            {showRetry && (
              <Button
                variant="contained"
                fullWidth
                onClick={handleRetry}
                sx={{ mt: 2 }}
              >
                Retry Authentication
              </Button>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
};
