import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material';
import { Add, Close } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { DuckLakeConnectionWizard } from './DuckLakeConnectionWizard';
import { useCreateDuckLakeInstance } from '../../controllers/duckLake.controller';

interface DuckLakeInstanceManagerProps {
  onInstanceCreated?: (instanceId: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  showButton?: boolean;
}

export const DuckLakeInstanceManager: React.FC<
  DuckLakeInstanceManagerProps
> = ({
  onInstanceCreated,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  showButton = true,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const createInstanceMutation = useCreateDuckLakeInstance();
  const navigate = useNavigate();

  // Use external control if provided, otherwise use internal state
  const isWizardOpen =
    externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsWizardOpen = externalOnClose
    ? (open: boolean) => {
        if (!open) externalOnClose();
      }
    : setInternalIsOpen;

  const handleCreateInstance = async (wizardData: any) => {
    try {
      // Transform wizard data to match backend API
      const createRequest = {
        name: wizardData.basics.name,
        dataPath: wizardData.basics.dataPath,
        description: wizardData.basics.description,
        catalog: wizardData.catalog,
        storage: wizardData.storage,
        runtimeOptions: wizardData.runtime,
      };

      const newInstance =
        await createInstanceMutation.mutateAsync(createRequest);

      setIsWizardOpen(false);

      if (onInstanceCreated) {
        onInstanceCreated(newInstance.id);
      } else {
        // Navigate to the new instance
        navigate(`/app/duck-lake/instances/${newInstance.id}`);
      }
    } catch {
      // Error handling is done by the mutation hook via toast
    }
  };

  const handleCancel = () => {
    setIsWizardOpen(false);
  };

  return (
    <>
      {showButton && (
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setIsWizardOpen(true)}
        >
          New Instance
        </Button>
      )}

      <Dialog
        open={isWizardOpen}
        onClose={handleCancel}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: { minHeight: '600px' },
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          Create New DuckLake Instance
          <IconButton
            aria-label="close"
            onClick={handleCancel}
            disabled={createInstanceMutation.isLoading}
            size="small"
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <DuckLakeConnectionWizard
            onComplete={handleCreateInstance}
            onCancel={handleCancel}
            isLoading={createInstanceMutation.isLoading}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
