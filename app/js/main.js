
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

          // Set the global, since I need that for some other requests.
          console.log(id, name);
          if ( name === 'dcpu' ) {
            CLASS_ID_DCPU = id;
          }

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
  package: 'gemu.ide',
  name: 'Project',
  properties: [
    'id',
    {
      class: 'String',
      name: 'name',
    },
  ],
});

foam.CLASS({
  package: 'gemu.ide',
  name: 'File',
  properties: [
    'id',
    {
      class: 'String',
      name: 'name',
    },
    {
      class: 'String',
      name: 'contents',
    },
  ],
});

foam.RELATIONSHIP({
  sourceModel: 'gemu.ide.Project',
  targetModel: 'gemu.ide.File',
  forwardName: 'files',
  inverseName: 'project',
  sourceDAOKey: 'projectDAO',
  targetDAOKey: 'fileDAO',
});


foam.CLASS({
  package: 'gemu.ui',
  name: 'Editor',
  extends: 'foam.u2.View',

  imports: [
    'fileDAO',
  ],

  methods: [
    function initE() {
      var self = this;
      this.start().end();

      var editor;

      this.data$.sub(function() {
        if ( self.data && editor ) {
          editor.setValue(self.data.contents, 1);
        }
      });

      this.onload.sub(function() {
        var e = ace.edit(self.id);
        e.setTheme('ace/theme/tomorrow_night_bright');
        e.getSession().setMode('ace/mode/dcpu');

        editor = e;

        if ( self.data ) {
          editor.setValue(self.data.contents, 1);
        }
        editor.on('change', self.contentUpdate.bind(self, editor));
      });
    },
  ],

  listeners: [
    {
      name: 'contentUpdate',
      isFramed: true,
      code: function(editor) {
        this.data.contents = editor.getValue();
        this.fileDAO.put(this.data);
      }
    },
  ],
});

foam.CLASS({
  package: 'gemu.ui',
  name: 'FileNameView',
  extends: 'foam.u2.View',
  methods: [
    function initE() {
      this.add(this.data$.dot('name'));
    },
  ]
});

foam.CLASS({
  package: 'gemu.ui',
  name: 'ProjectView',
  extends: 'foam.u2.View',
  requires: [
    'foam.dao.NullDAO',
    'foam.mlang.predicate.Eq',
    'foam.u2.DAOList',
    'gemu.ide.File',
    'gemu.model.Device',
    'gemu.ui.Editor',
  ],

  imports: [
    'assembler',
    'fileDAO',
  ],

  properties: [
    'file',
    'newFileName',
  ],

  methods: [
    function initE() {
      var self = this;
      var nullDAO = this.NullDAO.create({ of: this.File });
      this.cssClass(this.myCls()).start()
          .cssClass(this.myCls('files'))
          .start('h3').add('Files').end()
          .start()
              .startContext({ data: this })
                  .start(this.NEW_FILE_NAME, { onKey: true }).end()
                  .start(this.NEW_FILE, { data: this }).end()
              .endContext()
          .end()
          .start(this.DAOList, {
            data$: this.data$.map(function(d) {
              return d && d.files ? d.files : nullDAO;
            }),
            rowView: { class: 'gemu.ui.FileNameView' },
          })
              .call(function() { this.rowClick.sub(self.fileSelected); })
          .end()
          .start().cssClass(this.myCls('spacer')).end()
          .start()
              .startContext({ data: this })
              .start(this.RUN_PROJECT).end()
              .endContext()
          .end()
      .end()
      .start()
          .cssClass(this.myCls('editor'))
          .start(this.Editor, { data$: this.file$ }).end()
      .end();
    },
  ],

  listeners: [
    function fileSelected(_, __, file) {
      if ( ! this.file ) {
        this.file = file;
        return;
      }

      var self = this;
      this.fileDAO.put(this.file).then(function() {
        self.file = file;
      });
    },
  ],

  actions: [
    {
      name: 'newFile',
      isEnabled: function(newFileName) { return !! newFileName; },
      code: function() {
        var self = this;
        this.data.files.put(this.File.create({ name: this.newFileName }))
            .then(function(f) {
              self.newFileName = '';
              self.file = f;
            });
      }
    },

  ],

  axioms: [
    foam.u2.CSS.create({
      code: function CSS() {/*
        ^ {
          align-items: stretch;
          display: flex;
          flex-grow: 1;
          height: 800px;
        }
        ^files {
          flex-grow: 0;
          flex-shrink: 0;
          width: 200px;
        }
        ^editor {
          flex-grow: 1;
        }

        .ace_editor {
          height: 100%;
          width: 100%;
        }
      */}
    })
  ],
});

foam.CLASS({
  package: 'gemu.ui',
  name: 'EditingEnvironment',
  extends: 'foam.u2.View',
  requires: [
    'foam.dao.EasyDAO',
    'foam.u2.DAOList',
    'foam.u2.view.ChoiceView',
    'gemu.ide.File',
    'gemu.ide.Project',
    'gemu.ui.MachineDetailView',
    'gemu.ui.ProjectView',
  ],

  imports: [
    'machine',
  ],

  exports: [
    'fileDAO',
    'projectDAO',
  ],

  properties: [
    {
      class: 'foam.dao.DAOProperty',
      name: 'projectDAO',
      factory: function() {
        return this.EasyDAO.create({
          of: this.Project,
          daoType: 'IDB',
          cache: true,
          seqNo: true
        });
      }
    },
    {
      class: 'foam.dao.DAOProperty',
      name: 'fileDAO',
      factory: function() {
        return this.EasyDAO.create({
          of: this.File,
          daoType: 'IDB',
          cache: true,
          seqNo: true
        });
      }
    },
    'project',
    'newProjectName',
  ],

  methods: [
    function initE() {
      var self = this;
      this.start()
          .cssClass(this.myCls('project-choice'))
          .start('h3').add('Projects').end()
          .start(this.ChoiceView, {
            data$: this.project$,
            dao: this.projectDAO,
            objToChoice: function(project) {
              return [project, project.name];
            }
          }).end()
          .startContext({ data: this })
              .start(this.NEW_PROJECT_NAME, { onKey: true }).end()
              .start(this.NEW_PROJECT).end()
          .endContext()
      .end();

      this.start().cssClass(this.myCls('project-editors'))
          .start(this.ProjectView, { data$: this.project$ })
              .show(this.project$)
          .end()

          .start().cssClass(this.myCls('project-machine'))
              .add(this.slot(function(m) {
                console.log('ee slot', m);
                return m ? self.MachineDetailView.create({ data: m }) : self.E();
              }, this.machine$))
          .end()
      .end();
    },
  ],

  actions: [
    {
      name: 'newProject',
      isEnabled: function(newProjectName) { return !!newProjectName; },
      code: function() {
        var self = this;
        this.projectDAO.put(this.Project.create({
          name: this.newProjectName
        })).then(function(p) {
          self.newProjectName = '';
          self.project = p;
        }, alert);
      }
    },
  ],

  axioms: [
    foam.u2.CSS.create({
      code: function CSS() {/*
        ^project-editors {
          align-items: stretch;
          display: flex;
          height: 800px;
        }

        ^project-machine {
          flex-grow: 0;
          flex-shrink: 0;
          width: 200px;
        }
      */}
    })
  ],
});

foam.CLASS({
  package: 'gemu.ui',
  name: 'DeviceClassView',
  extends: 'foam.u2.View',
  methods: [
    function initE() {
      this.start('div')
          .add(this.data.name)
          .add(this.data.description)
      .end();
    },
  ]
});

foam.CLASS({
  package: 'gemu.ui',
  name: 'MachineCitationView',
  extends: 'foam.u2.View',
  methods: [
    function initE() {
      this.add(this.data$.dot('name'));
      this.add(this.data$.dot('state'));
    },
  ],
});

foam.CLASS({
  package: 'gemu.ui',
  name: 'MachineDetailView',
  extends: 'foam.u2.View',
  requires: [
    'foam.dao.PromisedDAO',
    'foam.u2.DAOList',
    'foam.u2.view.ChoiceView',
    'gemu.model.Device',
  ],
  imports: [
    'classDAO',
    'deviceDAO',
  ],

  properties: [
    'newDeviceClass',
  ],

  methods: [
    function initE() {
      var self = this;

      this.cssClass(this.myCls());
      this.startContext({ data$: this.data$ });
      this.add(this.slot(function(dev) {
            var e = self.E('div');
            if ( ! dev ) return e;
            e.start(self.RUN_PROJECT).end()
                .start(self.RESET_PROJECT).end()
                .start(self.RESUME_PROJECT).end()
                .start(self.PAUSE_PROJECT).end();
            return e;
          }, this.data$))
          .start()
              .cssClass(this.myCls('devices'))
              .start(this.ChoiceView, {
                data$: this.newDeviceClass$,
                dao: this.classDAO,
                objToChoice: function(dev) {
                  return [dev, dev.description];
                },
              }).end()
              .startContext({ data: this })
                  .start(this.NEW_DEVICE).end()
              .endContext()
          .end()
          .start(this.DAOList, {
            data: this.data.devices,
            rowView: function(args, X) {
              var cls = self.Device.DEVICE_UI_CLASSES[args.data.classID];
              return cls ? foam.lookup(cls).create({ data: args.data }, X) :
                  this.E();
            },
          }).end()
      .endContext();
    },

    function startDT_() {
      this.devMsg_(PT_START_DT, PT_START_DT_RESP);
    },
    function stopDT_() {
      this.devMsg_(PT_STOP_DT, PT_STOP_DT_RESP);
    },
    function resetDT_() {
      this.devMsg_(PT_RESET_DT, PT_RESET_DT_RESP);
    },
    function devMsg_(pt, ptr) {
      // Start the device tree.
      var tx = nextTX++;
      sendMessage(self.data.id, 0, PT_START_DT, tx, 0);
      awaitResponse(ptr, tx).then(function(resp) {
        var s = new ReadStream(resp, OFF_DATA);
        var err = s.uint32();
        if (err !==  0) {
          console.error('Error ' + err + ' while trying to toggle device tree state');
        }
      });
    },
  ],

  actions: [
    {
      name: 'runProject',
      isAvailable: function(data) {
        return data && data.state === 'fresh';
      },
      code: function() {
        // Assemble the currently selected file.
        var asm = this.assembler.assemble(this.file.contents);
        var data = new ArrayBuffer(asm.length * 2 + 2);
        var dv = new DataView(data);
        dv.setUint16(0, asm.length, true);
        for ( var i = 0; i < asm.length; i++ ) {
          dv.setUint16(2 * i + 2, asm[i], true);
        }

        var self = this;
        // Find the DCPU device in this tree.
        this.data.devices.where(this.Eq.create({
          arg1: this.Device.NAME,
          arg2: 'dcpu',
        })).select().then(function(a) {
          var dcpu = a.a[0];
          sendMessage(self.data.id, dcpu.id, PT_DEVICE_MESSAGE, nextTX++,
            data.length, data);

          self.startDT_();
        });
      }
    },
    {
      name: 'resumeProject',
      label: 'Resume',
      isAvailable: function(data) { return data && data.state === 'stopped'; },
      code: function() {
        this.startDT_();
      }
    },
    {
      name: 'pauseProject',
      label: 'Pause',
      isAvailable: function(data) { return data && data.state === 'running'; },
      code: function() {
        this.stopDT_();
      }
    },
    {
      name: 'resetProject',
      label: 'Reset',
      isAvailable: function(data) { return data && data.state !== 'fresh'; },
      code: function() {
        this.resetDT_();
      }
    },
  ],
});


foam.CLASS({
  package: 'gemu.ui',
  name: 'Controller',
  extends: 'foam.u2.Element',

  requires: [
    'foam.dao.CachingDAO',
    'foam.dao.EasyDAO',
    'foam.dao.MDAO',
    'foam.u2.DAOList',
    'gemu.dao.ClassDAO',
    'gemu.dao.DeviceDAO',
    'gemu.dcpu.Assembler',
    'gemu.model.Device',
    'gemu.model.DeviceClass',
    'gemu.model.DeviceTree',
    'gemu.model.MachineDAO',
    'gemu.model.StateSync',
    'gemu.ui.EditingEnvironment',
  ],

  exports: [
    'assembler',
    'classDAO',
    'deviceDAO',
    'machine',
    'machineDAO',
    'memory',
    'stateSync',
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
          cache: this.MDAO.create({ of: this.DeviceClass })
        });
      }
    },
    {
      name: 'assembler',
      factory: function() {
        return this.Assembler.create();
      }
    },
    /*
    {
      class: 'Boolean',
      name: 'machineMode',
      value: true, // Probably flip this back, later on.
    },
    */
    {
      class: 'foam.dao.DAOProperty',
      name: 'machineDAO',
      documentation: 'A DAO of my known device trees.',
      factory: function() {
        return this.MachineDAO.create();
      }
    },
    {
      class: 'foam.dao.DAOProperty',
      name: 'deviceDAO',
      documentation: 'DAO for all devices in all trees.',
      factory: function() {
        return this.CachingDAO.create({
          of: this.Device,
          cache: this.MDAO.create({ of: this.Device }),
          src: this.DeviceDAO.create()
        });
      }
    },
    {
      name: 'stateSync',
      factory: function() {
        var ss = this.StateSync.create();
        window.__stateSyncDrop = ss.sync;
        return ss;
      }
    },
    {
      name: 'memory',
      factory: function() {
        var mem = [];
        window.__memSyncDrop = function(msg) {
          var s = new ReadStream(msg, OFF_DATA);
          var sections = s.uint16();
          for ( var i = 0; i < sections; i++ ) {
            var start = s.uint16();
            var count = s.uint8();
            for ( var j = 0; j < count*16; j++ ) {
              mem[start + j] = s.uint16();
            }
          }
        };
      }
    },
    {
      // The actual running DeviceTree.
      name: 'machine'
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
      var self = this;
      // Touch classDAO so that it loads the classes.
      this.classDAO.select().then(function() {
        // Try to construct a device tree with the standard equipment.
        var dt = self.DeviceTree.create({ name: 'dev' });
        return self.machineDAO.put(dt);
      }).then(function(dt) {
        return Promise.all([
          // TODO: Make this a configurable device template.
          dt.devices.put({ classID: 12289 }), // DCPU
          dt.devices.put({ classID: 1 }), // Clock
          dt.devices.put({ classID: 2 }), // Floppy
          dt.devices.put({ classID: 5 }), // Keyboard
          dt.devices.put({ classID: 6 }), // LEM1802 display
          dt.devices.put({ classID: 7 })  // ROM
        ]).then(function() { self.machine = dt; });
      });

      // Likewise touch the memory and stateSync.
      this.memory;
      this.stateSync;

      this.startContext({ data: this })
          .start()
              .start(this.EditingEnvironment).end()
          .end()
      .endContext();
    },
  ]
});

