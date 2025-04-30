import React from 'react';
import { Typography, Box, Link, Divider, Stack } from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { Icon } from '../index';
import { icons } from '../../../../assets';

export const AboutSettings: React.FC = () => {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Icon
          src={icons.dbtTm}
          width={32}
          height={32}
        />
        <Typography variant="h5" fontWeight="500">
           Rosetta dbt™ Studio
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
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            textDecoration: 'none',
          }}
        >
          <Typography variant="body1">Get help with Rosetta dbt™ Studio</Typography>
          <OpenInNew fontSize="small" />
        </Link>

        <Link
          href="https://github.com/rosettadb/dbt-studio/issues"
          target="_blank"
          rel="noopener noreferrer"
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
          Rosetta dbt™ Studio is an Open Source visual development environment (IDE) that combines the strengths of RosettaDB and dbt™ Core for data engineering, transformation and migration. It empowers you to develop, run, and manage dbt™ projects with ease through a powerful graphical interface.
        </Typography>

        <Typography variant="body2" color="text.secondary" component="p">
          Key features include visual query editor, one-click dbt™ command execution, Git integration, multi-database support, and enhanced developer experience.
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Rosetta dbt™ Studio
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Copyright {new Date().getFullYear()} Rosettadb. All rights reserved.
        </Typography>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          dbt™ Studio is made possible by many open source projects including{' '}
          <Link
            href="https://www.getdbt.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            dbt™
          </Link>
          ,{' '}
          <Link
            href="https://github.com/rosettadb/rosetta"
            target="_blank"
            rel="noopener noreferrer"
          >
            RosettaDB
          </Link>
          ,{' '}
          <Link
            href="https://reactjs.org/"
            target="_blank"
            rel="noopener noreferrer"
          >
            React
          </Link>
          , and many others.
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary">
        <Link
          href="https://rosettaa.netlify.app/rosettadbtstudio"
          target="_blank"
          rel="noopener noreferrer"
        >
            Learn more about Rosetta dbt™ Studio
        </Link>
      </Typography>
    </Box>
  );
};
