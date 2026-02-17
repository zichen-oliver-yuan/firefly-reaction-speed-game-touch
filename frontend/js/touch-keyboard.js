/** Touch keyboard for name entry. */

class TouchKeyboard {
  constructor(inputElement) {
    this.input = inputElement;
    this.container = null;
    this.shift = false;
    this.capsLock = false;
  }

  /**
   * Initialize and render the keyboard.
   * @param {HTMLElement} container - Container element for keyboard
   */
  init(container) {
    this.container = container;
    this.render();
  }

  /**
   * Render the keyboard layout.
   */
  render() {
    if (!this.container) return;

    const layout = [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
      ['space']
    ];

    this.container.innerHTML = '';

    layout.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';

      row.forEach(key => {
        const keyEl = document.createElement('div');
        keyEl.className = 'keyboard-key';
        
        if (key === 'shift') {
          keyEl.textContent = '⇧';
          keyEl.classList.add('wide');
          keyEl.addEventListener('click', () => this.toggleShift());
        } else if (key === 'backspace') {
          keyEl.textContent = '⌫';
          keyEl.classList.add('wide');
          keyEl.addEventListener('click', () => this.handleBackspace());
        } else if (key === 'space') {
          keyEl.textContent = 'Space';
          keyEl.classList.add('space');
          keyEl.addEventListener('click', () => this.handleKey(' '));
        } else {
          keyEl.textContent = this.getKeyDisplay(key);
          keyEl.addEventListener('click', () => this.handleKey(key));
        }

        rowEl.appendChild(keyEl);
      });

      this.container.appendChild(rowEl);
    });
  }

  /**
   * Get display text for a key.
   * @param {string} key - Key character
   * @returns {string} Display text
   */
  getKeyDisplay(key) {
    if (this.shift || this.capsLock) {
      return key.toUpperCase();
    }
    return key.toLowerCase();
  }

  /**
   * Handle key press.
   * @param {string} key - Key character
   */
  handleKey(key) {
    if (!this.input) return;

    const char = (this.shift || this.capsLock) ? key.toUpperCase() : key.toLowerCase();
    
    // Insert character at cursor position
    const start = this.input.selectionStart || 0;
    const end = this.input.selectionEnd || 0;
    const value = this.input.value;
    
    this.input.value = value.substring(0, start) + char + value.substring(end);
    
    // Move cursor
    const newPos = start + 1;
    this.input.setSelectionRange(newPos, newPos);
    this.input.focus();

    // Turn off shift after key press (unless caps lock)
    if (this.shift && !this.capsLock) {
      this.shift = false;
      this.render();
    }
  }

  /**
   * Handle backspace.
   */
  handleBackspace() {
    if (!this.input) return;

    const start = this.input.selectionStart || 0;
    const end = this.input.selectionEnd || 0;
    const value = this.input.value;

    if (start === end && start > 0) {
      // Delete character before cursor
      this.input.value = value.substring(0, start - 1) + value.substring(start);
      this.input.setSelectionRange(start - 1, start - 1);
    } else if (start !== end) {
      // Delete selection
      this.input.value = value.substring(0, start) + value.substring(end);
      this.input.setSelectionRange(start, start);
    }

    this.input.focus();
  }

  /**
   * Toggle shift state.
   */
  toggleShift() {
    this.shift = !this.shift;
    this.render();
  }

  /**
   * Toggle caps lock.
   */
  toggleCapsLock() {
    this.capsLock = !this.capsLock;
    this.render();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TouchKeyboard;
}
