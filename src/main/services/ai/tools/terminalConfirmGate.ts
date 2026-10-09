import { v4 as uuidv4 } from 'uuid';
import type { IpcMainInvokeEvent, WebContents } from 'electron';

interface PendingConfirm {
  resolve: (allow: boolean) => void;
  conversationId: number;
  allowScope?: string;
}

const grantKey = (conversationId: number, scope: string) =>
  `${conversationId}:${scope}`;

export class TerminalConfirmGate {
  // Map from requestId → { resolve, conversationId, allowScope }
  private static pending = new Map<string, PendingConfirm>();

  /**
   * "Allow for this chat" grants, keyed `${conversationId}:${allowScope}`.
   * In memory only: a new chat, or the same chat after a restart, asks again.
   */
  private static grants = new Set<string>();

  /**
   * Ask the user to allow a command. With `allowScope`, the banner also offers
   * "Allow for this chat"; once granted, later requests with the same scope in
   * the same conversation resolve `true` without a prompt.
   */
  static async request(opts: {
    event: IpcMainInvokeEvent | WebContents;
    conversationId: number;
    toolName: string;
    command: string;
    cwd: string;
    allowScope?: string;
  }): Promise<boolean> {
    if (
      opts.allowScope &&
      this.grants.has(grantKey(opts.conversationId, opts.allowScope))
    ) {
      return true;
    }
    const requestId = uuidv4();
    return new Promise((resolve) => {
      this.pending.set(requestId, {
        resolve,
        conversationId: opts.conversationId,
        allowScope: opts.allowScope,
      });
      const sender = 'sender' in opts.event ? opts.event.sender : opts.event;
      sender.send('agent:terminal-confirm', {
        conversationId: opts.conversationId,
        requestId,
        toolName: opts.toolName,
        command: opts.command,
        cwd: opts.cwd,
        ...(opts.allowScope ? { allowScope: opts.allowScope } : {}),
      });
    });
  }

  /**
   * Answer a pending request. `remember` records an "Allow for this chat"
   * grant, only for requests that offered a scope.
   */
  static resolve(requestId: string, allow: boolean, remember = false): void {
    const entry = this.pending.get(requestId);
    if (entry) {
      if (allow && remember && entry.allowScope) {
        this.grants.add(grantKey(entry.conversationId, entry.allowScope));
      }
      entry.resolve(allow);
      this.pending.delete(requestId);
    }
  }

  /** Drop the grants of one conversation, or all of them. */
  static clearGrants(conversationId?: number): void {
    if (conversationId === undefined) {
      this.grants.clear();
      return;
    }
    const prefix = `${conversationId}:`;
    Array.from(this.grants).forEach((key) => {
      if (key.startsWith(prefix)) this.grants.delete(key);
    });
  }

  /**
   * Abort only the pending confirmations for a specific conversation.
   * Use this when cancelling a single agent run — does not affect other conversations.
   */
  static abortForConversation(conversationId: number): void {
    Array.from(this.pending.entries()).forEach(([requestId, entry]) => {
      if (entry.conversationId === conversationId) {
        entry.resolve(false);
        this.pending.delete(requestId);
      }
    });
  }

  /**
   * Abort all pending confirmations across all conversations.
   * Use only on app shutdown.
   */
  static abortAll(): void {
    this.pending.forEach((entry) => entry.resolve(false));
    this.pending.clear();
    this.grants.clear();
  }
}
