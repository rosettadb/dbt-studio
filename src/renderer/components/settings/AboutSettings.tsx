import React from 'react';
import { Typography, Box, Link, Button } from '@mui/material';
import {
  OpenInNew,
  RestoreFromTrash,
  InfoOutlined,
  HelpOutline,
  DescriptionOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { icons } from '../../../../assets';
import { utils } from '../../helpers';
import { ResetFactoryModal } from '../modals';
import { useResetFactorySettings } from '../../controllers';
import {
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
} from './SettingsLayout';

export const AboutSettings: React.FC = () => {
  const [isResetModalOpen, setIsResetModalOpen] = React.useState(false);

  const { mutate: resetFactorySettings, isLoading: isResetting } =
    useResetFactorySettings({
      onSuccess: () => {
        toast.success('Factory reset completed. The app is restarting.');
        setIsResetModalOpen(false);
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

  const renderExternalLinkButton = (label: string, url: string) => (
    <Button
      size="small"
      endIcon={<OpenInNew fontSize="small" />}
      component="a"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
        utils.handleExternalLink(e, url)
      }
    >
      {label}
    </Button>
  );

  return (
    <SettingsStack>
      <SettingsSection
        title="Rosetta DBT Studio"
        icon={<InfoOutlined />}
        description="Rosetta Labs"
      >
        <SettingsRow
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <img
                src={icons.rosettaLabs}
                width={20}
                height={20}
                alt="Rosetta Labs"
              />
              Version {window.electron.app.version} (Official Build)
            </Box>
          }
          description="Built with Electron and React"
        />
      </SettingsSection>

      <SettingsSection title="Help" icon={<HelpOutline />}>
        <SettingsRow label="Get help with Rosetta DBT Studio">
          {renderExternalLinkButton(
            'Open',
            'https://github.com/rosettadb/dbt-studio',
          )}
        </SettingsRow>
        <SettingsRow label="Report an issue">
          {renderExternalLinkButton(
            'Open',
            'https://github.com/rosettadb/dbt-studio/issues',
          )}
        </SettingsRow>
        <SettingsRow label="Learn more about Rosetta DBT Studio">
          {renderExternalLinkButton('Open', 'https://rosettadb.io/')}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="About" icon={<DescriptionOutlined />}>
        <SettingsSectionBody>
          <Typography variant="body2" color="text.secondary" component="p">
            Rosetta DBT Studio is an Open Source visual development environment
            (IDE) that combines the strengths of RosettaDB, dbt™ Core and
            DuckDB for data engineering, transformation and migration. It
            empowers you to develop, run, and manage dbt™ projects with ease
            through a powerful graphical interface.
          </Typography>
          <Typography variant="body2" color="text.secondary" component="p">
            Key features include visual query editor, one-click dbt™ command
            execution, Git integration, multi-database support, and enhanced
            developer experience.
          </Typography>
          <Typography variant="body2" color="text.secondary" component="p">
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
              onClick={(e) =>
                utils.handleExternalLink(e, 'https://reactjs.org/')
              }
            >
              React
            </Link>
            , and many others.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Copyright {new Date().getFullYear()} Rosetta Labs. All rights
            reserved.
          </Typography>
        </SettingsSectionBody>
      </SettingsSection>

      <SettingsSection title="Advanced Options" icon={<WarningAmberOutlined />}>
        <SettingsRow
          label="Reset Factory Settings"
          description="Permanently deletes all your projects, connections, and settings. Make sure to backup your data before proceeding."
        >
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<RestoreFromTrash />}
            onClick={handleResetClick}
          >
            Reset Factory Settings
          </Button>
        </SettingsRow>
      </SettingsSection>

      <ResetFactoryModal
        isOpen={isResetModalOpen}
        onClose={handleResetCancel}
        onConfirm={handleResetConfirm}
        isLoading={isResetting}
      />
    </SettingsStack>
  );
};
