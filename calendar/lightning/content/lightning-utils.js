/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported ltnInitMailIdentitiesRow, ltnGetMailIdentitySelection,
 *          ltnSaveMailIdentitySelection, ltnNotifyOnIdentitySelection
 */

/* global MozElements */

/* import-globals-from ../../base/content/calendar-ui-utils.js */
/* globals gCalendar */

var { fixIterator } = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * Initializing the email identity row
 * (shared between calendar creation wizard and properties dialog)
 */
function ltnInitMailIdentitiesRow() {
  if (!gCalendar) {
    document.getElementById("calendar-email-identity-row").toggleAttribute("hidden", true);
  }

  let imipIdentityDisabled = gCalendar.getProperty("imip.identity.disabled");
  document
    .getElementById("calendar-email-identity-row")
    .toggleAttribute("hidden", imipIdentityDisabled);

  if (imipIdentityDisabled) {
    // If the imip identity is disabled, we don't have to set up the
    // menulist.
    return;
  }

  // If there is no transport but also no organizer id, then the
  // provider has not statically configured an organizer id. This is
  // basically what happens when "None" is selected.
  let menuPopup = document.getElementById("email-identity-menupopup");

  // Remove all children from the email list to avoid duplicates if the list
  // has already been populated during a previous step in the calendar
  // creation wizard.
  while (menuPopup.hasChildNodes()) {
    menuPopup.lastChild.remove();
  }

  addMenuItem(menuPopup, cal.l10n.getLtnString("imipNoIdentity"), "none");
  let identities;
  if (gCalendar && gCalendar.aclEntry && gCalendar.aclEntry.hasAccessControl) {
    identities = gCalendar.aclEntry.getOwnerIdentities();
  } else {
    identities = MailServices.accounts.allIdentities;
  }
  for (let identity of fixIterator(identities, Ci.nsIMsgIdentity)) {
    addMenuItem(menuPopup, identity.identityName, identity.key);
  }
  try {
    let sel = gCalendar.getProperty("imip.identity");
    if (sel) {
      sel = sel.QueryInterface(Ci.nsIMsgIdentity);
    }
    menuListSelectItem("email-identity-menulist", sel ? sel.key : "none");
  } catch (exc) {
    // Don't select anything if the identity can't be found
  }
}

/**
 * Providing the selected email identity
 * (shared between calendar creation wizard and properties dialog)
 *
 * @returns {String}  the key of the selected nsIMsgIdentity or 'none'
 */
function ltnGetMailIdentitySelection() {
  let sel = "none";
  if (gCalendar) {
    let imipIdentityDisabled = gCalendar.getProperty("imip.identity.disabled");
    let selItem = document.getElementById("email-identity-menulist").selectedItem;
    if (!imipIdentityDisabled && selItem) {
      sel = selItem.getAttribute("value");
    }
  }
  return sel;
}

/**
 * Persisting the selected email identity
 * (shared between calendar creation wizard and properties dialog)
 */
function ltnSaveMailIdentitySelection() {
  if (gCalendar) {
    let sel = ltnGetMailIdentitySelection();
    // no imip.identity.key will default to the default account/identity, whereas
    // an empty key indicates no imip; that identity will not be found
    gCalendar.setProperty("imip.identity.key", sel == "none" ? "" : sel);
  }
}

/**
 * Displays a warning if the user doesn't assign an email identity to a calendar
 * (shared between calendar creation wizard and properties dialog)
 */
function ltnNotifyOnIdentitySelection() {
  let notificationBox = document.getElementById("no-identity-notification");
  while (notificationBox.firstChild) {
    notificationBox.firstChild.remove();
  }
  let gNotification = {};
  XPCOMUtils.defineLazyGetter(gNotification, "notificationbox", () => {
    return new MozElements.NotificationBox(element => {
      element.setAttribute("flex", "1");
      notificationBox.append(element);
    });
  });

  let msg = cal.l10n.getLtnString("noIdentitySelectedNotification");
  let sel = ltnGetMailIdentitySelection();

  if (sel == "none") {
    gNotification.notificationbox.appendNotification(
      msg,
      "noIdentitySelected",
      null,
      gNotification.notificationbox.PRIORITY_WARNING_MEDIUM
    );
  } else {
    gNotification.notificationbox.removeAllNotifications();
  }
}
