# Panorama

*“An unbroken view of an entire surrounding area.”*

Panorama is the working name of Thunderbird's new global message database. All folders and messages
will be stored in a single database, instead of one database per folder as currently happens.

Code for updating the front end's message list is also within scope.

<div class="note"><div class="admonition-title">Note</div>

Panorama is under development. It is not live and there are currently no user-facing parts. Feel
free to explore, but you do so at your own risk.

</div>

## Components

### DatabaseCore

[nsIDatabaseCore](https://searchfox.org/comm-central/source/mailnews/db/panorama/public/nsIDatabaseCore.idl),
[DatabaseCore.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/DatabaseCore.h),
[DatabaseCore.cpp](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/DatabaseCore.cpp)

This is the single entry point to access the database. It can give you access to the other database
components:

From JS:

```js
const database = Cc["@mozilla.org/mailnews/database-core;1"].getService(Ci.nsIDatabaseCore);
const folders = database.folders;
const messages = database.messages;
```

From C++:

```c++
nsCOMPtr<nsIDatabaseCore> database = components::DatabaseCore::Service();

nsCOMPtr<nsIFolderDatabase> folders;
database->GetFolders(getter_AddRefs(folders));

nsCOMPtr<nsIMessageDatabase> messages;
database->GetMessages(getter_AddRefs(messages));
```

Before use, `DatabaseCore.startup()` must be called, which returns a Promise when done. Eventually
this call will be added to Thunderbird's start-up sequence.

### FolderDatabase

[nsIFolderDatabase](https://searchfox.org/comm-central/source/mailnews/db/panorama/public/nsIFolderDatabase.idl),
[FolderDatabase.h](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/FolderDatabase.h),
[FolderDatabase.cpp](https://searchfox.org/comm-central/source/mailnews/db/panorama/src/FolderDatabase.cpp)

Access to folders. The front-end code will have read-only access by methods `getFolderById` and
`getFolderByPath`, and event listeners. Modifications to folders should be via function calls to the
back end.

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

The message table is currently a stub for the development of other features.

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
