/* eslint-disable no-nested-ternary */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  CircularProgress,
  useTheme,
  FormControlLabel,
  Checkbox,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  FolderOpen,
  InfoOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { ConnectionModel, RedshiftConnection } from '../../../types/backend';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useTestConnection,
  useFilePicker,
  useUpdateConnection,
  useGetConnections,
} from '../../controllers';
import ConnectionHeader from './connection-header';
import useSecureStorage from '../../hooks/useSecureStorage';
import { useConnectionNameValidation } from '../../utils/connectionValidation';

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  projectId?: string;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
};

export const Redshift: React.FC<Props> = ({
  onCancel,
  connection,
  projectId,
  duplicateFrom,
  suggestedName,
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const {
    getDatabaseUsername,
    getDatabasePassword,
    setDatabaseUsername,
    setDatabasePassword,
    setConnectionField,
  } = useSecureStorage();

  const { mutate: getFiles } = useFilePicker();

  const existingConnection = React.useMemo(
    () => connection?.connection as RedshiftConnection,
    [connection],
  );

  const duplicateConnection = React.useMemo(
    () => duplicateFrom?.connection as RedshiftConnection,
    [duplicateFrom],
  );

  const [formState, setFormState] = React.useState<RedshiftConnection>({
    type: existingConnection?.type ?? duplicateConnection?.type ?? 'redshift',
    name: existingConnection?.name ?? suggestedName ?? 'Redshift Connection',
    host: existingConnection?.host ?? duplicateConnection?.host ?? '',
    port: existingConnection?.port ?? duplicateConnection?.port ?? 5439,
    database:
      existingConnection?.database ?? duplicateConnection?.database ?? '',
    schema:
      existingConnection?.schema ?? duplicateConnection?.schema ?? 'public',
    username: '',
    password: '',
    ssl: existingConnection?.ssl ?? duplicateConnection?.ssl ?? true,
    sslrootcert:
      existingConnection?.sslrootcert ?? duplicateConnection?.sslrootcert ?? '',
  });

  const [showPassword, setShowPassword] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const [infoModalOpen, setInfoModalOpen] = React.useState(false);
  const [nameTouched, setNameTouched] = React.useState(false);

  const { mutate: testConnection, isLoading: isTesting } = useTestConnection({
    onSuccess: (success) => {
      if (success) {
        toast.success('Connection test successful!');
        setConnectionStatus('success');
        return;
      }
      toast.error('Connection test failed');
      setConnectionStatus('failed');
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
      setConnectionStatus('failed');
    },
  });

  const { mutate: updateConnection, isLoading: isUpdating } =
    useUpdateConnection({
      onSuccess: () => {
        toast.success('Redshift connection updated successfully!');
        if (projectId) {
          navigate('/app');
          return;
        }
        navigate('/app/connections');
      },
      onError: (error) => {
        toast.error(`Update failed: ${error}`);
      },
    });

  const { mutate: configureConnection, isLoading: isConfiguring } =
    useConfigureConnection({
      onSuccess: () => {
        toast.success('Redshift connection configured successfully!');
        navigate(`/app/project-details`);
      },
      onError: (error) => {
        toast.error(`Configuration failed: ${error}`);
      },
    });

  // Get existing connections for name validation
  const { data: existingConnections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    existingConnections,
    connection?.id,
  );

  // Get real-time validation result for name field
  const nameValidation = validateName(formState.name);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormState((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox' ? checked : name === 'port' ? Number(value) : value,
    }));

    setConnectionStatus('idle');
  };

  const handleCertificateSelect = async () => {
    try {
      getFiles(
        {
          properties: ['openFile'],
        },
        {
          onSuccess: (filePaths) => {
            if (filePaths && filePaths.length > 0) {
              setFormState((prev) => ({
                ...prev,
                sslrootcert: filePaths[0],
              }));
            }
          },
          onError: () => {
            toast.error('Failed to select certificate file');
          },
        },
      );
    } catch (error) {
      toast.error('Failed to select certificate file');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate connection name before submitting
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
      return;
    }

    await setDatabaseUsername(formState.username, formState.name);
    await setDatabasePassword(formState.password, formState.name);
    await setConnectionField('host', formState.host, formState.name);
    await setConnectionField('port', String(formState.port), formState.name);
    await setConnectionField('dbname', formState.database, formState.name);
    await setConnectionField('schema', formState.schema, formState.name);

    if (connection) {
      updateConnection({
        connection: {
          id: connection.id,
          connection: formState,
        },
      });
      return;
    }

    configureConnection({
      projectId,
      connection: formState,
    });
  };

  const handleTest = () => {
    setConnectionStatus('idle');
    testConnection(formState);
  };

  const getIndicatorColor = () => {
    switch (connectionStatus) {
      case 'success':
        return theme.palette.success.main;
      case 'failed':
        return theme.palette.error.main;
      default:
        return '#9e9e9e';
    }
  };

  const getButtonStartIcon = () => {
    if (isTesting) {
      return <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />;
    }
    return null;
  };

  React.useEffect(() => {
    let isMounted = true;
    const fetchCredentials = async () => {
      const sourceConnection = existingConnection || duplicateConnection;
      if (sourceConnection) {
        try {
          const storedUsername = await getDatabaseUsername(
            sourceConnection.name,
          );
          const storedPassword = await getDatabasePassword(
            sourceConnection.name,
          );
          if (isMounted) {
            setFormState((prev) => ({
              ...prev,
              username: storedUsername || '',
              password: storedPassword || '',
            }));
          }
        } catch {
          if (isMounted) {
            setFormState((prev) => ({
              ...prev,
              username: '',
              password: '',
            }));
          }
        }
      }
    };
    if (existingConnection || duplicateConnection) {
      fetchCredentials();
    }
    return () => {
      isMounted = false;
    };
  }, [
    existingConnection,
    duplicateConnection,
    getDatabaseUsername,
    getDatabasePassword,
  ]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        p: 3,
      }}
    >
      <ConnectionHeader
        title="Redshift Connection"
        imageSource={connectionIcons.images.redshift}
        onClose={onCancel}
        onSave={handleSubmit}
        isLoading={isUpdating || isConfiguring}
      />

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%',
          maxWidth: '500px',
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <TextField
          label="Connection Name"
          name="name"
          value={formState.name}
          onChange={handleChange}
          onBlur={() => setNameTouched(true)}
          fullWidth
          margin="normal"
          required
          error={nameTouched && !nameValidation.isValid}
          helperText={
            nameTouched && !nameValidation.isValid ? nameValidation.message : ''
          }
        />

        <TextField
          label="Host"
          name="host"
          value={formState.host}
          onChange={handleChange}
          fullWidth
          required
          placeholder="your-cluster.region.redshift.amazonaws.com"
        />

        <TextField
          label="Port"
          name="port"
          type="number"
          value={formState.port}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Database"
          name="database"
          value={formState.database}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Schema"
          name="schema"
          value={formState.schema}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Username"
          name="username"
          value={formState.username}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={formState.password}
          onChange={handleChange}
          fullWidth
          required
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    onMouseDown={(e) => e.preventDefault()}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />

        {/* SSL Configuration Section */}
        <Box sx={{ mt: 2, mb: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formState.ssl || false}
                onChange={handleChange}
                name="ssl"
              />
            }
            label="Use SSL Mode (Recommended)"
          />
        </Box>

        {formState.ssl && (
          <TextField
            label="SSL Root Certificate Path (Optional)"
            name="sslrootcert"
            value={formState.sslrootcert || ''}
            onChange={handleChange}
            fullWidth
            placeholder="/path/to/redshift-ca-bundle.crt"
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={handleCertificateSelect}
                      edge="end"
                      title="Browse for certificate file"
                      sx={{ mr: 1 }}
                    >
                      <FolderOpen />
                    </IconButton>
                    <IconButton
                      onClick={() => setInfoModalOpen(true)}
                      edge="end"
                      title="SSL certificate information"
                      sx={{ color: theme.palette.info.main }}
                    >
                      <InfoOutlined fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            helperText="Leave empty to use default SSL settings, or provide path to custom certificate"
          />
        )}

        <Box
          sx={{
            mt: 3,
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <Button
            type="button"
            variant="contained"
            color="primary"
            onClick={handleTest}
            disabled={isTesting}
            sx={{
              mr: 2,
              position: 'relative',
              paddingRight: '32px',
              minWidth: '150px',
            }}
            startIcon={getButtonStartIcon()}
          >
            {isTesting ? 'Testing...' : 'Test Connection'}

            <Box
              sx={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: getIndicatorColor(),
                border: `1px solid ${theme.palette.primary.contrastText}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Button>
        </Box>
      </Box>

      {/* SSL Certificate Information Modal */}
      <Dialog
        open={infoModalOpen}
        onClose={() => setInfoModalOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            maxWidth: '600px',
          },
        }}
      >
        <DialogTitle>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            How to get Redshift SSL Certificate
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ py: 1 }}>
            <Typography variant="body1" sx={{ mb: 2, fontWeight: 'bold' }}>
              1. Download from AWS Documentation:
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, ml: 2 }}>
              Visit the official AWS Redshift SSL documentation:
              <br />
              <strong>
                https://docs.aws.amazon.com/redshift/latest/mgmt/connecting-ssl-support.html
              </strong>
            </Typography>

            <Typography variant="body1" sx={{ mb: 2, fontWeight: 'bold' }}>
              2. Direct Download Link:
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, ml: 2 }}>
              You can directly download the certificate bundle:
              <br />
              <strong>
                https://s3.amazonaws.com/redshift-downloads/redshift-ca-bundle.crt
              </strong>
            </Typography>

            <Typography variant="body1" sx={{ mb: 2, fontWeight: 'bold' }}>
              3. Regional Certificates:
            </Typography>
            <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>
              • <strong>US East (N. Virginia):</strong> redshift-ca-bundle.crt
            </Typography>
            <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>
              • <strong>Other AWS regions:</strong> Check the AWS documentation
              for region-specific certificates
            </Typography>

            <Typography variant="body1" sx={{ mb: 2, fontWeight: 'bold' }}>
              4. Installation Steps:
            </Typography>
            <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>
              • Download the certificate file to your local machine
            </Typography>
            <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>
              • Save it in a secure location (e.g.,
              ~/.ssl/redshift-ca-bundle.crt)
            </Typography>
            <Typography variant="body2" sx={{ mb: 1, ml: 2 }}>
              • Use the &quot;Browse&quot; button to select the downloaded
              certificate file
            </Typography>

            <Box
              sx={{
                mt: 3,
                p: 2,
                bgcolor: 'info.main',
                color: 'info.contrastText',
                borderRadius: 1,
              }}
            >
              <Typography variant="body2">
                <strong>Note:</strong> SSL certificates are required for secure
                connections to Redshift clusters. The certificate ensures that
                your connection is encrypted and authenticated.
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoModalOpen(false)} variant="contained">
            Got it
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
