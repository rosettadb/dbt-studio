import { tool } from 'ai';
import { z } from 'zod';
import type {
  SecondBrainScope,
  SecondBrainSettings,
} from '../../../../../types/backend';
import SecondBrainService, {
  normalizeSecondBrainPageId,
} from '../../secondBrain/secondBrain.service';
import SecondBrainRuntimeService, {
  assertSecondBrainPageAuthorized,
  getSecondBrainInitialPageIds,
  getSecondBrainScopePrefixes,
  isSecondBrainPageAuthorized,
} from '../../secondBrain/secondBrainRuntime.service';
import { SecondBrainError } from '../../secondBrain/secondBrain.types';
import { containsLikelySecondBrainSecret } from '../../secondBrain/secondBrainSecrets';
import { SECOND_BRAIN_ENTRY_PAGE } from '../../secondBrain/secondBrainPolicy';

type SecondBrainToolOptions = {
  secondBrain: SecondBrainService;
  runtime: SecondBrainRuntimeService;
  scope: SecondBrainScope;
  settings: SecondBrainSettings;
  toolMode: 'chat' | 'agent';
};

const assertNoLikelySecret = (content: string): void => {
  if (containsLikelySecondBrainSecret(content)) {
    throw new SecondBrainError(
      'INVALID_CONTENT',
      'Potential credentials or secrets cannot be written to Wiki Memory.',
    );
  }
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const normalizeHeading = (heading: string): string =>
  heading.replace(/^#{1,6}\s*/u, '').trim();

const findSection = (
  content: string,
  headingInput: string,
): { headingStart: number; bodyStart: number; end: number } | null => {
  const heading = normalizeHeading(headingInput);
  const expression = new RegExp(
    `^(#{1,6})\\s+${escapeRegExp(heading)}\\s*$`,
    'imu',
  );
  const match = expression.exec(content);
  if (!match || match.index === undefined) return null;
  const level = match[1].length;
  const bodyStart = match.index + match[0].length;
  const remainder = content.slice(bodyStart);
  const nextHeading = new RegExp(`^#{1,${level}}\\s+.+$`, 'mu').exec(remainder);
  return {
    headingStart: match.index,
    bodyStart,
    end: nextHeading ? bodyStart + nextHeading.index : content.length,
  };
};

const provenanceComment = (sourceRefs: string[]): string =>
  `<!-- second-brain-sources: ${sourceRefs
    .map((sourceRef) =>
      sourceRef.replace(/-->/gu, '').replace(/\s+/gu, ' ').trim(),
    )
    .join(', ')} -->`;

const applySectionOperation = (
  currentContent: string,
  operation:
    | { type: 'append-section'; heading: string; content: string }
    | { type: 'replace-section'; heading: string; content: string },
  sourceRefs: string[],
): string => {
  const heading = normalizeHeading(operation.heading);
  if (!heading) {
    throw new SecondBrainError(
      'INVALID_CONTENT',
      'Section heading cannot be empty.',
    );
  }
  const section = findSection(currentContent, heading);
  const durableContent = `${operation.content.trim()}\n\n${provenanceComment(
    sourceRefs,
  )}`;

  if (operation.type === 'replace-section') {
    if (!section) {
      throw new SecondBrainError(
        'NOT_FOUND',
        'Cannot replace a section that does not exist.',
        { heading },
      );
    }
    return `${currentContent.slice(0, section.bodyStart)}\n\n${durableContent}\n${currentContent
      .slice(section.end)
      .replace(/^\n+/u, '')}`;
  }

  if (!section) {
    return `${currentContent.trimEnd()}\n\n## ${heading}\n\n${durableContent}\n`;
  }
  return `${currentContent.slice(0, section.end).trimEnd()}\n\n${durableContent}\n\n${currentContent
    .slice(section.end)
    .replace(/^\n+/u, '')}`;
};

const wikiLinks = (content: string): string[] =>
  [...content.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/gu)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .slice(0, 100);

const normalizeWikiPageReference = (reference: string): string => {
  let pageId = reference.trim();
  if (pageId === 'MEMORY') pageId = SECOND_BRAIN_ENTRY_PAGE;
  if (!pageId.toLowerCase().endsWith('.md')) pageId = `${pageId}.md`;
  return normalizeSecondBrainPageId(pageId);
};

const compactError = (error: unknown) => {
  if (error instanceof SecondBrainError) {
    return {
      ok: false as const,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }
  return {
    ok: false as const,
    error: {
      code: 'UNKNOWN',
      message:
        error instanceof Error ? error.message : 'Wiki Memory tool failed.',
    },
  };
};

const operationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create'),
    content: z
      .string()
      .min(1)
      .max(64 * 1024)
      .describe(
        'Complete OKF concept Markdown with YAML frontmatter containing a non-empty type; never use index.md or log.md',
      ),
    searchQuery: z
      .string()
      .min(2)
      .max(500)
      .describe('Query used to check for an existing canonical page first'),
  }),
  z.object({
    type: z.literal('append-section'),
    heading: z.string().min(1).max(200),
    content: z
      .string()
      .min(1)
      .max(32 * 1024),
  }),
  z.object({
    type: z.literal('replace-section'),
    heading: z.string().min(1).max(200),
    content: z
      .string()
      .min(1)
      .max(32 * 1024),
  }),
]);

export const createSecondBrainTools = (
  options: SecondBrainToolOptions,
): Record<string, any> => {
  const { secondBrain, runtime, scope, settings, toolMode } = options;
  const readTools: Record<string, any> = {
    wiki_search: tool({
      description:
        'Search authorized Wiki Memory Markdown pages for durable prior knowledge. Scope is supplied by DBT Studio and cannot be overridden.',
      inputSchema: z.object({
        query: z.string().min(2).max(500),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit }) => {
        try {
          const result = await runtime.search(query, scope, {
            limit,
            includeGlobalPages: settings.includeGlobalPages,
          });
          return { ok: true, ...result };
        } catch (error) {
          return compactError(error);
        }
      },
    }),
    wiki_read: tool({
      description: `Read one authorized Wiki Memory Markdown page by page ID. The global entry page is ${SECOND_BRAIN_ENTRY_PAGE}. Read before relying on or changing durable knowledge.`,
      inputSchema: z.object({ pageId: z.string().min(3).max(500) }),
      execute: async ({ pageId: pageReference }) => {
        try {
          const pageId = normalizeWikiPageReference(pageReference);
          assertSecondBrainPageAuthorized(
            pageId,
            scope,
            settings.includeGlobalPages,
          );
          const page = await secondBrain.readPage(pageId);
          return {
            ok: true,
            pageId: page.pageId,
            title: page.title,
            frontmatter: page.frontmatter,
            body: page.body,
            links: wikiLinks(page.content),
            hash: page.hash,
            modifiedAt: page.modifiedAt,
          };
        } catch (error) {
          return compactError(error);
        }
      },
    }),
    wiki_status: tool({
      description:
        'Return Wiki Memory readiness, existing scoped pages, and separate suggested creation targets. A suggestedCreatePageId is authorized but does not exist yet. Call this before inventing a scoped page ID.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const status = await secondBrain.getStatus();
          const pageIds = await secondBrain.listPageIds();
          const authorizedPageCount = pageIds.filter((pageId) =>
            isSecondBrainPageAuthorized(
              pageId,
              scope,
              settings.includeGlobalPages,
            ),
          ).length;
          const scopedPrefixes = getSecondBrainScopePrefixes(scope);
          const scopedPageIds = pageIds.filter((pageId) =>
            scopedPrefixes.some((prefix) =>
              prefix.endsWith('.md')
                ? pageId === prefix
                : pageId.startsWith(prefix),
            ),
          );
          const candidatePageIds = getSecondBrainInitialPageIds(scope).filter(
            (pageId) => pageId !== SECOND_BRAIN_ENTRY_PAGE,
          );
          return {
            ok: true,
            enabled: settings.enabled,
            initialized: status.initialized,
            authorizedPageCount,
            existingScopedPageIds: scopedPageIds,
            suggestedCreatePageIds: candidatePageIds.filter(
              (pageId) => !pageIds.includes(pageId),
            ),
            writablePagePrefixes: scopedPrefixes.filter(
              (prefix) => !prefix.endsWith('.md'),
            ),
            rootDisplayName: 'Wiki Memory',
            lastSuccessfulRefreshAt: status.lastSuccessfulRefreshAt,
          };
        } catch (error) {
          return compactError(error);
        }
      },
    }),
  };

  if (toolMode === 'chat' || !settings.inlineSelfLearning) return readTools;

  return {
    ...readTools,
    wiki_update: tool({
      description:
        'Create or update one authorized Wiki Memory Markdown page using a conflict-safe structured operation. Search and read before writing. Use the exact scoped page ID or writable prefix from the system context or wiki_status; never invent projects/<name>.',
      inputSchema: z.object({
        pageId: z.string().min(3).max(500),
        expectedHash: z.string().length(64).optional(),
        rationale: z.string().min(5).max(500),
        sourceRefs: z.array(z.string().min(1).max(300)).min(1).max(10),
        operation: operationSchema,
      }),
      execute: async ({
        pageId: pageReference,
        expectedHash,
        rationale,
        sourceRefs,
        operation,
      }) => {
        try {
          const pageId = normalizeWikiPageReference(pageReference);
          assertSecondBrainPageAuthorized(
            pageId,
            scope,
            settings.includeGlobalPages,
          );
          let content: string;
          if (operation.type === 'create') {
            if (expectedHash) {
              throw new SecondBrainError(
                'CONFLICT',
                'Create operations cannot provide an existing page hash.',
              );
            }
            const duplicates = await runtime.search(
              operation.searchQuery,
              scope,
              {
                limit: 5,
                includeGlobalPages: settings.includeGlobalPages,
              },
            );
            const exactDuplicate = duplicates.results.find(
              (result) =>
                result.scoreReason === 'exact-title' ||
                result.pageId === pageId,
            );
            if (exactDuplicate) {
              return {
                ok: false,
                error: {
                  code: 'POTENTIAL_DUPLICATE',
                  message: 'Update the existing canonical page instead.',
                },
                candidates: duplicates.results.map((result) => ({
                  pageId: result.pageId,
                  title: result.title,
                  hash: result.hash,
                })),
              };
            }
            content = `${operation.content.trimEnd()}\n\n${provenanceComment(
              sourceRefs,
            )}\n`;
          } else {
            if (!expectedHash) {
              throw new SecondBrainError(
                'CONFLICT',
                'Existing page updates require the hash returned by wiki_read.',
              );
            }
            const current = await secondBrain.readPage(pageId);
            content = applySectionOperation(
              current.content,
              operation,
              sourceRefs,
            );
          }
          assertNoLikelySecret(content);
          const page = await secondBrain.writePage({
            pageId,
            content,
            expectedHash,
            actor: 'agent',
          });
          return {
            ok: true,
            pageId: page.pageId,
            title: page.title,
            hash: page.hash,
            modifiedAt: page.modifiedAt,
            operation: operation.type,
            rationale,
          };
        } catch (error) {
          return compactError(error);
        }
      },
    }),
    wiki_archive: tool({
      description:
        'Archive one authorized Wiki Memory page after checking conflicts and inbound wiki links. Never deletes content permanently.',
      inputSchema: z.object({
        pageId: z.string().min(3).max(500),
        expectedHash: z.string().length(64),
        rationale: z.string().min(5).max(500),
      }),
      execute: async ({ pageId: pageReference, expectedHash, rationale }) => {
        try {
          const pageId = normalizeWikiPageReference(pageReference);
          assertSecondBrainPageAuthorized(
            pageId,
            scope,
            settings.includeGlobalPages,
          );
          if (
            [
              SECOND_BRAIN_ENTRY_PAGE,
              'preferences.md',
              'workflows.md',
            ].includes(pageId)
          ) {
            throw new SecondBrainError(
              'INVALID_CONTENT',
              'Canonical Wiki Memory pages cannot be archived by the agent.',
              { pageId },
            );
          }
          const inboundLinks = await runtime.findInboundLinks(
            pageId,
            scope,
            settings.includeGlobalPages,
          );
          if (inboundLinks.length > 0) {
            return {
              ok: false,
              error: {
                code: 'INBOUND_LINKS',
                message: 'Update inbound links before archiving this page.',
              },
              inboundLinks,
            };
          }
          await secondBrain.archivePage({
            pageId,
            expectedHash,
            actor: 'agent',
          });
          return { ok: true, pageId, archived: true, rationale };
        } catch (error) {
          return compactError(error);
        }
      },
    }),
  };
};
