/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { calendarDeactivator } from "resource:///modules/calendar/calCalendarDeactivator.sys.mjs";

/**
 * Return if this should be considered as the first run of Thunderbird or not.
 * Tests that don't want to see any first run behavior should set
 * mail.provider.suppress_dialog_on_startup to true.
 *
 * @returns {boolean}
 */
export function isFirstRun() {
  // We want at least one valid visible account in a set up profile.
  if (
    MailServices.accounts.accounts.some(
      account =>
        account.incomingServer.valid &&
        (!account.identities.length ||
          account.identities.some(identity => identity.valid))
    )
  ) {
    return false;
  }
  // If there is at least one enabled calendar, the profile is set up.
  if (calendarDeactivator.checkCalendarsEnabled()) {
    return false;
  }
  // If there is an address book with a contact, the profile is set up. We
  // ignore the OS X system address books and address books from outlook for
  // this check, since they are system data sources.
  if (
    MailServices.ab.directories.some(
      abDirectory =>
        !abDirectory.URI.startsWith("moz-abosxdirectory:") &&
        !abDirectory.URI.startsWith("moz-aboutlookdirectory:") &&
        abDirectory.childCardCount > 0
    )
  ) {
    return false;
  }
  // If the old first run pref is set, we no longer show anything on startup. This is primarily intended for tests going forward.
  if (
    Services.prefs.getBoolPref(
      "mail.provider.suppress_dialog_on_startup",
      false
    )
  ) {
    return false;
  }
  return true;
}
