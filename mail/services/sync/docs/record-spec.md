# Sync Record Data

## Servers
Renamed from Accounts in version 1. Same type for incoming and outgoing servers.

- `deleted`: `true` if this account has been removed
- `name`: string, user-visible way to identify this account
- `type`: "imap", "pop3", "smtp" [immutable]
- `location`: string, the server's hostname and port separated by a colon (in future this may be a
    URL instead, where appropriate)
- `socketType` (one of): (from nsMsgSocketType)
  - "plain"
  - "alwaysStartTLS"
  - "tls"
- `authMethod` (one of): (see nsMsgAuthMethod)
  - "passwordCleartext"
  - "passwordEncrypted"
  - "gssapi" (Kerberos)
  - "ntlm"
  - "tlsCertificate" (AKA “external”)
  - "oAuth2"
- `username`: string

## Identities
Identities get synced after accounts (lower priority), so the fields that refer to accounts should
always have a real object to attach to. See nsIMsgIdentity.idl.

- `deleted`: `true` if this identity has been removed
- `name`: string, user-visible way to identify this identity
- `fullName`: string, the user's name to be used in the `From` header e.g. “Geoff Lankow”
- `email`: string, the users email address
- `incomingServer`: string, UID of an incoming server [immutable]
- `outgoingServer`: string, UID of an outgoing server, if it differs from the incoming server

## Passwords
Passwords are synced before any of the Thunderbird stuff (higher priority). This is one of the
mozilla-central sync engines and we don't control it.

There are other fields but these are the important ones.

- `deleted`: `true` if this password has been removed
- `hostname`: string (URL origin)
- `httpRealm`: string (OAuth scopes)
- `username`: string
- `password`: string

## Address Books

- `deleted`: `true` if this address book has been removed
- `name`: string, user-visible way to identify this address book
- `type`: “ldap”, “carddav” [immutable]
- `url`: string, the URL of a CardDAV address book [immutable], or the LDAP URL (RFC4516) of an
    LDAP address book
- `username`: string
- *for LDAP only:*
- `socketType` (one of):
  - "plain"
  - "tls"
- `authMethod` (one of): string, if there is a username
  - "passwordCleartext"
  - "gssapi"

## Calendars

- `deleted`: `true` if this calendar has been removed
- `name`: string, user-visible way to identify this calendar
- `type`: “caldav”, “ics” [immutable]
- `url`: string [immutable]
- `username`: string
