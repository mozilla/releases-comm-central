# Directories

Contacts are organised into directories (also referred to as address books or just books). Every
Thunderbird profile has two default directories – Personal Address Book and Collected Addresses –
and users can add any number of additional directories.

There are various types of directory, allowing for various ways of gathering contacts. Each
directory is responsible for its own data storage.

Directories implement `nsIAbDirectory`. (Mailing lists also partially implement this, but shouldn't
be considered directories. Mailing lists are weird.) They are managed by `AddrBookManager`
(`MailServices.ab`) which implements `nsIAbManager`. Directory configuration is stored in
preferences named `ldap_2.servers.` plus a string derived from the original name of the directory.

## Useful properties

- `dirName` - The human-readable name of the directory.
- `UID` - Unique identifier for the directory.
- `URI`/`dirPrefId` - Other ways to refer to the directory. These should be considered deprecated,
    but remain commonly used in the code.
- `childNodes` - An array of mailing lists in the directory.
- `childCards` - An array of contacts and mailing lists in the directory.

## Useful methods

- `addCard`/`modifyCard`/`deleteCards` - Modify the collection of cards in the directory.
- `cardForEmailAddress` - Find a card for a given email address.
- `search` - Find cards using matching the given search criteria.

## Directory types

### SQLiteDirectory

This is the default directory type and contacts are stored in an SQLite database in the user
profile. The databases for the two default directories are `abook.sqlite` and `history.sqlite`, and
additional directories are usually named `abook-N.sqlite`, where N is a number.

The class `SQLiteDirectory` inherits from an abstract class `AddrBookDirectory` which contains most
of the code, leaving only the storage to be implemented by subclasses.

### CardDAVDirectory

`CardDAVDirectory` inherits from `SQLiteDirectory` and adds CardDAV [RFC6352](https://datatracker.ietf.org/doc/html/rfc6352)
capabilities. CardDAV can be used for synchronising contacts with a remote server.

### LDAPDirectory

LDAP servers can be queried for contacts using `LDAPDirectory`. Unlike other directory types,
`LDAPDirectory` is read-only, and it won't typically return a list of all contacts. Contacts can
only be found by searching, and all search queries go to the server — although it _is_ possible to
download all contacts from the server for offline use.

### nsAbOSXDirectory and nsAbOutlookDirectory

These provide read-only access to the system address books of macOS and Windows, respectively. They
have very few users and are no longer really maintained or supported.

### ExtSearchBook

This is a directory type that allows extensions to provide contacts in response to address book
searches.
