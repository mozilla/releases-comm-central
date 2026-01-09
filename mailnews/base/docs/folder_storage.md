# Folder Storage

Thunderbird uses a per-folder database model and this document aims to describe
the roles and interactions of a folder, its database, and the local storage.

## Foundational concepts

It is important to note that locally each folder will contain both:

* message database file - contains metadata about each message in the folder
(relatively small)
* message store file - contains the raw message information of each message in
the folder (can be quite large). Currently this is either an `mbox` file or a
`maildir` directory.

## Message Database File

Folders group messages and each folder has a message database file ending in
`.msf` (e.g. `INBOX.msf`) that describes what is in the folder. This file is a
[Mork](https://en.wikipedia.org/wiki/Mork_(file_format))
database file that contains the header information for each message in the
folder.

```{note}
Mork is a Mozilla specific technology that will eventually be phased out with
upcoming work to implement a global message database ([Bug
1572000](https://bugzilla.mozilla.org/show_bug.cgi?id=1572000)) where it will be
replaced with a single SQLite database that spans all folders.
```

This database file contains metadata about each message, some of which parsed
from the message headers, and some are added later (e.g. read status, tags, spam
score). You can find a [list of the parsed headers
here](https://searchfox.org/comm-central/source/mailnews/local/src/nsParseMailbox.cpp#595).
Some of the database header fields have data that is "massaged" from one or more
message headers. So it's not always a case of verbatim copying values for the
headers we're interested in. Another point worth noting is that there _are_
fields in the database which don't appear in the message headers. For example,
the spam rating we assign.

The way the database is updated depends on the folder's protocol (IMAP, EWS,
etc.) and the folder knows what protocol it's based on. In this way, the folder
and protocol are tightly intertwined. Also the folder has to know about the
protocol in order to issue commands to the server ("set the 'read' flag on
message 1453"), and to receive data back from it (eg "a new message has
arrived").

So a folder always knows about the specific protocol it's representing. The
protocols tend to use "sink" interfaces to talk back to the folder (the folder
implements the sink interfaces, e.g.
[nsIImapMessageSink](https://searchfox.org/comm-central/source/mailnews/imap/public/nsIImapMessageSink.idl)).
But all the sink interfaces are currently protocol-specific, so it's not much of
an abstraction.

For example, the database for IMAP folders is initially populated by requesting
the raw [RFC5322](https://datatracker.ietf.org/doc/html/rfc5322) headers from
the server (without the body) for all messages. So you're in the situation where
you know about a message (it's in the DB), but it might not have a local
downloaded copy - so no message body. For local folders, you're always dealing
with full, raw RFC5322 messages. As they are streamed into the folder (either
from POP3, say, or from copying from another folder), the headers are parsed and
the DB entries are added.

This database file does not exist on the IMAP or EWS server; it is only stored
locally. The server stores messages in whatever way it wants to. EWS or IMAP
servers have to send Thunderbird the raw message (or just the raw headers) in
RFC5322 form. As long as they do that, we don't care how they store things
locally.

```{note}
Other protocols could use a wire format other than RFC 5322 (e.g. JMAP uses JSON
and RSS uses atom or XML). But we come from an email-centric viewpoint and
RFC5322 is used for local storage and display. So non-RFC 5322 messages need to
be converted (forcibly coerced!) into RFC 5322.
```

Our .msf database files are also used for the other folder types: local folders,
NNTP, rss, etc. The database "schema" is largely the same, although the various
different folder types do poke a few protocol-specific values in here and there.
And there's a few annoying cases where the same fields have slightly different
meanings to different protocols (eg
[1930003](https://bugzilla.mozilla.org/show_bug.cgi?id=1930003)). But basically,
the database has all the info needed to display a list of messages in a folder,
regardless of folder type.

## Local Message Storage

The local message storage is implemented in either an `mbox` file or a `maildir`
directory.  It uses the `nsIMsgPluggableStore` interface to represent the
locally downloaded set of messages in a given folder. Both `mbox` files and
`maildir` directories (set in per-connection preferences) will contain the
complete raw message information for each message in that folder that has been
locally downloaded. For the rest of this document, we will refer to this stored
complete set of message information in the folder as the **message archive**.

```{note}
Auto downloading of messages is optional for IMAP, so it is possible to have a
populated database while the message archive is empty. However, the IMAP folder
default is to generate the database file and download all of the messages in the
background (into the message archive). Conversely, EWS currently only stores
database entries, and downloads messages as needed (e.g. when the user requests
to display a message).
```

### IMAP

When Thunderbird requests folder information from an IMAP server, if the folder
is set to not automatically download all of the messages in the folder, then the
server sends over just the message headers, in order to populate the message
database. In this case, the message archive continues to remain empty and when a
user selects a message to view, the message is downloaded "on demand".

If an IMAP folder is set to automatically download all of the messages in the
folder, then the server sends over the message headers and the database is
populated. This makes the list of messages appear immediately to the user. Then
the actual full downloading proceeds in the background to create a fully
populated message archive.

### EWS

When Thunderbird requests folder information from an EWS server, the server
sends over the list of the message headers and the database file is generated.
The message archive remains empty until a user views a message, triggering the
downloading of that message and initially populating the message archive.

## Locating a specific message in a folder

The database file contains a column for the `storeToken` that points to a
location of a specific message within the folder.

* `mbox`: The `storeToken` value is a number that represents an offset from the
start of the database file.
* `maildir`: The `storeToken` value is the filename of the message.

The message database references local messages with this `storeToken`.

## Deleting a message from a folder

Since `mbox` is the default for local storage, we will focus on the `mbox` case.
If a folder has many messages, then the corresponding `mbox` file can become
quite large and rewriting this file frequently would be a major hit on
performance. For this reason, every time a message is deleted, we do not rewrite
the mbox file to remove the message. There are extra header fields to help us
mark a message as being deleted without needing to rewrite the entire mbox file.

When a message is deleted, it is removed from the database and an attempt will
be made to edit its X-Mozilla-Status header (if it has one) in the mbox to add
"Expunged" flag.
For server-backed accounts (IMAP, EWS), a delete operation is also issued to
the server.

Deleted messages are left in place in the mbox until a [folder compaction](folder_compaction) operation occurs.
Folder compaction reclaims disk space by rebuilding the mbox, discarding any deleted messages.
It can be instigated manually or run automatically, according to criteria in
the Thunderbird settings.

### IMAP Example

#### Folder marked to not download messages

Consider the scenario where a new employee sets up Thunderbird with their
corporate email and is given access to shared folders that contain thousands of
emails. The corresponding `mbox` file of all of those messages in one folder
could be massive so the user would not want this to be automatically downloaded.
(This is a case where the folder would be set to not download automatically.)

The user has freshly connected and has not clicked on any of these IMAP messages
to download yet. In this case, the user would have a message database file and
an empty `mbox` file.

Then the user clicks and reads 5 messages. Now their database file is the same
and because the folder has been marked to not download, their `mbox` file
remains empty.

Then the user decides to delete 2 messages. Now their database file has the
"deleted" flag added to those 2 messages to be deleted and the `mbox` file is
still empty.

Then either the user initiates a folder compaction operation or it happens on
the scheduled frequency. Now their database file has those messages removed from
it and a delete operation kicks off on the IMAP server.

#### Folder marked to download messages

Consider the scenario where a person sets up Thunderbird with their personal
gmail account. The inbox of gmail by default is set to download messages. When
this account is connected, the message headers are gathered and the message
database for that folder (inbox, in this case) is generated. Then the message
downloads begin in the background to form the `mbox` file that contains the raw
message data from each message in the inbox.

Then the user decides to delete 2 messages. Now the "deleted" flag has been
added to those 2 messages (in both the message database and `mbox` file).

Then either the user initiates a folder compaction operation or it happens on
the scheduled frequency. Now their database file has those messages removed from
it, their mbox file is rewritten to remove those messages, and a delete
operation kicks off on the IMAP server.

### EWS Example

Consider any case involving an EWS folder. When an EWS server is connected, the
message headers are gathered to generate the message database for a given folder
and the `mbox` file starts off being empty.

Then the user clicks and reads 5 messages. Now their database file is the same
and they have an `mbox` file populated with the 5 raw messages.

Then the user decides to delete 2 messages. Now the "deleted" flag has been
added to those 2 messages (in both the message database and `mbox` file) and a
delete operation kicks off on the EWS server immediately.

Then either the user initiates a folder compaction operation or it happens on
the scheduled frequency. Now their database file has those messages removed from
it, and their mbox file is rewritten to remove those message.
