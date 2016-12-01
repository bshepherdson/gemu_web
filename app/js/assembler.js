// FOAM-powered parser and assembler for the TC flavour of the DCPU-16.
// Aims to be compatible with the official TC assembler, DASM:
// https://github.com/techcompliant/DASM

// Defining an AST for expressions. All expressions evaluate to an integer
// value, which might depend on the source location of various things.
// Expression is the parent class, it can be evaluated.
foam.CLASS({
  package: 'gemu.dcpu',
  name: 'Expression',

  properties: [
    [ 'isStatic', true ], // true if the expression doesn't depend on a label.
    'value_' // Can be set as a cache.
  ],

  methods: [
    function evaluate(scope) {
      if ( this.hasOwnProperty('value_') ) {
        return this.value_;
      }

      var v = this.evaluate_(scope);
      this.value_ = v;
      return v;
    },

    function evaluate_(scope) {
      throw 'Unimplemented abstract method evaluate_() in ' + this.cls_.id;
    }
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'LabelUse',
  extends: 'gemu.dcpu.Expression',
  properties: [
    'label',
    [ 'isStatic', false ]
  ],
  methods: [
    function evaluate_(scope) {
      return scope.labels[this.label];
    }
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'Constant',
  extends: 'gemu.dcpu.Expression',
  properties: [
    { class: 'Int', name: 'value' }
  ],
  methods: [
    function evaluate_() {
      return this.value;
    }
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'UnaryOp',
  extends: 'gemu.dcpu.Expression',
  properties: [
    'op',
    'arg',
    {
      name: 'isStatic',
      factory: function() {
        return this.arg.isStatic;
      }
    }
  ],
  methods: [
    function evaluate_(scope) {
      var av = this.arg.evaluate(scope);
      if ( this.op === '~' ) {
        return ~av;
      } else if ( this.op === '-' ) {
        return (-av)&0xffff;
      } else {
        throw 'Unknown unary op: ' + this.op;
      }
    }
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'BinaryOp',
  extends: 'gemu.dcpu.Expression',
  properties: [
    'op',
    'arg1',
    'arg2',
    {
      name: 'isStatic',
      factory: function() {
        return this.arg1.isStatic && this.arg2.isStatic;
      }
    }
  ],

  methods: [
    function evaluate_(scope) {
      var av = this.arg1.evaluate(scope);
      var bv = this.arg2.evaluate(scope);

      var res;
      if ( this.op === '+' ) {
        res = av + bv;
      } else if ( this.op === '-' ) {
        res = av - bv;
      } else if ( this.op === '*' ) {
        res = av * bv;
      } else if ( this.op === '/' ) {
        res = av * bv;
      } else if ( this.op === '<<' ) {
        res = av << bv;
      } else if ( this.op === '>>' ) {
        res = av >> bv;
      } else if ( this.op === '>>>' ) {
        res = av >>> bv;
      } else if ( this.op === '&' ) {
        res = av & bv;
      } else if ( this.op === '|' ) {
        res = av | bv;
      } else if ( this.op === '^' ) {
        res = av ^ bv;
      } else {
        throw 'Unknown binary op: ' + this.op;
      }
      return res & 0xffff;
    }
  ]
});


foam.CLASS({
  package: 'gemu.dcpu',
  name: 'Block',
  properties: [
    'start',
    [ 'isFree', false ],
    {
      name: 'contents',
      factory: function() { return []; }
    }
  ],

  methods: [
    function size() {
      var total = 0;
      for ( var i = 0; i < this.contents.length; i++ ) {
        total += this.contents[i].size();
      }
      return total;
    },

    function assemble(scope, rom) {
      var offset = this.start;
      for ( var i = 0; i < this.contents.length; i++ ) {
        offset = this.contents[i].assemble(scope, rom, offset);
      }
    }
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'BinaryInstruction',
  constants: {
    OPCODES: {
      'SET': 0x01,
      'ADD': 0x02,
      'SUB': 0x03,
      'MUL': 0x04,
      'MLI': 0x05,
      'DIV': 0x06,
      'DVI': 0x07,
      'MOD': 0x08,
      'MDI': 0x09,
      'AND': 0x0a,
      'BOR': 0x0b,
      'XOR': 0x0c,
      'SHR': 0x0d,
      'ASR': 0x0e,
      'SHL': 0x0f,
      'IFB': 0x10,
      'IFC': 0x11,
      'IFE': 0x12,
      'IFN': 0x13,
      'IFG': 0x14,
      'IFA': 0x15,
      'IFL': 0x16,
      'IFU': 0x17,
      'ADX': 0x1a,
      'SBX': 0x1b,
      'STI': 0x1e,
      'STD': 0x1f
    }
  },

  properties: [
    'opcode',
    'b',
    'a'
  ],

  methods: [
    function size() {
      return 1 + this.b.size() + this.a.size();
    },
    function assemble(scope, rom, offset) {
      var op = this.OPCODES[this.opcode.toUpperCase()] |
          (this.a.assembleInline(scope, true) << 10) |
          (this.b.assembleInline(scope, false) << 5);
      rom[offset] = op;
      offset = this.a.assemble(scope, rom, offset + 1, true);
      return this.b.assemble(scope, rom, offset, false);
    },
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'UnaryInstruction',
  constants: {
    OPCODES: {
      'JSR': 0x01,
      'INT': 0x08,
      'IAG': 0x09,
      'IAS': 0x0a,
      'RFI': 0x0b,
      'IAQ': 0x0c,
      'HWN': 0x10,
      'HWQ': 0x11,
      'HWI': 0x12,
      'LOG': 0x13,
      'BRK': 0x14,
      'HLT': 0x15,
    }
  },
  properties: [
    'opcode',
    'a',
  ],
  methods: [
    function size() {
      return 1 + this.a.size();
    },
    function assemble(scope, rom, offset) {
      var op = (this.OPCODES[this.opcode.toUpperCase()] << 5) |
          (this.a.assembleInline(scope, true) << 10);
      rom[offset] = op;
      return this.a.assemble(scope, rom, offset + 1, true);
    },
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'DatBlock',
  properties: [ 'values' ],
  methods: [
    function size() {
      return this.values.length;
    },
    function assemble(scope, rom, offset) {
      for ( var i = 0; i < this.values.length; i++ ) {
        rom[offset + i] = this.values[i].value;
      }
      return offset + this.values.length;
    },
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'LabelDef',
  properties: [
    'name'
  ],
  methods: [
    function size() {
      return 0;
    },
    function assemble(scope, rom, offset) {
      // Labels are collected in an earlier pass; nothing to assemble now.
      return offset;
    },
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'ArgReg',
  constants: {
    REGS: {
      'A': 0,
      'B': 1,
      'C': 2,
      'X': 3,
      'Y': 4,
      'Z': 5,
      'I': 6,
      'J': 7,
    },
  },
  properties: [
    'reg',
    [ 'addressed', false ],
    'indexExpr',
  ],
  methods: [
    function size() {
      return this.indexExpr ? 1 : 0;
    },

    function assembleInline() {
      var r = this.REGS[this.reg.toUpperCase()];
      if ( this.indexExpr ) {
        return r | 0x10;
      } else if ( this.addressed ) {
        return r | 0x08;
      }
      return r;
    },

    function assemble(scope, rom, offset) {
      if ( this.indexExpr ) {
        rom[offset] = this.indexExpr.evaluate(scope);
        return offset + 1;
      }
      return offset;
    }
  ]
});

// Simple, no-extra-word arguments, (PC, SP, PEEK, PUSH/POP, etc.)
foam.CLASS({
  package: 'gemu.dcpu',
  name: 'InlineArg',
  properties: [
    'value',
  ],
  methods: [
    function size() {
      return 0;
    },
    function assembleInline() {
      return this.value;
    },
    function assemble(_, __, offset) {
      return offset;
    },
  ]
});

foam.CLASS({
  package: 'gemu.dcpu',
  name: 'Pick',
  properties: [
    'expr',
  ],
  methods: [
    function size() {
      return 1;
    },
    function assembleInline() {
      return 0x1a;
    },
    function assemble(scope, rom, offset) {
      var v = this.expr.evaluate(scope);
      rom[offset] = v;
      return offset + 1;
    },
  ]
});

// Handles either long or short literals.
foam.CLASS({
  package: 'gemu.dcpu',
  name: 'LiteralArg',
  properties: [
    'value',
    [ 'addressed', false ],
  ],
  methods: [
    function isShort() {
      if ( this.addressed || ! this.value.isStatic ) return false;
      var v = this.value.evaluate(null);
      return v === 0xffff || (0 <= v && v <= 30);
    },
    function size() {
      return this.isShort() ? 0 : 1;
    },
    function assembleInline(scope, isA) {
      if ( this.isShort() && isA ) {
        var v = this.value.evaluate(null);
        return v === 0xffff ? 0x20 : 0x21 + v;
      }
      return this.addressed ? 0x1e : 0x1f;
    },
    function assemble(scope, rom, offset, isA) {
      if ( this.isShort() && isA ) return offset;
      rom[offset] = this.value.evaluate(scope);
      return offset + 1;
    },
  ]
});

// NB: In order to allow redefinition of .def values, they are maintained at
// parse time and can be overwritten.
foam.CLASS({
  package: 'gemu.dcpu',
  name: 'Assembler',
  requires: [
    'foam.parse.ImperativeGrammar',
    'gemu.dcpu.ArgReg',
    'gemu.dcpu.BinaryInstruction',
    'gemu.dcpu.BinaryOp',
    'gemu.dcpu.Block',
    'gemu.dcpu.Constant',
    'gemu.dcpu.DatBlock',
    'gemu.dcpu.Expression',
    'gemu.dcpu.InlineArg',
    'gemu.dcpu.LabelDef',
    'gemu.dcpu.LabelUse',
    'gemu.dcpu.LiteralArg',
    'gemu.dcpu.Pick',
    'gemu.dcpu.UnaryInstruction',
    'gemu.dcpu.UnaryOp',
  ],

  properties: [
    {
      name: 'grammar_',
      value: function(alt, anyChar, literal, literalIC, notChars, optional,
          range, repeat, repeat0, seq, seq1, sym) {
        return {
          START: repeat(sym('line')),

          white: alt(literal(' '), literal('\t'), literal('\r'),
              sym('lineComment')),
          lineComment: seq(literal(';'), repeat0(notChars('\n'))),
          // Whitespace within a line.
          ws: repeat0(sym('white')),
          ws1: seq(sym('white'), sym('ws')),

          // Bulk whitespace, including newlines.
          wsblock: repeat0(alt(literal('\n'), sym('white'))),

          eol: seq(sym('ws'), literal('\n')),

          line: seq1(1, sym('wsblock'), alt(
              sym('label'), sym('directive'), sym('binaryOp'), sym('unaryOp'))),

          a: alt(range('a', 'z'), range('A', 'Z'), literal('_')),
          w: alt(sym('a'), range('0', '9')),
          ident: seq(sym('a'), repeat(sym('w'))),

          label: seq(literal(':'), sym('ws'), sym('ident')),

          opcode: repeat(sym('a')),
          binaryOp: seq(sym('opcode'), sym('ws1'), sym('arg'), sym('ws'),
              literal(','), sym('ws'), sym('arg'), sym('eol')),
          unaryOp: seq(sym('opcode'), sym('ws1'), sym('arg'), sym('eol')),

          // Arguments come in several flavours: reg, [reg], [reg+expr],
          // sp, pc, ex, push/pop, pick expr, [expr], expr
          arg: alt(
            sym('bracketedArg'),
            sym('argNoExpr'),
            sym('argPick'),
            sym('exprArg')
          ),
          reg: alt(literalIC('a'), literalIC('b'), literalIC('c'),
              literalIC('x'), literalIC('y'), literalIC('z'),
              literalIC('i'), literalIC('j')),

          bracketedArg: seq1(2, literal('['), sym('ws'),
              alt(
                seq(sym('reg'), sym('ws'), sym('pm'), sym('ws'), sym('expr')),
                sym('exprArg')),
              sym('ws'), literal(']')),

          argNoExpr: alt(literalIC('sp'), literalIC('pc'), literalIC('ex'),
              literalIC('push'), literalIC('pop'), literalIC('peek')),

          argPick: seq1(2, literalIC('pick'), sym('ws1'), sym('expr')),
          exprArg: sym('expr'),

          // Directives: dat, org, def/define, fill.
          // TODO: DASM also has flag, opcode, and macro; support them too.
          directive: alt(sym('dat'), sym('org'), sym('def'), sym('fill')),
          dat: seq(optional(literal('.')), literal('dat'), sym('ws1'),
              repeat(sym('datValue'), seq(literal(','), sym('ws'))), sym('eol')),
          org: seq(optional(literal('.')), literal('org'), sym('ws1'),
              sym('number'), sym('eol')),
          def: seq(optional(literal('.')),
              alt(literal('define'), literal('def')), sym('ws1'),
              sym('ident'), sym('ws'), literal(','), sym('ws'), sym('expr'),
              sym('eol')),
          // value, amount
          fill: seq(optional(literal('.')), literal('fill'), sym('ws1'),
              sym('expr'), sym('ws'), literal(','), sym('ws'), sym('expr'),
              sym('eol')),

          datValue: alt(sym('string'), sym('expr')),
          string: seq(literal('"'), repeat(alt(literal('\\"'), notChars('"'))), literal('"')),
          number: alt(sym('hexnumber'), sym('binarynumber'), sym('decimalnumber')),
          hexnumber: seq(literal('0x'), repeat(alt(range('0', '9'), range('a', 'f'), range('A', 'F')))),
          binarynumber: seq(literal('0b'), repeat(alt(literal('0'), literal('1')))),
          decimalnumber: repeat(range('0', '9'), undefined, 1),
          char: seq1(1, literal("'"), anyChar(), literal("'")),
          pm: alt(literal('+'), literal('-')),

          expr: seq(sym('expr1'), repeat(seq(sym('ws'), literal('|'), sym('ws'), sym('expr1')))),
          expr1: seq(sym('expr2'), repeat(seq(sym('ws'), literal('^'), sym('ws'), sym('expr2')))),
          expr2: seq(sym('expr3'), repeat(seq(sym('ws'), literal('&'), sym('ws'), sym('expr3')))),
          expr3: seq(sym('expr4'), repeat(seq(sym('ws'),
              alt(literal('<<'), literal('>>>'), literal('>>')), sym('ws'), sym('expr4')))),
          expr4: seq(sym('expr5'), repeat(seq(sym('ws'),
              sym('pm'), sym('ws'), sym('expr5')))),
          expr5: seq(sym('expr6'), repeat(seq(sym('ws'),
              alt(literal('*'), literal('/')), sym('ws'), sym('expr6')))),
          expr6: alt(
              seq(sym('pm'), sym('expr6')),
              sym('term')),

          term: alt(
            seq(literal('('), sym('ws'), sym('expr'), sym('ws'), literal(')')),
            sym('char'),
            sym('number'),
            sym('ident')),
        };
      }
    },
    'defs',
    {
      name: 'parser',
      factory: function() {
        var g = this.ImperativeGrammar.create({ symbols: this.grammar_ });
        var self = this;

        // Helper for binary operations.
        // expr: seq(sym('expr1'), repeat(seq(sym('ws'), literal('|'),
        //     sym('ws'), sym('expr1')))),
        var binops = function(a) {
          var base = a[0];
          if ( ! a[1] ) return base;
          for ( var i = 0; i < a[1].length; i++ ) {
            var op = a[1][i][1];
            var rhs = a[1][i][3];
            base = self.BinaryOp.create({ op: op, arg1: base, arg2: rhs });
          }
          return base;
        };

        var regs = { A: 1, B: 1, C: 1, X: 1, Y: 1, Z: 1, I: 1, J: 1 };

        g.addActions({
          ident: function(a) {
            return a[0] + a[1].join('');
          },

          opcode: function(a) {
            return a.join('');
          },

          label: function(a) {
            return self.LabelDef.create({ name: a[2] });
          },

          //binaryOp: seq(sym('opcode'), sym('ws1'), sym('arg'), sym('ws'),
          //    literal(','), sym('ws'), sym('arg'), sym('ws'), literal('\n')),
          binaryOp: function(a) {
            return self.BinaryInstruction.create({
              opcode: a[0],
              b: a[2],
              a: a[6],
            });
          },

          //unaryOp: seq(sym('opcode'), sym('ws1'), sym('arg'), sym('ws'),
          //    literal('\n')),
          unaryOp: function(a) {
            return self.UnaryInstruction.create({
              opcode: a[0],
              a: a[2]
            });
          },

            // Directives: dat, org, def/define, fill.
            // TODO: DASM also has flag, opcode, and macro; support them too.
          dat: function(a) {
            // Dat opcodes have a list of datValues. We just emit a DatBlock.
            var values = [];
            for ( var i = 0; i < a[3].length; i++ ) {
              // Either a string or an expression.
              if ( typeof a[3][i] === 'string' ) {
                for ( var j = 0; j < a[3][i].length; j++ ) {
                  values.push(self.Constant.create({
                    value: a[3][i].charCodeAt(j)
                  }));
                }
              } else {
                values.push(a[3][i]);
              }
            }
            return self.DatBlock.create({ values: values });
          },

          org: function(a) {
            return ['org', a[3]];
          },

          def: function(a) {
            var key = a[3];
            var value = a[7];
            self.defs[key] = a[7];
          },

          fill: function(a) {
            var value = a[3];
            var amount = a[7];

            if ( ! amount.isStatic ) {
              throw '.fill amount must be a static expression';
            }

            var values = [];
            var len = amount.evaluate(null);
            for ( var i = 0; i < len; i++ ) {
              values.push(value);
            }
            return self.DatBlock.create({ values: values });
          },

          string: function(a) {
            return a[1].join('');
          },

          number: function(a) {
            return self.Constant.create({ value: +a });
          },

          hexnumber: function(a) {
            var s = a[1].join('');
            return Number.parseInt(s, 16);
          },

          binarynumber: function(a) {
            var s = a[1].join('');
            return Number.parseInt(s, 2);
          },

          decimalnumber: function(a) {
            return Number.parseInt(a.join(''), 10);
          },

          char: function(a) {
            return self.Constant.create({ value: a.charCodeAt(0) });
          },

          // Arguments come in several flavours: reg, [reg], [reg+expr],
          // sp, pc, ex, push/pop, pick expr, [expr], expr
          reg: function(a) {
            return self.ArgReg.create({ reg: a });
          },

          bracketedArg: function(a) {
            // Either an ArgReg or LiteralArg, or both.
            if ( Array.isArray(a) ) {
              a[0].indexExpr = a[4];

              if ( a[2] === '-' ) {
                a[0].indexExpr = self.UnaryOp.create({
                  op: '-',
                  arg: a[0].indexExpr
                });
              }
              a[0].addressed = true;
              return a[0];
            }

            // Otherwise, just set the 'addressed' bit.
            a.addressed = true;
            return a;
          },

          argNoExpr: function(a) {
            a = a.toUpperCase();
            if ( a === 'SP' ) {
              return self.InlineArg.create({ value: 0x1b });
            } else if ( a === 'PC' ) {
              return self.InlineArg.create({ value: 0x1c });
            } else if ( a === 'EX' ) {
              return self.InlineArg.create({ value: 0x1d });
            } else if ( a === 'PUSH' || a === 'POP' ) {
              return self.InlineArg.create({ value: 0x18 });
            } else if ( a === 'PEEK' ) {
              return self.InlineArg.create({ value: 0x19 });
            } else {
              throw 'Unknown argNoExpr: ' + a;
            }
          },

          argPick: function(a) {
            return self.Pick.create({ expr: a });
          },

          exprArg: function(a) {
            // If a is a LabelUse whose value is a general-purpose register,
            // convert it to an ArgReg.
            if ( self.LabelUse.isInstance(a) && regs[a.label.toUpperCase()] ) {
              return self.ArgReg.create({ reg: a.label });
            }
            return self.LiteralArg.create({ value: a });
          },

          expr: function(a) { return binops(a); },
          expr1: function(a) { return binops(a); },
          expr2: function(a) { return binops(a); },
          expr3: function(a) { return binops(a); },
          expr4: function(a) { return binops(a); },
          expr5: function(a) { return binops(a); },
          expr6: function(a) {
            if ( Array.isArray(a) ) {
              return self.UnaryOp.create({ op: a[0], arg: a[1] });
            } else {
              return a;
            }
          },

          term: function(a) {
            if ( Array.isArray(a) ) {
              return a[2]; // Inner expression.
            } else if ( typeof a === 'string' ) {
              return self.defs[a] || self.LabelUse.create({ label: a });
            }
            return a;
          },
        });
        return g;
      }
    },
  ],

  methods: [
    function assemble(str) {
      this.defs = {};
      // Ensure there's a newline at EOF for the eol rule to match safely.
      var ast = this.parser.parseString(str + '\n');

      // Split that into the blocks.
      var blocks = [];
      var freeBlock = this.Block.create({ isFree: true });
      var block = freeBlock;

      for ( var i = 0; i < ast.length; i++ ) {
        if ( Array.isArray(ast[i]) && ast[i][0] === 'org' ) {
          blocks.push(block);
          block = this.Block.create({ start: ast[i][1] });
          continue;
        }

        // Otherwise, add this line's content to the block.
        if ( ast[i] ) {
          block.contents.push(ast[i]);
        }
      }

      // Now find the lowest address where there's room for the free block.
      blocks.push(block);
      var sizes = [];
      for ( var i = 0; i < blocks.length; i++ ) {
        if ( blocks[i].isFree ) continue;
        sizes.push([blocks[i].start, blocks[i].size()]);
      }

      // Sort the blocks by starting location.
      sizes.sort(function(a, b) {
        return a[0] < b[0] ? -1 :
            a[0] > b[0] ? 1 : 0;
      });

      if ( sizes.length > 1 ) {
        for ( var i = 0; i < sizes.length - 1 ; i++ ) {
          if ( sizes[i][0] + sizes[i][1] > sizes[i + 1][0] ) {
            throw 'Overlapping .org regions';
          }
        }
      }

      // And finally see where there's room for the free block.
      var offset = 0;
      var size = freeBlock.size();
      for ( var i = 0; i < sizes.length; i++ ) {
        if ( offset + size <= sizes[i].start ) {
          break;
        }
        // Otherwise, advance offset to the end of this block.
        offset = sizes[i].start + sizes[i].size();
      }

      // Whether we found it and broke out of the loop, or finished running
      // through all the blocks, or there were no blocks at all, offset is the
      // start position.
      freeBlock.start = offset;

      // Now that the blocks are intact, we can resolve all labels.
      var scope = { labels: {}, defs: this.defs };
      for ( var i = 0; i < blocks.length; i++ ) {
        var offset = blocks[i].start;
        for ( var j = 0; j < blocks[i].contents.length; j++ ) {
          // Blocks contain LabelDefs, Instructions and DatBlocks, all of which
          // support size().
          var c = blocks[i].contents[j];
          if ( this.LabelDef.isInstance(c) ) {
            scope.labels[c.name] = offset;
          }
          offset += c.size();
        }
      }

      // And finally we can assemble the combined ROM.
      var rom = [];
      for ( var i = 0; i < blocks.length; i++ ) {
        blocks[i].assemble(scope, rom);
      }

      // Now the rom array is populated. Convert it to a Uint16Array.
      var buf = new ArrayBuffer(2 * rom.length);
      var arr = new DataView(buf);
      for ( var i = 0; i < rom.length; i++ ) {
        arr.setUint16(i * 2, (rom[i] || 0) & 0xffff, true);
      }

      // This is our final value to return.
      return buf;
    }
  ]
});
