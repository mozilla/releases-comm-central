# Calendars

Calendars implement calICalendar. They are managed by `CalCalendarManager` (`cal.manager`), which
implements `calICalendarManager`. Calendar configuration is stored in preferences named
`calendar.registry.` plus the ID of the calendar.

## Useful properties

- `name` - The human-readable name of the calendar.
- `id` - Unique identifier for the calendar.
- `type` - What sort of calendar this is, see below.

## Useful methods

- `getProperty`/`setProperty`/`deleteProperty` - Arbitrary name and value properties.
- `addItem`/`modifyItem`/`deleteItem` - Modify the collection of items in the calendar.
- `getItem`/`getItems`/`getItemsAsArray` - Fetch one or a group of items from the calendar.

## Calendar Types

Calendars are either local or network (online) calendars, and add-ons exist that provide calendar
data. Network calendar types handle only the communication with servers, actual item storage is
automatically performed by a separate local calendar.

### Memory

This is the most basic type and only stores items in memory. They are lost when Thunderbird closes.
As such, it's not very useful for much except tests or as item storage for network calendars
without offline support.

### Storage

This type stores items in SQLite databases. It is used as the calendar type of local (non-network)
calendars and as item storage of network calendars with offline support.

### iCalendar/Webcal

This is a network calendar accessed by a single request from an HTTP server. Users with
authorisation can update also push updates to the server. In Thunderbird code this is usually
called an iCalendar or ICS calendar, referring to the usual file extension for iCalendar files.
Sometimes the URL for a calendar of this type has a `webcal:` or `webcals:` scheme, though they are
actually `http:` or `https:` URLs. See [RFC5545](https://datatracker.ietf.org/doc/html/rfc5545).

### CalDAV

CalDAV is an extension of the HTTP protocol for managing items on a server. See
[RFC4791](https://datatracker.ietf.org/doc/html/rfc4791).

### GData

[Provider for Google Calendar](https://addons.thunderbird.net/en-US/thunderbird/addon/provider-for-google-calendar/)
is the most popular calendar add-on for Thunderbird and it has more users than the iCalendar type,
so it is worth mentioning here. The add-on talks to Google Calendar using Google's proprietary APIs
and supports some features that are unavailable using CalDAV.
