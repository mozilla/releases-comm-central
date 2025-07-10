# Panorama

*“An unbroken view of an entire surrounding area.”*

Panorama is the working name of Thunderbird's new global message database. All folders and messages
will be stored in a single database, instead of one database per folder as currently happens.

Code for updating the front end's message list is also within scope.

<div class="note"><div class="admonition-title">Note</div>

Panorama is under development. It is not live and there are currently no user-facing parts. Feel
free to explore, but you do so at your own risk.

</div>

## Enabling it

The Panorama code is compiled in when the `MOZ_PANORAMA` compile-time flag is set.
This happens automatically on the nightly channel (i.e. comm-central) only.

`MOZ_PANORAMA` can be used for conditional blocks in C++ code, moz.build files, and other places
where preprocessing happens.

To use Panorama at runtime (instead of the old mork databases), set the pref `mail.panorama.enabled`
to true.

To run tests:

```
$ ./mach mochitest --setpref mail.panorama.enabled=true ....
$ ./mach xpcshell-test --setpref mail.panorama.enabled=true ....
```

## Logging

The `panorama` log emits a bunch of relevant stuff.
But you might also want `mozStorage`, which logs the lower-level sqlite stuff.

For example:
```
$ export MOZ_LOG="panorama:4,mozStorage:4"
```

## The Plan

1. Implement the global database (at least enough of it)
2. Implement the legacy interfaces to run against Panorama rather than mork.
  This boils down to implementing Panorama-aware versions of:
    - `nsIMsgDatabase` (there are some derived classes for various protocols, but really easiest to
      think of them all as one).
    - `nsIMsgDBHdr` - represents a single message, in a single folder.
    - `nsIMsgThread` - The model for threaded conversations, within a folder.
    - `nsIMsgDBService` - responsible for opening and caching databases.
    - `nsIFolderInfo` - persists assorted folder settings in the database.
3. Fix whatever needs fixing to get the existing stuff up and running against Panorama.
4. Solid migration path from old system
5. Use fancy new Panorama features and phase out the legacy interfaces
    - LiveViews etc.
    - Replace gloda by integrating full-text searching into Panorama.
6. Remove the legacy database code and interfaces completely.

There is a _lot_ of scope to simplify huge parts of the codebase, while adding new functionality
which cannot currently be supported. Proper global conversation views, for one.

## Key Components

### DatabaseCore

[nsIDatabaseCore](https://searchfox.org/comm-central/source/mailnews/db/panorama/public/nsIDatabaseCore.idl)
(see also [nsIMsgDBService](https://searchfox.org/comm-central/source/mailnews/db/msgdb/public/nsIMsgDatabase.idl)),
[DatabaseCore.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/DatabaseCore.h),
[DatabaseCore.cpp](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/DatabaseCore.cpp)

This is the single entry point to access the database. It can give you access to the other database
components:

From JS:

```js
const database = Cc["@mozilla.org/mailnews/database-core;1"].getService(Ci.nsIDatabaseCore);
const folders = database.folderDB;
const messages = database.messageDB;
```

From C++:

```c++
nsCOMPtr<nsIDatabaseCore> database = components::DatabaseCore::Service();
nsCOMPtr<nsIFolderDatabase> folders = database->GetFolderDB();
nsCOMPtr<nsIMessageDatabase> messages = database->GetMessageDB();
```

If Panorama is enabled, `DatabaseCore` will be started automatically by the initialisation of the
account manager. This includes overriding the default database server XPCOM registration.

If you want to use it before the account manager (e.g. in a test), call `DatabaseCore.startup()`.

### FolderDatabase

[nsIFolderDatabase](https://searchfox.org/comm-central/source/mailnews/db/panorama/public/nsIFolderDatabase.idl),
[FolderDatabase.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/FolderDatabase.h),
[FolderDatabase.cpp](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/FolderDatabase.cpp)

Access to folders and their properties. The front-end code will have read-only access (`Folder`
objects) by methods `getFolderById` and `getFolderByPath`, and event listeners. Modifications to
folders should be through function calls to the back end.

### Folder

[nsIFolder](https://searchfox.org/comm-central/source/mailnews/db/panorama/public/nsIFolder.idl),
[Folder.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/Folder.h),
[Folder.cpp](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/Folder.cpp)

Each row in the folders table has a corresponding `Folder` object which is kept up-to-date at all
times. Outside of `FolderDatabase`, `Folder` is a read-only object and has no methods that can cause
anything to happen.

The `id` and `path` properties uniquely identify a `Folder`. Code should not attempt to manipulate
the `path` to find other folders.

### MessageDatabase

[nsIMessageDatabase](https://searchfox.org/comm-central/source/mailnews/db/panorama/public/nsIMessageDatabase.idl),
[MessageDatabase.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/MessageDatabase.h),
[MessageDatabase.cpp](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/MessageDatabase.cpp)

Access to messages and their properties. Like `FolderDatabase`, changes to the data *should* go
through function calls on this object

### Message

[nsIMsgDBHdr](https://searchfox.org/comm-central/source/mailnews/base/public/nsIMsgHdr.idl),
[Message.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/Message.h),
[Message.cpp](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/Message.cpp)

Unlike `Folder`, `Message` objects implement an existing interface and can cause changes in the
datbase. This is likely to change once the old databases are switched off.

### PerFolderDatabase and FolderInfo

[nsIMsgDatabase](https://searchfox.org/comm-central/source/mailnews/db/msgdb/public/nsIMsgDatabase.idl),
[nsIDBFolderInfo](https://searchfox.org/comm-central/source/mailnews/db/msgdb/public/nsIDBFolderInfo.idl),
[PerFolderDatabase.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/PerFolderDatabase.h),
[PerFolderDatabase.cpp](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/PerFolderDatabase.cpp)

These classes exist to bridge the gap between legacy code, which expects one database per folder,
and the new single database. Mostly they just forward calls to the new database code (with added
context of the folder they represent) but there is a bit of data manipulation where the database we
want doesn't match the interfaces we have to support.

### LiveView

[nsILiveView](https://searchfox.org/comm-central/source/mailnews/db/panorama/public/nsILiveView.idl),
[LiveView.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/LiveView.h),
[LiveView.cpp](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/LiveView.cpp)
[LiveViewFilters.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/LiveViewFilters.h),

A `LiveView` is so-called because represents a collection of messages that keeps itself up-to-date.
It is defined by zero or more `LiveViewFilter`s which narrow the scope of the view, e.g. to all
messages in a particular folder, or all messages with the ‘Important’ tag.

`LiveView` is intended for use by the front end, and before sending messages there it converts them
to plain JS objects instead of XPCOM objects, for performance reasons. Therefore a message obtained
from a `LiveView` is *not* live. However you can register a single JS listener to get updates.

### LiveViewDataAdapter

[LiveViewDataAdapter.mjs](https://searchfox.org/comm-central/source/mailnews/db/panorama/content/LiveViewDataAdapter.mjs)

`LiveViewDataAdapter` is a JS component for connecting a `LiveView` to a `TreeView`. It maintains a
sparse array of messages that is populated on demand.

## Known issues

This is a list of issues we know we'll have to confront at some point, but we're ignoring for now.

### nsMsgKeys are only 32bit

32 bits probably aren't enough for a global database, especially if there's a lot of turnover. There
could be some clever ID reclamation system, but really we should just bite the bullet and go to 64
bits. Simply switching to a 64bit `nsMsgKey` is fine for the new code, but could cause a lot of
issues in old code.

For now we'll probably leave the nsMsgKey at 32 bits while Panorama is in it's development phase.

### Definition of `nsMsgKey_None` as 0xFFFFFFFF.

`nsMsgKey_None` is currently defined as `0xFFFFFFFF` (AKA `uint32_t` -1).

A value of `0` is probably better for Panorama (SQL databases tend not to use `0` for auto-assigned
primary keys).

In any case, a special value of `0xFFFFFFFF` is no good for a 64bit nsMsgKey.

The C++ side is probably easy enough to deal with, but there are a lot of `0xFFFFFFFF`s out there in
javascript, and likely a bunch of `-1`s to pick through too.

For now, Panorama can probably fudge things by massaging any potentially-None nsMsgKeys it returns
from it's API, but at some point we'll need to deal with it.

### IMAP/News won't work.

Currently IMAP and News use the message UID assigned by the server as the primary database key.
This is no good for a global database as those keys are only unique within a single folder.

The fix is to track server-assigned IDs separately, and let the database assign it's own keys.

* [Bug 1806770](https://bugzilla.mozilla.org/show_bug.cgi?id=1806770) - IMAP shouldn't use UID as
message key

### Reliance on detached nsIMsgDBHdr objects

Mork supports editing database rows which are not attached to a table in the DB. Sqlite does not.
The current code relies heavily upon this fact when adding messages to the database.

The main approach here is to replace the use of a detached nsIMsgDBHdr with a "here's all the data"
object. Often the message fields are known when a message entry is created, so we can collect it
before going to the database.

* [Bug 1952094](https://bugzilla.mozilla.org/show_bug.cgi?id=1952094) - Stop using detached
nsIMsgDBHdr objects

It's also an issue for message filtering: the filters operate upon `nsIMsgDBHdr` objects, but often
(at least for POP3 incoming messages) these objects are not in the database. The filter runs, and
_then_ the message is added to a database (depending upon which folder it ends up in). This also
causes big complications with local storage - which doesn't have the explicit concept of a detached
message.

We can fool the existing filter logic by implementing another `nsIMsgDBHdr` object which just stores
fields locally and has no database connection. But the filter actions (move/copy/delete etc) and
local message store will need work.

### Dangling folders

The current code tends to create folders lazily, and there's an assumption that child folders can be
created before their parents.

This is silly, and it'd be much much simpler for everyone concerned if folders were created as a
part of sensible folder hierarchy from the start.

Ideally, each folder hierarchy would be initially created by the `nsIMsgIncomingServer` object that
was responsible for them.

As folders were added and removed (via user operations, or via slower network-based discoveries),
child folders should be created by their parent.

TODO: talk about folder URIs here.

* [Bug 1679333](https://bugzilla.mozilla.org/show_bug.cgi?id=1679333) - Remove support for dangling
(unparented) folders

## Things to think about

- How to integrate full-text indexing (of message body)?
  - How to handle different languages? Proper stemming/tokenisation needs to be language-aware...
- How to represent messages appearing in multiple folders?
  - do any protocols support per-folder-per-message flags?
    i.e. if you set "Read" on a message, do instances of that message in other folders also
    appear "Read" or do they have their own flags?
- How to handle add-on API requirements.
  - Want to attach arbitrary values to messages, folders etc... but don't want the free-for-all
    of the legacy database.
  - Ability to register extra message headers to parse and retain in the database
    (the database only stores data from a few headers, and the data is not verbatim, it's
    cooked in all kinds of ways).
