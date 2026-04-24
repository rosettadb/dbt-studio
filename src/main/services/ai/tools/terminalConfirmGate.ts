import { v4 as uuidv4 } from 'uuid';
import type { IpcMainInvokeEvent, WebContents } from 'electron';

interface PendingConfirm {
  resolve: (allow: boolean) => void;
  conversationId: number;
}

export class TerminalConfirmGate {
  // Map from requestId → { resolve, conversationId }
  private static pending = new Map<string, PendingConfirm>();

  static async request(opts: {
    event: IpcMainInvokeEvent | WebContents;
    conversationId: number;
    toolName: string;
    command: string;
    cwd: string;
  }): Promise<boolean> {
    const requestId = uuidv4();
    return new Promise((resolve) => {
      this.pending.set(requestId, {
        resolve,
        conversationId: opts.conversationId,
      });
      const sender = 'sender' in opts.event ? opts.event.sender : opts.event;
      sender.send('agent:terminal-confirm', {
        conversationId: opts.conversationId,
        requestId,
        toolName: opts.toolName,
        command: opts.command,
        cwd: opts.cwd,
      });
    });
  }

  static resolve(requestId: string, allow: boolean): void {
    const entry = this.pending.get(requestId);
    if (entry) {
      entry.resolve(allow);
      this.pending.delete(requestId);
    }
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
  }
}
