import React from 'react';

export type AppLayoutSlots = {
  sidebarContent?: React.ReactNode;
  panelHeaderLeft?: React.ReactNode;
  panelTitle?: string;
  topMenuActions?: React.ReactNode;
};

type ContextValue = {
  setSlots: (slots: AppLayoutSlots) => void;
};

export const AppLayoutContext = React.createContext<ContextValue | null>(null);

export const useAppLayoutContext = () => React.useContext(AppLayoutContext);
