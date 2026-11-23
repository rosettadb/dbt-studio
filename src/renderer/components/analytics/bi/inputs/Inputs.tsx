/**
 * Input components. Each writes its value to the page's input state under
 * its `name`, where SQL reads it as `${inputs.<name>.value}`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Checkbox as MuiCheckbox,
  FormControlLabel,
  MenuItem,
  Select,
  Slider as MuiSlider,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  DATE_RANGE_PRESETS,
  formatValue,
  InputValue,
  resolveDatePreset,
  staticOptions,
} from '../engine';
import type { BiImplProps, Row } from '../registry.types';
import { propBool, propNumber, propString } from '../props';
import { useBiPage } from '../context';

interface Option {
  value: unknown;
  label: string;
}

const key = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

function useInput(props: Record<string, unknown>) {
  const page = useBiPage();
  const name = propString(props, 'name');
  const current = name ? page.inputs[name] : undefined;
  const set = (value: InputValue) => {
    if (name && !page.readOnlyInputs) page.setInput(name, value);
  };
  return { name, current, set, readOnly: page.readOnlyInputs };
}

function optionsFrom(
  props: Record<string, unknown>,
  data: Row[] | undefined,
  node: BiImplProps['node'],
): Option[] {
  const out: Option[] = staticOptions(node).map((o) => ({
    value: o.value,
    label: String(o.label ?? o.value),
  }));
  if (data && data.length) {
    const valueCol = propString(props, 'value') ?? Object.keys(data[0])[0];
    const labelCol = propString(props, 'label') ?? valueCol;
    const seen = new Set(out.map((o) => key(o.value)));
    data.forEach((row) => {
      const value = row[valueCol];
      if (seen.has(key(value))) return;
      seen.add(key(value));
      out.push({ value, label: String(row[labelCol] ?? value) });
    });
  }
  return out;
}

const InputShell: React.FC<{
  title?: string;
  readOnly: boolean;
  children: React.ReactNode;
  testId: string;
}> = ({ title, readOnly, children, testId }) => {
  const body = (
    <Box
      data-testid={testId}
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        verticalAlign: 'top',
        minWidth: 160,
      }}
    >
      {title && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
  return readOnly ? (
    <Tooltip title="Filters are fixed to their defaults in this view">
      {body}
    </Tooltip>
  ) : (
    body
  );
};

export const BiDropdown: React.FC<BiImplProps> = ({
  node,
  props,
  data,
  dataQuery,
}) => {
  const { current, set, readOnly } = useInput(props);
  const page = useBiPage();
  const options = useMemo(
    () => optionsFrom(props, data, node),
    [props, data, node],
  );
  const multiple = propBool(props, 'multiple');
  const title = propString(props, 'title') ?? propString(props, 'name');
  const loading =
    dataQuery && data === undefined && page.statuses[dataQuery] === 'running';

  const selected: string[] = useMemo(() => {
    const v = current?.value;
    if (v === undefined) return [];
    return Array.isArray(v) ? v.map(key) : [key(v)];
  }, [current]);

  const byKey = useMemo(
    () => new Map(options.map((o) => [key(o.value), o])),
    [options],
  );

  const handleChange = (raw: string | string[]) => {
    const keys = Array.isArray(raw) ? raw : [raw];
    const chosen = keys
      .map((k) => byKey.get(k))
      .filter((o): o is Option => Boolean(o));
    if (multiple) {
      set({
        value: chosen.map((o) => o.value),
        label: chosen.map((o) => o.label).join(', '),
      });
    } else if (chosen[0]) {
      set({ value: chosen[0].value, label: chosen[0].label });
    }
  };

  return (
    <InputShell title={title} readOnly={readOnly} testId="bi-dropdown">
      <Select
        size="small"
        multiple={multiple}
        displayEmpty
        disabled={readOnly || Boolean(loading)}
        value={multiple ? selected : (selected[0] ?? '')}
        onChange={(e) => handleChange(e.target.value as string | string[])}
        renderValue={(value) => {
          let keys: string[] = [];
          if (Array.isArray(value)) keys = value;
          else if (value) keys = [value];
          if (keys.length === 0) {
            return (
              <Typography variant="body2" color="text.disabled">
                {dataQuery && data === undefined
                  ? 'Run queries to load options'
                  : 'Select…'}
              </Typography>
            );
          }
          return keys.map((k) => byKey.get(k)?.label ?? k).join(', ');
        }}
        inputProps={{ 'aria-label': title ?? 'Dropdown' }}
        sx={{ fontSize: '0.85rem', minWidth: 160, height: 40 }}
      >
        {options.map((o) => (
          <MenuItem
            key={key(o.value)}
            value={key(o.value)}
            sx={{ fontSize: '0.85rem' }}
          >
            {o.label}
          </MenuItem>
        ))}
      </Select>
    </InputShell>
  );
};

export const BiButtonGroup: React.FC<BiImplProps> = ({ node, props, data }) => {
  const { current, set, readOnly } = useInput(props);
  const options = useMemo(
    () => optionsFrom(props, data, node),
    [props, data, node],
  );
  const multiple = propBool(props, 'multiple');
  const title = propString(props, 'title');
  const selected = current?.value;
  let value: string | string[] | null = null;
  if (multiple) value = (Array.isArray(selected) ? selected : []).map(key);
  else if (selected !== undefined) value = key(selected);
  const byKey = new Map(options.map((o) => [key(o.value), o]));

  return (
    <InputShell title={title} readOnly={readOnly} testId="bi-buttongroup">
      <ToggleButtonGroup
        size="small"
        exclusive={!multiple}
        value={value}
        disabled={readOnly}
        onChange={(_, next: string | string[] | null) => {
          if (next === null) return;
          if (Array.isArray(next)) {
            const chosen = next
              .map((k) => byKey.get(k))
              .filter((o): o is Option => Boolean(o));
            set({
              value: chosen.map((o) => o.value),
              label: chosen.map((o) => o.label).join(', '),
            });
          } else {
            const o = byKey.get(next);
            if (o) set({ value: o.value, label: o.label });
          }
        }}
      >
        {options.map((o) => (
          <ToggleButton
            key={key(o.value)}
            value={key(o.value)}
            sx={{
              textTransform: 'none',
              height: 40,
              px: 1.75,
              fontSize: '0.8rem',
            }}
          >
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </InputShell>
  );
};

/** Text-like inputs commit on blur / Enter so typing doesn't re-run SQL per key. */
const CommitField: React.FC<{
  value: string;
  onCommit: (v: string) => void;
  type?: string;
  placeholder?: string;
  readOnly: boolean;
  label: string;
  inputProps?: Record<string, unknown>;
  /** Date pickers change without a blur: commit each complete value. */
  commitOnChange?: boolean;
}> = ({
  value,
  onCommit,
  type,
  placeholder,
  readOnly,
  label,
  inputProps,
  commitOnChange = false,
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <TextField
      size="small"
      type={type}
      value={draft}
      placeholder={placeholder}
      disabled={readOnly}
      onChange={(e) => {
        setDraft(e.target.value);
        if (commitOnChange && e.target.value && e.target.value !== value) {
          onCommit(e.target.value);
        }
      }}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft);
      }}
      inputProps={{ 'aria-label': label, ...inputProps }}
      sx={{ minWidth: 160, '& input': { fontSize: '0.85rem' } }}
    />
  );
};

export const BiTextInput: React.FC<BiImplProps> = ({ props }) => {
  const { current, set, readOnly } = useInput(props);
  const title = propString(props, 'title') ?? propString(props, 'label');
  return (
    <InputShell title={title} readOnly={readOnly} testId="bi-textinput">
      <CommitField
        value={String(current?.value ?? '')}
        placeholder={propString(props, 'placeholder')}
        readOnly={readOnly}
        label={title ?? 'Text'}
        onCommit={(v) => set({ value: v })}
      />
    </InputShell>
  );
};

export const BiNumberInput: React.FC<BiImplProps> = ({ props }) => {
  const { current, set, readOnly } = useInput(props);
  const title = propString(props, 'title') ?? propString(props, 'label');
  return (
    <InputShell title={title} readOnly={readOnly} testId="bi-numberinput">
      <CommitField
        type="number"
        value={String(current?.value ?? '')}
        readOnly={readOnly}
        label={title ?? 'Number'}
        inputProps={{
          min: propNumber(props, 'min'),
          max: propNumber(props, 'max'),
          step: propNumber(props, 'step'),
        }}
        onCommit={(v) => {
          const n = Number(v);
          if (Number.isFinite(n)) set({ value: n });
        }}
      />
    </InputShell>
  );
};

export const BiCheckbox: React.FC<BiImplProps> = ({ props }) => {
  const { current, set, readOnly } = useInput(props);
  const title = propString(props, 'title');
  const label =
    propString(props, 'label') ?? title ?? propString(props, 'name') ?? '';
  return (
    <InputShell
      title={propString(props, 'label') ? title : undefined}
      readOnly={readOnly}
      testId="bi-checkbox"
    >
      <FormControlLabel
        control={
          <MuiCheckbox
            size="small"
            checked={Boolean(current?.value)}
            disabled={readOnly}
            onChange={(e) => set({ value: e.target.checked })}
          />
        }
        label={<Typography variant="body2">{label}</Typography>}
      />
    </InputShell>
  );
};

export const BiSlider: React.FC<BiImplProps> = ({ props }) => {
  const { current, set, readOnly } = useInput(props);
  const min = propNumber(props, 'min') ?? 0;
  const max = propNumber(props, 'max') ?? 100;
  const step = propNumber(props, 'step') ?? 1;
  const fmt = propString(props, 'fmt');
  const committed = Number(current?.value ?? min);
  const [draft, setDraft] = useState(committed);
  useEffect(() => setDraft(committed), [committed]);
  const title = propString(props, 'title');
  return (
    <InputShell title={title} readOnly={readOnly} testId="bi-slider">
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 220 }}
      >
        <MuiSlider
          size="small"
          min={min}
          max={max}
          step={step}
          value={draft}
          disabled={readOnly}
          onChange={(_, v) => setDraft(v as number)}
          onChangeCommitted={(_, v) => set({ value: v as number })}
          aria-label={title ?? 'Slider'}
        />
        <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
          {formatValue(draft, fmt)}
        </Typography>
      </Box>
    </InputShell>
  );
};

export const BiDateRange: React.FC<BiImplProps> = ({ props }) => {
  const { current, set, readOnly } = useInput(props);
  const title = propString(props, 'title');
  const start = String(current?.start ?? '');
  const end = String(current?.end ?? '');
  // A range picked backwards is swapped so start <= end.
  const update = (a: string, b: string) => {
    const [s, e] = a && b && a > b ? [b, a] : [a, b];
    set({ value: { start: s, end: e }, start: s, end: e });
  };
  return (
    <InputShell title={title} readOnly={readOnly} testId="bi-daterange">
      <Box
        sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Select
          size="small"
          displayEmpty
          value=""
          disabled={readOnly}
          onChange={(e) => {
            const range = resolveDatePreset(String(e.target.value));
            if (range) update(range.start, range.end);
          }}
          renderValue={() => 'Preset'}
          inputProps={{ 'aria-label': `${title ?? 'Date range'} preset` }}
          sx={{ fontSize: '0.8rem' }}
        >
          {DATE_RANGE_PRESETS.map((p) => (
            <MenuItem key={p} value={p} sx={{ fontSize: '0.8rem' }}>
              {p}
            </MenuItem>
          ))}
        </Select>
        <CommitField
          type="date"
          value={start}
          readOnly={readOnly}
          label="Start date"
          commitOnChange
          onCommit={(v) => update(v, end)}
        />
        <Typography variant="caption" color="text.secondary">
          to
        </Typography>
        <CommitField
          type="date"
          value={end}
          readOnly={readOnly}
          label="End date"
          commitOnChange
          onCommit={(v) => update(start, v)}
        />
      </Box>
    </InputShell>
  );
};
