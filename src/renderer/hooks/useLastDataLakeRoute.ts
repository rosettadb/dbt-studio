import React from 'react';
import { useLocation } from 'react-router-dom';

const STORAGE_KEY = 'dbt-studio:last-data-lake-route';
const DEFAULT_ROUTE = '/app/data-lake/dashboard';

const isRestorableRoute = (route: string) => {
  const pathname = route.split('?')[0];
  return (
    pathname.startsWith('/app/data-lake/') &&
    !pathname.includes('/new-instance') &&
    !pathname.endsWith('/edit')
  );
};

const readLastRoute = () => {
  try {
    const route = window.localStorage.getItem(STORAGE_KEY);
    return route && isRestorableRoute(route) ? route : DEFAULT_ROUTE;
  } catch {
    return DEFAULT_ROUTE;
  }
};

export const useLastDataLakeRoute = () => {
  const { pathname, search } = useLocation();
  const currentRoute = `${pathname}${search}`;
  const route = isRestorableRoute(currentRoute)
    ? currentRoute
    : readLastRoute();

  React.useEffect(() => {
    if (!isRestorableRoute(currentRoute)) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, currentRoute);
    } catch {
      // Fall back to the dashboard when persistent storage is unavailable.
    }
  }, [currentRoute]);

  return route;
};
