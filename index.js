'use strict';

// NOTE: This does not yet implement the Notes Protocol, but does provide a single notepad saved in out.txt.

const fs = require('fs');
const Express = require('express');

const app = new Express();

app.post('/load', (req, res) => {
    try {
        const fin = fs.readFileSync('out.txt');
        res.status(200).send(fin);
    } catch(err) {
        console.error(err);
        res.status(500).send();
    }
});

app.post('/save', (req, res) => {
    const fout = fs.createWriteStream('out2.txt');
    req.pipe(fout).on('close', () => {
        fs.renameSync('out2.txt', 'out.txt');
        res.send();
    }).on('error', (error) => {
        console.error(error);
        res.status(500).send();
    });
});

app.get('/', (req, res) => {
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
    textarea.value = ''; // Likes to keep data on reload.
    load();
</script>
`);
});

app.listen(7777);
