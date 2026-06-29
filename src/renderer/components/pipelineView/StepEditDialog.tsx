import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Divider,
  Autocomplete,
} from '@mui/material';
import type { PipelineNodeData } from './PipelineNode';
import { PLUGIN_DEFS, PLUGIN_MAP } from './pluginDefinitions';

interface StepEditDialogProps {
  open: boolean;
  data: PipelineNodeData | null;
  existingJobNames: string[];
  onClose: () => void;
  onSave: (data: Partial<PipelineNodeData>) => void;
}

export const StepEditDialog: React.FC<StepEditDialogProps> = ({
  open,
  data,
  existingJobNames,
  onClose,
  onSave,
}) => {
  const [name, setName] = React.useState('');
  const [plugin, setPlugin] = React.useState('dbt@v1');
  const [jobName, setJobName] = React.useState('run');
  const [jobType, setJobType] = React.useState('');
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>(
    {},
  );

  React.useEffect(() => {
    if (!open || !data) return;
    setName(data.name ?? '');
    setPlugin(data.plugin ?? 'dbt@v1');
    setJobName(data.jobName ?? 'run');
    setJobType(data.jobType ?? '');
    const def = PLUGIN_MAP.get(data.plugin);
    const vals: Record<string, string> = {};
    const dataAny = data as unknown as Record<string, unknown>;
    def?.fields.forEach((f) => {
      vals[f.key] = String(dataAny[f.key] ?? '');
    });
    setFieldValues(vals);
  }, [open, data]);

  const handlePluginChange = (newPlugin: string) => {
    setPlugin(newPlugin);
    const def = PLUGIN_MAP.get(newPlugin);
    const vals: Record<string, string> = {};
    def?.fields.forEach((f) => {
      vals[f.key] = f.defaultValue ?? '';
    });
    setFieldValues(vals);
  };

  const pluginDef = PLUGIN_MAP.get(plugin);

  const handleApply = () => {
    onSave({
      name,
      plugin,
      jobName: jobName || 'run',
      jobType: jobType || undefined,
      ...(fieldValues as Partial<PipelineNodeData>),
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1, fontSize: '1rem' }}>Edit Step</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Step Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            required
            autoFocus
          />

          <FormControl fullWidth size="small">
            <InputLabel>Plugin</InputLabel>
            <Select
              value={plugin}
              label="Plugin"
              onChange={(e) => handlePluginChange(e.target.value)}
            >
              {PLUGIN_DEFS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  <span
                    style={{ color: p.color, fontWeight: 700, marginRight: 8 }}
                  >
                    {p.label}
                  </span>
                  <span style={{ color: '#888', fontSize: '0.75rem' }}>
                    {p.id}
                  </span>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {pluginDef?.fields.map((field) => (
            <TextField
              key={field.key}
              label={field.label}
              value={fieldValues[field.key] ?? ''}
              onChange={(e) =>
                setFieldValues((v) => ({ ...v, [field.key]: e.target.value }))
              }
              fullWidth
              size="small"
              multiline={field.multiline}
              minRows={field.multiline ? 2 : 1}
              required={field.required}
              placeholder={field.placeholder}
              InputLabelProps={field.placeholder ? { shrink: true } : undefined}
            />
          ))}

          <Divider sx={{ my: 0.5 }} />

          <Stack direction="row" spacing={1.5}>
            <Autocomplete
              freeSolo
              options={existingJobNames}
              value={jobName}
              onInputChange={(_, val) => setJobName(val)}
              renderInput={(params) => (
                <TextField
                  {...params} // eslint-disable-line react/jsx-props-no-spreading
                  label="Job Name"
                  size="small"
                  fullWidth
                />
              )}
              sx={{ flex: 1 }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Job Type</InputLabel>
              <Select
                value={jobType}
                label="Job Type"
                onChange={(e) => setJobType(e.target.value)}
              >
                <MenuItem value="">generic</MenuItem>
                <MenuItem value="cleanup">cleanup</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleApply}
          size="small"
          disabled={!name.trim()}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};
