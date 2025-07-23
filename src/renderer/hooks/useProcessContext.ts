import { useContext } from 'react';
import { ProcessContext, ProcessContextValue } from '../context';

const useProcess = (): ProcessContextValue => {
  const context = useContext(ProcessContext);
  if (!context) {
    throw new Error('useProcess must be used within a ProcessProvider');
  }
  return context;
};

export default useProcess;
