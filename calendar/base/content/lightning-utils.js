/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported ltnInitMailIdentitiesRow, ltnGetMailIdentitySelection,
 *          ltnSaveMailIdentitySelection, ltnNotifyOnIdentitySelection
 */

/* global MozElements, addMenuItem */

var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "gIdentityNotification", () => {
  return new MozElements.NotificationBox(element => {
    document.getElementById("no-identity-notification").append(element);
  });
});

/**
 * Initialize the email identity row. Shared between the calendar creation
 * dialog and the calendar properties dialog.
 *
 * @param {calICalendar} aCalendar    The calendar being created or edited.
 */
function ltnInitMailIdentitiesRow(aCalendar) {
  if (!aCalendar) {
    document.getElementById("calendar-email-identity-row").toggleAttribute("hidden", true);
  }

  let imipIdentityDisabled = aCalendar.getProperty("imip.identity.disabled");
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
  if (aCalendar && aCalendar.aclEntry && aCalendar.aclEntry.hasAccessControl) {
    identities = aCalendar.aclEntry.getOwnerIdentities();
  } else {
    identities = MailServices.accounts.allIdentities;
  }
  for (let identity of identities) {
    addMenuItem(menuPopup, identity.identityName, identity.key);
  }
  let sel = aCalendar.getProperty("imip.identity");
  if (sel) {
    sel = sel.QueryInterface(Ci.nsIMsgIdentity);
  }
  document.getElementById("email-identity-menulist").value = sel ? sel.key : "none";
}

/**
 * Returns the selected email identity. Shared between the calendar creation
 * dialog and the calendar properties dialog.
 *
 * @param {calICalendar} aCalendar    The calendar for the identity selection.
 * @returns {string}                  The key of the selected nsIMsgIdentity or 'none'.
 */
function ltnGetMailIdentitySelection(aCalendar) {
  let sel = "none";
  if (aCalendar) {
    let imipIdentityDisabled = aCalendar.getProperty("imip.identity.disabled");
    let selItem = document.getElementById("email-identity-menulist").selectedItem;
    if (!imipIdentityDisabled && selItem) {
      sel = selItem.getAttribute("value");
    }
  }
  return sel;
}

/**
 * Persists the selected email identity. Shared between the calendar creation
 * dialog and the calendar properties dialog.
 *
 * @param {calICalendar} aCalendar    The calendar for the identity selection.
 */
function ltnSaveMailIdentitySelection(aCalendar) {
  if (aCalendar) {
    let sel = ltnGetMailIdentitySelection(aCalendar);
    // no imip.identity.key will default to the default account/identity, whereas
    // an empty key indicates no imip; that identity will not be found
    aCalendar.setProperty("imip.identity.key", sel == "none" ? "" : sel);
  }
}

/**
 * Displays a warning if the user doesn't assign an email identity to a
 * calendar. Shared between the calendar creation dialog and the calendar
 * properties dialog.
 *
 * @param {calICalendar} aCalendar    The calendar for the identity selection.
 */
function ltnNotifyOnIdentitySelection(aCalendar) {
  gIdentityNotification.removeAllNotifications();

  let msg = cal.l10n.getLtnString("noIdentitySelectedNotification");
  let sel = ltnGetMailIdentitySelection(aCalendar);

  if (sel == "none") {
    gIdentityNotification.appendNotification(
      msg,
      "noIdentitySelected",
      null,
      gIdentityNotification.PRIORITY_WARNING_MEDIUM
    );
  } else {
    gIdentityNotification.removeAllNotifications();
  }
}
