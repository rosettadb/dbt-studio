import type { BaseAgentConfig } from './baseAgentConfig';
import type { EnrichedConnectionMeta } from './agentTypes';

/** What the agent of a screen gets for one run of the chat. */
export interface ScreenAgentContext {
  conversationId: number;
  /** `chat` is Ask (read-only) mode, `agent` is Code mode. */
  toolMode: 'chat' | 'agent';
  /** The connection the screen is working on. */
  connectionMeta: EnrichedConnectionMeta;
  connectionId?: string;
  /** The notebook that is open, on the Notebooks screen. */
  notebookId?: string;
  /** The Analytics page that is open, on the Analytics tab. */
  pageId?: string;
  /**
   * The project tools the user allows. The ones that write to the project
   * are already taken out: a screen agent only reads the linked project.
   */
  enabledTools: Record<string, any>;
  /** Names of the tools the user switched off in AI settings. */
  disabledTools: string[];
  /** The skills block for the system prompt. */
  skills: string;
}

/** Builds the agent of one screen for one run. */
export type ScreenAgentFactory = (
  base: BaseAgentConfig,
  context: ScreenAgentContext,
) => Promise<any> | any;

/** A tool call of a run, as the agent service collected it. */
export type ScreenAgentToolCall = { toolName: string; output: unknown };

export interface ScreenAgentOptions {
  /**
   * What to say when the model ends a run without writing anything: built
   * from the tool calls of the run (in the order they ran). Returning null
   * leaves Studio's general "could not generate a response" message.
   */
  emptyAnswerFallback?: (
    toolCalls: ReadonlyArray<ScreenAgentToolCall>,
  ) => string | null;
}

const factories = new Map<string, ScreenAgentFactory>();
const optionsByScreen = new Map<string, ScreenAgentOptions>();

/**
 * Adds the AI agent of a screen: the chat opened with this `screenKey` runs
 * it. Returns the function that takes it out again. One agent per screen
 * key; `project` is Studio's own.
 */
export function registerScreenAgent(
  screenKey: string,
  factory: ScreenAgentFactory,
  options: ScreenAgentOptions = {},
): () => void {
  if (screenKey === 'project' || factories.has(screenKey)) {
    throw new Error(`The "${screenKey}" screen already has an AI agent`);
  }
  factories.set(screenKey, factory);
  optionsByScreen.set(screenKey, options);
  return () => {
    if (factories.get(screenKey) !== factory) return;
    factories.delete(screenKey);
    optionsByScreen.delete(screenKey);
  };
}

export const getScreenAgent = (
  screenKey: string,
): ScreenAgentFactory | undefined => factories.get(screenKey);

export const getScreenAgentOptions = (
  screenKey: string,
): ScreenAgentOptions | undefined => optionsByScreen.get(screenKey);
