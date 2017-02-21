import { Device } from './device'

export enum R { A, B, C, X, Y, Z, I, J }

// Converts a value from unsigned 16-bits to signed, 2's complement.
function signed(x: number): number {
  return x < 0x8000 ? x : x - 0x10000;
}

export class DCPU {
  public mem:  number[]
  public regs: number[]
  public ia: number
  public sp: number
  public pc: number
  public ex: number
  public queueing: boolean
  public queue: number[]

  public skipping: boolean
  public waitStates: number
  public blocked: boolean
  public halted: boolean
  public debug: boolean
  public breakpoints: number[]

  public devices: Device[]

  constructor() {
    this.reset();
  }

  public reset(): void {
    for (let i = 0; i < 65536; i++) this.mem[i] = 0;
    for (let i = 0; i < 8; i++) this.regs[i] = 0;
    this.ia = 0;
    this.sp = 0;
    this.pc = 0;
    this.ex = 0;
    this.queueing = false;
    this.queue = [];

    this.skipping = false;
    this.waitStates = 0;
    this.blocked = false;
    this.halted = false;
    // Deliberately not resetting the debug state.
  }

  private pcGet(): number { return this.mem[this.pc++]; }
  private pcPeek(): number { return this.mem[this.pc]; }
  private pop(): number { return this.mem[this.sp++]; }
  private push(v: number) { this.mem[--this.sp]; }
  private addInterrupt(v: number) {
    if (this.queue.length >= 256) {
      // TODO: Better error state here.
      throw 'On fire!';
    }

    this.queue.push(v);
  }

  private popInterrupt(): number {
    // TODO: Check for errors? This shouldn't be called with an empty queue.
    return this.queue.shift();
  }

  private readArg(arg: number, consume: boolean): number {
    if (arg < 0x08) return this.regs[arg];
    if (arg < 0x10) return this.mem[this.regs[arg & 7]];
    if (arg < 0x18) {
      this.waitStates++;
      return this.mem[
        this.regs[arg & 7] + (consume ? this.pcGet() : this.pcPeek())];
    }
    if (arg >= 0x20) { // Inline literal.
      return arg - 0x21;
    }

    switch (arg) {
      case 0x18: // POP
        return this.pop();
      case 0x19: // PEEK
        return this.mem[this.sp];
      case 0x1a: // PICK n
        this.waitStates++;
        return this.mem[this.sp + (consume ? this.pcGet() : this.pcPeek())];
      case 0x1b: // SP
        return this.sp;
      case 0x1c: // PC
        return this.pc;
      case 0x1d: // EX
        return this.ex;
      case 0x1e: // [next]
        this.waitStates++;
        return this.mem[consume ? this.pcGet() : this.pcPeek()];
      case 0x1f: // next
        this.waitStates++;
        return consume ? this.pcGet() : this.pcPeek();
    }
    // Can't reach here.
    throw 'Invalid arg value: ' + arg
  }

  private skipArg(a: number): void {
    //   [A+next]                  PICK n       [next]       lit next
    if ((0x10 <= a && a < 0x18) || a == 0x1a || a == 0x1e || a == 0x1f) {
      this.pc++;
    }
  }

  private readArgs(a: number, b: number): { av: number, bv: number } {
    return {
      av: this.readArg(a, true),
      bv: this.readArg(b, false),
    };
  }

  private writeArg(arg: number, val: number) {
    val &= 0xffff;
    if (arg < 0x08) {
      this.regs[arg] = val;
    } else if (arg < 0x10) {
      this.mem[this.regs[arg & 7]] = val;
    } else if (arg < 0x18) {
      this.waitStates++;
      this.mem[this.regs[arg & 7] + this.pcGet()] = val;
    } else if (arg == 0x18) {
      this.push(val);
    } else if (arg == 0x19) {
      this.mem[this.sp] = val;
    } else if (arg == 0x1a) {
      this.waitStates++;
      this.mem[this.sp + this.pcGet()] = val;
    } else if (arg == 0x1b) {
      this.sp = val;
    } else if (arg == 0x1c) {
      this.pc = val;
    } else if (arg == 0x1d) {
      this.ex = val;
    } else if (arg == 0x1e) {
      this.mem[this.pcGet()] = val;
      this.waitStates++;
    }
    // Otherwise, silently dropped. (Writing to a literal.)
  }

  static BRANCH_OPS = {
    0x10: (av: number, bv: number) => (av & bv) != 0, // IFB
    0x11: (av: number, bv: number) => (av & bv) == 0, // IFC
    0x12: (av: number, bv: number) => av == bv,       // IFE
    0x13: (av: number, bv: number) => av != bv,       // IFN
    0x14: (av: number, bv: number) => av  > bv,       // IFG
    0x15: (av: number, bv: number) => signed(av) > signed(bv), // IFA
    0x16: (av: number, bv: number) => av  < bv,       // IFL
    0x17: (av: number, bv: number) => signed(av) < signed(bv), // IFU
  };

  static MAIN_OPS = {
    0x01: function(a: number, b: number) { // SET
      this.writeArg(b, this.readArg(a, true));
      this.waitStates++;
    },

    0x02: function(a: number, b: number) { // ADD
      let { av: av, bv: bv } = this.readArgs(a, b);
      let bigRes: number = av + bv;
      this.ex = bigRes >= 0x10000 ? 1 : 0;
      this.writeArg(b, bigRes & 0xffff);
      this.waitStates += 2;
    },

    0x03: function(a: number, b: number) { // SUB b, a   b = b - a
      let { av: av, bv: bv } = this.readArgs(a, b);
      this.ex = av > bv ? 0xffff : 0;
      this.writeArg(b, bv - av);
      this.waitStates += 2;
    },

    0x04: function(a: number, b: number) { // MUL
      let { av: av, bv: bv } = this.readArgs(a, b);
      let bigRes: number = av * bv;
      this.ex = bigRes >> 16;
      this.writeArg(b, bigRes & 0xffff);
      this.waitStates += 2;
    },

    0x05: function(a: number, b: number) { // MUL
      let { av: av, bv: bv } = this.readArgs(a, b);
      let bigRes: number = signed(av) * signed(bv);
      this.ex = bigRes >> 16;
      this.writeArg(b, bigRes & 0xffff);
      this.waitStates += 2;
    },

    0x06: function(a: number, b: number) { // DIV b, a  (b = b/a or 0)
      let { av: av, bv: bv } = this.readArgs(a, b);
      if (av == 0) {
        this.ex = 0;
        this.writeArg(b, 0);
      } else {
        this.writeArg(b, Math.trunc(bv / av));
        this.ex = Math.trunc((bv << 16) / av);
      }
      this.waitStates += 3;
    },

    0x07: function(a: number, b: number) { // DVI b, a  (b = b/a or 0)
      let { av: av, bv: bv } = this.readArgs(a, b);
      if (av == 0) {
        this.ex = 0;
        this.writeArg(b, 0);
      } else {
        this.writeArg(b, Math.trunc(signed(bv) / signed(av)));
        this.ex = Math.trunc((bv << 16) / av);
      }
      this.waitStates += 3;
    },

    0x08: function(a: number, b: number) { // MOD b, a  (b = b%a or 0)
      let { av: av, bv: bv } = this.readArgs(a, b);
      this.writeArg(b, av == 0 ? 0 : bv % av);
      this.waitStates += 3;
    },
    0x09: function(a: number, b: number) { // MDI b, a  (b = b%a or 0)
      let { av: av, bv: bv } = this.readArgs(a, b);
      this.writeArg(b, av == 0 ? 0 : signed(bv) % signed(av));
      this.waitStates += 3;
    },

    0x0a: function(a: number, b: number) { // AND
      let { av: av, bv: bv } = this.readArgs(a, b);
      this.writeArg(b, av & bv);
      this.waitStates++;
    },
    0x0b: function(a: number, b: number) { // BOR
      let { av: av, bv: bv } = this.readArgs(a, b);
      this.writeArg(b, av | bv);
      this.waitStates++;
    },
    0x0c: function(a: number, b: number) { // EOR
      let { av: av, bv: bv } = this.readArgs(a, b);
      this.writeArg(b, av ^ bv);
      this.waitStates++;
    },

    0x0d: function(a: number, b: number) { // SHR
      let { av: av, bv: bv } = this.readArgs(a, b);
      this.ex = ((bv << 16) >>> av) & 0xffff;
      this.writeArg(b, bv >>> av);
      this.waitStates++;
    },
    0x0e: function(a: number, b: number) { // ASR
      let { av: av, bv: bv } = this.readArgs(a, b);
      this.ex = (signed(bv) << 16) >> av;
      this.writeArg(b, signed(bv) >> av);
      this.waitStates++;
    },
    0x0f: function(a: number, b: number) { // ASR
      let { av: av, bv: bv } = this.readArgs(a, b);
      this.ex = (bv << av) >> 16;
      this.writeArg(b, (bv << av) & 0xffff);
      this.waitStates++;
    },

    // Branches are 0x10-0x18.
    0x1a: function(a: number, b: number) { // ADX
      let { av: av, bv: bv } = this.readArgs(a, b);
      let res = av + bv + this.ex;
      this.ex = (res & 0xffff0000) != 0 ? 1 : 0;
      this.writeArg(b, res);
      this.waitStates += 3;
    },
    0x1b: function(a: number, b: number) { // SBX
      let { av: av, bv: bv } = this.readArgs(a, b);
      let oldEX = this.ex;
      this.ex = bv < (av + oldEX) ? 0xffff : 0;
      this.writeArg(b, bv - av + oldEX);
      this.waitStates += 3;
    },

    0x1e: function(a: number, b: number) { // STI
      this.writeArg(b, this.readArg(a, true));
      this.regs[R.I]++;
      this.regs[R.J]++;
      this.waitStates += 2;
    },
    0x1f: function(a: number, b: number) { // STD
      this.writeArg(b, this.readArg(a, true));
      this.regs[R.I]--;
      this.regs[R.J]--;
      this.waitStates += 2;
    },
  };

  private runMainOp(op: number, a: number, b: number): void {
    if (0x10 <= op && op < 0x18) { // Branches
      // All the branches are the same style.
      // True means run the next op! False means skip.
      let av: number = this.readArg(a, true);
      let bv: number = this.readArg(b, true);

      this.skipping = !DCPU.BRANCH_OPS[op](av, bv);
      this.waitStates += this.skipping ? 3 : 2;
      return;
    }

    if (op == 0x00) {
      this.runSpecialOp(b, a);
      return;
    }

    let f = DCPU.MAIN_OPS[op];
    f.call(this, a, b);
  }

  static SPECIAL_OPS = {
    0x01: function(a: number) { // JSR
      let av = this.readArg(a, true);
      this.push(this.pc);
      this.pc = av;
      this.waitStates += 3;
    },

    0x08: function(a: number) { // INT a - software interrupt
      this.addInterrupt(this.readArg(a, true));
      this.waitStates += 4;
    },

    0x09: function(a: number) { // IAG a - store IA in a
      this.writeArg(a, this.ia);
      this.waitStates++;
    },
    0x0a: function(a: number) { // IAS a - store a in IA
      this.ia = this.readArg(a, true);
      this.waitStates++;
    },

    0x0b: function(a: number) { // RFI a - return from interrupt
      // Disables queueing, A = popped, PC = popped.
      this.readArg(a, true); // Arg is consumed but ignored.
      this.regs[R.A] = this.pop();
      this.pc = this.pop();
      this.queueing = false;
      this.waitStates += 3;
    },

    0x0c: function(a: number) { // IAQ a - if a != 0, enable queueing.
      this.queueing = this.readArg(a, true) != 0;
      this.waitStates += 2;
    },

    0x10: function(a: number) { // HWN a - Set a to number of devices.
      this.writeArg(a, this.devices.length);
      this.waitStates += 2;
    },

    0x11: function(a: number) { // HWQ a - Details of device a.
      let d: number = this.readArg(a, true);
      if (d > this.devices.length) {
        for (let i = 0; i < 5; i++) this.regs[i] = 0;
      } else {
        let dev: Device = this.devices[d];
        this.regs[R.A] = dev.id & 0xffff;
        this.regs[R.B] = (dev.id >> 16) & 0xffff;
        this.regs[R.C] = dev.version;
        this.regs[R.X] = dev.manufacturer & 0xffff;
        this.regs[R.Y] = (dev.manufacturer >> 16) & 0xffff;
      }
      this.waitStates += 4;
    },

    0x12: function(a: number) { // HWI a - Interrupt to device a.
      let av: number = this.readArg(a, true);
      if (av < this.devices.length) {
        this.devices[av].interrupt(this);
      }
      this.waitStates += 4;
    },

    // TC extras: LOG, BRK, HLT.
    0x13: function(a: number) { // LOG a
      // TODO: Port this to use the debugger pseudo-device.
      let av: number = this.readArg(a, true);
      this.waitStates++;
      console.log('Log: 0x' + av.toString(16), av, signed(av),
                  String.fromCharCode(av));
    },

    0x14: function(a: number) { // BRK a
      console.log('Breakpoint', this.readArg(a, true));
      this.debug = true;
      this.waitStates++;
    },

    0x15: function(a: number) { // HLT a
      this.readArg(a, true); // Consumed but ignored.
      this.halted = true;
      this.waitStates++;
    },
  };

  private runSpecialOp(op: number, a: number): void {
    DCPU.SPECIAL_OPS[op](a);
  }


  // Main interpreter function.
  // Runs a single cycle - which might mean doing nothing.
  // Returns true if an instruction was really executed, false otherwise.
  private runOp(): boolean {
    // Tick all the hardware devices.
    this.devices.forEach((d) => d.tick(this));

    if (this.blocked) return false;
    if (this.waitStates > 1) {
      this.waitStates--;
      return false;
    }

    this.waitStates = 0;

    // If we're skipping, check whether this is a branching opcode or not.
    if (this.skipping) {
      let x: number = this.pcGet();
      let op = x & 31;
      let b = (x >> 5) & 31;
      let a = (x >> 10) & 63;

      if (op != 0) { // If op == 0, no b to be skipped.
        this.skipArg(b);
      }
      this.skipArg(a);

      if (0x10 <= op && op < 0x18) { // Branching op, keep skipping.
        this.waitStates++;
        return false
      }

      this.skipping = false;
      // Done skipping. Let the below run the following instruction.
    }

    // Check for interrupts before running the current op.
    if (!this.queueing && this.queue.length > 0) {
      let msg = this.popInterrupt();
      if (this.ia != 0) {
        this.push(this.pc);
        this.push(this.regs[R.A]);
        this.pc = this.ia;
        this.regs[R.A] = msg;
      }
    }

    // Whether we interrupted or not, PC is aimed at the instruction to run.
    let x = this.pcGet();
    let op = x & 31;
    let b = (x >> 5) & 31;
    let a = (x >> 10) & 63;

    this.runMainOp(op, a, b);
    return true;
  }

  public run(): void {
    // Repeatedly run the CPU operations, stopping on debugging.
    // Break every 5000 cycles (~20Hz) for input/output.
    let cycles = 0;
    while (cycles < 5000 && !this.debug) {
      cycles++;
      this.runOp();
    }

    // If we didn't break for debugging, schedule a timeout.
    if (!this.debug) {
      window.setTimeout(this.run.bind(this), 0);
    }
  }

  public loadROM(rom: number[]): void {
    for (let i = 0; i < rom.length; i++) {
      this.mem[i] = rom[i];
    }
  }
}
