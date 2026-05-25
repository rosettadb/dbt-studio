import { generateText } from 'ai';
import { getVercelModel } from '../agentAdapter';
import type { ChatMessage } from '../../../schemas/mainDatabase.schema';
import {
  CONSOLIDATION_PROMPT,
  parseExtraction,
  deduplicateAgainstMemory,
  writeToMemory,
} from './memoryConsolidationUtils';

export async function consolidateConversation(
  messages: ChatMessage[],
): Promise<void> {
  if (messages.length < 2) return;

  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const model = await getVercelModel();

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

  if (!hasAny) return;

  const deduped = await deduplicateAgainstMemory(extraction);
  const hasDeduped =
    deduped.rules.length > 0 ||
    deduped.preferences.length > 0 ||
    deduped.workflows.length > 0 ||
    deduped.concepts.length > 0;

  if (!hasDeduped) return;

  await writeToMemory(deduped);
}
