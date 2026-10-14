import React from 'react';
import {
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { Check, ExtensionOutlined, InfoOutlined } from '@mui/icons-material';
import { DBT_V2_BUILT_IN_ADAPTERS } from '../../../shared/dbtAdapterPackages';
import { SetupChoiceRow, setupChoiceListSx } from '../setupChoiceRow';

export type DbtLine = 'v1' | 'v2';

// The setup page's collapsible sections; only one is open at a time.
export type SetupSection = DbtLine | 'adapters' | 'tools';

const DBT_LINE_OPTIONS: Array<{
  line: DbtLine;
  title: string;
  description: string;
}> = [
  {
    line: 'v1',
    title: 'dbt 1.x',
    description: 'Python engine. Works with all 7 databases.',
  },
  {
    line: 'v2',
    title: 'dbt 2.x',
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

// Same as the dbt settings page's full version list.
const MAX_VERSIONS_PER_LINE = 15;

type DbtSetupProps = {
  dbtLine: DbtLine;
  setDbtLine: (line: DbtLine) => void;
  // Stable dbt versions, newest first; null while they load.
  availableVersions: string[] | null;
  chosenVersions: Record<DbtLine, string | null>;
  setChosenVersion: (line: DbtLine, version: string) => void;
  openSection: SetupSection | null;
  setOpenSection: (section: SetupSection | null) => void;
};

export const DbtSetup: React.FC<DbtSetupProps> = ({
  dbtLine,
  setDbtLine,
  availableVersions,
  chosenVersions,
  setChosenVersion,
  openSection,
  setOpenSection,
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
    <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
      Which dbt™ version would you like to install?
    </Typography>
    <Box sx={setupChoiceListSx} role="radiogroup">
      {DBT_LINE_OPTIONS.map((option) => {
        const isSelected = dbtLine === option.line;
        const isOpen = openSection === option.line;
        const lineVersions = (availableVersions ?? [])
          .filter(
            (version) =>
              Number.parseInt(version, 10) === LINE_MAJOR[option.line],
          )
          .slice(0, MAX_VERSIONS_PER_LINE);
        const chosenVersion = chosenVersions[option.line];

        let summary: string | undefined;
        if (isSelected) {
          if (availableVersions === null) summary = 'Loading...';
          else if (!chosenVersion) summary = 'Latest';
          else if (chosenVersion === lineVersions[0])
            summary = `${chosenVersion} (latest)`;
          else summary = chosenVersion;
        }

        let versionList: React.ReactNode;
        if (availableVersions === null) {
          versionList = (
            <Typography variant="body2" color="text.secondary">
              Loading versions...
            </Typography>
          );
        } else if (lineVersions.length === 0) {
          // The list couldn't load; the install step then picks the latest.
          versionList = (
            <Typography variant="body2" color="text.secondary">
              Couldn&apos;t load the versions. The latest one will be installed.
            </Typography>
          );
        } else {
          versionList = (
            <RadioGroup
              value={chosenVersion ?? ''}
              onChange={(event) => {
                setChosenVersion(option.line, event.target.value);
                setOpenSection(null);
              }}
              sx={{ maxHeight: 168, overflowY: 'auto', flexWrap: 'nowrap' }}
              data-testid={`setup-dbt-versions-${option.line}`}
            >
              {lineVersions.map((version, index) => (
                <FormControlLabel
                  key={version}
                  value={version}
                  sx={{ m: 0 }}
                  control={<Radio size="small" sx={{ py: 0.5 }} />}
                  label={
                    <Typography sx={{ fontSize: 13 }}>
                      {version}
                      {index === 0 && (
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                          sx={{ ml: 1 }}
                        >
                          latest
                        </Typography>
                      )}
                    </Typography>
                  }
                />
              ))}
            </RadioGroup>
          );
        }

        return (
          <SetupChoiceRow
            key={option.line}
            testId={`setup-dbt-${option.line}`}
            leading={
              <Radio
                size="small"
                checked={isSelected}
                onChange={() => setDbtLine(option.line)}
                sx={{ p: 0.25 }}
                inputProps={{ 'aria-label': option.title }}
              />
            }
            title={
              <>
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
              </>
            }
            description={option.description}
            summary={summary}
            isSelected={isSelected}
            isOpen={isOpen}
            onToggle={() => {
              setDbtLine(option.line);
              setOpenSection(isOpen ? null : option.line);
            }}
          >
            {versionList}
          </SetupChoiceRow>
        );
      })}
    </Box>
  </Box>
);

type DbtAdaptersRowProps = {
  dbtLine: DbtLine;
  adapters: Array<{ name: string; description: string }>;
  selectedAdapters: string[];
  setSelectedAdapters: React.Dispatch<React.SetStateAction<string[]>>;
  isOpen: boolean;
  onToggle: () => void;
};

export const DbtAdaptersRow: React.FC<DbtAdaptersRowProps> = ({
  dbtLine,
  adapters,
  selectedAdapters,
  setSelectedAdapters,
  isOpen,
  onToggle,
}) => {
  // dbt-core is always installed, so only the adapter packages count.
  const adapterCount = adapters.length - 1;
  const selectedCount = selectedAdapters.filter((a) => a !== 'dbt-core').length;
  let summary = `${DBT_V2_BUILT_IN_ADAPTERS.length} included with 2.x`;
  if (dbtLine === 'v1') {
    summary =
      selectedCount === adapterCount
        ? `All ${adapterCount} selected`
        : `${selectedCount} of ${adapterCount} selected`;
  }

  return (
    <SetupChoiceRow
      testId="setup-adapters"
      leading={<ExtensionOutlined fontSize="small" />}
      title="Adapters"
      summary={summary}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {dbtLine === 'v1' ? (
        <Box sx={adapterGridSx} data-testid="setup-adapter-checkboxes">
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
      ) : (
        <Box data-testid="setup-adapter-included">
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
            Postgres and Kinetica aren&apos;t supported on 2.x yet. Choose 1.x
            if you need them.
          </Typography>
        </Box>
      )}
    </SetupChoiceRow>
  );
};
