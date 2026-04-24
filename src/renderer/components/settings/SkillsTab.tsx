import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Paper,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
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
import {
  useGetSkills,
  useGetSkillsDir,
  useDeleteSkill,
  useCreateSkill,
  useImportSkill,
} from '../../controllers/skills.controller';
import { utilsService } from '../../services';

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
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress size={32} />
        </Box>
      );
    }

    if (isError) {
      return (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load skills list.
        </Alert>
      );
    }

    if (skills && skills.length > 0) {
      return (
        <Paper variant="outlined">
          <List disablePadding>
            {skills.map((skill, index) => (
              <React.Fragment key={skill.name}>
                {index > 0 && <Divider component="li" />}
                <ListItem
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => setSkillToDelete(skill.path)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={skill.name}
                    secondary={skill.description}
                  />
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        </Paper>
      );
    }

    return (
      <Paper
        variant="outlined"
        sx={{ p: 4, textAlign: 'center', bgcolor: 'background.default' }}
      >
        <Typography variant="body1" color="text.secondary" gutterBottom>
          No skills found
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
          You can create a new skill or add them directly into your skills
          directory.
        </Typography>
        <Stack
          direction="row"
          spacing={2}
          justifyContent="center"
          sx={{ mt: 2 }}
        >
          <Button variant="outlined" onClick={() => setImportDialogOpen(true)}>
            Import from URL
          </Button>
          <Button variant="contained" onClick={() => setCreateDialogOpen(true)}>
            Create Your First Skill
          </Button>
        </Stack>
      </Paper>
    );
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h6">Skills Library</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage local skills that give the AI specialized workflows. Discover
            more skills at{' '}
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <Link
              component="button"
              variant="body2"
              onClick={() => handleOpenExternal('https://skills.sh/')}
              sx={{ verticalAlign: 'baseline' }}
            >
              skills.sh
            </Link>
            .
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={openSkillsDirectory}
            disabled={!skillsDir}
          >
            Open Directory
          </Button>
          <Button
            variant="outlined"
            startIcon={<CloudDownloadIcon />}
            onClick={() => setImportDialogOpen(true)}
          >
            Import
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Skill
          </Button>
        </Stack>
      </Box>

      {renderContent()}

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
    </Box>
  );
};
