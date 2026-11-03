import { useTaskManager } from '../context';

// True while any task of one of these types is running or waiting in the
// task manager. Reads the main-process registry, so it stays correct after
// the component that started the task unmounts and mounts again.
export const useIsTaskTypeActive = (...types: string[]): boolean => {
  const { tasks } = useTaskManager();
  return tasks.some(
    (task) =>
      types.includes(task.type) &&
      (task.status === 'running' || task.status === 'pending'),
  );
};

export default useIsTaskTypeActive;
