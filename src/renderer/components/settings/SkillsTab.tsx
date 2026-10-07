import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  TextField,
  Stack,
  Link,
  Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AddIcon from '@mui/icons-material/Add';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined';
import {
  useGetSkills,
  useGetSkillsDir,
  useDeleteSkill,
  useCreateSkill,
  useImportSkill,
} from '../../controllers/skills.controller';
import { utilsService } from '../../services';
import {
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
} from './SettingsLayout';

export const SkillsTab: React.FC = () => {
  const { data: skills, isLoading, isError } = useGetSkills();
  const { data: skillsDir } = useGetSkillsDir();
  const deleteSkillMutation = useDeleteSkill();
  const createSkillMutation = useCreateSkill();
  const importSkillMutation = useImportSkill();

  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);

  // Create Skill Dialog State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillInst, setNewSkillInst] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Import Skill Dialog State
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (skillToDelete) {
      await deleteSkillMutation.mutateAsync(skillToDelete);
      setSkillToDelete(null);
    }
  };

  const handleCreateSubmit = async () => {
    if (!newSkillName.trim() || !newSkillDesc.trim() || !newSkillInst.trim()) {
      setCreateError('All fields are required.');
      return;
    }

    setCreateError(null);
    try {
      await createSkillMutation.mutateAsync({
        name: newSkillName.trim(),
        description: newSkillDesc.trim(),
        instructions: newSkillInst.trim(),
      });
      setCreateDialogOpen(false);
      setNewSkillName('');
      setNewSkillDesc('');
      setNewSkillInst('');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create skill');
    }
  };

  const handleImportSubmit = async () => {
    if (!importUrl.trim()) {
      setImportError('A URL is required.');
      return;
    }

    setImportError(null);
    try {
      await importSkillMutation.mutateAsync(importUrl.trim());
      setImportDialogOpen(false);
      setImportUrl('');
    } catch (err: any) {
      setImportError(err.message || 'Failed to import skill');
    }
  };

  const openSkillsDirectory = () => {
    if (skillsDir) {
      utilsService.openPath(skillsDir);
    }
  };

  const handleOpenExternal = (url: string) => {
    window.electron.ipcRenderer.invoke('open:external', url);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <SettingsSectionBody>
          <Box display="flex" justifyContent="center">
            <CircularProgress size={24} />
          </Box>
        </SettingsSectionBody>
      );
    }

    if (isError) {
      return (
        <SettingsSectionBody>
          <Alert severity="error">Failed to load skills list.</Alert>
        </SettingsSectionBody>
      );
    }

    if (skills && skills.length > 0) {
      return skills.map((skill) => (
        <SettingsRow
          key={skill.name}
          label={skill.name}
          description={skill.description}
        >
          <IconButton
            size="small"
            aria-label="delete"
            onClick={() => setSkillToDelete(skill.path)}
            color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </SettingsRow>
      ));
    }

    return (
      <SettingsRow
        label="No skills found"
        description="You can create a new skill or add them directly into your skills directory."
      />
    );
  };

  return (
    <SettingsStack>
      <SettingsSection
        title="Skills Library"
        icon={<PsychologyOutlined />}
        description={
          <>
            Specialized AI workflows. Discover more at{' '}
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <Link
              component="button"
              variant="caption"
              onClick={() => handleOpenExternal('https://skills.sh/')}
              sx={{ verticalAlign: 'baseline' }}
            >
              skills.sh
            </Link>
          </>
        }
        action={
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FolderOpenIcon />}
              onClick={openSkillsDirectory}
              disabled={!skillsDir}
            >
              Open Directory
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CloudDownloadIcon />}
              onClick={() => setImportDialogOpen(true)}
            >
              Import
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
            >
              Create Skill
            </Button>
          </>
        }
      >
        {renderContent()}
      </SettingsSection>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!skillToDelete} onClose={() => setSkillToDelete(null)}>
        <DialogTitle>Delete Skill</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this skill? This will permanently
            delete the skill folder from your disk.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkillToDelete(null)}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteSkillMutation.isLoading}
          >
            {deleteSkillMutation.isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Skill Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <DialogTitle>Create New Skill</DialogTitle>
        <DialogContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <DialogContentText sx={{ mb: 2 }}>
            A skill needs a name, a description (which the agent uses to decide
            when to employ it), and instructional Markdown content.
          </DialogContentText>

          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          )}

          <Stack spacing={0} sx={{ flex: 1, minHeight: 0 }}>
            <TextField
              autoFocus
              label="Skill Name"
              placeholder="e.g. data-quality-expert"
              fullWidth
              variant="outlined"
              margin="dense"
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              disabled={createSkillMutation.isLoading}
            />
            <TextField
              label="Description (When to use)"
              placeholder="Provide clear instructions for when the AI should load this skill."
              fullWidth
              variant="outlined"
              margin="dense"
              value={newSkillDesc}
              onChange={(e) => setNewSkillDesc(e.target.value)}
              disabled={createSkillMutation.isLoading}
            />
            <TextField
              label="Markdown Instructions"
              placeholder="# Instructions\n\n1. Step one...\n2. Step two..."
              fullWidth
              multiline
              variant="outlined"
              margin="dense"
              value={newSkillInst}
              onChange={(e) => setNewSkillInst(e.target.value)}
              disabled={createSkillMutation.isLoading}
              InputProps={{
                style: {
                  fontFamily: 'monospace',
                  fontSize: '13px',
                },
              }}
              sx={{
                mt: 1,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                '& .MuiOutlinedInput-root': {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  bgcolor: 'action.hover',
                },
                '& .MuiInputBase-inputMultiline': {
                  flex: 1,
                  height: '100% !important',
                  overflow: 'auto !important',
                  resize: 'none', // Flexing handles it now
                },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>

          <Button
            onClick={handleCreateSubmit}
            variant="contained"
            disabled={createSkillMutation.isLoading}
          >
            {createSkillMutation.isLoading ? 'Saving...' : 'Save Skill'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Skill Dialog */}
      <Dialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Import Skill</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 3 }}>
            Import a raw SKILL.md file from a URL (e.g., from
            raw.githubusercontent.com or skills.sh).
          </DialogContentText>

          {importError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {importError}
            </Alert>
          )}

          <TextField
            autoFocus
            label="Raw File URL"
            placeholder="https://..."
            fullWidth
            variant="outlined"
            margin="normal"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            disabled={importSkillMutation.isLoading}
          />

          <Box sx={{ mt: 3 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              gutterBottom
              display="block"
            >
              Suggested Skills (Click to select):
            </Typography>
            <Stack spacing={1}>
              <Chip
                label="wshobson/dbt-transformation-patterns"
                onClick={() =>
                  setImportUrl(
                    'https://skills.sh/wshobson/agents/dbt-transformation-patterns',
                  )
                }
                variant="outlined"
                size="small"
                sx={{ justifyContent: 'flex-start', cursor: 'pointer' }}
              />
              <Chip
                label="duckdb/duckdb-docs"
                onClick={() =>
                  setImportUrl(
                    'https://skills.sh/duckdb/duckdb-skills/duckdb-docs',
                  )
                }
                variant="outlined"
                size="small"
                sx={{ justifyContent: 'flex-start', cursor: 'pointer' }}
              />
              <Chip
                label="motherduckdb/ducklake"
                onClick={() =>
                  setImportUrl(
                    'https://skills.sh/motherduckdb/agent-skills/ducklake',
                  )
                }
                variant="outlined"
                size="small"
                sx={{ justifyContent: 'flex-start', cursor: 'pointer' }}
              />
              <Chip
                label="awesome-copilot/sql-optimization"
                onClick={() =>
                  setImportUrl(
                    'https://skills.sh/github/awesome-copilot/sql-optimization',
                  )
                }
                variant="outlined"
                size="small"
                sx={{ justifyContent: 'flex-start', cursor: 'pointer' }}
              />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleImportSubmit}
            variant="contained"
            disabled={importSkillMutation.isLoading}
          >
            {importSkillMutation.isLoading ? 'Importing...' : 'Import Skill'}
          </Button>
        </DialogActions>
      </Dialog>
    </SettingsStack>
  );
};
