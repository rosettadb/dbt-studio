import React from 'react';
import {
  useUpdateChatSession,
  useGetChatSession,
} from '../controllers/chat.controller';
import {
  generateSessionTitle,
  shouldAutoRenameSession,
} from '../utils/chatHelpers';

/**
 * Hook for automatic session renaming after first LLM response
 * @param sessionId - The session ID to potentially rename
 * @returns Object with autoRename function and loading state
 */
export const useAutoRenameSession = (sessionId?: number) => {
  const { data: session } = useGetChatSession(sessionId);
  const { mutate: updateSession, isLoading } = useUpdateChatSession();

  const autoRename = React.useCallback(
    (userMessageContent: string) => {
      if (!sessionId || !session || !userMessageContent.trim()) {
        return;
      }

      // Only auto-rename if the session has a generic title
      if (!shouldAutoRenameSession(session.title)) {
        return;
      }

      // Generate a new title from the user's first message
      const newTitle = generateSessionTitle(userMessageContent);

      // Don't update if the new title is the same as current
      if (newTitle === session.title) {
        return;
      }

      // Update the session title
      updateSession({
        sessionId,
        updates: { title: newTitle },
      });
    },
    [sessionId, session, updateSession],
  );

  return {
    autoRename,
    isRenaming: isLoading,
  };
};
