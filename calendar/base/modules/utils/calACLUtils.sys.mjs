/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers for permission checks and other ACL features
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.acl namespace.

export var acl = {
  /**
   * Check if the specified calendar is writable. This is the case when it is
   * not marked readOnly, we are not offline, or we are offline and the
   * calendar is local.
   *
   * @param aCalendar     The calendar to check
   * @returns True if the calendar is writable
   */
  isCalendarWritable(aCalendar) {
    return (
      !aCalendar.getProperty("disabled") &&
      !aCalendar.readOnly &&
      (!Services.io.offline ||
        aCalendar.getProperty("cache.enabled") ||
        aCalendar.getProperty("cache.always") ||
        aCalendar.getProperty("requiresNetwork") === false)
    );
  },

  /**
   * Check if the specified calendar is writable from an ACL point of view.
   *
   * @param aCalendar     The calendar to check
   * @returns True if the calendar is writable
   */
  userCanAddItemsToCalendar(aCalendar) {
    const aclEntry = aCalendar.aclEntry;
    return (
      !aclEntry || !aclEntry.hasAccessControl || aclEntry.userIsOwner || aclEntry.userCanAddItems
    );
  },

  /**
   * Check if the user can delete items from the specified calendar, from an
   * ACL point of view.
   *
   * @param aCalendar     The calendar to check
   * @returns True if the calendar is writable
   */
  userCanDeleteItemsFromCalendar(aCalendar) {
    const aclEntry = aCalendar.aclEntry;
    return (
      !aclEntry || !aclEntry.hasAccessControl || aclEntry.userIsOwner || aclEntry.userCanDeleteItems
    );
  },

  /**
   * Check if the user can fully modify the specified item, from an ACL point
   * of view.  Note to be confused with the right to respond to an
   * invitation, which is handled instead by userCanRespondToInvitation.
   *
   * @param aItem         The calendar item to check
   * @returns True if the item is modifiable
   */
  userCanModifyItem(aItem) {
    const aclEntry = aItem.aclEntry;
    return (
      !aclEntry ||
      !aclEntry.calendarEntry.hasAccessControl ||
      aclEntry.calendarEntry.userIsOwner ||
      aclEntry.userCanModify
    );
  },

  /**
   * Checks if the user can modify the item and has the right to respond to
   * invitations for the item.
   *
   * @param aItem         The calendar item to check
   * @returns True if the invitation w.r.t. the item can be
   *                        responded to.
   */
  userCanRespondToInvitation(aItem) {
    const aclEntry = aItem.aclEntry;
    // TODO check if || is really wanted here
    return acl.userCanModifyItem(aItem) || aclEntry.userCanRespond;
  },
};
