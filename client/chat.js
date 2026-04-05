/**
 * Chat — Babel chat UI.
 * Players type messages that display as Library of Babel gibberish.
 */

import { MAX_CHAT_LENGTH } from '../shared/constants.js';

export class ChatUI {
  constructor(networkClient) {
    this.network = networkClient;
    this.visible = false;
    this.createDOM();
  }

  createDOM() {
    // Chat container
    this.container = document.createElement('div');
    this.container.id = 'chat-container';

    // Messages area
    this.messages = document.createElement('div');
    this.messages.id = 'chat-messages';
    this.container.appendChild(this.messages);

    // Input row
    this.inputRow = document.createElement('div');
    this.inputRow.id = 'chat-input-row';
    this.inputRow.style.display = 'none';

    this.input = document.createElement('input');
    this.input.id = 'chat-input';
    this.input.type = 'text';
    this.input.maxLength = MAX_CHAT_LENGTH;
    this.input.placeholder = 'speak into the void...';
    this.input.autocomplete = 'off';

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Don't trigger game controls
      if (e.key === 'Enter' && this.input.value.trim()) {
        this.network.sendChat(this.input.value.trim());
        this.input.value = '';
        this.hideInput();
        // Re-enter game
        document.body.requestPointerLock();
      } else if (e.key === 'Escape') {
        this.hideInput();
        document.body.requestPointerLock();
      }
    });

    this.inputRow.appendChild(this.input);
    this.container.appendChild(this.inputRow);

    document.body.appendChild(this.container);
  }

  showInput() {
    this.inputRow.style.display = 'flex';
    this.input.focus();
    this.visible = true;
  }

  hideInput() {
    this.inputRow.style.display = 'none';
    this.input.value = '';
    this.visible = false;
  }

  toggle() {
    if (this.visible) this.hideInput();
    else this.showInput();
  }

  /**
   * Display a babel chat bubble (from server broadcast).
   */
  addMessage(sessionId, babelText) {
    const msg = document.createElement('div');
    msg.className = 'chat-message';
    msg.textContent = babelText;
    this.messages.appendChild(msg);

    // Auto-scroll
    this.messages.scrollTop = this.messages.scrollHeight;

    // Fade out after 5 seconds
    setTimeout(() => {
      msg.classList.add('fading');
      setTimeout(() => msg.remove(), 1000);
    }, 5000);

    // Limit visible messages
    while (this.messages.children.length > 10) {
      this.messages.firstChild.remove();
    }
  }
}
