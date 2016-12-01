/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2012, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

ace.define('ace/mode/dcpu_highlight_rules', ['require', 'exports', 'module',
  'ace/lib/oop', 'ace/mode/text_highlight_rules'], function(require, exports, module) {
"use strict";

var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var AssemblyDCPUHighlightRules = function() {
    // regexp must not have capturing parentheses. Use (?:) instead.
    // regexps are ordered -> the first match is used

    this.$rules = { start:
       [ { token: 'keyword.control.assembly',
            regex: '\\b(?:set|add|sub|mul|mli|div|dvi|mod|mdi|and|bor|xor|shr|asr|shl|ifb|ifc|ife|ifn|ifg|ifa|ifl|ifu|adx|sbx|sti|std|jsr|int|iag|ias|rfi|iaq|hwn|hwq|hwi|log|brk|hlt)\\b',
           caseInsensitive: true },
         { token: 'variable.register.assembly',
           regex: '\\b(?:a|b|c|x|y|z|i|j|ex|pc|sp|push|pop|peek|pick)\\b',
           caseInsensitive: true },
         { token: 'constant.character.decimal.assembly',
           regex: '\\b[0-9]+\\b' },
         { token: 'constant.character.hexadecimal.assembly',
           regex: '\\b0x[A-F0-9]+\\b',
           caseInsensitive: true },
         { token: 'string.assembly', regex: /"([^\\"]|\\.)*"/ },
         { token: 'support.function.directive.assembly',
           regex: '^\\.(?:def|define|dat|org|fill|flag|macro|opcode)\\b',
           caseInsensitive: true },
         { token: 'entity.name.function.assembly', regex: '^\\s*:[\\w._]+' },
         { token: 'comment.assembly', regex: ';.*$' } ]
    }

    this.normalizeRules();
};

AssemblyDCPUHighlightRules.metaData = { fileTypes: [ 'asm' ],
      name: 'Assembly DCPU',
      scopeName: 'source.assembly' }


oop.inherits(AssemblyDCPUHighlightRules, TextHighlightRules);

exports.AssemblyDCPUHighlightRules = AssemblyDCPUHighlightRules;
});
ace.define("ace/mode/dcpu",["require","exports","module","ace/lib/oop",
  "ace/mode/text","ace/mode/dcpu_highlight_rules"], function(e,t,n){
    "use strict";
    var r=e("../lib/oop"),
      i=e("./text").Mode,
      s=e("./dcpu_highlight_rules").AssemblyDCPUHighlightRules,
      u=function(){this.HighlightRules=s};
    r.inherits(u,i),
      function(){this.lineCommentStart=";",this.$id="ace/mode/dcpu"}.call(u.prototype),
      t.Mode=u
  });
