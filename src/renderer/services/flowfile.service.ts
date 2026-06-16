import { client } from '../config/client';

export type FlowfileStatus = {
  processRunning: boolean;
  serviceUp: boolean;
  url: string;
  version: string | null;
};

export type FlowfileResult = {
  ok: boolean;
  error?: string;
};

export const flowfileGetStatus = async (): Promise<FlowfileStatus> => {
  const { data } = await client.get<FlowfileStatus>('flowfile:getStatus');
  return data;
};

export const flowfileInstall = async (): Promise<FlowfileResult> => {
  const { data } = await client.get<FlowfileResult>('flowfile:install');
  return data;
};

export const flowfileUninstall = async (): Promise<FlowfileResult> => {
  const { data } = await client.get<FlowfileResult>('flowfile:uninstall');
  return data;
};

export const flowfileStart = async (): Promise<FlowfileResult> => {
  const { data } = await client.get<FlowfileResult>('flowfile:start');
  return data;
};

export const flowfileStop = async (): Promise<FlowfileResult> => {
  const { data } = await client.get<FlowfileResult>('flowfile:stop');
  return data;
};
