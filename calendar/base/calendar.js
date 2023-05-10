#filter dumbComments emptyLines substitution

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// This file contains all of the default preference values for Calendar.

// Turns on basic calendar logging.
pref("calendar.debug.log", false);
// Turns on verbose calendar logging.
pref("calendar.debug.log.verbose", false);

// general settings
pref("calendar.date.format", 0);
pref("calendar.event.defaultlength", 60);
pref("calendar.task.defaultstart", "none");
pref("calendar.task.defaultstartoffset", 0);
pref("calendar.task.defaultstartoffsetunits", "minutes");
pref("calendar.task.defaultdue", "none");
pref("calendar.task.defaultdueoffset", 60);
pref("calendar.task.defaultdueoffsetunits", "minutes");

// default transparency (free-busy status) of standard and all-day events
pref("calendar.events.defaultTransparency.allday.transparent", true);
pref("calendar.events.defaultTransparency.standard.transparent", false);

// Make "Edit" the default action for events.
pref("calendar.events.defaultActionEdit", false);

// Number of days in Today Pane agenda
pref("calendar.agenda.days", 14);

// alarm settings
pref("calendar.alarms.show", true);
pref("calendar.alarms.showmissed", true);
pref("calendar.alarms.playsound", true);
pref("calendar.alarms.soundType", 0);
pref("calendar.alarms.soundURL", "chrome://calendar/content/sound.wav");
pref("calendar.alarms.defaultsnoozelength", 5);
pref("calendar.alarms.indicator.show", true);
pref("calendar.alarms.indicator.totaltime", 3600);

// default alarm settings for new event
pref("calendar.alarms.onforevents", 0);
pref("calendar.alarms.eventalarmlen", 15);
pref("calendar.alarms.eventalarmunit", "minutes");

// default alarm settings for new task
pref("calendar.alarms.onfortodos", 0);
pref("calendar.alarms.todoalarmlen", 15);
pref("calendar.alarms.todoalarmunit", "minutes");

pref("calendar.alarms.loglevel", "Warn");

// The default timeouts to show notifications for calendar items. The value
// should be in the form of "-PT1D,PT2M,END:-PT3M", which means to show
// notifications at: 1 day before the start, 2 minutes after the start, 3
// minutes before the end.
pref("calendar.notifications.times", "");

// open invitations autorefresh settings
pref("calendar.invitations.autorefresh.enabled", true);
pref("calendar.invitations.autorefresh.timeout", 3);

// whether "notify" is checked by default when creating new events/todos with attendees
pref("calendar.itip.notify", true);

// whether "Separate invitation per attendee" is checked by default
pref("calendar.itip.separateInvitationPerAttendee", false);

// whether the organizer propagates replies of attendees to all attendees
pref("calendar.itip.notify-replies", false);

// whether email invitation updates are send out to all attendees if (only) adding a new attendee
pref("calendar.itip.updateInvitationForNewAttendeesOnly", false);

//whether changes in email invitation updates should be displayed
pref("calendar.itip.displayInvitationChanges", true);

//whether for delegated invitations a delegatee's replies will be send also to delegator(s)
pref("calendar.itip.notifyDelegatorOnReply", true);

// whether to prefix the subject field for email invitation invites or updates.
pref("calendar.itip.useInvitationSubjectPrefixes", true);

// whether separate invitation actions to more separate buttons or integrate into few buttons
pref("calendar.itip.separateInvitationButtons", true);

// Whether to show the imip bar.
pref("calendar.itip.showImipBar", true);

// Whether to always expand the iMIP details, instead of collapsing them.
pref("calendar.itip.imipDetailsOpen", true);

// Temporary pref for using the new invitation display instead of the old one.
pref("calendar.itip.newInvitationDisplay", false);

// whether CalDAV (experimental) scheduling is enabled or not.
pref("calendar.caldav.sched.enabled", false);

// 0=Sunday, 1=Monday, 2=Tuesday, etc.  One day we might want to move this to
// a locale specific file.
pref("calendar.week.start", 0);
pref("calendar.weeks.inview", 4);
pref("calendar.previousweeks.inview", 0);

// Show week number in minimonth and multiweek/month views
pref("calendar.view-minimonth.showWeekNumber", true);

// Default days off
pref("calendar.week.d0sundaysoff", true);
pref("calendar.week.d1mondaysoff", false);
pref("calendar.week.d2tuesdaysoff", false);
pref("calendar.week.d3wednesdaysoff", false);
pref("calendar.week.d4thursdaysoff", false);
pref("calendar.week.d5fridaysoff", false);
pref("calendar.week.d6saturdaysoff", true);

// start and end work hour for day and week views
pref("calendar.view.daystarthour", 8);
pref("calendar.view.dayendhour", 17);

// number of visible hours for day and week views
pref("calendar.view.visiblehours", 9);

// If true, mouse scrolling via shift+wheel will be enabled
pref("calendar.view.mousescroll", true);

// Do not set this!  If it's not there, then we guess the system timezone
//pref("calendar.timezone.local", "");

// Recent timezone list
pref("calendar.timezone.recent", "[]");

// categories settings
// XXX One day we might want to move this to a locale specific file
//     and include a list of locale specific default categories
pref("calendar.categories.names", "");

// Disable use of worker threads. Restart needed.
pref("calendar.threading.disabled", false);

// The maximum time in microseconds that a cal.iterate.forEach event can take (soft limit).
pref("calendar.threading.latency ", 250);

// Enable support for multiple realms on one server with the payoff that you
// will get multiple password dialogs (one for each calendar)
pref("calendar.network.multirealm", false);

// Disable hiding the label on todayPane button
pref("calendar.view.showTodayPaneStatusLabel", true);

// Maximum number of iterations allowed when searching for the next matching
// occurrence of a repeating item in calFilter
pref("calendar.filter.maxiterations", 50);

// Edit events and tasks in a tab rather than a window.
pref("calendar.item.editInTab", false);

// Always use the currently selected calendar as target for paste operations
pref("calendar.paste.intoSelectedCalendar", false);

pref("calendar.baseview.loglevel", "Warn");

// Enables the prompt when deleting from the item views or trees.
pref("calendar.item.promptDelete", true);

// Enables the new extract service.
pref("calendar.extract.service.enabled", false);

// Number of days to display in the invite attendees interface.
pref("calendar.view.attendees.visibleDays", 16);
// Only full days are displayed the invite attendees interface.
pref("calendar.view.attendees.showOnlyWholeDays", false);
