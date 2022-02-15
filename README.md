# Notepad

An auth-free, multi-user notepad for the browser.

The suggested usage of this software is behind an HTTPS reverse-proxy with an obscure URL shared between a small number of users. The application listens on 127.0.0.1:7777 and requires a WebSocket to function. Browse to the root URL to get the system time or to a resource directly within the root to start editing that file (e.g. `https://www.example.com/totally_obscure_root_url/` for the time and `https://www.example.com/totally_obscure_root_url/shopping_list` for the file).

### User Guide

* While your edits are being saved to the server, the editor area is blue (you may continue to type).
* Edits from other users show up in real time.
* Some effort is made to keep your cursor in the right place during concurrent edits, but don't expect perfection.
* If the connection is lost, the editor area is gray.
* If your edit conflicts with another edit, the editor area is gray.
* If the editor area isn't blue or white, then you should reload the page to resume editing.

### Running

* Install dependencies with `npm install`.
* Set environment variable `NOTEPAD_DIR` to tell the application where to save files; create the directory before running the software.
* Run with `node index.js`.
* Browse to `http://127.0.0.1:7777/your_file_name` to edit the file.
* File contents are placed in a directory with the resource name from the URL and are numbered by the edit's serial counter.

### More Info

* Check out the [Notes Protocol](PROTOCOL.md) for the communication protocol.
* Check out [index.js](index.js) for the complete implementation.
