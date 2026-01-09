# ADR 0002 IMAP Should Not Use Server UID as Local Message Key

## Links

- [Bug 1806770 - IMAP shouldn't use UID as message key.](https://bugzilla.mozilla.org/show_bug.cgi?id=1806770)
- [tb-developers list discussion](https://thunderbird.topicbox.com/groups/developers/T189e53bca6ebb4dd-M896d8a5dad82bfcf52b21e55)

## Status

Approved

## Context

The IMAP code uses the UID from the server as the unique key in the local message database (accessed as `nsIMsgDBHdr.messageKey`).

This complicates things in a number of ways:
 - The message database cannot assign and manage it's own primary keys for IMAP messages (as it does for POP3/local messages).
 - Temporary (fake) keys must be assigned to messages awaiting a UID from the server (e.g. during message composition or copying).
 - Various interfaces must support extra methods to update `messageKey` values, complicating the code.

It's been a known tech-debt issue for almost a decade, but it has never quite been pressing enough to fix.
Now we're looking at implementing a global message database, it becomes more of a showstopper:

 - It prevents us using `.messageKey` as the primary key it's intended to be.
   - IMAP keys/UIDs are unique within a folder but they are not globally unique across the system.
   - All the current code assumes that `.messageKey` is the primary key, so changing that would be a huge upheaval.
 - We cannot properly model a message which appears in more than one folder.
   - Already important for gmail [X-GM-MSGID](https://developers.google.com/gmail/imap/imap-extensions#access_to_the_unique_message_id_x-gm-msgid).
   - Likely to be more important in future e.g. Yahoo already supports [RFC 8474 - Object Identifiers](https://datatracker.ietf.org/doc/html/rfc8474).
 - A message cannot keep its `.messageKey` when it is moved to a different folder (not a showstopper, but it complicates things).

NOTE: NNTP has the same issue - using server-side IDs as local keys.
But NNTP is a simpler case and similar enough that I'm happy bundling it into the IMAP situation.

## Decision

We should store server UID as a separate field in the database, and the database should have responsibility for managing it's own primary keys (`.messageKey`).
Additionally, `.messageKey` should be considered read-only - once a message has been assigned a unique ID in the database, that ID should not change.

All ambiguous uses of message keys in the IMAP code should be audited to determine if they really are message keys, or if they're being used as a UID.

The `nsMsgKey` type should never be used to store UIDs.

A migration process is needed to move existing `.messageKey` values out to a separate UID field in the database.

A backward migration - going back to earlier versions of the app - is possible by discarding the local database (and offline messages) and downloading them from the server again.
This is the same operation as "Repair Folder" for IMAP.

### Consequences and Risks

#### Positive Consequences

- Makes it possible to continue using `.messageKey` as primary key, even as we move to a global database.
- Improves separation between protocol and folder code.
- Simplifies a lot of code (particularly the local part of message copy/move).

#### Negative Consequences

- Complications due to older releases not being capable of using the new database if people downgrade.
- Exposure to the usual risks involved when refactoring code.

### Alternatives

Continue using per-folder nsMsgKeys, and assign an additional globally-unique ID to messages.
But this seems like it would lead to a lot of unnecessary complexity and confusion and skirts around the core problem in the IMAP implementation.

### Security Considerations

None known.

### Rollout Plan

Because of the fine-grained nature of nsMsgKey/UID usage, it's not really possible to switch over incrementally - there's always going to be one reasonably-big patch to land.

However, before that we can go through and identify all the places were nsMsgKey values are used as UIDs and change their datatype to something UID-specific.
This provides a solid roadmap as to what needs changing and the datatypes can be set up to give compile-time errors if nsMsgKeys and UIDs are interchanged accidentally.

A forward migration (to shift nsMsgKeys in existing databases to a separate UID field) needs to land along with the main change.

Backward migrations are trickier - earlier versions of TB would not handle the updated database.
The actual background migration isn't too hard, it's just that earlier versions of TB are not looking out for them.
We could, in theory, land/backport code in advance of the main rollout, so that there's a range of earlier versions which can detect (or migrate from) newer, incompatible databases.
This is more a policy decision than a technical one.
