'use strict';

const fs = require('fs');
const Express = require('express');
const app = new Express();
const expressWs = require('express-ws')(app); // Gotta come before routes.

function validateFilename(filename) {
  if (!/^[A-Z-09]{1,32}$/.test(filename)) {
    throw new NotesProtocolError(`Invalid filename.`);
  }
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
  console.log(istart, ienda, iendb);
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

let g_txt = 'this is the text\n';
let g_ser = 0;
let sockets = [];

// File names can have only A-Z, 0-9, and period.
app.ws('/:filename', (ws, req) => {
  sockets.push(ws);

  console.log('got connection');

  function enterFailState() {
    ws.close(); // TODO: Harder?!
  }

  function onsync(m) {
    requireField(m,'beg','number');
    requireField(m,'end','number');
    // TODO: Integers -1 to max int are acceptable. No floats, no specials.
    ws.send(JSON.stringify({
      msg: 'sync',
      ser: g_ser,
      txt: m.end == -1 ? g_txt.slice(m.beg) : g_txt.slice(m.beg, m.end),
      siz: g_txt.length,
    }));
  }

  function onedit(m) {
    const nextSer = g_ser + 1;
    if (m.ser === nextSer) {
      const orig = g_txt;
      g_txt = applyEdit(g_txt, m.beg, m.end, m.txt);
      console.log('EDIT ' + JSON.stringify(m));
      console.log('FROM ' + JSON.stringify(orig));
      console.log('TO   ' + JSON.stringify(g_txt));
      ++g_ser;
      ws.send(JSON.stringify({
        msg: 'okay',
        ser: g_ser,
      }));
      const [header, oldstuff, newstuff, footer] = diff(orig, g_txt);
      const edit = {
        msg: 'edit',
        ser: g_ser,
        beg: header.length,
        end: header.length + oldstuff.length,
        txt: m.txt,
      };
      for (const socket of sockets) {
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
      return;
    }
    console.log(m);
  });

  ws.on('close', () => {
    sockets = sockets.filter(s => s != ws);
  });
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
  background: red;
}
</style>
<body>
<textarea id="textarea"></textarea>
<script>
/*
  function load() {
    var http = new XMLHttpRequest();
    var url = 'load';
    http.open('POST', url, true);
    http.onreadystatechange = function() {
      //console.log(http);
      if (http.readyState == 4 && http.status == 200) {
        textarea.value = http.response;
      }
    }
    http.send();
  }
  function save(text) {
    var http = new XMLHttpRequest();
    var url = 'save';
    http.open('POST', url, true);
    http.setRequestHeader('Content-type', 'application/octet-stream');
    http.onreadystatechange = function() {
      //console.log(http);
      if (http.readyState == 4) {
        console.log('save(): POST received ' + http.status + ' response.');
        if (http.status >= 400) {
          console.error(http);
        }
      }
    }
    http.send(text);
  }
  load();
  */
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
  }

  function enterFailState(why) {
    console.error('FAIL STATE: ' + why);
    try {
      socket.close();
    } catch (err) {
      console.log(err); // Errors stop here.
    }
    textarea.classList.add('fail');
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
      textarea.value = global_txt;
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
        if (m.beg <= textarea.selectionStart) {
          textarea.selectionStart += delta;
        }
        if (m.end <= textarea.selectionEnd) {
          textarea.selectionEnd += delta;
        }
        thisEdit.ser = nextSer + 1;
        textarea.value = applyEdit(global_txt, thisEdit.beg, thisEdit.end, thisEdit.txt);
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
  }

  let socket = new WebSocket(location.href.replace(/^https?:/,'ws:'));
  socket.onopen = () => {
    socket.send(JSON.stringify({msg:'sync',beg:0,end:-1}));
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
</script>
`);
});

/*
{
  "msg": "edit",
  "ser": 1234,
  "beg": 0,
  "end": 100,
  "txt": "..."
}
*/

app.listen(7777);
