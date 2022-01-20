# Notes Protocol

A user establishes and maintains a connection to the server and exchanges a series of messages encoded as JSON objects to inquire about and manipulate the contents of a file. Multiple concurrent users are possible. Each edit of the file is numbered serially; to get an edit accepted by the server, the user must predict the next edit's serial number (it should be one after the last serial they have seen). Each user is trusted to use serial numbers appropriately. Edits from another user show up as unsolicited edit messages.

The connection can be implemented with a WebSocket.

## Common Fields

* `msg` - The message identifier.
* `ser` - Incremented for each edit to file.
* `txt` - A portion or all of the file's text.
* `siz` - The file's total size.

### Sync Request

To request portions of the file, its serial, and its size.

* Client to Server
* Use `beg = end = 0` to "stat" the file to inquire about its size.
* Use `beg = 0` and `end = -1` to request the entire file.

```
{
  "msg": "sync",
  "beg": 0,
  "end": -1
}
```

### Sync Message

A response to a sync request.

* Server to Client

```
{
  "msg": "sync",
  "ser": 1234,
  "txt": "...",
  "siz": 9999
}
```

### Edit Message

To replace a portion of the file.

* Client to Server
* Use `beg = end = siz` when you are appending to the end of the file.
* Use `beg = 0` and `end = -1` when overwriting the entire file.
* Use the last sync or edit message's `ser + 1` for this message's `ser`. 

```
{
  "msg": "edit",
  "ser": 1235,
  "beg": 0,
  "end": 100,
  "txt": "..."
}
```

### Edited Message

A response to an edit message that was accepted. These may arrive at any time from other user activity.

* Server to Client

```
{
  "msg": "edit",
  "ser": 1234,
  "beg": 0,
  "end": 100,
  "txt": "..."
}
```

### Edit Conflict Message

A response to an edit message that was rejected.

* Server to Client

```
{
  "msg": "nope",
  "ser": 1235
}
```
