import React from 'react';
import {
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  Radio,
  Typography,
} from '@mui/material';
import { Check, InfoOutlined } from '@mui/icons-material';
import { DBT_V2_BUILT_IN_ADAPTERS } from '../../../shared/dbtAdapterPackages';

export type DbtLine = 'v1' | 'v2';

export const DBT_LINE_LABELS: Record<DbtLine, string> = {
  v1: 'dbt 1.x',
  v2: 'dbt 2.x',
};

const DBT_LINE_DESCRIPTIONS: Record<DbtLine, string> = {
  v1: 'Python engine. Works with all 7 databases.',
  v2: 'Rust engine with built-in adapters. 5 databases. Needs Python 3.11 (installed for you).',
};

const LINE_MAJOR: Record<DbtLine, number> = { v1: 1, v2: 2 };

// Same as the dbt settings page's full version list.
const MAX_VERSIONS_PER_LINE = 15;

// A line's stable versions, newest first.
export const versionsOfLine = (
  availableVersions: string[] | null,
  line: DbtLine,
) =>
  (availableVersions ?? [])
    .filter((version) => Number.parseInt(version, 10) === LINE_MAJOR[line])
    .slice(0, MAX_VERSIONS_PER_LINE);

const adapterGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  columnGap: 2,
} as const;

type ChoiceOptionProps = {
  isChecked: boolean;
  onPick: () => void;
  testId: string;
  children: React.ReactNode;
};

// A clickable row with a radio. Clicking an already-checked row still picks
// it, so the step can move on with the pre-selected choice.
const ChoiceOption: React.FC<ChoiceOptionProps> = ({
  isChecked,
  onPick,
  testId,
  children,
}) => (
  <Box
    role="radio"
    aria-checked={isChecked}
    tabIndex={0}
    onClick={onPick}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPick();
      }
    }}
    data-testid={testId}
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      px: 1.25,
      py: 0.75,
      cursor: 'pointer',
      borderRadius: 1,
      border: '1px solid',
      borderColor: isChecked ? 'primary.main' : 'divider',
      '&:hover': { bgcolor: 'action.hover' },
    }}
  >
    <Radio
      size="small"
      checked={isChecked}
      tabIndex={-1}
      inputProps={{ readOnly: true, 'aria-hidden': true }}
      sx={{ p: 0.25, pointerEvents: 'none' }}
    />
    <Box sx={{ minWidth: 0 }}>{children}</Box>
  </Box>
);

type DbtLineChoiceProps = {
  dbtLine: DbtLine | null;
  onPick: (line: DbtLine) => void;
};

export const DbtLineChoice: React.FC<DbtLineChoiceProps> = ({
  dbtLine,
  onPick,
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
    {(['v1', 'v2'] as DbtLine[]).map((line) => (
      <ChoiceOption
        key={line}
        isChecked={dbtLine === line}
        onPick={() => onPick(line)}
        testId={`setup-dbt-${line}`}
      >
        <Typography component="div" sx={{ fontSize: 13, fontWeight: 500 }}>
          {DBT_LINE_LABELS[line]}
          {line === 'v1' && (
            <Chip
              label="Recommended"
              size="small"
              color="primary"
              variant="outlined"
              sx={{ ml: 1, height: 20, fontSize: 11 }}
            />
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {DBT_LINE_DESCRIPTIONS[line]}
        </Typography>
      </ChoiceOption>
    ))}
  </Box>
);

type DbtVersionChoiceProps = {
  dbtLine: DbtLine;
  // Stable dbt versions, newest first; null while they load.
  availableVersions: string[] | null;
  chosenVersion: string | null;
  // null when the list couldn't load: the install step then picks the latest.
  onPick: (version: string | null) => void;
};

export const DbtVersionChoice: React.FC<DbtVersionChoiceProps> = ({
  dbtLine,
  availableVersions,
  chosenVersion,
  onPick,
}) => {
  const lineVersions = versionsOfLine(availableVersions, dbtLine);

  if (availableVersions === null) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading versions...
      </Typography>
    );
  }
  if (lineVersions.length === 0) {
    return (
      <ChoiceOption
        isChecked={false}
        onPick={() => onPick(null)}
        testId="setup-dbt-version-latest"
      >
        <Typography sx={{ fontSize: 13 }}>Latest</Typography>
        <Typography variant="body2" color="text.secondary">
          Couldn&apos;t load the versions. The newest one will be installed.
        </Typography>
      </ChoiceOption>
    );
  }
  return (
    <Box
      role="radiogroup"
      data-testid="setup-dbt-versions"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        maxHeight: 200,
        overflowY: 'auto',
        pr: 0.5,
      }}
    >
      {lineVersions.map((version, index) => (
        <ChoiceOption
          key={version}
          isChecked={chosenVersion === version}
          onPick={() => onPick(version)}
          testId={`setup-dbt-version-${version}`}
        >
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
        </ChoiceOption>
      ))}
    </Box>
  );
};

type DbtAdaptersChoiceProps = {
  dbtLine: DbtLine;
  adapters: Array<{ name: string; description: string }>;
  selectedAdapters: string[];
  setSelectedAdapters: React.Dispatch<React.SetStateAction<string[]>>;
};

export const DbtAdaptersChoice: React.FC<DbtAdaptersChoiceProps> = ({
  dbtLine,
  adapters,
  selectedAdapters,
  setSelectedAdapters,
}) => {
  if (dbtLine === 'v2') {
    return (
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
          Postgres and Kinetica aren&apos;t supported on 2.x yet. Choose 1.x if
          you need them.
        </Typography>
      </Box>
    );
  }
  return (
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
          label={<Typography sx={{ fontSize: 13 }}>{adapter.name}</Typography>}
        />
      ))}
    </Box>
  );
};
