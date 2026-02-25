# Contacts

Contacts implement `nsIAbCard`. Formerly, contact properties were a simple list of keys and values,
and some directory types still only support that, but most contacts are now based on the
[vCard format](https://datatracker.ietf.org/doc/html/rfc6350). In
[`SQLiteDirectory`](/addrbook/directories.md#sqlitedirectory), data is stored in vCard format with
only the most commonly used properties also stored as keys and values for performance reasons.

## Useful properties

- `UID` - Unique identifier for the contact.
- `directoryUID` - Unique identifier of the directory containing the contact.
- `firstName`/`lastName`/`displayName` - The name of the contact.
- `primaryEmail` - The first email address of the contact.
- `emailAddresses` - All email addresses of the contact, in preference order.
- `properties` - Access to the contact's properties as keys and values.
- `vCardProperties` - A `VCardProperties` object allowing direct access to the items in the
    contact's vCard.
