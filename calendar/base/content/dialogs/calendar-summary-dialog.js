/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad, onUnload, updatePartStat, browseDocument,
 *          sendMailToOrganizer, openAttachment, reply
 */

/* global MozElements */

/* import-globals-from ../../src/calApplicationUtils.js */
/* import-globals-from calendar-dialog-utils.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { recurrenceRule2String } = ChromeUtils.import(
  "resource:///modules/calendar/calRecurrenceUtils.jsm"
);
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

const gNotification = {};
XPCOMUtils.defineLazyGetter(gNotification, "notificationbox", () => {
  return new MozElements.NotificationBox(element => {
    element.setAttribute("flex", "1");
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
  let dialog = document.querySelector("dialog");

  // the calling entity provides us with an object that is responsible
  // for recording details about the initiated modification. the 'finalize'-property
  // is our hook in order to receive a notification in case the operation needs
  // to be terminated prematurely. this function will be called if the calling
  // entity needs to immediately terminate the pending modification. in this
  // case we serialize the item and close the window.
  if (args.job) {
    // store the 'finalize'-functor in the provided job-object.
    args.job.finalize = () => {
      // store any pending modifications...
      this.onAccept();

      let calendarItem = window.calendarItem;

      // ...and close the window.
      window.close();

      return calendarItem;
    };
  }

  // set the dialog-id to enable the right window-icon to be loaded.
  if (cal.item.isEvent(item)) {
    setDialogId(dialog, "calendar-event-summary-dialog");
  } else if (cal.item.isToDo(item)) {
    setDialogId(dialog, "calendar-task-summary-dialog");
  }

  window.attendees = item.getAttendees();

  let calendar = cal.wrapInstance(item.calendar, Ci.calISchedulingSupport);
  window.readOnly = !(
    cal.acl.isCalendarWritable(calendar) &&
    (cal.acl.userCanModifyItem(item) ||
      (calendar && item.calendar.isInvitation(item) && cal.acl.userCanRespondToInvitation(item)))
  );
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

  document.getElementById("item-title").value = item.title;

  document.getElementById("item-calendar").value = calendar.name;
  document.getElementById("item-date-row-start-date").item = item;
  document.getElementById("item-date-row-end-date").item = item;

  let isToDoItem = cal.item.isToDo(item);
  let itemStartRowLabel = document.getElementById("item-start-row-label");
  let itemStartDate = item[cal.dtz.startDateProp(item)];
  itemStartRowLabel.style.visibility = itemStartDate ? "visible" : "collapse";
  let itemStartLabelValue = itemStartRowLabel.getAttribute(
    isToDoItem ? "taskStartLabel" : "eventStartLabel"
  );
  if (itemStartDate) {
    itemStartRowLabel.setAttribute("value", itemStartLabelValue);
  }

  let itemDueRowLabel = document.getElementById("item-due-row-label");
  let itemDueDate = item[cal.dtz.endDateProp(item)];
  itemDueRowLabel.style.visibility = itemDueDate ? "visible" : "collapse";
  let itemDueLabelValue = itemDueRowLabel.getAttribute(
    isToDoItem ? "taskDueLabel" : "eventEndLabel"
  );
  if (itemDueDate) {
    itemDueRowLabel.setAttribute("value", itemDueLabelValue);
  }
  // show reminder if this item is *not* readonly.
  // this case happens for example if this is an invitation.
  let argCalendar = window.arguments[0].calendarEvent.calendar;
  let supportsReminders =
    argCalendar.getProperty("capabilities.alarms.oninvitations.supported") !== false;
  if (!window.readOnly && supportsReminders) {
    document.getElementById("reminder-row").removeAttribute("hidden");
    loadReminders(window.calendarItem.getAlarms());
    updateReminder();
  }

  updateRepeatDetails();
  updateAttendees();
  updateLink();

  let location = item.getProperty("LOCATION");
  if (location && location.length) {
    document.getElementById("location-row").removeAttribute("hidden");
    document.getElementById("item-location").value = location;
  }

  let categories = item.getCategories();
  if (categories.length > 0) {
    document.getElementById("category-row").removeAttribute("hidden");
    document.getElementById("item-category").value = categories.join(", "); // TODO l10n-unfriendly
  }

  let organizer = item.organizer;
  if (organizer && organizer.id) {
    document.getElementById("organizer-row").removeAttribute("hidden");
    let cell = document.getElementsByClassName("item-organizer-cell")[0];
    let text = cell.getElementsByTagName("label")[0];
    let icon = cell.getElementsByTagName("img")[0];

    let role = organizer.role || "REQ-PARTICIPANT";
    let userType = organizer.userType || "INDIVIDUAL";
    let partstat = organizer.participationStatus || "NEEDS-ACTION";
    let orgName =
      organizer.commonName && organizer.commonName.length
        ? organizer.commonName
        : organizer.toString();
    let userTypeString = cal.l10n.getCalString("dialog.tooltip.attendeeUserType2." + userType, [
      organizer.toString(),
    ]);
    let roleString = cal.l10n.getCalString("dialog.tooltip.attendeeRole2." + role, [
      userTypeString,
    ]);
    let partstatString = cal.l10n.getCalString("dialog.tooltip.attendeePartStat2." + partstat, [
      orgName,
    ]);
    let tooltip = cal.l10n.getCalString("dialog.tooltip.attendee.combined", [
      roleString,
      partstatString,
    ]);

    text.setAttribute("value", orgName);
    cell.setAttribute("tooltiptext", tooltip);
    icon.setAttribute("partstat", partstat);
    icon.setAttribute("usertype", userType);
    icon.setAttribute("role", role);
  }

  let status = item.getProperty("STATUS");
  if (status && status.length) {
    let statusRow = document.getElementById("status-row");
    let statusRowData = document.getElementById("status-row-td");
    for (let i = 0; i < statusRowData.children.length; i++) {
      if (statusRowData.children[i].getAttribute("status") == status) {
        statusRow.removeAttribute("hidden");
        if (status == "CANCELLED" && cal.item.isToDo(item)) {
          // There are two labels for CANCELLED, the second one is for
          // todo items. Increment the counter here.
          i++;
        }
        statusRowData.children[i].removeAttribute("hidden");
        break;
      }
    }
  }

  if (item.hasProperty("DESCRIPTION")) {
    let description = item.getProperty("DESCRIPTION");
    if (description && description.length) {
      document.getElementById("item-description-box").removeAttribute("hidden");
      let textbox = document.getElementById("item-description");
      textbox.value = description;
      textbox.readOnly = true;
    }
  }

  document.title = item.title;

  let attachments = item.getAttachments();
  if (attachments.length) {
    // we only want to display uri type attachments and no ones received inline with the
    // invitation message (having a CID: prefix results in about:blank) here
    let attCounter = 0;
    attachments.forEach(aAttachment => {
      if (aAttachment.uri && aAttachment.uri.spec != "about:blank") {
        let attachment = document.getElementById("attachment-template").cloneNode(true);
        attachment.removeAttribute("id");
        attachment.removeAttribute("hidden");

        let label = attachment.getElementsByTagName("label")[0];
        label.setAttribute("value", aAttachment.uri.spec);
        label.setAttribute("hashid", aAttachment.hashId);

        let icon = attachment.getElementsByTagName("image")[0];
        let iconSrc = aAttachment.uri.spec.length ? aAttachment.uri.spec : "dummy.html";
        if (aAttachment.uri && !aAttachment.uri.schemeIs("file")) {
          // using an uri directly with e.g. a http scheme wouldn't render any icon
          if (aAttachment.formatType) {
            iconSrc = "goat?contentType=" + aAttachment.formatType;
          } else {
            // let's try to auto-detect
            let parts = iconSrc.substr(aAttachment.uri.scheme.length + 2).split("/");
            if (parts.length) {
              iconSrc = parts[parts.length - 1];
            }
          }
        }
        icon.setAttribute("src", "moz-icon://" + iconSrc);

        document.getElementById("item-attachment-cell").appendChild(attachment);
        attCounter++;
      }
    });
    if (attCounter > 0) {
      document.getElementById("attachments-row").removeAttribute("hidden");
    }
  }
  // If this item is read only we remove the 'cancel' button as users
  // can't modify anything, thus we go ahead with an 'ok' button only.
  if (window.readOnly) {
    dialog.getButton("cancel").setAttribute("collapsed", "true");
    dialog.getButton("accept").focus();
  }

  // disable default controls
  let accept = dialog.getButton("accept");
  let cancel = dialog.getButton("cancel");
  accept.setAttribute("collapsed", "true");
  cancel.setAttribute("collapsed", "true");
  cancel.parentNode.setAttribute("collapsed", "true");

  updateToolbar();

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
 * Saves any changed information to the item.
 */
document.addEventListener("dialogaccept", () => {
  dispose();
  if (window.readOnly) {
    return;
  }
  // let's make sure we have a response mode defined
  let resp = window.responseMode || "USER";
  let respMode = { responseMode: Ci.calIItipItem[resp] };

  let args = window.arguments[0];
  let oldItem = args.calendarEvent;
  let newItem = window.calendarItem;
  let calendar = newItem.calendar;
  saveReminder(newItem);
  adaptScheduleAgent(newItem);
  args.onOk(newItem, calendar, oldItem, null, respMode);
  window.calendarItem = newItem;
});

/**
 * Called when closing the dialog and any changes should be thrown away.
 */
document.addEventListener("dialogcancel", () => {
  dispose();
});

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
  if (window.readOnly) {
    document.getElementById("summary-toolbar").setAttribute("hidden", "true");
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

    gNotification.notificationbox.appendNotification(
      msg,
      "statusNotification",
      null,
      gNotification.notificationbox.PRIORITY_INFO_MEDIUM
    );
  } else {
    gNotification.notificationbox.removeAllNotifications();
  }
}

/**
 * Updates the dialog w.r.t recurrence, i.e shows a text describing the item's
 * recurrence)
 */
function updateRepeatDetails() {
  let args = window.arguments[0];
  let item = args.calendarEvent;

  // step to the parent (in order to show the
  // recurrence info which is stored at the parent).
  item = item.parentItem;

  // retrieve a valid recurrence rule from the currently
  // set recurrence info. bail out if there's more
  // than a single rule or something other than a rule.
  let recurrenceInfo = item.recurrenceInfo;
  if (!recurrenceInfo) {
    return;
  }

  document.getElementById("repeat-row").removeAttribute("hidden");

  // First of all collapse the details text. If we fail to
  // create a details string, we simply don't show anything.
  // this could happen if the repeat rule is something exotic
  // we don't have any strings prepared for.
  let repeatDetails = document.getElementById("repeat-details");
  repeatDetails.setAttribute("collapsed", "true");

  // Try to create a descriptive string from the rule(s).
  let kDefaultTimezone = cal.dtz.defaultTimezone;
  let startDate = item.startDate || item.entryDate;
  let endDate = item.endDate || item.dueDate;
  startDate = startDate ? startDate.getInTimezone(kDefaultTimezone) : null;
  endDate = endDate ? endDate.getInTimezone(kDefaultTimezone) : null;
  let detailsString = recurrenceRule2String(recurrenceInfo, startDate, endDate, startDate.isDate);

  if (!detailsString) {
    detailsString = cal.l10n.getString("calendar-event-dialog", "ruleTooComplexSummary");
  }

  // Now display the string...
  let lines = detailsString.split("\n");
  repeatDetails.removeAttribute("collapsed");
  while (repeatDetails.children.length > lines.length) {
    repeatDetails.lastChild.remove();
  }
  let numChilds = repeatDetails.children.length;
  for (let i = 0; i < lines.length; i++) {
    if (i >= numChilds) {
      let newNode = repeatDetails.firstElementChild.cloneNode(true);
      repeatDetails.appendChild(newNode);
    }
    repeatDetails.children[i].value = lines[i];
    repeatDetails.children[i].setAttribute("tooltiptext", detailsString);
  }
}

/**
 * Updates the attendee listbox, displaying all attendees invited to the
 * window's item.
 */
function updateAttendees() {
  if (window.attendees && window.attendees.length) {
    document.getElementById("item-attendees").removeAttribute("hidden");
    setupAttendees();
  }
}

/**
 * Updates the reminder, called when a reminder has been selected in the
 * menulist.
 */
function updateReminder() {
  commonUpdateReminder();
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
 * Extracts the item's organizer and opens a compose window to send the
 * organizer an email.
 */
function sendMailToOrganizer() {
  let args = window.arguments[0];
  let item = args.calendarEvent;
  let organizer = item.organizer;
  let email = cal.email.getAttendeeEmail(organizer, true);
  let emailSubject = cal.l10n.getString("calendar-event-dialog", "emailSubjectReply", [item.title]);
  let identity = item.calendar.getProperty("imip.identity");
  cal.email.sendTo(email, emailSubject, null, identity);
}

/**
 * Opens an attachment
 *
 * @param {AUTF8String}  aAttachmentId   The hashId of the attachment to open
 */
function openAttachment(aAttachmentId) {
  if (!aAttachmentId) {
    return;
  }
  let args = window.arguments[0];
  let item = args.calendarEvent;
  let attachments = item
    .getAttachments()
    .filter(aAttachment => aAttachment.hashId == aAttachmentId);
  if (attachments.length && attachments[0].uri && attachments[0].uri.spec != "about:blank") {
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .loadURI(attachments[0].uri);
  }
}
