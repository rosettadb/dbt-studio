import { ipcMain } from 'electron';
import LineageService from '../services/lineage.service';
import type {
  ColumnLineageRequest,
  LineageCurrentModelRequest,
  LineageFullGraphRequest,
  LineageTraversalRequest,
} from '../../types/lineage';

const handlerChannels = [
  'lineage:getUpstream',
  'lineage:getDownstream',
  'lineage:getFullLineage',
  'lineage:getModelMetadata',
  'lineage:getCurrentModelId',
  'lineage:getColumnLineage',
] as const;

const removeLineageHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerLineageHandlers = () => {
  removeLineageHandlers();

  ipcMain.handle(
    'lineage:getUpstream',
    async (_event, request: LineageTraversalRequest) => {
      return LineageService.getUpstreamModels(request);
    },
  );

  ipcMain.handle(
    'lineage:getDownstream',
    async (_event, request: LineageTraversalRequest) => {
      return LineageService.getDownstreamModels(request);
    },
  );

  ipcMain.handle(
    'lineage:getFullLineage',
    async (_event, request: LineageFullGraphRequest) => {
      return LineageService.getFullLineage(request);
    },
  );

  ipcMain.handle(
    'lineage:getModelMetadata',
    async (_event, request: LineageTraversalRequest) => {
      return LineageService.getModelMetadata(request);
    },
  );

  ipcMain.handle(
    'lineage:getCurrentModelId',
    async (_event, request: LineageCurrentModelRequest) => {
      return LineageService.getCurrentModelId(request);
    },
  );

  ipcMain.handle(
    'lineage:getColumnLineage',
    async (_event, request: ColumnLineageRequest) => {
      return LineageService.getColumnLineage(request);
    },
  );
};

export default registerLineageHandlers;
