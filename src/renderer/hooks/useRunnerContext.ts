import { useContext } from 'react';
import { RunnerContext, RunnerContextValue } from '../context';

const useRunner = (): RunnerContextValue => {
  const context = useContext(RunnerContext);
  if (!context) {
    throw new Error('useRunner must be used within a RunnerProvider');
  }
  return context;
};

export default useRunner;
