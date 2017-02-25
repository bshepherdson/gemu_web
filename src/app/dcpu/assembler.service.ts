import { Injectable } from '@angular/core';

import { Token, ISimpleTokenOrIToken, Lexer, Parser } from 'chevrotain';

import { SourceService } from '../editor/source.service';

@Injectable()
export class AssemblerService {
  constructor(private sourceService: SourceService) {}

  // Given the main file name, returns the assembled binary.
  // Throws if there are errors.
  public assemble(name: string): number[] {
    let s = new AssemblyState();
    let parsed = this.parseFile(name);
    this.collectLabels(parsed, s);

    while (!s.resolved || s.dirty) {
      s.reset();
      for (let a of parsed) a.assemble(s);
    }
    return s.rom;
  }

  private parseFile(name: string): Assembled[] {
    let file = this.sourceService.getFile(name);
    let lexResult = lexer.tokenize(file);
    let lines: ISimpleTokenOrIToken[][] = [];
    let line: ISimpleTokenOrIToken[] = [];
    for (let t of lexResult.tokens) {
      if (t instanceof TNewline) {
        if (line.length > 0) lines.push(line);
        line = [];
      } else {
        line.push(t);
      }
    }
    if (line.length > 0) lines.push(line);

    let out: Assembled[] = [];
    for (let l of lines) {
      console.log(l);
      let parser = new DCPUParser(name, l as Token[]);
      let items = parser.item();

      if (parser.errors.length > 0) {
        throw parser.errors;
      }

      // Look for .includes and expand them.
      for (let i of items) {
        if (i instanceof Include) {
          out = out.concat(this.parseFile(i.filename));
        } else {
          out.push(i);
        }
      }
    }

    return out;
  }

  private collectLabels(asm: Assembled[], s: AssemblyState): void {
    for (let a of asm) {
      if (a instanceof LabelDef) {
        s.addLabel(a.label);
      }
    }
  }
}

export class ParseError {
  constructor(public sourceLoc: SourceLoc, public message: string) {}
  toString(): string {
    return 'Parse error: ' + this.sourceLoc.toString() + ':   ' + this.message;
  }
}


// The dynamic labels in scope at runtime.
class AssemblyState {
  // Fixed labels in the code, defined with :label.
  // These must be unique.
  // These are collected early and added with addLabel(), but their values are
  // set to null initially.
  private labels: { [l: string]: number } = {};

  // Updatable .defines
  private symbols: { [l: string]: number } = {};

  // True when all labels are resolved, false if anything is unclear.
  public resolved: boolean = false;
  // True when something has changed this pass (eg. a label's value).
  public dirty: boolean = false;

  // True when all labels are resolved, false if anything is unclear.
  public offset: number = 0;

  public rom: number[] = [];
  public index: number = 0;
  private used: { [x: number]: boolean } = {};

  public lookup(l: string): [boolean, number] {
    if (l in this.labels) {
      return [true, this.labels[l]];
    }
    if (l in this.symbols) {
      return [true, this.symbols[l]];
    }
    return [false, 0];
  }

  public addLabel(l: string): void {
    this.labels[l] = null;
  }

  public updateLabel(l: string, loc: number): void {
    if (l in this.labels && this.labels[l] !== loc) {
      this.dirty = true;
    }
    this.labels[l] = loc;
  }

  public updateSymbol(l: string, val: number): void {
    this.symbols[l] = val;
  }

  public reset(): void {
    this.symbols = {};
    this.resolved = true;
    this.dirty = false;
    this.index = 0;
    this.used = {};
  }

  public push(x: number): void {
    if (this.used[this.index]) {
      throw new ParseError(null, 'Overlapping regions at: ' + this.index);
    }

    this.used[this.index] = true;
    this.rom[this.index++] = x;
  }
}

class SourceLoc {
  constructor(public readonly file: string, public readonly row: number,
              public readonly col: number) {}

  toString(): string {
    return this.file + '@' + this.row + ':' + this.col;
  }
}

// All expressions evaluate to an integer value, which might depend on the
// source location of various things.
// Expression is the abstract parent class.
abstract class Expression {
  constructor(public sourceLoc: SourceLoc) {}

  public evaluate(s: AssemblyState): number {
    return this.evaluate_(s);
  }

  errorAt(msg: string): ParseError {
    return new ParseError(this.sourceLoc, msg);
  }

  abstract evaluate_(s: AssemblyState): number;
}

class LabelUse extends Expression {
  constructor(public sourceLoc: SourceLoc, public label: string) {
    super(sourceLoc);
  }

  evaluate_(s: AssemblyState): number {
    let [found, value] = s.lookup(this.label);
    if (!found) throw this.errorAt('Unknown symbol "' + this.label + '"');
    if (value !== null) return value;

    // Null means the labels aren't fully resolved yet.
    s.resolved = false;
    return 0;
  }
}

class Constant extends Expression {
  constructor(public sourceLoc: SourceLoc, public value: number) {
    super(sourceLoc);
  }

  evaluate_(s: AssemblyState): number {
    return this.value;
  }
}

class UnaryOp extends Expression {
  constructor(public sourceLoc: SourceLoc, private op: string, private arg: Expression) {
    super(sourceLoc);
  }

  evaluate_(s: AssemblyState): number {
    let av = this.arg.evaluate(s);
    if (this.op === '~') {
      return ~av;
    } else if (this.op === '-') {
      return (-av) & 0xffff;
    } else {
      throw this.errorAt('Unknown unary op: ' + this.op);
    }
  }
}

class BinaryOp extends Expression {
  constructor(public sourceLoc: SourceLoc, private op: string,
              private arg1: Expression, private arg2: Expression) {
    super(sourceLoc);
  }

  evaluate_(s: AssemblyState): number {
    let av = this.arg1.evaluate(s);
    let bv = this.arg2.evaluate(s);

    let res: number;
    if (this.op === '+') res = av + bv;
    else if (this.op === '-') res = av - bv;
    else if (this.op === '*') res = av * bv;
    else if (this.op === '/') res = av / bv;
    else if (this.op === '<<') res = av << bv;
    else if (this.op === '>>') res = av >> bv;
    else if (this.op === '>>>') res = av >>> bv;
    else if (this.op === '&') res = av & bv;
    else if (this.op === '|') res = av | bv;
    else if (this.op === '^') res = av ^ bv;
    else {
      throw this.errorAt('Unknown binary op: ' + this.op);
    }
    return res & 0xffff;
  }
}


interface Assembled {
  // Assembles this item into the given ROM, returning its size.
  assemble(s: AssemblyState): void;
}

class Block implements Assembled {
  constructor(private start: number, private isFree: boolean, private contents: Assembled[]) {}

  assemble(s: AssemblyState): void {
    for (let c of this.contents) c.assemble(s);
  }
}

class Include implements Assembled {
  constructor(public filename: string) {}

  assemble(s: AssemblyState): void {
    throw new Error('Can\'t happen: Include() survived to assemble() time');
  }
}

class Org implements Assembled {
  constructor(private loc: Expression) {}

  assemble(s: AssemblyState): void {
    s.index = this.loc.evaluate(s);
  }
}

class SymbolDef implements Assembled {
  constructor(private name: string, private value: Expression) {}

  assemble(s: AssemblyState): void {
    s.updateSymbol(this.name, this.value.evaluate(s));
  }
}

enum BinOps {
  SET = 1, ADD, SUB, MUL, MLI, DIV, DVI, MOD, MDI,
  AND, BOR, XOR, SHR, ASR, SHL,
  IFB, IFC, IFE, IFN, IFG, IFA, IFL, IFU,
  ADX, SBX, STI, STD
}

enum UnOps {
  JSR = 1,
  INT = 8, IAG, IAS, RFI, IAQ,
  HWN = 0x10, HWQ, HWI, LOG, BRK, HLT
}

class BinaryInstruction implements Assembled {
  constructor(private opcode: BinOps, private b: Arg, private a: Arg) {}

  assemble(s: AssemblyState): void {
    let op = this.opcode | (this.a.assembleInline(s, true) << 10) |
        (this.b.assembleInline(s, false) << 5);
    s.push(op);
    this.a.assembleExtra(s, true);
    this.b.assembleExtra(s, false);
  }
}

class UnaryInstruction implements Assembled {
  constructor(private opcode: UnOps, private a: Arg) {}

  assemble(s: AssemblyState): void {
    let op = (this.opcode << 5) | (this.a.assembleInline(s, true) << 10);
    s.push(op);
    this.a.assembleExtra(s, true);
  }
}

class DatBlock implements Assembled  {
  constructor(private values: Expression[]) {}

  assemble(s: AssemblyState): void {
    for (let v of this.values) s.push(v.evaluate(s));
  }
}

class FillBlock implements Assembled {
  constructor(private length: Expression, private value: Expression) {}

  assemble(s: AssemblyState): void {
    let len = this.length.evaluate(s);
    let val = this.value.evaluate(s);
    for (let i = 0; i < len; i++) s.push(val);
  }
}


class LabelDef implements Assembled {
  constructor(public label: string) {}

  assemble(s: AssemblyState): void {
    // Labels are collected in an earlier pass, but I should record the current
    // index as the location of this label.
    s.updateLabel(this.label, s.index);
  }
}


interface Arg {
  assembleInline(s: AssemblyState, isA: boolean): number;
  assembleExtra(s: AssemblyState, isA: boolean): void;
}

// Represents all three flavours of accessing the general-purpose registers:
// A, [A] (addressed=true), and [A +/- expr] (indexExpr set).
class ArgReg implements Arg {
  static REGS = {
    A: 0,
    B: 1,
    C: 2,
    X: 3,
    Y: 4,
    Z: 5,
    I: 6,
    J: 7,
  };

  constructor(private reg: string,
              public addressed: boolean = false,
              public indexExpr: Expression = null) {}

  assembleInline(s: AssemblyState, isA: boolean): number {
    let r = ArgReg.REGS[this.reg.toUpperCase()];
    if (this.indexExpr) {
      return r | 0x10;
    } else if (this.addressed) {
      return r | 0x08;
    }
    return r;
  }

  assembleExtra(s: AssemblyState, isA: boolean): void {
    if (this.indexExpr) {
      s.push(this.indexExpr.evaluate(s));
    }
  }
}

// Simple, no-extra-word arguments (PC, SP, PEEK, PUSH/POP, etc.)
class InlineArg implements Arg {
  constructor(private value: number) {}

  assembleInline(s: AssemblyState, isA: boolean): number {
    return this.value;
  }
  assembleExtra(s: AssemblyState, isA: boolean): void {}
}

// PICK n
class Pick implements Arg {
  constructor(private expr: Expression) {}

  assembleInline(s: AssemblyState, isA: boolean): number { return 0x1a; }

  assembleExtra(s: AssemblyState, isA: boolean): void {
    s.push(this.expr.evaluate(s));
  }
}


// Handles long or short literals, with optional addressing.
class LiteralArg implements Arg {
  constructor(private value: Expression, private addressed: boolean = false) {}

  private isShort(s: AssemblyState): boolean {
    if (this.addressed) return false;
    let v = this.value.evaluate(s);
    return v === 0xffff || (0 <= v && v <= 30);
  }

  assembleInline(s: AssemblyState, isA: boolean): number {
    if (isA && this.isShort(s)) {
      let v = this.value.evaluate(s);
      return v === 0xffff ? 0x20 : 0x21 + v;
    }
    return this.addressed ? 0x1e : 0x1f;
  }

  assembleExtra(s: AssemblyState, isA: boolean): void {
    if (isA && this.isShort(s)) return;
    s.push(this.value.evaluate(s));
  }
}



// Lexer
class TComment extends Token {
  static PATTERN = /;[^\n]*/;
  static GROUP = Lexer.SKIPPED;
}

class TWhitespace extends Token {
  static PATTERN = /[ \t\r]+/;
  static GROUP = Lexer.SKIPPED;
}

class TNewline extends Token { static PATTERN = /\n/; }

class TRegister extends Token { static PATTERN = /[abcxyzij](?!\w)/i; }
class TArgument extends Token {
  static PATTERN = /ex|pc|sp|peek|pop|push/i;
}
class TPick extends Token { static PATTERN = /pick/i; }

class TLBrac extends Token { static PATTERN = /\[/; }
class TRBrac extends Token { static PATTERN = /\]/; }

class TLParen extends Token { static PATTERN = /\(/; }
class TRParen extends Token { static PATTERN = /\)/; }

class TIdent extends Token { static PATTERN = /[A-Za-z_]\w*/; }

class TNumber extends Token {
  static PATTERN = /[1-9]\d*|0x[0-9a-fA-F]+|0/;
}

class TString extends Token {
  static PATTERN = /"[^"\n]*"/;
}

class TColon extends Token { static PATTERN = /:/; }
class TDot extends Token { static PATTERN = /\./; }
class TComma extends Token { static PATTERN = /,/; }

class TOperator extends Token {
  static PATTERN = />>>|>>|<<|[+\-*\/&|^]/;
}

let allTokens = [TComment, TWhitespace, TNewline, TRegister, TArgument,
    TPick, TNumber, TString, TOperator, TDot, TComma, TColon,
    TLBrac, TRBrac, TLParen, TRParen, TIdent];
let lexer = new Lexer(allTokens);


class DCPUParser extends Parser {
  constructor(public filename: string, input: Token[]) {
    super(input, allTokens, false /* no error recovery */);
    Parser.performSelfAnalysis(this);
  }

  private buildLocation(t: ISimpleTokenOrIToken): SourceLoc {
    return new SourceLoc(this.filename, t.startColumn, t.endColumn);
  }

  // START : Whitespace (manySep line ws)
  public START = this.RULE('START', () => {
    this.SUBRULE(this.blanks);
    let res = this.AT_LEAST_ONE_SEP(TNewline, this.item).values;
    this.SUBRULE2(this.blanks);
    return res.filter((x) => !!x);
  });

  public blanks = this.RULE('blanks', () => {
    this.MANY(() => { this.CONSUME(TNewline); });
  });

  // item : directive | labelDef | instruction
  public item = this.RULE<Assembled[]>('item', () => {
    let labels = this.MANY1<Assembled>(() => {
      return this.NEXT_TOKEN() instanceof TColon;
    }, () => { return this.SUBRULE(this.labelDef); });
    let main = this.OPTION2(() => {
      return this.OR<Assembled>([
        {ALT: () => { return this.SUBRULE3(this.directive); }},
        {ALT: () => { return this.SUBRULE3(this.instruction); }},
      ]);
    });
    console.log(labels, main);
    let out: Assembled[] = [];
    for (let l of labels) out.push(l);
    if (main) out.push(main);
    return out;
  });

  // Helpers for directives:
  // Returns an Expression[].
  public dirValue = this.RULE<Expression[]>('dirValue', () => {
    return this.OR([
      {ALT: () => {
        let t = this.CONSUME(TString);
        let loc = this.buildLocation(t);
        let s = t.image;
        let ret: Expression[] = [];
        for (let i = 1; i < s.length - 1; i++) { // Ignoring the quotes.
          ret.push(new Constant(loc, s.charCodeAt(i)));
        }
        return ret;
      }},
      {ALT: () => {
        let v = this.SUBRULE(this.value);
        return [v];
      }},
    ]);
  });

  public value = this.RULE<Expression>('value', () => {
    let v = this.OR<Expression>([
      {ALT: () => { return this.SUBRULE(this.number); }},
      {ALT: () => { return this.SUBRULE(this.ident); }},
    ]);
    return v;
  });
  public number = this.RULE<Expression>('number', () => {
    let t = this.CONSUME(TNumber);
    return new Constant(this.buildLocation(t), Number.parseInt(t.image));
  });
  public ident = this.RULE<Expression>('ident', () => {
    let t = this.CONSUME(TIdent);
    return new LabelUse(this.buildLocation(t), t.image);
  });

  public directive = this.RULE('directive', () => {
    let t = this.CONSUME(TDot);
    let op = this.CONSUME2(TIdent).image.toLowerCase();
    let args = this.AT_LEAST_ONE_SEP1<Expression[]>(TComma, this.dirValue).values;

    // Now try to sort out the directives. Each supports only certain types and
    // numbers of arguments.
    if (op === 'dat') {
      // Any number of arguments, any types.
      let vals: Expression[] = [];
      for (let exprs of args) {
        vals = vals.concat(exprs);
      }
      return new DatBlock(vals);
    } else if (op === 'reserve') {
      // Single number.
      if (args.length !== 1 || args[0].length !== 1) {
        throw new ParseError(this.buildLocation(t),
                             '.reserve takes exactly one argument');
      }
      return new FillBlock(args[0][0], new Constant(this.buildLocation(t), 0));
    } else if (op === 'fill') {
      // Two numbers.
      if (args.length !== 2 || args[0].length !== 1 || args[1].length !== 1) {
        throw new ParseError(this.buildLocation(t),
                             '.fill takes exactly two arguments');
      }
      return new FillBlock(args[0][0], args[1][0]);
    } else if (op === 'org') {
      // One number.
      if (args.length !== 1 || args[0].length !== 1) {
        throw new ParseError(this.buildLocation(t),
                             '.org takes exactly one argument');
      }
      return new Org(args[0][0]);
    } else if (op === 'include') {
      // Compact the Expression[] back into a string.
      if (args.length !== 1) {
        throw new ParseError(this.buildLocation(t),
                             '.include needs one string argument');
      }
      let s: string = '';
      for (let c of args[0]) s += String.fromCharCode((c as Constant).value);
      return new Include(s);
    } else if (op === 'define' || op === 'def') {
      // Two arguments, the first an identifier.
      if (args.length !== 2 || args[0].length !== 1 || !(args[0][0] instanceof LabelUse) || args[1].length !== 1) {
        throw new ParseError(this.buildLocation(t),
                             '.define requires an identifier and expression');
      }

      return new SymbolDef((args[0][0] as LabelUse).label, args[1][0]);
    } else if (op === 'macro') {
      throw new ParseError(this.buildLocation(t),
                           '.macro is not implemented');
    } else {
      throw new ParseError(this.buildLocation(t),
                           'Unrecognized directive: .' + op);
    }
  });

  public labelDef = this.RULE<Assembled>('labelDef', () => {
    this.CONSUME(TColon);
    let l = this.CONSUME(TIdent).image;
    return new LabelDef(l);
  });

  public instruction = this.RULE('instruction', () => {
    let t = this.CONSUME1(TIdent);
    let op = t.image.toUpperCase();
    let args = this.AT_LEAST_ONE_SEP(TComma, this.arg).values;
    if (UnOps[op] > 0) {
      if (args.length !== 1) {
        throw new ParseError(this.buildLocation(t),
                             'Unary op with ' + args.length + ' arguments');
      }
      return new UnaryInstruction(UnOps[op], args[0]);
    } else if (BinOps[op] > 0) {
      if (args.length !== 2) {
        throw new ParseError(this.buildLocation(t),
                             'Binary op with ' + args.length + ' arguments');
      }
      return new BinaryInstruction(BinOps[op], args[0], args[1]);
    } else {
      throw new ParseError(this.buildLocation(t), 'Unrecognized opcode: ' + op);
    }
  });

  public arg = this.RULE<Arg>('arg', () => {
    return this.OR([
      {ALT: () => { return this.SUBRULE(this.memRef); }},
      {ALT: () => { return this.SUBRULE(this.simpleArg); }},
    ]);
  });

  public simpleArg = this.RULE<Arg>('simpleArg', () => {
    return this.OR<Arg>([
      {ALT: () => { return this.SUBRULE(this.specialReg); }},
      {ALT: () => { return this.SUBRULE(this.pick); }},
      {ALT: () => { return this.SUBRULE(this.register); }},
      {ALT: () => {
        return new LiteralArg(this.SUBRULE(this.value));
      }},
    ]);
  });

  // Several possibilities here:
  // [A]
  // [expr]
  // [A + expr]
  // [A - expr]
  public memRef = this.RULE<Arg>('memRef', () => {
    let t = this.CONSUME1(TLBrac);
    let lhs = this.OPTION1(this.register);
    let op  = this.OPTION2(() => {
      return this.CONSUME2(TOperator).image;
    });
    let rhs = this.OPTION3(this.value);

    if (lhs instanceof ArgReg) {
      if (rhs instanceof Expression) {
        if (op !== '+' && op !== '-') {
          throw new ParseError(this.buildLocation(t),
                               'Malformed memory access argument');
        }

        lhs.addressed = true;
        lhs.indexExpr = op === '-' ? new UnaryOp(rhs.sourceLoc, '-', rhs) : rhs;
      }
    } else if (lhs instanceof Expression && !rhs && !op) {
      return new LiteralArg(lhs, true);
    }
  });

  static SPECIAL_REG_VALUES = {
    PUSH: 0x18,
    POP: 0x18,
    PEEK: 0x19,
    SP: 0x1b,
    PC: 0x1c,
    EX: 0x1d,
  };

  public specialReg = this.RULE<Arg>('specialReg', () => {
    let t = this.CONSUME(TArgument);
    let s = t.image.toUpperCase();
    if (s in DCPUParser.SPECIAL_REG_VALUES) {
      return new InlineArg(DCPUParser.SPECIAL_REG_VALUES[s]);
    }
    throw new ParseError(this.buildLocation(t),
                         'Unknown special reg: ' + s); // Can't happen?
  });

  public pick = this.RULE<Arg>('pick', () => {
    this.CONSUME(TPick);
    let n = this.SUBRULE(this.value);
    return new Pick(n);
  });

  public register = this.RULE<Arg>('register', () => {
    let r = this.CONSUME(TRegister).image;
    return new ArgReg(r);
  });

  // TODO: Support for more complex expressions.
}

