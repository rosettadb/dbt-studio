// Every widget component takes the same props; not each one uses them all.
/* eslint-disable react/no-unused-prop-types */
import React from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import type {
  PluginWidget,
  PluginWidgetType,
} from '../../../extensionApi/studio/pipelineShared';

// One form field of a pipeline step, drawn from a widget of the plugin's
// manifest entry. A step value is whatever the pipeline file holds; every
// widget type reads it leniently and writes back a value the runner turns
// into one string for the plugin's script.

export interface StepWidgetProps {
  widget: PluginWidget;
  value: unknown;
  onChange: (value: unknown) => void;
  /** For file and directory pickers: paths inside it are saved relative. */
  projectPath?: string;
}

const asText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const asList = (value: unknown, separator: string): string[] => {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  return asText(value)
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
};

const labelWithRequired = (widget: PluginWidget): string =>
  widget.required ? `${widget.label} *` : widget.label;

const FieldCaption: React.FC<{ widget: PluginWidget }> = ({ widget }) => (
  <Typography
    variant="caption"
    color="text.secondary"
    sx={{ mb: 0.5, display: 'block' }}
  >
    {labelWithRequired(widget)}
  </Typography>
);

const Description: React.FC<{ widget: PluginWidget }> = ({ widget }) =>
  widget.description ? (
    <FormHelperText sx={{ mx: 0 }}>{widget.description}</FormHelperText>
  ) : null;

const TextWidget: React.FC<StepWidgetProps> = ({ widget, value, onChange }) => (
  <TextField
    label={widget.label}
    value={asText(value)}
    onChange={(e) => onChange(e.target.value)}
    fullWidth
    size="small"
    required={widget.required}
    placeholder={widget.placeholder}
    helperText={widget.description}
    InputLabelProps={widget.placeholder ? { shrink: true } : undefined}
  />
);

const MultilineWidget: React.FC<StepWidgetProps> = ({
  widget,
  value,
  onChange,
}) => (
  <Box>
    <FieldCaption widget={widget} />
    <textarea
      value={asText(value)}
      onChange={(e) => onChange(e.target.value)}
      rows={widget.type === 'code' ? 8 : 4}
      placeholder={widget.placeholder}
      spellCheck={false}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        padding: '8px 12px',
        border: '1px solid rgba(0,0,0,0.23)',
        borderRadius: 4,
        resize: 'vertical',
        outline: 'none',
        background: 'transparent',
        color: 'inherit',
        lineHeight: 1.5,
      }}
    />
    <Description widget={widget} />
  </Box>
);

const NumberWidget: React.FC<StepWidgetProps> = ({
  widget,
  value,
  onChange,
}) => (
  <TextField
    type="number"
    label={widget.label}
    value={asText(value)}
    onChange={(e) =>
      onChange(e.target.value === '' ? undefined : Number(e.target.value))
    }
    fullWidth
    size="small"
    required={widget.required}
    placeholder={widget.placeholder}
    helperText={widget.description}
    inputProps={{ min: widget.min, max: widget.max, step: widget.step }}
    InputLabelProps={widget.placeholder ? { shrink: true } : undefined}
  />
);

const CheckboxWidget: React.FC<StepWidgetProps> = ({
  widget,
  value,
  onChange,
}) => (
  <Box>
    <FormControlLabel
      control={
        <Checkbox
          size="small"
          checked={value === true || value === 'true'}
          onChange={(e) => onChange(e.target.checked)}
        />
      }
      label={<Typography variant="body2">{widget.label}</Typography>}
    />
    <Description widget={widget} />
  </Box>
);

// A value written by hand that is not among the options is still offered,
// so opening the dialog never loses it.
const optionsWithCurrent = (widget: PluginWidget, current: string[]) => [
  ...widget.options,
  ...current
    .filter((item) => !widget.options.some((option) => option.value === item))
    .map((item) => ({ value: item, label: item })),
];

const DropdownWidget: React.FC<StepWidgetProps> = ({
  widget,
  value,
  onChange,
}) => {
  const current = asText(value);
  return (
    <FormControl fullWidth size="small" required={widget.required}>
      <InputLabel shrink>{widget.label}</InputLabel>
      <Select
        value={current}
        label={widget.label}
        displayEmpty
        notched
        onChange={(e) => onChange(e.target.value)}
      >
        {!widget.required && (
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
        )}
        {optionsWithCurrent(widget, current ? [current] : []).map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      <Description widget={widget} />
    </FormControl>
  );
};

const RadioWidget: React.FC<StepWidgetProps> = ({
  widget,
  value,
  onChange,
}) => {
  const current = asText(value);
  return (
    <Box>
      <FieldCaption widget={widget} />
      <RadioGroup
        row
        value={current}
        onChange={(e) => onChange(e.target.value)}
      >
        {optionsWithCurrent(widget, current ? [current] : []).map((option) => (
          <FormControlLabel
            key={option.value}
            value={option.value}
            control={<Radio size="small" />}
            label={<Typography variant="body2">{option.label}</Typography>}
          />
        ))}
      </RadioGroup>
      <Description widget={widget} />
    </Box>
  );
};

const MultiselectWidget: React.FC<StepWidgetProps> = ({
  widget,
  value,
  onChange,
}) => {
  const current = asList(value, widget.separator);
  const options = optionsWithCurrent(widget, current);
  return (
    <Autocomplete
      multiple
      size="small"
      options={options.map((option) => option.value)}
      getOptionLabel={(item) =>
        options.find((option) => option.value === item)?.label ?? item
      }
      value={current}
      onChange={(_event, items) => onChange(items.join(widget.separator))}
      renderInput={(params) => (
        <TextField
          {...params} // eslint-disable-line react/jsx-props-no-spreading
          label={labelWithRequired(widget)}
          placeholder={widget.placeholder}
          helperText={widget.description}
        />
      )}
    />
  );
};

const ListWidget: React.FC<StepWidgetProps> = ({ widget, value, onChange }) => (
  <Autocomplete
    multiple
    freeSolo
    size="small"
    options={[] as string[]}
    value={asList(value, widget.separator)}
    onChange={(_event, items) => onChange(items.join(widget.separator))}
    renderTags={(items, getTagProps) =>
      items.map((item, index) => (
        <Chip
          size="small"
          label={item}
          {...getTagProps({ index })} // eslint-disable-line react/jsx-props-no-spreading
        />
      ))
    }
    renderInput={(params) => (
      <TextField
        {...params} // eslint-disable-line react/jsx-props-no-spreading
        label={labelWithRequired(widget)}
        placeholder={widget.placeholder ?? 'Type a value and press Enter'}
        helperText={widget.description}
      />
    )}
  />
);

// Saved as one KEY=VALUE per line.
const parsePairs = (value: unknown): [string, string][] =>
  asText(value)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line): [string, string] => {
      const at = line.indexOf('=');
      return at === -1 ? [line, ''] : [line.slice(0, at), line.slice(at + 1)];
    });

const KeyValueWidget: React.FC<StepWidgetProps> = ({
  widget,
  value,
  onChange,
}) => {
  // Rows being typed (a key without a value yet, an empty new row) are kept
  // here; only rows with a key are saved.
  const [rows, setRows] = React.useState<[string, string][]>(() =>
    parsePairs(value),
  );
  const update = (next: [string, string][]) => {
    setRows(next);
    onChange(
      next
        .filter(([key]) => key.trim() !== '')
        .map(([key, item]) => `${key.trim()}=${item}`)
        .join('\n'),
    );
  };
  return (
    <Box>
      <FieldCaption widget={widget} />
      {rows.map(([key, item], index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField
            size="small"
            placeholder="KEY"
            value={key}
            onChange={(e) =>
              update(
                rows.map((row, i) =>
                  i === index ? [e.target.value, row[1]] : row,
                ),
              )
            }
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            placeholder="value"
            value={item}
            onChange={(e) =>
              update(
                rows.map((row, i) =>
                  i === index ? [row[0], e.target.value] : row,
                ),
              )
            }
            sx={{ flex: 2 }}
          />
          <IconButton
            size="small"
            onClick={() => update(rows.filter((_, i) => i !== index))}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => setRows([...rows, ['', '']])}
      >
        Add
      </Button>
      <Description widget={widget} />
    </Box>
  );
};

// A path inside the project is saved relative to it, with forward slashes
// (what a pipeline file uses on every OS); any other path stays absolute.
export const toProjectRelativePath = (
  picked: string,
  projectPath?: string,
): string => {
  const normalize = (value: string) =>
    value.replace(/\\/g, '/').replace(/\/+$/, '');
  const target = normalize(picked);
  if (!projectPath) return target;
  const root = normalize(projectPath);
  if (target === root) return '.';
  return target.startsWith(`${root}/`) ? target.slice(root.length + 1) : target;
};

const PathWidget: React.FC<StepWidgetProps> = ({
  widget,
  value,
  onChange,
  projectPath,
}) => {
  const isDirectory = widget.type === 'directory';
  const browse = async () => {
    const result = await window.electron.ipcRenderer.invoke(
      'dialog:showOpenDialog',
      {
        properties: [isDirectory ? 'openDirectory' : 'openFile'],
        title: widget.label,
        defaultPath: projectPath,
      },
    );
    if (result?.canceled || !result?.filePaths?.length) return;
    onChange(toProjectRelativePath(result.filePaths[0], projectPath));
  };
  return (
    <TextField
      label={widget.label}
      value={asText(value)}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
      size="small"
      required={widget.required}
      placeholder={widget.placeholder}
      helperText={widget.description}
      InputLabelProps={widget.placeholder ? { shrink: true } : undefined}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title={isDirectory ? 'Choose a folder' : 'Choose a file'}>
              <IconButton size="small" edge="end" onClick={browse}>
                {isDirectory ? (
                  <FolderOpenIcon fontSize="small" />
                ) : (
                  <InsertDriveFileOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  );
};

// A new widget type is one component and one line here. A type this version
// does not know is read as `input` when the manifest is parsed.
const WIDGETS: Record<PluginWidgetType, React.FC<StepWidgetProps>> = {
  input: TextWidget,
  textarea: MultilineWidget,
  code: MultilineWidget,
  number: NumberWidget,
  checkbox: CheckboxWidget,
  dropdown: DropdownWidget,
  radio: RadioWidget,
  multiselect: MultiselectWidget,
  list: ListWidget,
  key_value: KeyValueWidget,
  file: PathWidget,
  directory: PathWidget,
};

export const StepWidget: React.FC<StepWidgetProps> = (props) => {
  const { widget } = props;
  const Component = WIDGETS[widget.type] ?? TextWidget;
  // eslint-disable-next-line react/jsx-props-no-spreading
  return <Component {...props} />;
};
