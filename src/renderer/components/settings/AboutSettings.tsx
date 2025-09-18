import React from 'react';
import { Typography, Box, Link, Divider, Stack, Button } from '@mui/material';
import { OpenInNew, RestoreFromTrash } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { icons } from '../../../../assets';
import { utils } from '../../helpers';
import { ResetFactoryModal } from '../modals';
import { useResetFactorySettings } from '../../controllers';
import { restartApp } from '../../services/settings.services';

export const AboutSettings: React.FC = () => {
  const [isResetModalOpen, setIsResetModalOpen] = React.useState(false);

  const { mutate: resetFactorySettings, isLoading: isResetting } =
    useResetFactorySettings({
      onSuccess: () => {
        toast.success(
          'Factory settings reset successfully. The app will restart automatically.',
        );
        setIsResetModalOpen(false);

        // Restart the app after a short delay
        setTimeout(() => {
          restartApp();
        }, 2000); // 2 second delay
      },
      onError: (error) => {
        toast.error(`Failed to reset factory settings: ${error.message}`);
      },
    });

  const handleResetClick = () => {
    setIsResetModalOpen(true);
  };

  const handleResetConfirm = () => {
    resetFactorySettings();
  };

  const handleResetCancel = () => {
    setIsResetModalOpen(false);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Typography variant="h5" fontWeight="500">
          Rosetta Labs
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <img
          src={icons.rosettaLabs}
          width={32}
          height={32}
          alt="Rosetta Labs"
        />
        <Typography variant="h5" fontWeight="500">
          Rosetta DBT Studio
        </Typography>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="body1">
            Version {window.electron.app.version} (Official Build)
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Built with Electron and React
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Stack spacing={2}>
        <Link
          href="https://github.com/rosettadb/dbt-studio"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) =>
            utils.handleExternalLink(
              e,
              'https://github.com/rosettadb/dbt-studio',
            )
          }
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            textDecoration: 'none',
          }}
        >
          <Typography variant="body1">
            Get help with Rosetta DBT Studio
          </Typography>
          <OpenInNew fontSize="small" />
        </Link>

        <Link
          href="https://github.com/rosettadb/dbt-studio/issues"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) =>
            utils.handleExternalLink(
              e,
              'https://github.com/rosettadb/dbt-studio/issues',
            )
          }
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            textDecoration: 'none',
          }}
        >
          <Typography variant="body1">Report an issue</Typography>
          <OpenInNew fontSize="small" />
        </Link>
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary" component="p">
          Rosetta DBT Studio is an Open Source visual development environment
          (IDE) that combines the strengths of RosettaDB, dbt™ Core and DuckDB
          for data engineering, transformation and migration. It empowers you to
          develop, run, and manage dbt™ projects with ease through a powerful
          graphical interface.
        </Typography>

        <Typography variant="body2" color="text.secondary" component="p">
          Key features include visual query editor, one-click dbt™ command
          execution, Git integration, multi-database support, and enhanced
          developer experience.
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Rosetta DBT Studio
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Copyright {new Date().getFullYear()} Rosetta Labs. All rights
          reserved.
        </Typography>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          DBT Studio is made possible by many open source projects including{' '}
          <Link
            href="https://www.getdbt.com/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) =>
              utils.handleExternalLink(e, 'https://www.getdbt.com/')
            }
          >
            dbt™
          </Link>
          ,{' '}
          <Link
            href="https://github.com/rosettadb/rosetta_cli"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) =>
              utils.handleExternalLink(
                e,
                'https://github.com/rosettadb/rosetta_cli',
              )
            }
          >
            RosettaDB
          </Link>
          ,{' '}
          <Link
            href="https://reactjs.org/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => utils.handleExternalLink(e, 'https://reactjs.org/')}
          >
            React
          </Link>
          , and many others.
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary">
        <Link
          href="https://rosettadb.io/"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => utils.handleExternalLink(e, 'https://rosettadb.io/')}
        >
          Learn more about Rosetta DBT Studio
        </Link>
      </Typography>

      <Divider sx={{ my: 3 }} />

      <Box>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Advanced Options
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<RestoreFromTrash />}
          onClick={handleResetClick}
          sx={{ mb: 2 }}
        >
          Reset Factory Settings
        </Button>
        <Typography variant="body2" color="text.secondary">
          This will permanently delete all your projects, connections, and
          settings. Make sure to backup your data before proceeding.
        </Typography>
      </Box>

      <ResetFactoryModal
        isOpen={isResetModalOpen}
        onClose={handleResetCancel}
        onConfirm={handleResetConfirm}
        isLoading={isResetting}
      />
    </Box>
  );
};
