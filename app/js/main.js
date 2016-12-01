// Opens a websocket to the server.
function openConnection() {
  var ws = new WebSocket('ws://' + window.location.host + '/gemu');
  ws.binaryType = 'arraybuffer';
  return new Promise(function(resolve, reject) {
    ws.onopen = function() { resolve(ws); };
    ws.onerror = reject;
  });
}

const OFF_TREE = 0;
const OFF_DEVICE = 4;
const OFF_PACKET = 6;
const OFF_TRANSACTION = 8;
const OFF_LENGTH = 10;
const OFF_DATA = 12;

const PT_CLASS_LIST = 0x0001;
const PT_CLASS_LIST_RESP = 0x8001;

var nextTX = 1;

// A map of items blocked on receiving particular messages.
// Map<tx, Map<message type, [handler]>>
const awaiting = {};

// A map of received items that haven't yet been requested.
// Map<tx, Map<message type, [message]>>
const received = {};

function popMap(map, a, b) {
  if (map[a] && map[a][b]) {
    var arr = map[a][b];
    var ret = arr.shift();
    if (!arr.length) {
      delete map[a][b];
    }
    return ret;
  }
  return null;
}

function pushMap(map, a, b, value) {
  if (!map[a]) {
    map[a] = {};
  }
  var mid = map[a];
  if (!mid[b]) {
    mid[b] = [];
  }
  mid[b].push(value);
}

function awaitResponse(tx, respType) {
  var msg = popMap(received, tx, respType);
  if (msg) {
    return Promise.resolve(msg);
  }

  // Otherwise, add myself to the awaiting list.
  return new Promise(function(resolve, reject) {
    pushMap(awaiting, tx, respType, resolve);
  });
}

function onMessage(evt) {
  // Check for handlers of this message.
  var msg = evt.data; // Raw arraybuffer.
  var dv = new DataView(msg);
  var tx = dv.getUint16(OFF_TRANSACTION, true);
  var type = dv.getUint16(OFF_PACKET, true);

  var nextWaiter = popMap(awaiting, tx, type);
  if (nextWaiter) {
    nextWaiter(msg);
  } else {
    pushMap(received, tx, type, msg);
  }
}

const socketP = openConnection();
socketP.then(function(s) { s.onmessage = onMessage; });

function sendMessage(tree, device, packet, tx, len, data) {
  var buf = new ArrayBuffer(12 + len);
  var dv = new DataView(buf);
  dv.setUint32(OFF_TREE, tree, true);
  dv.setUint16(OFF_DEVICE, device, true);
  dv.setUint16(OFF_PACKET, packet, true);
  dv.setUint16(OFF_TRANSACTION, tx, true);
  dv.setUint16(OFF_LENGTH, len, true);

  if (len > 0) {
    var array = new Uint8Array(buf, OFF_DATA, len);
    var src = new Uint8Array(data);
    for (var i = 0; i < len; i++) {
      array[i] = src[i];
    }
  }

  socketP.then(function(s) { s.send(buf); });
}


// Class: ReadStream
function ReadStream(buf, opt_offset) {
  this.offset = opt_offset || 0;
  this.length = buf.byteLength;
  this.buffer = new DataView(buf);
}

ReadStream.prototype.uint8 = function() {
  return this.buffer.getUint8(this.offset++);
};
ReadStream.prototype.uint16 = function() {
  const ret = this.buffer.getUint16(this.offset, true);
  this.offset += 2;
  return ret;
};
ReadStream.prototype.uint32 = function() {
  const ret = this.buffer.getUint32(this.offset, true);
  this.offset += 4;
  return ret;
};

ReadStream.prototype.string = function() {
  var s = '';
  var len = this.uint16();
  while (len > 0) {
    len--;
    s += String.fromCharCode(this.uint8());
  }
  return s;
};

ReadStream.prototype.eof = function() {
  return this.offset >= this.length;
};


foam.CLASS({
  package: 'gemu.model',
  name: 'DeviceClass',
  properties: ['id', 'name', 'description']
});

foam.CLASS({
  package: 'gemu.dao',
  name: 'ClassDAO',
  requires: [
    'gemu.model.DeviceClass',
  ],

  properties: [
    { name: 'of', factory: function() { return this.DeviceClass; } },
  ],

  methods: [
    function select(sink) {
      // Just select all.
      sink = sink || foam.dao.ArraySink.create();
      var tx = nextTX++;
      sendMessage(0, 0, PT_CLASS_LIST, tx, 0);
      var self = this;
      return awaitResponse(tx, PT_CLASS_LIST_RESP).then(function(resp) {
        // Dump the results from the data section.
        var s = new ReadStream(resp, OFF_DATA);
        var len = s.uint16(); // Array length, which I'm ignoring.
        while (!s.eof()) {
          // ClassID uint32
          // Name string
          // Desc string
          var id = s.uint32();
          var name = s.string();
          var desc = s.string();
          sink.put(self.DeviceClass.create({
            id: id,
            name: name,
            description: desc
          }));
        }
        sink.eof();
        return sink;
      });
    }
  ]
});


foam.CLASS({
  package: 'gemu.ui',
  name: 'Controller',
  extends: 'foam.u2.Element',

  requires: [
    'foam.dao.CachingDAO',
    'foam.dao.MDAO',
    'foam.u2.DAOList',
    'gemu.dao.ClassDAO',
    'gemu.dcpu.Assembler',
    'gemu.model.DeviceClass',
  ],

  exports: [
    'assembler',
    'classDAO',
  ],

  properties: [
    {
      class: 'foam.dao.DAOProperty',
      name: 'classDAO',
      view: { class: 'foam.u2.DAOList' },
      factory: function() {
        return this.CachingDAO.create({
          of: this.DeviceClass,
          src: this.ClassDAO.create(),
          delegate: this.MDAO.create({ of: this.DeviceClass })
        });
      }
    },
    {
      name: 'assembler',
      factory: function() {
        return this.Assembler.create();
      }
    },
  ],

  actions: [
    {
      name: 'assemble',
      code: function(X) {
        var buf = X.assembler.assemble(this.editor.getValue());
        var dv = new DataView(buf);
        for ( var i = 0; i < buf.byteLength; i += 2 ) {
          console.log((i/2).toString(16) + ': ' + dv.getUint16(i, true).toString(16));
        }
      }
    }
  ],

  methods: [
    function initE() {
      this.start(this.DAOList, { data: this.classDAO }).end();
      this.start(this.ASSEMBLE).end();
    },
  ]
});

