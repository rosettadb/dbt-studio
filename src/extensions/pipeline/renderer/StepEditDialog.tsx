import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
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
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { PipelineNodeData } from './PipelineNode';
import { getPluginVisual, usePluginCatalog } from './pluginDefinitions';
import { StepWidget } from './StepWidgets';
import {
  defaultStepParams,
  isEmptyParam,
  isWidgetVisible,
  validateStepParams,
  type MacroContext,
  type PluginWidget,
  type StepParams,
} from '../../../extensionApi/studio/pipelineShared';

interface StepEditDialogProps {
  open: boolean;
  data: PipelineNodeData | null;
  existingJobNames: string[];
  onClose: () => void;
  onSave: (data: Partial<PipelineNodeData>) => void;
  /** Values for the macros in widget defaults (see defaultStepParams). */
  macros?: MacroContext;
  projectPath?: string;
}

export const StepEditDialog: React.FC<StepEditDialogProps> = ({
  open,
  data,
  existingJobNames,
  onClose,
  onSave,
  macros,
  projectPath,
}) => {
  const catalog = usePluginCatalog();
  const [name, setName] = React.useState('');
  const [plugin, setPlugin] = React.useState('');
  const [jobName, setJobName] = React.useState('run');
  const [jobType, setJobType] = React.useState('');
  // The step's parameters as the pipeline file holds them. A value is only
  // rewritten when its field is edited, so parameters the form does not show
  // (or shows differently) are saved back untouched.
  const [params, setParams] = React.useState<StepParams>({});
  // Changes each time a step is loaded, so fields never keep another
  // step's typing state.
  const [formKey, setFormKey] = React.useState(0);

  React.useEffect(() => {
    if (!open || !data) return;
    setName(data.name ?? '');
    setPlugin(data.plugin ?? '');
    setJobName(data.jobName ?? 'run');
    setJobType(data.jobType ?? '');
    setParams({ ...(data.params ?? {}) });
    setFormKey((key) => key + 1);
  }, [open, data]);

  const pluginDef = catalog.byId.get(plugin);

  // Another plugin has other parameters: start from its defaults.
  const handlePluginChange = (newPlugin: string) => {
    setPlugin(newPlugin);
    const def = catalog.byId.get(newPlugin);
    setParams(def ? defaultStepParams(def, macros) : {});
  };

  const handleApply = () => {
    const saved: StepParams = { ...params };
    // A field hidden by its visible_when condition does not apply.
    pluginDef?.widgets.forEach((widget) => {
      if (!isWidgetVisible(widget, params)) delete saved[widget.key];
    });
    onSave({
      name,
      plugin,
      jobName: jobName || 'run',
      jobType: jobType || undefined,
      params: saved,
    });
    onClose();
  };

  // Plugins offered for a step: the addable ones, plus this step's own
  // plugin when it is not among them (kept for existing steps, or unknown).
  const selectable = catalog.plugins.filter(
    (p) => p.addable || p.id === plugin,
  );
  const pluginIsListed = selectable.some((p) => p.id === plugin);

  const visibleWidgets = (pluginDef?.widgets ?? []).filter((widget) =>
    isWidgetVisible(widget, params),
  );
  const ungrouped = visibleWidgets.filter((widget) => !widget.group);
  const groups = Array.from(
    new Set(visibleWidgets.map((widget) => widget.group).filter(Boolean)),
  ) as string[];
  const issues = pluginDef ? validateStepParams(pluginDef, params) : [];
  const ruleIssues = issues.filter((issue) => !issue.key);

  const renderWidget = (widget: PluginWidget) => (
    <StepWidget
      key={`${formKey}:${plugin}:${widget.key}`}
      widget={widget}
      value={params[widget.key]}
      projectPath={projectPath}
      onChange={(value) =>
        setParams((current) => ({ ...current, [widget.key]: value }))
      }
    />
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { maxHeight: '85vh' } }}
    >
      <DialogTitle sx={{ pb: 1, fontSize: '1rem' }}>Edit Step</DialogTitle>
      <DialogContent sx={{ overflowY: 'auto' }}>
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
              {!pluginIsListed && plugin && (
                <MenuItem value={plugin}>
                  <span style={{ fontWeight: 700, marginRight: 8 }}>
                    {getPluginVisual(undefined, plugin).label}
                  </span>
                  <span style={{ color: '#888', fontSize: '0.75rem' }}>
                    {plugin}
                  </span>
                </MenuItem>
              )}
              {selectable.map((p) => (
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

          {plugin && !pluginDef && !catalog.isLoading && (
            <Alert severity="info" sx={{ py: 0 }}>
              The local runner does not list this plugin, so its parameters
              cannot be edited here. They are kept as they are; use the YAML
              view to change them.
            </Alert>
          )}

          {ungrouped.map(renderWidget)}

          {groups.map((group) => {
            const widgets = visibleWidgets.filter(
              (widget) => widget.group === group,
            );
            return (
              <Accordion
                key={`${plugin}:${group}`}
                disableGutters
                variant="outlined"
                defaultExpanded={widgets.some(
                  (widget) => !isEmptyParam(params[widget.key]),
                )}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">{group}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>{widgets.map(renderWidget)}</Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}

          {ruleIssues.map((issue) => (
            <Typography key={issue.message} variant="caption" color="error">
              {issue.message}
            </Typography>
          ))}

          <Divider sx={{ my: 0.5 }} />

          <Stack direction="row" spacing={1.5}>
            <Autocomplete
              freeSolo
              options={existingJobNames}
              value={jobName}
              onInputChange={(_, val) => setJobName(val)}
              renderInput={(inputParams) => (
                <TextField
                  {...inputParams} // eslint-disable-line react/jsx-props-no-spreading
                  label="Job Name"
                  size="small"
                  fullWidth
                />
              )}
              sx={{ flex: 1 }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel shrink>Job Type</InputLabel>
              <Select
                value={jobType}
                label="Job Type"
                displayEmpty
                notched
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
