/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported reply */

/* global MozElements */

/* import-globals-from calendar-dialog-utils.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  SelectionUtils: "resource://gre/modules/SelectionUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(this, "gStatusNotification", () => {
  return new MozElements.NotificationBox(async element => {
    const box = document.getElementById("status-notifications");
    // Fix window size after the notification animation is done.
    box.addEventListener(
      "transitionend",
      () => {
        window.sizeToContent();
      },
      { once: true }
    );
    box.append(element);
  });
});

window.addEventListener("load", onLoad);
window.addEventListener("unload", onUnload);

/**
 * Sets up the summary dialog, setting all needed fields on the dialog from the
 * item received in the window arguments.
 */
async function onLoad() {
  const args = window.arguments[0];
  let item = args.calendarEvent;
  item = item.clone(); // use an own copy of the passed item
  window.calendarItem = item;
  window.isInvitation = args.isInvitation;
  const dialog = document.querySelector("dialog");

  document.title = item.title;

  // set the dialog-id to enable the right CSS to be used.
  if (item.isEvent()) {
    setDialogId(dialog, "calendar-event-summary-dialog");
  } else if (item.isTodo()) {
    setDialogId(dialog, "calendar-task-summary-dialog");
  }

  // Start setting up the item summary custom element.
  const itemSummary = document.getElementById("calendar-item-summary");
  itemSummary.item = item;

  window.readOnly = itemSummary.readOnly;
  const calendar = itemSummary.calendar;

  if (!window.readOnly) {
    const attendee = cal.itip.getInvitedAttendee(item, calendar);
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

  updateToolbar();
  updateDialogButtons(item);

  if (typeof window.ToolbarIconColor !== "undefined") {
    window.ToolbarIconColor.init();
  }

  await document.l10n.translateRoots();
  window.sizeToContent();
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
    const aclEntry = window.calendarItem.calendar.aclEntry;
    if (aclEntry) {
      const userAddresses = aclEntry.getUserAddresses();
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
 *
 * @param {string} aResponseMode - a literal of one of the response modes defined
 *                                 in calIItipItem (like 'NONE')
 */
function saveAndClose(aResponseMode) {
  window.responseMode = aResponseMode;
  document.querySelector("dialog").acceptDialog();
}

async function updateToolbar() {
  if (window.readOnly || window.isInvitation !== true) {
    document.getElementById("summary-toolbox").hidden = true;
    return;
  }

  const replyButtons = document.getElementsByAttribute("type", "menu-button");
  for (const element of replyButtons) {
    element.removeAttribute("hidden");
    if (window.attendee) {
      // we disable the control which represents the current partstat
      const status = window.attendee.participationStatus || "NEEDS-ACTION";
      if (element.getAttribute("value") == status) {
        element.setAttribute("disabled", "true");
      } else {
        element.removeAttribute("disabled");
      }
    }
  }

  if (window.attendee) {
    // we display a notification about the users partstat
    const partStat = window.attendee.participationStatus || "NEEDS-ACTION";
    const type = window.calendarItem.isEvent() ? "event" : "task";

    const msgStr = {
      ACCEPTED: type + "Accepted",
      COMPLETED: "taskCompleted",
      DECLINED: type + "Declined",
      DELEGATED: type + "Delegated",
      TENTATIVE: type + "Tentative",
    };
    // this needs to be noted differently to get accepted the '-' in the key
    msgStr["NEEDS-ACTION"] = type + "NeedsAction";
    msgStr["IN-PROGRESS"] = "taskInProgress";

    const msg = cal.l10n.getString("calendar-event-dialog", msgStr[partStat]);

    await gStatusNotification
      .appendNotification(
        "statusNotification",
        {
          label: msg,
          priority: gStatusNotification.PRIORITY_INFO_MEDIUM,
        },
        null
      )
      .catch(console.warn);
  } else {
    gStatusNotification.removeAllNotifications();
  }
}

/**
 * Copy the text content of the given link node to the clipboard.
 *
 * @param {string} labelNode - The label node inside an html:a element.
 */
function locationCopyLink(labelNode) {
  const clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
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
  const editButton = document.getElementById("calendar-summary-dialog-edit-button");
  const isRecurring = item.parentItem !== item;
  if (window.readOnly === true) {
    // This enables pressing the "enter" key to close the dialog.
    editButton.focus();
  } else if (window.isInvitation === true) {
    document.addEventListener("dialogaccept", onInvitationDialogAccept);
  } else if (isRecurring) {
    // Show the edit button menu for repeating events.
    const menuButton = document.getElementById("calendar-summary-dialog-edit-menu-button");
    menuButton.hidden = false;

    // Pressing the "enter" key will display the occurrence menu.
    document.getElementById("calendar-summary-dialog-edit-menu-button").focus();
    document.addEventListener("dialogaccept", evt => {
      evt.preventDefault();
    });
  } else {
    // Show the single edit button for non-repeating events.
    document.addEventListener("dialogaccept", () => {
      useEditDialog(item);
    });
    editButton.hidden = false;
  }
  // Show the custom dialog footer when the event is editable.
  if (window.readOnly !== true && window.isInvitation !== true) {
    const footer = document.getElementById("calendar-summary-dialog-custom-button-footer");
    footer.hidden = false;
  }
}

/**
 * Saves any changed information to the item.
 */
function onInvitationDialogAccept() {
  // let's make sure we have a response mode defined
  const resp = window.responseMode || "USER";
  const respMode = { responseMode: Ci.calIItipItem[resp] };

  const args = window.arguments[0];
  const oldItem = args.calendarEvent;
  const newItem = window.calendarItem;
  const calendar = newItem.calendar;
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
 *
 * @param {calIItemBase} item
 */
function useEditDialog(item) {
  window.addEventListener("unload", () => {
    window.opener.modifyEventWithDialog(item, false);
  });
  window.close();
}

/**
 * Initializes the context menu used for the attendees area.
 *
 * @param {Event} event
 */
function onAttendeeContextMenu(event) {
  const copyMenu = document.getElementById("attendee-popup-copy-menu");
  const item = window.arguments[0].calendarEvent;

  const attId =
    event.target.getAttribute("attendeeid") || event.target.parentNode.getAttribute("attendeeid");
  const attendee = item.getAttendees().find(att => att.id == attId);

  if (!attendee) {
    copyMenu.hidden = true;
    return;
  }

  const id = attendee.toString();
  const idMenuItem = document.getElementById("attendee-popup-copy-menu-id");
  idMenuItem.setAttribute("label", id);
  idMenuItem.hidden = false;

  const name = attendee.commonName;
  const nameMenuItem = document.getElementById("attendee-popup-copy-menu-common-name");
  if (name && name != id) {
    nameMenuItem.setAttribute("label", name);
    nameMenuItem.hidden = false;
  } else {
    nameMenuItem.hidden = true;
  }

  copyMenu.hidden = false;
}

/**
 * Initializes the context menu used for the event description area in the
 * event summary.
 *
 * @param {Event} event
 */
function openDescriptionContextMenu(event) {
  const popup = document.getElementById("description-popup");
  const link = event.target.closest("a") ? event.target.closest("a").getAttribute("href") : null;
  const linkText = event.target.closest("a") ? event.target.closest("a").text : null;
  const copyLinkTextMenuItem = document.getElementById("description-context-menu-copy-link-text");
  const copyLinkLocationMenuItem = document.getElementById(
    "description-context-menu-copy-link-location"
  );
  const selectionCollapsed = SelectionUtils.getSelectionDetails(window).docSelectionIsCollapsed;

  // Hide copy command if there is no text selected.
  popup.querySelector('[command="cmd_copy"]').hidden = selectionCollapsed;

  copyLinkLocationMenuItem.hidden = !link;
  copyLinkTextMenuItem.hidden = !link;
  popup.querySelector("#calendar-summary-description-context-menuseparator").hidden =
    selectionCollapsed && !link;
  copyLinkTextMenuItem.setAttribute("text", linkText);

  popup.openPopupAtScreen(event.screenX, event.screenY, true, event);
  event.preventDefault();
}

/**
 * Copies the link text in a calender event description
 * @param {Event} event
 */
async function copyLinkTextToClipboard(event) {
  return navigator.clipboard.writeText(event.target.getAttribute("text"));
}

/**
 * Copies the label value of a menuitem to the clipboard.
 */
async function copyLabelToClipboard(event) {
  return navigator.clipboard.writeText(event.target.getAttribute("label"));
}

/**
 * Brings up the compose window to send an e-mail to all attendees.
 */
function sendMailToAttendees() {
  const item = window.arguments[0].calendarEvent;
  const toList = cal.email.createRecipientList(item.getAttendees());
  const emailSubject = cal.l10n.getString("calendar-event-dialog", "emailSubjectReply", [
    item.title,
  ]);
  const identity = item.calendar.getProperty("imip.identity");
  cal.email.sendTo(toList, emailSubject, null, identity);
}
