import React from 'react';

const useLocalStorage = <T>(name: string, defaultVal: string) => {
  const [value, setValue] = React.useState<T>(
    JSON.parse(localStorage.getItem(name) || defaultVal),
  );

  React.useEffect(() => {
    localStorage.setItem(name, JSON.stringify(value));
  }, [value]);

  return [value, setValue] as const;
};

export default useLocalStorage;
