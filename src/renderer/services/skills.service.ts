import type { SkillMetadata } from '../../main/services/ai/skills/skillsDiscovery';

export const getSkills = async (): Promise<SkillMetadata[]> => {
  return window.electron.ipcRenderer.invoke('skills:list');
};

export const getSkillsDir = async (): Promise<string> => {
  return window.electron.ipcRenderer.invoke('skills:get-directory');
};

export const deleteSkill = async (folderPath: string): Promise<boolean> => {
  return window.electron.ipcRenderer.invoke('skills:delete', folderPath);
};

export interface CreateSkillPayload {
  name: string;
  description: string;
  instructions: string;
}

export const createSkill = async (
  payload: CreateSkillPayload,
): Promise<boolean> => {
  return window.electron.ipcRenderer.invoke('skills:create', payload);
};

export const importSkill = async (url: string): Promise<boolean> => {
  return window.electron.ipcRenderer.invoke('skills:import', url);
};
