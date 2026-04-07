# Message Database

The Message Database holds the list of all messages known to exist within a folder.

Each folder has its own database, and together they represent all the messages the system knows of.

These databases provide enough information to allow the user to browse, search and sort messages, although full text search requires use of an extra database (gloda).

## Database Contents

### Message entries

The database contains a table to keep track of messages in the folder.
It doesn't contain full messages, just enough to cover the basic properties such as:

- Subject
- Sender/Author
- Recipients (and CC list)
- Threading (parent message etc)
- Flags (read, flagged etc...)
- Tags/Keywords
- Junk classification
- Preview data (eg the first paragraph of the message)
- Any server-assigned ID (eg IMAP UID)
- Message size
- etc...

A lot of these fields map directly to standard (rfc5322) email headers.

Some fields represent data inherent to the message itself (i.e. extracted from rfc5322 data).
Things like Subject, Sender, Recipients, Thread structure etc...
This data doesn't typically change and is more or less immutable.
Some of these fields are "massaged" for the database, so there's not always a direct mapping from rfc5322.

Some fields are _not_ inherently part of the message.
Properties like Flags, Junk Classification, Server-side ID, Tags/Keywords are not part of the rfc5322 data, but are usually transmitted alongside it.
These properties tend to be more mutable, and may change as messages are read and flagged, tags are added and removed, etc...

The database itself doesn't really make a distinction between mutable and immutable message data.

```{note}
Historically, the definitive message list for a folder was its mbox file.
The database was originally just a cache, to enable displaying message lists without having to rescan the mbox every time.
But over time, as IMAP was added and message views became more capable and complex, the database took over as the definitive list of known messages.

Traces of this db-as-cache approach remain.
For example, local folders still attempt to add `X-Mozilla-*` headers to messages, in order to store flags and keywords inside rfc5322 messages.

The idea being that you could throw away the database at any time, and rebuild it from the raw mbox (This still exposed as "Repair Folder").

Because some (most?) folders now represent server-side email, the system does not need to see the full message to know it exists.
So the database has taken over from the mbox file as the definitive list of messages known to the system.

```

### Folder information

Folder properties are persisted in the database (accessed via `nsIDBFolderInfo`).
This covers things such as the GUI view settings, the name of the IMAP mailbox this folder represents, how much space could be reclaimed by a folder compaction etc...

### Other

The database also has tables to handle message threading and (for IMAP) offline and pending operations.


## Message keys

As each message is added to the database, it is assigned an integer key, unique within the folder.
In C++ the `nsMsgKey` type is used to store this key.

For most folder types, the key is just an incrementing integer.
But for IMAP and NNTP, the server-side identifier (eg IMAP UID) is used as the message key.
See [Bug 1806770](https://bugzilla.mozilla.org/show_bug.cgi?id=1806770) and [ADR-0002](/adr/records/0002-imap-should-not-use-uid-as-message-key).
## Synchronisation

The database is just a standalone store - it doesn't really know about folders or local storage or protocols and it doesn't really know (or care) where its data comes from.

For server-backed folders (eg IMAP), the database should be maintained as a reflection of the "definitive" message list held on the server.

For local folders, the database must reflect the local message store (mbox or maildir).

And when changes occur, the database must be kept synchronised with its source.

For example:
- if a new message is received by an IMAP server, a new entry must be added to the database.
- if a message is marked as junk by the user, both the database and server (if any) must be updated.
- if a message is deleted from a local folder, its database entry must also be removed.

The database knows nothing of this synchronisation - it just adds, removes or modifies message entries as directed.


## Storage

Message database files are stored in the folder hierarchy within the users profile.
Each database is contained in a single file, named `{FOLDERNAME}.msf`.

The database is implemented with a custom database called [Mork](https://en.wikipedia.org/wiki/Mork_(file_format).).


## Quirks

Mork (or in some cases the code that has grown surrounding Mork) has a couple of quirks to be aware of:

1. Mork DBs are read entirely into RAM.
2. A file handle is held upon the Mork file while the database is open.
3. You can operate on rows in Mork _before_ they are added to a table.
4. Rows can be modified _after_ they've been deleted from a table.

1 and 2 mean that you can't rely on all folder databases being open at all times.
If you are working with huge numbers of messages and/or folders, the RAM usage can get significant and the OS file handle limits can start being a problem (especially on windows).
So a lot of the codebase is quite aggressive about closing folder databases. This can be quite annoying.

3 leads to a lot of places where systems operate on "detached" message entries.
For example, filtering of incoming messages for POP3 and IMAP relies on detached `nsIMsgDBHdr` objects, bound to Mork database rows which have been created and populated, but not yet attached to a table in a database.
If the filter triggers and decides to move the incoming message to another folder, the detached `nsIMsgDBHdr` is attached to the destination database instead of the database it was originally created within.

4 Is just a bit odd and usually isn't an issue, but it is something that can bite you if you're not aware of it.

## XPCOM Interfaces


The main interface is [`nsIMsgDatabase`](https://searchfox.org/comm-central/search?q=interface+nsIMsgDatabase+).

There are also interfaces which provide extra functionality used by IMAP ([`nsIMsgOfflineOpsDatabase`](https://searchfox.org/comm-central/search?q=interface+nsIMsgOfflineOpsDatabase+)) and News ([`nsINewsDatabase`](https://searchfox.org/comm-central/search?q=interface+nsINewsDatabase+)).
But such protocol-specific functionality has tended to smear out over the years, and there's probably a good argument for consolidating it all into a single interface (and implementation).

`nsIMsgDatabase` inherits from [`nsIDBChangeAnnouncer`](https://searchfox.org/comm-central/search?q=interface+nsIDBChangeAnnouncer+), which provides methods for listeners to register interest for notifications when changes are made to the database.

There is also a database manager, [`nsIMsgDBService`](https://searchfox.org/comm-central/search?q=interface+nsIMsgDBService+) which handles opening databases and creating new ones.
It also attempts to provide some caching to paper over some of the quirks that result from aggressive closure of databases.

Messages themselves are represented by [`nsIMsgDBHdr`](https://searchfox.org/comm-central/search?q=interface+nsIMsgDBHdr+).
It's best to think of these objects as specifying a folder + nsMsgKey combination.
This identifies row in a database representing an individual message and, indeed, the implementation ([`nsMsgHdr`](https://searchfox.org/comm-central/source/mailnews/db/msgdb/src/nsMsgHdr.h) is more or less just a wrapper for a Mork row.
So reading `nsIMsgDBHdr` attributes means querying the database, and writing attributes means updating the database.

Folder properties are read and written via the [`nsIDBFolderInfo`](https://searchfox.org/comm-central/search?q=interface+nsIDBFolderInfo+) interface.

## See Also

[New database (AKA Panorama)](/panorama/index) - an ongoing project to replace the per-folder databases with a single, global database, and to address some of the various database quirks, pain points and limitations that have accreted over time.
