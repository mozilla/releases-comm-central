# Accounts, Servers and Identities

The core of the mail architecture is the accounts system. The objects here are largely containers
for configuration information. It is overseen by the Account Manager (`MailServices.accounts`).

## Accounts

An account object represents a user's account with an email provider. It is a simple object used to
tie together an incoming server and one or more identities.

Configured profiles also have a special "Local Folders" account which exists for messages solely on
the user's computer.

Account configuration is stored in preferences prefixed by `mail.account.accountX.`, where X is an
integer and "accountX" is the account's key (unique identifier).

See [nsIMsgAccount](https://searchfox.org/comm-central/source/mailnews/base/public/nsIMsgAccount.idl)
and [nsIMsgAccountManager](https://searchfox.org/comm-central/source/mailnews/base/public/nsIMsgAccountManager.idl).

## Incoming Servers

An incoming server object contains the information needed to connect to a mail server, such as the
hostname, port, and user name. There are various types: one for each supported mail or news
protocol, one for RSS, and the "none" type for local folders.

It is also the starting point for accessing the folder tree, both programmatically and on the file
system.

Like accounts, incoming server configuration is stored in preferences prefixed by
`mail.server.serverY.` where Y is an integer (usually, but not necessarily the same as the account's
X) and "serverY" is the server's key.

### Useful properties

- `prettyName` - User-visible name.
- `key` - Unique identifier.
- `type` - "imap", "ews", "none", etc.
- `hostName`/`port`/`username` - Connection information.
- `localPath` - Where mail is stored on the file system.
- `rootFolder` - The root of the folder tree for this account.

See [nsIMsgIncomingServer](https://searchfox.org/comm-central/source/mailnews/base/public/nsIMsgIncomingServer.idl).

## Identities

An identity represents the user when sending mail: their name, email address, signature etc. One
account can have multiple identities, which is useful if the user wants Thunderbird to act in
different ways.

Identities are stored in preferences prefixed by `mail.identity.idZ`.

### Useful properties

- `identityName` - User-visible name.
- `key` - Unique identifier.
- `fullName` - The user's name, as used when sending messages.
- `email` - The user's email address.
- `smtpServerKey` - The key of an SMTP server to use, if appropriate.

See [nsIMsgIdentity](https://searchfox.org/comm-central/source/mailnews/base/public/nsIMsgIdentity.idl).

## Outgoing Servers

Outgoing servers are just like incoming servers, except they are for sending mail, and they are
tied to identities rather than accounts. Any number of outgoing servers can exist, and they are
managed separately, by the `OutgoingServerService`.

In most cases, an outgoing server represents an SMTP server connection, but Exchange-based
protocols use the same connection for incoming and outgoing mail, so they use a different
implementation.

SMTP outgoing servers are stored in preferences prefixed by `mail.smtpserver.smtpA`.

See [nsIMsgOutgoingServer](https://searchfox.org/comm-central/source/mailnews/compose/public/nsIMsgOutgoingServer.idl)
and [nsIMsgOutgoingServerService](https://searchfox.org/comm-central/source/mailnews/compose/public/nsIMsgOutgoingServerService.idl).
