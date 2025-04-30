import React from 'react';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { RosettaConnection } from '../../../../types/backend';
import { useCli } from '../../../hooks';
import { useGetSettings } from '../../../controllers';

type Props = {
  commandToRun: string;
  isOpen: boolean;
  onClose: () => void;
  connection: RosettaConnection;
  projectPath: string;
  successCallback: () => void;
};

export const ExtractModal: React.FC<Props> = ({
  commandToRun,
  isOpen,
  onClose,
  connection,
  projectPath,
  successCallback,
}) => {
  const { data: settings } = useGetSettings();
  const { error, isRunning, runCommand, isSuccess } = useCli();

  React.useEffect(() => {
    if (error.length > 0) {
      toast.error('Command failed');
      return;
    }
    if (isSuccess) {
      toast.success('Command completed successfully');
      successCallback();
    }
  }, [isSuccess, error]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${commandToRun} Modal`}>
      <button
        type="button"
        disabled={!connection || isRunning}
        onClick={async () => {
          await runCommand(
            `cd "${projectPath}/rosetta" && "${settings?.rosettaPath}" ${commandToRun} -s ${connection.name}`,
          );
        }}
      >
        Extract
      </button>
    </Modal>
  );
};
