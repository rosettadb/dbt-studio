/**
 * Chat utility functions for session management and content processing
 */

/**
 * Generates a descriptive title from user message content
 * @param content - The user message content
 * @returns A shortened, descriptive title (max 50 characters)
 */
export const generateSessionTitle = (content: string): string => {
  // Clean and normalize the content
  const cleaned = content
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s.,!?-]/g, '') // Remove special characters except basic punctuation
    .trim();

  if (!cleaned) {
    return 'New Chat';
  }

  // If content is short enough, use it directly
  if (cleaned.length <= 50) {
    return cleaned;
  }

  // Try to break at a sentence boundary
  const sentences = cleaned.split(/[.!?]+/);
  if (sentences.length > 1 && sentences[0].length <= 50) {
    return sentences[0].trim();
  }

  // Try to break at a word boundary
  const words = cleaned.split(' ');
  let title = '';

  words.reduce((accumulator, word) => {
    const newTitle = accumulator ? `${accumulator} ${word}` : word;
    if (newTitle.length > 47) {
      // Leave room for "..." - stop processing more words
      return accumulator;
    }
    title = newTitle;
    return newTitle;
  }, '');

  // Add ellipsis if we truncated
  if (title.length < cleaned.length) {
    title = `${title}...`;
  }

  return title || 'New Chat';
};

/**
 * Checks if a session needs automatic renaming
 * @param sessionTitle - Current session title
 * @returns True if the session should be auto-renamed
 */
export const shouldAutoRenameSession = (sessionTitle: string): boolean => {
  if (!sessionTitle) return true;

  // Auto-rename if title is generic
  const genericTitles = [
    'New Chat',
    /^Chat \d+$/, // "Chat 1", "Chat 2", etc.
    /^Untitled/i,
    /^Conversation/i,
  ];

  return genericTitles.some((pattern) =>
    typeof pattern === 'string'
      ? sessionTitle === pattern
      : pattern.test(sessionTitle),
  );
};

/**
 * Truncates text to a specified length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length (default: 50)
 * @returns Truncated text with ellipsis if needed
 */
export const truncateText = (text: string, maxLength: number = 50): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength - 3)}...`;
};

/**
 * Extracts plain text from HTML content
 * @param html - HTML content
 * @returns Plain text string
 */
export const htmlToPlainText = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  const text = div.textContent || div.innerText || '';
  return text.replace(/\u00A0/g, ' ').replace(/\s+$/g, '');
};
