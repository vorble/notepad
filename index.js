'use strict';

const fs = require('fs');
const path = require('path');
const Express = require('express');
const app = new Express();
const expressWs = require('express-ws')(app); // Gotta come before routes.

const NOTEPAD_DIR = process.env.NOTEPAD_DIR || path.join(__dirname, 'data');

function validateFilename(filename) {
  if (!/^[a-zA-Z0-9]{1,32}$/.test(filename)) {
    throw new Error(`Invalid filename ${ JSON.stringify(filename) }.`);
  }
}

function scary_deleteOldSer(thedir) {
  let topser = -1;
  let foundser = false;
  let toDelete = [];
  for (const _ser of fs.readdirSync(thedir)) {
    const ser = parseInt(_ser);
    if (ser == _ser) {
      if (ser > topser) {
        toDelete.push(_ser);
        topser = ser;
        foundser = true;
      }
    }
  }
  toDelete.splice(Math.max(0, toDelete.length - 5));
  for (const ser of toDelete) { 
    fs.unlinkSync(path.join(thedir, '' + ser));
  }
  return foundser ? topser : 0;
}

function checkTheDir(filename) {
  validateFilename(filename);
  const thedir = path.join(NOTEPAD_DIR, filename);
  try {
    const thedirStat = fs.statSync(thedir);
    if (!thedirStat.isDirectory()) {
      throw new Error('Filename ' + JSON.stringify(filename) + ' is not a directory.'); 
    }
  } catch (err) {
    if (err.code != 'ENOENT') {
      throw err;
    }
    fs.mkdirSync(thedir);
  }
  return thedir;
}

function loadFile(filename) {
  const thedir = checkTheDir(filename);
  const ser = scary_deleteOldSer(thedir);
  try {
    const txt = fs.readFileSync(path.join(thedir,'' + ser), { encoding: 'utf-8' });
    return { ser, txt };
  } catch (err) {
    if (err.code != 'ENOENT') {
      throw err;
    }
    return { ser, txt: '' };
  }
}

function saveFile(filename, ser, txt) {
  //console.log('Save file: ' + path.join(NOTEPAD_DIR, filename, '' + ser));
  fs.writeFileSync(path.join(NOTEPAD_DIR, filename, '' + ser), txt);
  scary_deleteOldSer(path.join(NOTEPAD_DIR, filename));
}

// TODO: Make this isomorphic.
class NotesProtocolError extends Error {}
const REQUIRE_FIELD = `function requireField(obj, field, withType) {
  if (Object.keys(obj).indexOf(field) < 0) {
    throw new NotesProtocolError('Missing required field ' + field + ' with type ' + withType + '.');
  } else if (typeof obj[field] !== withType) {
    throw NotesProtocolError('Field ' + field + ' has type ' + (typeof obj[field]) + '. Expected ' + withType + '.');
  }
}
if (typeof window !== 'undefined') window.requireField = requireField;
if (typeof global !== 'undefined') global.requireField = requireField;`;
eval(REQUIRE_FIELD);
const APPLY_EDIT = `function applyEdit(initial, beg, end, txt) {
  return initial.slice(0, beg) + txt + initial.slice(end);
}
if (typeof window !== 'undefined') window.applyEdit = applyEdit;
if (typeof global !== 'undefined') global.applyEdit = applyEdit;`;
eval(APPLY_EDIT);
const DIFF = `  function diff(a, b) {
  if (b.length == 0) {
    return ['', a, '', ''];
  }
  let istart = 0;
  while (istart < a.length && istart < b.length && a[istart] == b[istart]) {
    ++istart;
  }
  let ienda = a.length;
  let iendb = b.length;
  while (ienda > istart && iendb > istart && a[ienda-1] == b[iendb-1]) {
    --ienda;
    --iendb;
  }
  // [header, oldstuff, newstuff, footer]
  return [
    a.slice(0, istart), a.slice(istart, ienda),
    b.slice(istart, iendb), b.slice(iendb),
  ];
}
if (typeof window !== 'undefined') window.diff = diff;
if (typeof global !== 'undefined') global.diff = diff;`;
eval(DIFF);

app.get('/', (req, res) => {
  res.send('<pre>' + new Date().getTime());
});

let files = new Map();

// File names can have only A-Z, 0-9, and period.
app.ws('/:filename', (ws, req) => {
  try {
    const filename = req.params.filename;

    let file = files.get(filename);
    if (file == null) {
      file = loadFile(filename);
      file.sockets = [ws];
      files.set(filename, file);
    } else {
      file.sockets.push(ws);
    }

    console.log('got connection to '+ filename, file.sockets.length);

    function enterFailState() {
      ws.close(); // TODO: Harder?!
    }

    function onsync(m) {
      requireField(m,'beg','number');
      requireField(m,'end','number');
      // TODO: Integers -1 to max int are acceptable. No floats, no specials.
      ws.send(JSON.stringify({
        msg: 'sync',
        ser: file.ser,
        txt: m.end == -1 ? file.txt.slice(m.beg) : file.txt.slice(m.beg, m.end),
        siz: file.txt.length,
      }));
    }

    function onedit(m) {
      const nextSer = file.ser + 1;
      if (m.ser === nextSer) {
        const orig = file.txt;
        const updated = applyEdit(file.txt, m.beg, m.end, m.txt);
        saveFile(filename, nextSer, updated);
        file.txt = updated;
        file.ser = nextSer;
//        console.log('EDIT ' + JSON.stringify(m));
//        console.log('FROM ' + JSON.stringify(orig));
//        console.log('TO   ' + JSON.stringify(file.txt));
        ws.send(JSON.stringify({
          msg: 'okay',
          ser: file.ser,
        }));
        const [header, oldstuff, newstuff, footer] = diff(orig, file.txt);
        const edit = {
          msg: 'edit',
          ser: file.ser,
          beg: header.length,
          end: header.length + oldstuff.length,
          txt: m.txt,
        };
        for (const socket of file.sockets) {
          if (socket == ws) continue;
          socket.send(JSON.stringify(edit));
        }
      } else {
        ws.send(JSON.stringify({
          msg: 'nope',
          ser: m.ser,
        }));
      }
    }

    ws.on('message', (m) => {
      try {
        m = JSON.parse(m);
        requireField(m, 'msg', 'string');
        switch (m.msg) {
          case 'sync': onsync(m); break;
          case 'edit': onedit(m); break;
          default: console.log('ERROR: Unhandled msg = ' + m.msg + '.'); break;
        }
      } catch (err) {
        console.error(err);
        enterFailState();
      }
      //console.log(m);
    });

    ws.on('close', () => {
      try {
        file.sockets = file.sockets.filter(s => s != ws);
      } catch (err) {
        console.log(err);
      }
    });
  } catch (err) {
    console.error(err);
  }
});

app.get('/:filename', (req, res) => {
  res.send(`<!doctype html>
<html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notes</title>
<style>
body, html, textarea {
  margin-top: 0px;
  margin-bottom: 0px;
  margin-left: 0px;
  margin-right: 0px;
}
textarea {
  padding-top: 0px;
  padding-bottom: 0px;
  padding-left: 0px;
  padding-right: 0px;

  border: none;
  resize: none;

  width: calc(100vw - 4px);
  height: calc(100vh - 4px);
}
.fail {
  background-color: #F99;
}
.saving {
  background-color: #F0F0FF;
}
.connected {
  background-color: #FFF;
}
.disconnected {
  background-color: #CCC;
}
</style>
<body>
<textarea id="textarea" class="disconnected"></textarea>
<script>
  ${ REQUIRE_FIELD }
  ${ APPLY_EDIT }
  ${ DIFF }
  let DEBUG = true; // TODO: For now.
  let global_txt = '';
  let global_ser = 0;
  let thisEdit = null;

  textarea.value = global_txt;

  textarea.oninput = function(e) {
    doedit();
  }

  function doedit() {
    if (thisEdit != null) {
      return; // the handler for 'nope' will call doedit() again.
    }
    const [header, oldstuff, newstuff, footer] = diff(global_txt, textarea.value);
    if (oldstuff.length == 0 && newstuff.length == 0) {
      return; // No edit.
    }
    thisEdit = {
      msg: 'edit',
      ser: global_ser + 1,
      beg: header.length,
      end: header.length + oldstuff.length,
      txt: newstuff,
    };
    socket.send(JSON.stringify(thisEdit));
    textarea.className = 'saving';
  }

  function enterFailState(why) {
    console.error('FAIL STATE: ' + why);
    try {
      socket.close();
    } catch (err) {
      console.log(err); // Errors stop here.
    }
    textarea.className = 'fail';
  }

  function onsync(m) {
    if (m.siz == m.txt.length) {
      textarea.value = m.txt;
      global_txt = m.txt;
      global_ser = m.ser;
    } else {
      enterFailState('Expected full sync.');
    }
  }

  function onedit(m) {
    const nextSer = global_ser + 1;
    if (m.ser === nextSer) {
      global_txt = applyEdit(global_txt, m.beg, m.end, m.txt);
      global_ser = m.ser;
    } else {
      enterFailState('Expected ser ' + nextSer);
      return;
    }
    if (thisEdit == null) {
      // TODO: Sortof duplicated with below.
      let selstart = textarea.selectionStart;
      let selend = textarea.selectionEnd;
      const delta = m.txt.length - (m.end - m.beg);
      if (m.beg <= selstart) {
        selstart += delta;
      }
      if (m.end <= selend) {
        selend += delta;
      }
      textarea.value = global_txt;
      textarea.selectionStart = selstart;
      textarea.selectionEnd = selend;
    } else {
      if (thisEdit.beg <= m.beg && thisEdit.end > m.beg) {
        enterFailState('Overlapping edits 1');
      } else if (m.beg < thisEdit.beg && m.end > thisEdit.beg) {
        enterFailState('Overlapping edits 2');
      } else {
        const delta = m.txt.length - (m.end - m.beg);
        if (m.beg < thisEdit.beg) {
          thisEdit.beg += delta;
          thisEdit.end += delta;
        }
        let selstart = textarea.selectionStart;
        let selend = textarea.selectionEnd;
        if (m.beg <= selstart) {
          selstart += delta;
        }
        if (m.end <= selend) {
          selend += delta;
        }
        thisEdit.ser = nextSer + 1;
        textarea.value = applyEdit(global_txt, thisEdit.beg, thisEdit.end, thisEdit.txt);
        textarea.selectionStart = selstart;
        textarea.selectionEnd = selend;
      }
    }
  }

  function onnope(m) {
    if (thisEdit == null) {
      enterFailState('No pending edit.');
    } else {
      doedit();
    }
  }

  function onokay(m) {
    global_ser = thisEdit.ser;
    global_txt = applyEdit(global_txt, thisEdit.beg, thisEdit.end, thisEdit.txt);
    thisEdit = null;
    textarea.className = 'connected';
  }

  let socket = new WebSocket(location.href.replace(/^http:/,'ws:').replace(/^https:/,'wss:'));
  socket.onopen = () => {
    socket.send(JSON.stringify({msg:'sync',beg:0,end:-1}));
    textarea.className = 'connected';
  };
  socket.onmessage = (m) => {
    if (DEBUG) console.log('DEBUG:', m);
    try {
      m = JSON.parse(m.data); // TODO: If error, close socket?
      requireField(m,'msg','string');
      switch (m.msg) {
        case 'sync': onsync(m); break;
        case 'edit': onedit(m); break;
        case 'nope': onnope(m); break;
        case 'okay': onokay(m); break;
      }
    } catch (err) {
      console.log(err);
      enterFailState();
    }
  };
  socket.onclose = () => {
    textarea.className = 'disconnected';
  };
</script>
`);
});

app.listen(7777, '127.0.0.1');
