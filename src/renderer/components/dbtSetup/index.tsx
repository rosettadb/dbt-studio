import React from 'react';
import {
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Radio,
  Select,
  Typography,
} from '@mui/material';
import { Check, InfoOutlined } from '@mui/icons-material';
import { DBT_V2_BUILT_IN_ADAPTERS } from '../../../shared/dbtAdapterPackages';

export type DbtLine = 'v1' | 'v2';

const DBT_LINE_OPTIONS: Array<{
  line: DbtLine;
  title: string;
  description: string;
}> = [
  {
    line: 'v1',
    title: 'dbt Core 1.x',
    description: 'Python engine. Works with all 7 databases.',
  },
  {
    line: 'v2',
    title: 'dbt Core 2.x',
    description:
      'Rust engine with built-in adapters. 5 databases. Needs Python 3.11 (installed for you).',
  },
];

const adapterGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  columnGap: 2,
} as const;

const LINE_MAJOR: Record<DbtLine, number> = { v1: 1, v2: 2 };

type Props = {
  dbtLine: DbtLine;
  setDbtLine: (line: DbtLine) => void;
  // Stable dbt versions, newest first; null while they load.
  availableVersions: string[] | null;
  chosenVersions: Record<DbtLine, string | null>;
  setChosenVersion: (line: DbtLine, version: string) => void;
  adapters: Array<{ name: string; description: string }>;
  selectedAdapters: string[];
  setSelectedAdapters: React.Dispatch<React.SetStateAction<string[]>>;
};

export const DbtSetup: React.FC<Props> = ({
  dbtLine,
  setDbtLine,
  availableVersions,
  chosenVersions,
  setChosenVersion,
  adapters,
  selectedAdapters,
  setSelectedAdapters,
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
      Which dbt™ Core version do you want?
    </Typography>
    <Box
      sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}
      role="radiogroup"
    >
      {DBT_LINE_OPTIONS.map((option) => {
        const isSelected = dbtLine === option.line;
        const lineVersions = (availableVersions ?? []).filter(
          (version) => Number.parseInt(version, 10) === LINE_MAJOR[option.line],
        );
        let versionItems: React.ReactNode;
        if (availableVersions === null) {
          versionItems = <MenuItem value="">Loading versions...</MenuItem>;
        } else if (lineVersions.length === 0) {
          // The list couldn't load; the install step then picks the latest.
          versionItems = <MenuItem value="">Latest</MenuItem>;
        } else {
          versionItems = lineVersions.map((version, index) => (
            <MenuItem key={version} value={version}>
              {index === 0 ? `${version} (latest)` : version}
            </MenuItem>
          ));
        }
        return (
          <Box
            key={option.line}
            onClick={() => setDbtLine(option.line)}
            data-testid={`setup-dbt-${option.line}`}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              p: 1.25,
              cursor: 'pointer',
              borderRadius: 1,
              border: '1px solid',
              borderColor: isSelected ? 'primary.main' : 'divider',
              outline: isSelected ? '1px solid' : 'none',
              outlineColor: 'primary.main',
            }}
          >
            <Radio
              size="small"
              checked={isSelected}
              onChange={() => setDbtLine(option.line)}
              sx={{ p: 0.25 }}
              inputProps={{ 'aria-label': option.title }}
            />
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                alignSelf: 'stretch',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Typography
                component="div"
                sx={{ fontSize: 13, fontWeight: 500 }}
              >
                {option.title}
                {option.line === 'v1' && (
                  <Chip
                    label="Recommended"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ ml: 1, height: 20, fontSize: 11 }}
                  />
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {option.description}
              </Typography>
              <Select
                size="small"
                fullWidth
                displayEmpty
                value={chosenVersions[option.line] ?? ''}
                disabled={!isSelected || availableVersions === null}
                onChange={(event) =>
                  setChosenVersion(option.line, event.target.value)
                }
                data-testid={`setup-dbt-version-${option.line}`}
                inputProps={{ 'aria-label': `${option.title} version` }}
                sx={{
                  // Keep both cards' dropdowns level, and compact (the app
                  // theme makes inputs 48px tall).
                  mt: 'auto',
                  height: 36,
                  fontSize: 13,
                }}
              >
                {versionItems}
              </Select>
            </Box>
          </Box>
        );
      })}
    </Box>

    {dbtLine === 'v1' ? (
      <Box data-testid="setup-adapter-checkboxes">
        <Typography sx={{ fontSize: 14, fontWeight: 500, mb: 0.5 }}>
          Adapters to install
        </Typography>
        <Box sx={adapterGridSx}>
          {adapters.map((adapter, index) => (
            <FormControlLabel
              key={adapter.name}
              title={adapter.description}
              sx={{ m: 0 }}
              control={
                <Checkbox
                  size="small"
                  sx={{ py: 0.5 }}
                  checked={selectedAdapters.includes(adapter.name)}
                  disabled={index === 0}
                  onChange={() => {
                    if (selectedAdapters.includes(adapter.name)) {
                      setSelectedAdapters(
                        selectedAdapters.filter((a) => a !== adapter.name),
                      );
                    } else {
                      setSelectedAdapters([...selectedAdapters, adapter.name]);
                    }
                  }}
                />
              }
              label={
                <Typography sx={{ fontSize: 13 }}>{adapter.name}</Typography>
              }
            />
          ))}
        </Box>
      </Box>
    ) : (
      <Box data-testid="setup-adapter-included">
        <Typography sx={{ fontSize: 14, fontWeight: 500, mb: 0.5 }}>
          Included adapters
        </Typography>
        <Box sx={{ ...adapterGridSx, rowGap: 0.75, mb: 1 }}>
          {DBT_V2_BUILT_IN_ADAPTERS.map((adapter) => (
            <Box
              key={adapter}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
            >
              <Check fontSize="small" color="disabled" />
              <Typography sx={{ fontSize: 13 }} color="text.secondary">
                {adapter}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
        >
          <InfoOutlined fontSize="small" />
          Postgres and Kinetica aren&apos;t supported on 2.x yet. Choose 1.x if
          you need them.
        </Typography>
      </Box>
    )}
  </Box>
);
