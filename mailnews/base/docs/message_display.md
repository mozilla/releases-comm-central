# New Message Display

This document describes the new (c. 2026) code for getting a message from the back end to display
on the screen. Once it's up and running, messages will be displayed in a child process, which
brings security and stability benefits compared to display in the main process.

[Email Protocols](email_protocols) partially describes the old (c. 1996) code. It is very complex.

```{warning}
This is a work in progress. It is disabled by default. Feel free to flip the preference
`mail.reader.remote` to try it, but you do so at your own risk.
```

## How it works:

- The front end assembles a `mail-message` URL and tells the message display browser element to
  load it. This is much less complicated than previously.
- The browser element calls `NewChannel` on `MailMessageProtocolHandler` (as it's the registered
  handler of the `mail-message` protocol) which creates and returns an instance of
  `MailMessageChannel`. This happens in a child process.
- The browser element calls `BeginAsyncRead` on the channel.
- The `MailMessageChannel` object makes an IPC call to the parent process, requesting the message
  data.
- `NeckoParent` handles the IPC call in the parent process, and forwards it to `MailMessageParent`
  (to minimise Thunderbird's footprint in the Firefox code – we can't easily avoid having a piece
  in NeckoParent). `MailMessageParent` talks to the back end and retrieves the message data as an
  `nsIInputStream`, then answers the IPC request returning the stream.
- `MailMessageChannel` receives the stream and passes it back to the browser element.
- As before, the browser element creates an instance of `nsStreamConverter` to convert the message
  from `message/rfc822` to `text/html` for display. `MailMessageChannel` implements
  `nsIMailChannel`, so progress events, headers, and attachment data are also sent to the channel
  as the stream converter processes the message. These are relayed to front end for display in the
  UI (see `MailMessageChild.sys.mjs`/`MailMessageParent.sys.mjs`).

Message parts (i.e. images to display or attachments) follow exactly the same process, except that
`MailMessageChannel` uses `nsStreamConverter` to extract only the requested part from the message
data (the whole message is sent from parent to child process).

## Known problems:

- At the time of writing, this code only handles messages which exist on disk – .eml files or
  messages which are in offline storage. Messages that need to be fetched from a server are not
  handled.
- S/MIME and OpenPGP encrypted messages cannot be decrypted in a child process, as child processes
  are denied access to the key database. We'll have to either decrypt the message in the parent
  process, or make some way to request keys from the parent process.
- Using a child process causes slightly different behaviour in the front end, but that's beyond the
  scope of this document.

## Still to do:

- Fix the above problems.
- If a message includes an image (or many images) to display, we shouldn't have to request the
  whole message from the parent process again to get each part. A simple in-memory cache in the
  child process would fix this.
- Remove the existing code. There is [a large amount of ugly code](email_protocols) that will made
  obsolete by this new code. Much rejoicing shall be had.
