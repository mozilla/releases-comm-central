/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported initMailIdentitiesRow, saveMailIdentitySelection,
            notifyOnIdentitySelection, initForceEmailScheduling,
            saveForceEmailScheduling, updateForceEmailSchedulingControl */

/* global MozElements, addMenuItem, gCalendar */

var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineLazyGetter(this, "gIdentityNotification", () => {
  return new MozElements.NotificationBox(element => {
    document.getElementById("no-identity-notification").append(element);
  });
});

/**
 * Initialize the email identity row. Shared between the calendar creation
 * dialog and the calendar properties dialog.
 *
 * @param {calICalendar} aCalendar - The calendar being created or edited.
 */
function initMailIdentitiesRow(aCalendar) {
  if (!aCalendar) {
    document.getElementById("calendar-email-identity-row").toggleAttribute("hidden", true);
  }

  const imipIdentityDisabled = aCalendar.getProperty("imip.identity.disabled");
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
  const menuPopup = document.getElementById("email-identity-menupopup");

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
  for (const identity of identities) {
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
 * @param {calICalendar} aCalendar - The calendar for the identity selection.
 * @returns {string} The key of the selected nsIMsgIdentity or 'none'.
 */
function getMailIdentitySelection(aCalendar) {
  let sel = "none";
  if (aCalendar) {
    const imipIdentityDisabled = aCalendar.getProperty("imip.identity.disabled");
    const selItem = document.getElementById("email-identity-menulist").selectedItem;
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
 * @param {calICalendar} aCalendar - The calendar for the identity selection.
 */
function saveMailIdentitySelection(aCalendar) {
  if (aCalendar) {
    const sel = getMailIdentitySelection(aCalendar);
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
 * @param {calICalendar} aCalendar - The calendar for the identity selection.
 */
async function notifyOnIdentitySelection(aCalendar) {
  gIdentityNotification.removeAllNotifications();

  const msg = cal.l10n.getLtnString("noIdentitySelectedNotification");
  const sel = getMailIdentitySelection(aCalendar);

  if (sel == "none") {
    await gIdentityNotification.appendNotification(
      "noIdentitySelected",
      {
        label: msg,
        priority: gIdentityNotification.PRIORITY_WARNING_MEDIUM,
      },
      null
    );
  } else {
    gIdentityNotification.removeAllNotifications();
  }
}

/**
 * Initializing calendar creation wizard and properties dialog to display the
 * option to enforce email scheduling for outgoing scheduling operations.
 * Used in the calendar properties dialog.
 */
function initForceEmailScheduling() {
  if (gCalendar && gCalendar.type == "caldav") {
    const checkbox = document.getElementById("force-email-scheduling");
    const curStatus = checkbox.getAttribute("checked") == "true";
    const newStatus = gCalendar.getProperty("forceEmailScheduling") || curStatus;
    if (curStatus != newStatus) {
      if (newStatus) {
        checkbox.setAttribute("checked", "true");
      } else {
        checkbox.removeAttribute("checked");
      }
    }
    updateForceEmailSchedulingControl();
  } else {
    document.getElementById("calendar-force-email-scheduling-row").toggleAttribute("hidden", true);
  }
}

/**
 * Persisting the calendar property to enforce email scheduling. Used in the
 * calendar properties dialog.
 */
function saveForceEmailScheduling() {
  if (gCalendar && gCalendar.type == "caldav") {
    const checkbox = document.getElementById("force-email-scheduling");
    if (checkbox && checkbox.getAttribute("disable-capability") != "true") {
      const status = checkbox.getAttribute("checked") == "true";
      gCalendar.setProperty("forceEmailScheduling", status);
    }
  }
}

/**
 * Updates the forceEmailScheduling control based on the currently assigned
 * email identity to this calendar. Used in the calendar properties dialog.
 */
function updateForceEmailSchedulingControl() {
  const checkbox = document.getElementById("force-email-scheduling");
  if (
    gCalendar &&
    gCalendar.getProperty("capabilities.autoschedule.supported") &&
    getMailIdentitySelection(gCalendar) != "none"
  ) {
    checkbox.removeAttribute("disable-capability");
    checkbox.removeAttribute("disabled");
  } else {
    checkbox.setAttribute("disable-capability", "true");
    checkbox.setAttribute("disabled", "true");
  }
}
