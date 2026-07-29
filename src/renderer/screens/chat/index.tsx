import React from 'react';
import { ChatWindow, ChatWindowProps } from '../../components/chat/ChatWindow';

const ChatScreen: React.FC<ChatWindowProps> = ({
  screenKey,
  connectionId,
  notebookId,
  pageId,
  projectId,
  activePipelinePath,
  onClose,
}) => {
  return (
    <ChatWindow
      screenKey={screenKey}
      connectionId={connectionId}
      notebookId={notebookId}
      pageId={pageId}
      projectId={projectId}
      activePipelinePath={activePipelinePath}
      onClose={onClose}
    />
  );
};

export default ChatScreen;
