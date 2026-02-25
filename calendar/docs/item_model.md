# Events and Tasks

The calendar item model leans heavily on the [iCalendar specification](https://datatracker.ietf.org/doc/html/rfc5545).
Thunderbird implements `VEVENT` events and `VTODO` tasks but not `VJOURNAL`.

Events and tasks share a common base class, `CalItemBase` (implementing `calIItemBase`) and each
has its own class (`CalEvent` implementing `calIEvent` and `CalTodo` implementing `calITodo`) for
the traits specific to the type. The key difference is that events have a start and end date,
whereas tasks have entry, due, and completion dates as well as completion status properties.
Collectively events and tasks are referred to as items. To find out if an item is an event or a
task, call `isEvent()` or `isTodo()` on it.

Beneath the surface, item data is handled by [ical.js](https://github.com/kewisch/ical.js), a
replacement for [libical](https://github.com/libical/libical) originally written for Thunderbird
(actually for Lightning, as it was then). Bugs found in this code should be sent upstream to the
ical.js project.

## Mutability

Items can be mutable (changeable) or immutable (unchangeable). They start out as mutable so that
the initial state can be established, then `makeImmutable()` is called. Once an item is marked as
immutable it cannot be made mutable again – to change its properties, it must first be cloned.

Mutability also applies to object property types, such as `CalRecurrenceRule`.

## Item Components

As well as simple properties such as dates, summaries, and locations, items can have more
complicated properties handled by separate classes:

### Recurrence

Items can repeat, either as one or more individual occurrences, or a series of occurrences defined
by a rule. If an item repeats, the item object will have a `recurrenceInfo` property. Individual
occurrences (as appear in the UI, for example) are also items, but they have no `recurrenceInfo`,
instead they have a `parentItem` which points to the item with the info.

`CalRecurrenceInfo` objects hold a collection of `CalRecurrenceDate` (for one-off `RDATE`
occurrences, or `EXDATE` exceptions) and `CalRecurrenceRule` (for `RRULE` occurrence patterns)
objects describing the recurrence.

### Attendees

Items used for scheduling have an organiser and attendees. These are implemented as `CalAttendee`.

### Alarms

Alarms (reminders) of various types can be attached to events. These are implemented as `CalAlarm`.
