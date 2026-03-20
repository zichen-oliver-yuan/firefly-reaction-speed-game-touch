/** Touch keyboard for lead form entry. */

class TouchKeyboard {
  constructor(inputElement) {
    this.input = inputElement;
    this.container = null;
    this.shift = false;
    this.capsLock = false;
  }

  getSelectionRange() {
    if (!this.input) return { start: 0, end: 0 };
    const valueLength = (this.input.value || '').length;
    const rawStart = this.input.selectionStart;
    const rawEnd = this.input.selectionEnd;
    const hasStart = typeof rawStart === 'number' && !Number.isNaN(rawStart);
    const hasEnd = typeof rawEnd === 'number' && !Number.isNaN(rawEnd);
    const start = hasStart ? rawStart : valueLength;
    const end = hasEnd ? rawEnd : valueLength;
    return { start, end };
  }

  emitInputEvent() {
    if (!this.input) return;
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
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
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
      ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
      ['.', '-', '_', 'space']
    ];

    this.container.innerHTML = '';

    layout.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';

      row.forEach(key => {
        const keyEl = document.createElement('div');
        keyEl.className = 'keyboard-key';
        
        const addPressing = () => keyEl.classList.add('pressing');
        const removePressing = () => keyEl.classList.remove('pressing');
        keyEl.addEventListener('pointerup', removePressing);
        keyEl.addEventListener('pointerleave', removePressing);
        keyEl.addEventListener('pointercancel', removePressing);

        if (key === 'shift') {
          keyEl.textContent = '⇧';
          keyEl.classList.add('wide');
          keyEl.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            addPressing();
            this.toggleShift();
          });
        } else if (key === 'backspace') {
          keyEl.textContent = '⌫';
          keyEl.classList.add('wide');
          let bsTimer = null;
          let bsInterval = null;
          const stopRepeat = () => {
            clearTimeout(bsTimer);
            clearInterval(bsInterval);
            bsTimer = null;
            bsInterval = null;
          };
          keyEl.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            addPressing();
            this.handleBackspace();
            bsTimer = setTimeout(() => {
              bsInterval = setInterval(() => this.handleBackspace(), 60);
            }, 400);
          });
          keyEl.addEventListener('pointerup', stopRepeat);
          keyEl.addEventListener('pointerleave', stopRepeat);
          keyEl.addEventListener('pointercancel', stopRepeat);
        } else if (key === 'space') {
          keyEl.textContent = 'Space';
          keyEl.classList.add('space');
          keyEl.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            addPressing();
            this.handleKey(' ');
          });
        } else {
          keyEl.textContent = this.getKeyDisplay(key);
          keyEl.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            addPressing();
            this.handleKey(key);
          });
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
    const { start, end } = this.getSelectionRange();
    const value = this.input.value;
    
    this.input.value = value.substring(0, start) + char + value.substring(end);
    
    // Move cursor
    const newPos = start + 1;
    if (typeof this.input.setSelectionRange === 'function') {
      this.input.setSelectionRange(newPos, newPos);
    }
    this.emitInputEvent();
    this.input.focus({ preventScroll: true });

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

    const { start, end } = this.getSelectionRange();
    const value = this.input.value;

    if (start === end && start > 0) {
      // Delete character before cursor
      this.input.value = value.substring(0, start - 1) + value.substring(start);
      if (typeof this.input.setSelectionRange === 'function') {
        this.input.setSelectionRange(start - 1, start - 1);
      }
    } else if (start !== end) {
      // Delete selection
      this.input.value = value.substring(0, start) + value.substring(end);
      if (typeof this.input.setSelectionRange === 'function') {
        this.input.setSelectionRange(start, start);
      }
    }

    this.emitInputEvent();
    this.input.focus({ preventScroll: true });
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
