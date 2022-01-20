'use strict';

const fs = require('fs');
const Express = require('express');
const app = new Express();
const expressWs = require('express-ws')(app); // Gotta come before routes.

class NotesProtocolError extends Error {}

function validateFilename(filename) {
  if (!/^[A-Z-09]{1,32}$/.test(filename)) {
    throw new NotesProtocolError(`Invalid filename.`);
  }
}

function requireField(obj, field, withType) {
  if (!(field in obj)) {
    throw new NotesProtocolError(`Missing required field ${ field } with type ${ withType }.`);
  } else if (typeof obj[field] !== withType) {
    throw NotesProtocolError(`Field ${ field } has type ${ typeof obj[field] }. Expected ${ withType }.`);
  }
}

app.get('/', (req, res) => {
  res.send('<pre>' + new Date().getTime());
});

// File names can have only A-Z, 0-9, and period.
app.ws('/:filename', (ws, req) => {
  console.log('got connection')
  ws.on('message', (msg) => {
    console.log(msg);
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
</style>
<body>
<textarea id="textarea"></textarea>
<script>
/*
  let expected = 0;
  textarea.oninput = function(e) {
    const toExpect = ++expected;
    setTimeout(() => {
      if (expected == toExpect) {
        save(textarea.value);
      }
    }, 250);
  }
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
  textarea.value = ''; // Likes to keep data on reload.
  let socket = new WebSocket(location.href.replace(/^https?:/,'ws:'));
  socket.onopen = () => {
    socket.send(JSON.stringify({msg:'sync',beg:0,end:-1}));
  };
  socket.onmessage = (message) => {
    console.log('message', message);
  };
</script>
`);
});

/*
{
  "msg": "edited",
  "ser": 1234,
  "beg": 0,
  "end": 100,
  "txt": "..."
}
*/

app.listen(7777);
