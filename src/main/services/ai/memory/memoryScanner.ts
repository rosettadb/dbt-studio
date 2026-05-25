/* eslint-disable no-await-in-loop, no-continue */
/* eslint-disable no-underscore-dangle */
import { generateText } from 'ai';
import { getVercelModel } from '../agentAdapter';
import MainDatabaseService from '../../mainDatabase.service';
import {
  refreshProjectContext,
  updateDbtProjectNodes,
} from './memoryBootstrap';
import {
  CONSOLIDATION_PROMPT,
  parseExtraction,
  deduplicateAgainstMemory,
  writeToMemory,
} from './memoryConsolidationUtils';
import { readScanState, writeScanState } from './memoryIndex';

export interface ScanProgress {
  phase: 'project' | 'history';
  current: number;
  total: number;
  status: string;
}

export interface ScanResult {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
  projectUpdated: boolean;
  conversationsScanned: number;
  itemsWritten: number;
}

class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled');
    this.name = 'ScanCancelledError';
  }
}

let _isCancelled = false;

export function cancelScan(): void {
  _isCancelled = true;
}

function checkCancelled(): void {
  if (_isCancelled) {
    _isCancelled = false;
    throw new ScanCancelledError();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function scanProjectContext(
  projectPath?: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<void> {
  checkCancelled();
  onProgress?.({
    phase: 'project',
    current: 0,
    total: 1,
    status:
      'Refreshing project data from dbt_project.yml, connectors, and file counts...',
  });
  await refreshProjectContext(projectPath);
  checkCancelled();
  onProgress?.({
    phase: 'project',
    current: 1,
    total: 1,
    status: 'Project data refreshed.',
  });

  if (projectPath) {
    checkCancelled();
    onProgress?.({
      phase: 'project',
      current: 0,
      total: 1,
      status: 'Updating DBT project node with model/macro/source counts...',
    });
    await updateDbtProjectNodes(projectPath);
    checkCancelled();
    onProgress?.({
      phase: 'project',
      current: 1,
      total: 1,
      status: 'DBT project nodes updated.',
    });
  }
}

export async function scanHistory(
  onProgress?: (progress: ScanProgress) => void,
): Promise<{ conversationsScanned: number; itemsWritten: number }> {
  checkCancelled();
  const scanState = await readScanState();
  const lastScan = scanState.lastHistoryScan
    ? new Date(scanState.lastHistoryScan)
    : null;

  const allConversations = await MainDatabaseService.getConversations();
  const conversations = lastScan
    ? allConversations.filter((c) => {
        if (!c.updatedAt) return false;
        return new Date(c.updatedAt) > lastScan;
      })
    : allConversations;

  let totalItemsWritten = 0;

  checkCancelled();
  onProgress?.({
    phase: 'history',
    current: 0,
    total: conversations.length,
    status: lastScan
      ? `Found ${conversations.length} conversation(s) updated since last scan. Scanning for new rules, preferences, workflows, and concepts...`
      : `Scanning all ${conversations.length} conversation(s) for the first time to extract rules, preferences, workflows, and concepts...`,
  });

  for (let i = 0; i < conversations.length; i += 1) {
    checkCancelled();
    const conv = conversations[i];
    onProgress?.({
      phase: 'history',
      current: i + 1,
      total: conversations.length,
      status: `Conversation ${i + 1}/${conversations.length}: loading messages...`,
    });

    const convWithMessages = await MainDatabaseService.getConversation(conv.id);
    if (!convWithMessages) continue;

    const relevant = convWithMessages.messages.filter(
      (m) => m.role === 'user' || m.role === 'assistant',
    );
    if (relevant.length < 2) continue;

    for (let start = 0; start < relevant.length; start += 6) {
      checkCancelled();
      const batch = relevant.slice(start, start + 6);
      const conversationText = batch
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      try {
        const model = await getVercelModel();
        checkCancelled();
        onProgress?.({
          phase: 'history',
          current: i + 1,
          total: conversations.length,
          status: `Conversation ${i + 1}/${conversations.length}: analyzing batch ${Math.floor(start / 6) + 1}...`,
        });

        const { text } = await generateText({
          model: model as any,
          prompt: `${CONSOLIDATION_PROMPT}\n\nCONVERSATION:\n${conversationText}\n\nOUTPUT:`,
        });

        const extraction = parseExtraction(text);
        const hasAny =
          extraction.rules.length > 0 ||
          extraction.preferences.length > 0 ||
          extraction.workflows.length > 0 ||
          extraction.concepts.length > 0;
        if (!hasAny) continue;

        const deduped = await deduplicateAgainstMemory(extraction);
        const hasDeduped =
          deduped.rules.length > 0 ||
          deduped.preferences.length > 0 ||
          deduped.workflows.length > 0 ||
          deduped.concepts.length > 0;
        if (!hasDeduped) continue;

        const count =
          deduped.rules.length +
          deduped.preferences.length +
          deduped.workflows.length +
          deduped.concepts.length;

        await writeToMemory(deduped);
        totalItemsWritten += count;

        onProgress?.({
          phase: 'history',
          current: i + 1,
          total: conversations.length,
          status: `Conversation ${i + 1}/${conversations.length}: found ${count} new item(s).`,
        });
      } catch {
        // log and continue — one batch failure shouldn't stop the scan
      }

      await delay(500);
    }
  }

  await writeScanState({ lastHistoryScan: new Date().toISOString() });

  return {
    conversationsScanned: conversations.length,
    itemsWritten: totalItemsWritten,
  };
}

export async function scanAll(
  projectPath?: string,
  onProgress?: (progress: ScanProgress) => void,
): Promise<ScanResult> {
  _isCancelled = false;

  try {
    await scanProjectContext(projectPath, onProgress);
    const { conversationsScanned, itemsWritten } =
      await scanHistory(onProgress);
    return {
      ok: true,
      projectUpdated: true,
      conversationsScanned,
      itemsWritten,
    };
  } catch (err) {
    if (err instanceof ScanCancelledError) {
      return {
        ok: false,
        cancelled: true,
        projectUpdated: false,
        conversationsScanned: 0,
        itemsWritten: 0,
      };
    }
    const error = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error,
      projectUpdated: false,
      conversationsScanned: 0,
      itemsWritten: 0,
    };
  }
}
