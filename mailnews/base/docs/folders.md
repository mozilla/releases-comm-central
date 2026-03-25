# Folders

Folders are the main message container that the user sees and interacts with.
They tie together a message database, a local message store, and interaction with a server.
The various supported protocols all have their own specialised folder type, supporting a wide variety of differing traits and capabilities.

Some key facts about folders:

- Folders hold a list of messages (in the message database).
  - This list contains metadata about the message - to/from/subject etc... - but not necessarily the whole message.
- Folders MAY represent a container on a remote server (e.g. an IMAP mailbox).
- Folders MAY have have full local copies of the messages they contain (in the local message store).
- Folders MAY contain child folders.
- Folders MAY allow moving or deleting their messages.
- Folders MAY allow the user to copy messages into them.
- Folders MAY be capable of being renamed.
  - Some protocols have restrictions on this (e.g. for NNTP, the folder represents a newsgroup and the name is read-only).
- Folders are protocol specific
  - if there's a remote server, the folder knows how synchronise with it.
- Folders have a URI which identifies them.
  - This URI is just an identifier, it's not used as a URL to issue requests.

## nsIMsgFolder

Folders are XPCOM objects which implement the [`nsIMsgFolder`](https://searchfox.org/comm-central/search?q=nsIMsgFolder) interface:

```
interface nsIMsgFolder : nsISupports {
  attribute AUTF8String name;
  attribute nsIMsgFolder parent;

  ...

  attribute nsIMsgDatabase msgDatabase;
  readonly attribute nsIMsgPluggableStore msgStore;
  readonly attribute nsIMsgIncomingServer server;

  ...
};
```

Every folder has a database (`nsIMsgDatabase`) which contains the metadata of the messages contained by the folder.
This information is enough for the GUI to display a list of the folders messages.

The full messages may be stored locally, on a remote server (e.g. IMAP), or both (e.g. IMAP, with a local offline copy).

Folders are responsible for coordinating message operations, such as adding new messages, copying or moving messages, marking them read, displaying them...

For example, copying a message into an IMAP folder would involve:
1. adding the message metadata to the database
2. streaming the raw message to the remote IMAP server
3. (optionally) streaming the raw message to a local (offline) store, where it can be accessed without generating further network traffic.

## Access to messages

A folder provides access to read the messages it contains.
While basic details are stored in the database, to get the full, raw message data we need to ask the folder to fetch it for us.
This usually boils down to obtaining a URL which can be accessed to read out the raw message via one of the protocol-specific `nsIMsgMessageService` implementations.
The URL scheme will depend on the protocol (e.g. `imap://...` for IMAP messages.)

For local (and POP3) folders this means reading messages from the local mailstore on the local filesystem.
For protocols such as IMAP and NNTP, this could mean fetching the message from a server if it's not in the local mailstore.

Displaying a message is a little more complicated - the raw message data needs to be converted into HTML for display.
A big enough topic to cover separately.

## Subfolders

A folder may contain subfolders.
Actions to create, move, copy or delete folders all cause the appropriate operation on the server, if the protocol allows it.
For example, news folders cannot be renamed - the folder name is simply the name of the news group, and the user cannot alter them.

## Manipulating messages

Messages can be moved and copied between folders and deleted, although there are limitations, depending upon protocol/folder type.
For example, News folders simply reflect the messages in a newsgroup, and usually cannot be deleted.

Some protocols (e.g. IMAP) don't delete messages immediately, but rather set a flag to indicate deletion.
Such protocols also might support actions such as undelete (restore a deleted message) and expunge (purge all messages marked as deleted).

Deletion can mean move-to-trash or immediate deletion.


## Folder Creation

Folders are created by the `nsIMsgIncomingServer` which owns them.
Each server has a top level root folder under which all the others reside.

Different protocols will create the folders in different ways.
For example, on Exchange, the server must be contacted and told to create a new folder.
This is asynchronous, can be slow, and may fail due to any number of external conditions.
When (if!) the server-side operation succeeds, the local `nsIMsgFolder` object - along with its database, local storage, etc. - can be constructed and added to the folder hierarchy.

Contrast this with local folders, which can just be created immediately and directly in the filesystem.

```{note}
Folder creation is still very protocol-specific.
While local folder creation is a synchronous operation, server-based folder creations needs to be asynchronous.

The intention is to unify folder creation (and indeed most other folder operations) so that they can be used in the same way, without copious amounts of protocol-specific special handling.
```

## Types of folders

Each type of `nsIMsgIncomingServer` holds a specific class of folder.
`nsIMsgFolder` is the base interface which all folders support.

- `nsMsgDBFolder` is the concrete C++ base class inherited by the other folder classes, and tries to factor out common functionality shared by all of them.
- `nsMsgLocalMailFolder` for local and POP3 folders.
- `nsImapMailFolder` handles IMAP folders.
- `ExchangeFolder` handles EWS and Graph folders.
- `nsMsgNewsFolder` handles NNTP folders.
- `JaBaseCppMsgFolder` is a base for implementing folder types in javascript.

## Virtual folders

A virtual folder is one which shows a view of messages from other folders, which match user-defined filters.

There is no separate class for virtual folders.
Instead, a virtual folder is a just a normal folder with the 'Virtual' flag set.

Virtual folders are created by `nsMsgAccountManager::LoadVirtualFolders()`.
The virtual folder configurations are saved in `virtualFolders.dat` by default (it's user-configurable).

## Folder notifications

Things can register interest in hearing about specific folder-related events (e.g. a new child folder being created).

This is currently a little messy, and needs some more investigation and documentation.

### nsIFolderListener

- can be registered either to individual folders, or globally, to the nsIMsgMailSession.
- nsIFolderListener notifications generally originate inside the folder implementations, using the `nsIMsgFolder.Notify*` functions.

### nsIMsgFolderListener

- defines listener callbacks for global registration with nsIMsgFolderNotificationService.
- nsIMsgFolderNotificationService notifications are invoked from a bunch of places.
- are registered along with a set of flags, so you just receive the notifications you're interested in, and the rest are ignored.


## General notes

- Functions which take window pointers generally mean they might pop up dialog boxes or post progress or request logins or some other GUI interaction.
- Many async functions take nsIUrlListener objects to handle start/finish notifications, even if there's no real URL associated with the operation.
