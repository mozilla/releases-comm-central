# Folder Compaction

Folder compaction is the act of removing left-over messages from the local
storage which are no longer needed.
It's particular issue for mbox stores, because each new message is just
concatenated to the end of the mbox file and you can't really delete them
without rewriting the entire file. So deleted messages are usually just left
in place and cleaned up later, via compaction.

```{note}
Compaction is currently an mbox-specific operation.
But it _might_ also be required for other storage back-ends.
For example, maildir stores could potentially end up with messages on disk which are no longer in the database.

But for the sake of simplicity, this document will just talk about mbox.
```

## The Process

Compacting a folder means building a new mbox file, omitting any messages which are no longer in the database.

The `.storeToken` value for each message in the database must be updated to point at the offset to the message in the new file, as it will have changed.

We need to be careful that the mbox and database (.msf) files are updated in sync.
A compacted mbox file will not work with the `.storeToken` values in the old database.
Conversely, an updated database with new `.storeToken` values will not work against the old mbox file.

Ideally we'd like to install the new mbox file and the new database file atomically.
But this can't be done.

The most atomic operation we have available is being able to rename a file on the same filesystem.
So we can write to temporary files, then use rename to install them into place.

But even then we could (for example) lose power or crash after installing the new database file, but before installing the new mbox file.
This would be leave the two files out of sync.
So we also need to include a method to detect and mitigate that state.


## The Details

Say we're compacting mbox `foo` and it's corresponding `foo.msf` database file (in the same directory).

These are the steps we take:

1. Create a `.compact-temp` subdirectory in the same location (i.e. on the same filesystem).
2. Copy `foo.msf` to `.compact-temp/foo.msf.compacting`.
3. Read messages out from `foo`, writing the ones we want to keep into `.compact-temp/foo.compacting`.
4. Rename `.compact-temp/foo.compacting` to `.compact-temp/foo.compacted`.
5. Update the `.storeToken` values in `.compact-temp/foo.msf.compacting` to correspond with `.compact-temp/foo.compacted`.
6. Move `foo` to `.compact-temp/foo.original`.
7. Rename `.compact-temp/foo.msf.compacting` to  `.compact-temp/foo.msf.compacted`.
8. Move `foo.msf` to `.compact-temp/foo.msf.original`.
9. Rename `.compact-temp/foo.msf.compacted` to `foo.msf`
10. Rename `.compact-temp/foo.compacted` to `foo`
11. Done!
12. Clean up by deleting `.compact-temp/foo.original` and `.compact-temp/foo.msf.original`, then by removing `.compact-temp` dir entirely.

So the filename conventions are:
- `.compacting` - a file being compacted, but not yet complete.
- `.compacted` - a compacted file, but not yet installed (uncommitted data).
- `.original` - the original uncompacted file, moved out of the 'live' location.

If we crash or power-off before step 6:
- the old `foo` and `foo.msf` will be left intact, so the app will continue working
- there'll be a residual `.compact-temp` dir left there, with partially-processed `.compacting` files. These aren't any use and can be deleted.
- There may be a completed "foo.compacted" mbox, but that's no use without the "foo.msf.compacted" DB to go with it, and that doesn't show up until step 7.

Steps 6 through 10 are all file renames and should be very rapid and simple.
(Rough benchmark: they complete within 50 microseconds or so, but that was a debug build, with full logging).

So, we could be unlucky and crash or power-off, in which case we might be left in a bad state (e.g. we could crash at step 7, leaving the old `foo.msf`, but no `foo`).

However, the combination of `.compacted` and `.original` files gives us enough information to later detect what's gone wrong and recover.


## Recovery

This table gives the state of the relevant files and where they appear at each step of the compaction process.

| after step | foo | foo.msf | temporary mbox | temporary summary  | backup mbox  | backup summary   |
| ---------- | --- | ------- | -------------- | ------------------ | ------------ | ---------------- |
| 1          | old | old     | -              | -                  | -            | -                |
| 2          | old | old     | -              | foo.msf.compacting | -            | -                |
| 3          | old | old     | foo.compacting | foo.msf.compacting | -            | -                |
| 4          | old | old     | foo.compacted  | foo.msf.compacting | -            | -                |
| 5          | old | old     | foo.compacted  | foo.msf.compacting | -            | -                |
| 6          | -   | old     | foo.compacted  | foo.msf.compacting | foo.original | -                |
| 7          | -   | old     | foo.compacted  | foo.msf.compacted  | foo.original | -                |
| 8          | -   | -       | foo.compacted  | foo.msf.compacted  | foo.original | foo.msf.original |
| 9          | -   | new     | foo.compacted  | -                  | foo.original | foo.msf.original |
| 10         | new | new     | -              | -                  | foo.original | foo.msf.original |
| 11         | new | new     | -              | -                  | foo.original | foo.msf.original |
| 12         | new | new     | -              | -                  | -            | -                |


There's not currently an automatic process to detect and recover from incomplete compaction.
But we can use this table to map out the steps such a process would need to follow.
Such a process could be applied manually if needed. Something like this:
```
if .compact-temp/ dir exists:
  if foo is missing:
    if .compact-temp/foo.compacted and .compact-temp/foo.msf.compacted exist:
      copy them to foo and foo.msf
    else if .compact-temp/foo.original and .compact-temp/foo.msf.original exist:
      copy them to foo and foo.msf
    else if foo.msf exists and .compact-temp/foo.compacted exists:
      copy .compact-temp/foo.compacted to foo

```
(We _could_ refine this to avoid a rollback if we'd crashed after step 9, but probably best to keep things simple!)


## Implementation

The compaction system is layered, to try and keep the moving parts decoupled.

From the top down:

The entry point for compacting folders is the bare function AsyncCompactFolders().
It takes a list of folders to compact sequentially, and a listener to call when the whole thing is done.
Internally, it is implemented using the [`BatchCompactor` class](https://searchfox.org/comm-central/search?q=class+BatchCompactor&path=&case=false&regexp=false).

`BatchCompactor` orchestrates the whole operation, instantiating a [`FolderCompactor`](https://searchfox.org/comm-central/search?q=class+FolderCompactor&path=&case=false&regexp=false) to compact each folder.
It also handles GUI updates - taking progress and error reports from the `FolderCompactor` and presenting them appropriately.

`FolderCompactor` compacts a single folder. It handles updating the database and various folder housekeeping and notifications.
The actual mbox compaction is delegated to the storage layer, via `nsIMsgPluggableStore.AsyncCompact()`.
The `FolderCompacter` passes itself as a listener to `AsyncCompact()`, which invokes callbacks to determine which messages to keep and when the mbox files are complete and ready to install.

The mbox `AsyncCompact()` implementation of `nsIMsgPluggableStore.AsyncCompact()` is implemented by the [`MboxCompactor` class](https://searchfox.org/comm-central/search?q=class+MboxCompactor&path=&case=false&regexp=false).

`MboxCompactor` iterates over each message in the store. It uses the listener (provided by `FolderCompactor`) to ask which messages should be written into the new mbox file.
When done, it'll invoke the `.onCompactionComplete` on the `FolderCompactor` to let it know it should install it's own changes (the new DB file).
When that callback returns, the new mbox file will be installed.
`MboxCompactor` can also update the `X-Mozilla-*` headers inserted into messages in local folders as it goes.
