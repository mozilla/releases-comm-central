/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad, onUnload, updatePartStat, browseDocument, reply */

/* global MozElements */

/* import-globals-from ../../src/calApplicationUtils.js */
/* import-globals-from calendar-dialog-utils.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "gStatusNotification", () => {
  return new MozElements.NotificationBox(element => {
    document.getElementById("status-notifications").append(element);
  });
});

/**
 * Sets up the summary dialog, setting all needed fields on the dialog from the
 * item received in the window arguments.
 */
function onLoad() {
  let args = window.arguments[0];
  let item = args.calendarEvent;
  item = item.clone(); // use an own copy of the passed item
  window.calendarItem = item;
  window.isInvitation = args.isInvitation;
  let dialog = document.querySelector("dialog");

  document.title = item.title;

  // set the dialog-id to enable the right window-icon to be loaded.
  if (cal.item.isEvent(item)) {
    setDialogId(dialog, "calendar-event-summary-dialog");
  } else if (cal.item.isToDo(item)) {
    setDialogId(dialog, "calendar-task-summary-dialog");
  }

  // Start setting up the item summary custom element.
  let itemSummary = document.getElementById("calendar-item-summary");
  itemSummary.item = item;

  window.readOnly = itemSummary.readOnly;
  let calendar = itemSummary.calendar;

  if (!window.readOnly && calendar) {
    let attendee = calendar.getInvitedAttendee(item);
    if (attendee) {
      // if this is an unresponded invitation, preset our default alarm values:
      if (!item.getAlarms().length && attendee.participationStatus == "NEEDS-ACTION") {
        cal.alarms.setDefaultValues(item);
      }

      window.attendee = attendee.clone();
      // Since we don't have API to update an attendee in place, remove
      // and add again. Also, this is needed if the attendee doesn't exist
      // (i.e REPLY on a mailing list)
      item.removeAttendee(attendee);
      item.addAttendee(window.attendee);

      window.responseMode = "USER";
    }
  }

  // Finish setting up the item summary custom element.
  itemSummary.updateItemDetails();

  window.addEventListener("resize", () => {
    itemSummary.onWindowResize();
  });

  updateToolbar();
  updateDialogButtons(item);

  if (typeof window.ToolbarIconColor !== "undefined") {
    window.ToolbarIconColor.init();
  }

  window.focus();
  opener.setCursor("auto");
}

function onUnload() {
  if (typeof window.ToolbarIconColor !== "undefined") {
    window.ToolbarIconColor.uninit();
  }
}

/**
 * Updates the user's participation status (PARTSTAT from see RFC5545), and
 * send a notification if requested. Then close the dialog.
 *
 * @param {string} aResponseMode - a literal of one of the response modes defined
 *                                 in calIItipItem (like 'NONE')
 * @param {string} aPartStat - participation status; a PARTSTAT value
 */
function reply(aResponseMode, aPartStat) {
  // Set participation status.
  if (window.attendee) {
    let aclEntry = window.calendarItem.calendar.aclEntry;
    if (aclEntry) {
      let userAddresses = aclEntry.getUserAddresses();
      if (
        userAddresses.length > 0 &&
        !cal.email.attendeeMatchesAddresses(window.attendee, userAddresses)
      ) {
        window.attendee.setProperty("SENT-BY", "mailto:" + userAddresses[0]);
      }
    }
    window.attendee.participationStatus = aPartStat;
    updateToolbar();
  }

  // Send notification and close window.
  saveAndClose(aResponseMode);
}

/**
 * Stores the event in the calendar, sends a notification if requested and
 * closes the dialog.
 * @param {string} aResponseMode - a literal of one of the response modes defined
 *                                 in calIItipItem (like 'NONE')
 */
function saveAndClose(aResponseMode) {
  window.responseMode = aResponseMode;
  document.querySelector("dialog").acceptDialog();
}

function updateToolbar() {
  if (window.readOnly || window.isInvitation !== true) {
    document.getElementById("summary-toolbox").hidden = true;
    return;
  }

  let replyButtons = document.getElementsByAttribute("type", "menu-button");
  for (let element of replyButtons) {
    element.removeAttribute("hidden");
    if (window.attendee) {
      // we disable the control which represents the current partstat
      let status = window.attendee.participationStatus || "NEEDS-ACTION";
      if (element.getAttribute("value") == status) {
        element.setAttribute("disabled", "true");
      } else {
        element.removeAttribute("disabled");
      }
    }
  }

  if (window.attendee) {
    // we display a notification about the users partstat
    let partStat = window.attendee.participationStatus || "NEEDS-ACTION";
    let type = cal.item.isEvent(window.calendarItem) ? "event" : "task";

    let msgStr = {
      ACCEPTED: type + "Accepted",
      COMPLETED: "taskCompleted",
      DECLINED: type + "Declined",
      DELEGATED: type + "Delegated",
      TENTATIVE: type + "Tentative",
    };
    // this needs to be noted differently to get accepted the '-' in the key
    msgStr["NEEDS-ACTION"] = type + "NeedsAction";
    msgStr["IN-PROGRESS"] = "taskInProgress";

    let msg = cal.l10n.getString("calendar-event-dialog", msgStr[partStat]);

    gStatusNotification.appendNotification(
      msg,
      "statusNotification",
      null,
      gStatusNotification.PRIORITY_INFO_MEDIUM
    );
  } else {
    gStatusNotification.removeAllNotifications();
  }
}

/**
 * Browse the item's attached URL.
 *
 * XXX This function is broken, should be fixed in bug 471967
 */
function browseDocument() {
  let args = window.arguments[0];
  let item = args.calendarEvent;
  let url = item.getProperty("URL");
  launchBrowser(url);
}

/**
 * Copy the text content of the given link node to the clipboard.
 *
 * @param {string} labelNode - The label node inside an html:a element.
 */
function locationCopyLink(labelNode) {
  let clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
  clipboard.copyString(labelNode.parentNode.getAttribute("href"));
}

/**
 * This configures the dialog buttons depending on the writable status
 * of the item and whether it recurs or not:
 * 1) The calendar is read-only - The buttons stay hidden.
 * 2) The item is an invitation - The buttons stay hidden.
 * 3) The item is recurring     - Show an edit menu with occurrence options.
 * 4) Otherwise                 - Show the single edit button.
 *
 * @param {calIItemBase} item
 */
function updateDialogButtons(item) {
  let editButton = document.getElementById("calendar-summary-dialog-edit-button");
  let isRecurring = item.parentItem !== item;
  if (window.readOnly === true) {
    // This enables pressing the "enter" key to close the dialog.
    editButton.focus();
  } else if (window.isInvitation === true) {
    document.addEventListener("dialogaccept", onInvitationDialogAccept);
  } else if (isRecurring) {
    // Show the edit button menu for repeating events.
    let menuButton = document.getElementById("calendar-summary-dialog-edit-menu-button");
    menuButton.hidden = false;
  } else {
    // Show the single edit button for non-repeating events.
    document.addEventListener("dialogaccept", () => {
      useEditDialog(item);
    });
    editButton.hidden = false;
  }
  // Show the custom dialog footer when the event is editable.
  if (window.readOnly !== true && window.isInvitation !== true) {
    let footer = document.getElementById("calendar-summary-dialog-custom-button-footer");
    footer.hidden = false;
  }
}

/**
 * Saves any changed information to the item.
 */
function onInvitationDialogAccept() {
  // let's make sure we have a response mode defined
  let resp = window.responseMode || "USER";
  let respMode = { responseMode: Ci.calIItipItem[resp] };

  let args = window.arguments[0];
  let oldItem = args.calendarEvent;
  let newItem = window.calendarItem;
  let calendar = newItem.calendar;
  saveReminder(newItem, calendar, document.querySelector(".item-alarm"));
  adaptScheduleAgent(newItem);
  args.onOk(newItem, calendar, oldItem, null, respMode);
  window.calendarItem = newItem;
}

/**
 * Invokes the editing dialog for the current item occurrence.
 */
function onEditThisOccurrence() {
  useEditDialog(window.calendarItem);
}

/**
 * Invokes the editing dialog for all occurrences of the current item.
 */
function onEditAllOccurrences() {
  useEditDialog(window.calendarItem.parentItem);
}

/**
 * Switch to the "modify" mode dialog so the user can make changes to the event.
 * @param {calIItemBase} item
 */
function useEditDialog(item) {
  window.addEventListener("unload", () => {
    window.opener.modifyEventWithDialog(item, false);
  });
  window.close();
}
