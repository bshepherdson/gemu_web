import { R, DCPU } from './emulator';
import { Device } from './device';

enum KeyboardMode { COOKED, RAW }

export class Keyboard implements Device {
  id: number = 0x30d17406;
  manufacturer: number = 0x1c6c8b36;
  version: number = 1;

  intMessage: number = 0;
  mode: KeyboardMode = KeyboardMode.COOKED;
  queue: number[] = [];
  keysDown: { [ key: string ]: boolean } = {};

  public interrupt(c: DCPU): void {
    switch (c.regs[R.A]) {
      case 0: // CLEAR_BUFFER
        this.queue = [];
        break;

      case 1: // GET_NEXT
        if (this.queue.length == 0) {
          c.regs[R.C] = 0;
        } else {
          c.regs[R.C] = this.queue.shift();
        }
        break;

      case 2: // CHECK_KEY
        c.regs[R.C] = this.keysDown[c.regs[R.B]] ? 1 : 0;
        break;

      case 3: // SET_INT
        this.intMessage = c.regs[R.B];
        break;

      case 4: // SET_MODE
        this.intMessage = c.regs[R.B] == 1 ? KeyboardMode.RAW : KeyboardMode.COOKED;
        this.queue = [];
        break;
    }
  }

  private static KEY_CODES = {
    Shift: 0x90,
    Control: 0x91,
    Alt: 0x92,
    Backspace: 0x10,
    Enter: 0x11,
    Insert: 0x12,
    Delete: 0x13,
    ArrowUp: 0x80,
    ArrowDown: 0x81,
    ArrowLeft: 0x82,
    ArrowRight: 0x83,
  };

  // Called by the environment when keys are pressed and released on the
  // emulation tab.
  public handleKeyEvent(e: KeyboardEvent): void {
    // First convert from the raw input event to the DCPU's view.
    // The DCPU uses its own key codes.
    // e.key is a string describing the key.
    let code = Keyboard.KEY_CODES[e.key];
    if (code) { // Special key
      if (this.mode == KeyboardMode.COOKED && 0x90 <= code && code <= 0x92) {
        // Cooked mode and saw mod key, just note its up/down state.
        this.keysDown[code] = e.type === 'keydown';
      }
    }

    code = code || e.key.charCodeAt(0);
    if (e.type === 'keydown') {
      this.keysDown[code] = true;
      this.queue.push(code);
    } else if (e.type === 'keyup') {
      this.keysDown[code] = false;
    }
  }

  public tick(c: DCPU): void {}
  public cleanup(): void {}
}
