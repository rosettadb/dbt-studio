import React from 'react';
import { Typography, Box, Link, Button } from '@mui/material';
import {
  ContentCopy,
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
import { getPlatform } from '../../lib/path';
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

  const formatOsName = (platform: string): string => {
    const map: Record<string, string> = {
      darwin: 'macOS',
      win32: 'Windows',
      linux: 'Linux',
    };
    return map[platform] ?? platform;
  };

  const formatMemoryGiB = (bytes: number): string => {
    const gib = bytes / 1024 ** 3;
    return `${Math.round(gib)} GiB`;
  };

  const buildVersionDetails = () => {
    const { version, osVersion, osArch, memory } = window.electron.app;
    return [
      `Studio: v${version}`,
      `OS: ${formatOsName(getPlatform())} ${osVersion}`,
      `Memory: ${formatMemoryGiB(memory)}`,
      `Architecture: ${osArch}`,
    ].join('\n');
  };

  const handleCopyVersionDetails = async () => {
    try {
      await navigator.clipboard.writeText(buildVersionDetails());
      toast.success('Version details copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const buildReportIssueUrl = () => {
    const params = new URLSearchParams({
      template: 'bug_report.yml',
      environment: buildVersionDetails(),
    });
    return `https://github.com/rosettadb/dbt-studio/issues/new?${params.toString()}`;
  };

  const renderExternalLinkButton = (
    label: string,
    url: string,
    accessibleLabel: string,
  ) => (
    <Button
      size="small"
      variant="outlined"
      aria-label={accessibleLabel}
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
            <Box
              sx={{ display: 'flex', flexDirection: 'column', gap: 0.1, mb: 1 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <img
                  src={icons.rosettaLabs}
                  width={20}
                  height={20}
                  alt="Rosetta Labs"
                />
                Version {window.electron.app.version} (Official Build)
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                component="span"
              >{`OS: ${formatOsName(getPlatform())} ${window.electron.app.osVersion}`}</Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="span"
              >{`Memory: ${formatMemoryGiB(window.electron.app.memory)}`}</Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="span"
              >{`Architecture: ${window.electron.app.osArch}`}</Typography>
            </Box>
          }
          description="Built with Electron and React"
        >
          <Button
            size="small"
            variant="outlined"
            aria-label="Copy version details to clipboard"
            startIcon={<ContentCopy fontSize="small" />}
            onClick={handleCopyVersionDetails}
          >
            Copy
          </Button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Help" icon={<HelpOutline />}>
        <SettingsRow label="Get help with Rosetta DBT Studio">
          {renderExternalLinkButton(
            'Open',
            'https://github.com/rosettadb/dbt-studio',
            'Get help with Rosetta DBT Studio on GitHub',
          )}
        </SettingsRow>
        <SettingsRow label="Report an issue">
          {renderExternalLinkButton(
            'Open',
            buildReportIssueUrl(),
            'Report an issue on GitHub with version info pre-filled',
          )}
        </SettingsRow>
        <SettingsRow label="Learn more about Rosetta DBT Studio">
          {renderExternalLinkButton(
            'Open',
            'https://rosettadb.io/',
            'Learn more about Rosetta DBT Studio on rosettadb.io',
          )}
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
