import { useContext } from 'react';
import { ProcessContextType, ProcessContext } from '../context';

const useProcess = (): ProcessContextType => {
  const context = useContext(ProcessContext);
  if (!context) {
    throw new Error('useProcess must be used within a ProcessProvider');
  }
  return context;
};

export default useProcess;
