/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from item-editing/calendar-item-editing.js */
/* import-globals-from calendar-command-controller.js */
/* import-globals-from calendar-management.js */
/* import-globals-from calendar-views-utils.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/* exported cutToClipboard, pasteFromClipboard */

/**
 * Test if a writable calendar is selected, and if the clipboard has items that
 * can be pasted into Calendar. The data must be of type "text/calendar" or
 * "text/unicode".
 *
 * @return          If true, pasting is currently possible.
 */
function canPaste() {
  if (Services.prefs.getBoolPref("calendar.paste.intoSelectedCalendar", false)) {
    let selectedCal = getSelectedCalendar();
    if (
      !selectedCal ||
      !cal.acl.isCalendarWritable(selectedCal) ||
      !cal.acl.userCanAddItemsToCalendar(selectedCal)
    ) {
      return false;
    }
  } else {
    let calendars = cal
      .getCalendarManager()
      .getCalendars()
      .filter(cal.acl.isCalendarWritable)
      .filter(cal.acl.userCanAddItemsToCalendar);
    if (!calendars.length) {
      return false;
    }
  }

  const flavors = ["text/calendar", "text/unicode"];
  return Services.clipboard.hasDataMatchingFlavors(flavors, Ci.nsIClipboard.kGlobalClipboard);
}

/**
 * Copy the ics data of the current view's selected events to the clipboard and
 * deletes the events on success
 *
 * @param aCalendarItemArray    (optional) an array of items to cut. If not
 *                                passed, the current view's selected items will
 *                                be used.
 */
function cutToClipboard(aCalendarItemArray = null) {
  copyToClipboard(aCalendarItemArray, true);
}

/**
 * Copy the ics data of the items in calendarItemArray to the clipboard. Fills
 * both text/unicode and text/calendar mime types.
 *
 * @param aCalendarItemArray    (optional) an array of items to copy. If not
 *                                passed, the current view's selected items will
 *                                be used.
 * @param aCutMode              (optional) set to true, if this is a cut operation
 */
function copyToClipboard(aCalendarItemArray = null, aCutMode = false) {
  let calendarItemArray = aCalendarItemArray || getSelectedItems();
  if (!calendarItemArray.length) {
    cal.LOG("[calendar-clipboard] No items selected.");
    return;
  }
  if (aCutMode) {
    let items = calendarItemArray.filter(
      aItem =>
        cal.acl.userCanModifyItem(aItem) ||
        (aItem.calendar && cal.acl.userCanDeleteItemsFromCalendar(aItem.calendar))
    );
    if (items.length < calendarItemArray.length) {
      cal.LOG("[calendar-clipboard] No privilege to delete some or all selected items.");
      return;
    }
    calendarItemArray = items;
  }
  let [targetItems, , response] = promptOccurrenceModification(
    calendarItemArray,
    true,
    aCutMode ? "cut" : "copy"
  );
  if (!response) {
    // The user canceled the dialog, bail out
    return;
  }

  let icsSerializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
    Ci.calIIcsSerializer
  );
  icsSerializer.addItems(targetItems);
  let icsString = icsSerializer.serializeToString();

  let clipboard = Services.clipboard;
  let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);

  if (trans && clipboard) {
    // Register supported data flavors
    trans.init(null);
    trans.addDataFlavor("text/calendar");
    trans.addDataFlavor("text/unicode");

    // Create the data objects
    let icsWrapper = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    icsWrapper.data = icsString;

    // Add data objects to transferable
    // Both Outlook 2000 client and Lotus Organizer use text/unicode
    // when pasting iCalendar data.
    trans.setTransferData("text/calendar", icsWrapper);
    trans.setTransferData("text/unicode", icsWrapper);

    clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
    if (aCutMode) {
      // check for MODIFICATION_PARENT
      let useParent = response == 3;
      calendarViewController.deleteOccurrences(targetItems, useParent, true);
    }
  }
}

/**
 * Reads ics data from the clipboard, parses it into items and inserts the items
 * into the currently selected calendar.
 */
function pasteFromClipboard() {
  if (!canPaste()) {
    return;
  }

  let clipboard = Services.clipboard;
  let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);

  if (!trans || !clipboard) {
    return;
  }

  // Register the wanted data flavors (highest fidelity first!)
  trans.init(null);
  trans.addDataFlavor("text/calendar");
  trans.addDataFlavor("text/unicode");

  // Get transferable from clipboard
  clipboard.getData(trans, Ci.nsIClipboard.kGlobalClipboard);

  // Ask transferable for the best flavor.
  let flavor = {};
  let data = {};
  trans.getAnyTransferData(flavor, data);
  data = data.value.QueryInterface(Ci.nsISupportsString).data;
  switch (flavor.value) {
    case "text/calendar":
    case "text/unicode": {
      let icsParser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
      try {
        icsParser.parseString(data);
      } catch (e) {
        // Ignore parser errors from the clipboard data, if it fails
        // there will just be 0 items.
      }

      let items = icsParser.getItems();
      if (items.length == 0) {
        return;
      }

      // If there are multiple items on the clipboard, the earliest
      // should be set to the selected day and the rest adjusted.
      let earliestDate = null;
      for (let item of items) {
        let date = null;
        if (item.startDate) {
          date = item.startDate.clone();
        } else if (item.entryDate) {
          date = item.entryDate.clone();
        } else if (item.dueDate) {
          date = item.dueDate.clone();
        }

        if (!date) {
          continue;
        }

        if (!earliestDate || date.compare(earliestDate) < 0) {
          earliestDate = date;
        }
      }
      let firstDate = currentView().selectedDay;

      let offset = null;
      if (earliestDate) {
        // Timezones and DT/DST time may differ between the earliest item
        // and the selected day. Determine the offset between the
        // earliestDate in local time and the selected day in whole days.
        earliestDate = earliestDate.getInTimezone(cal.dtz.defaultTimezone);
        earliestDate.isDate = true;
        offset = firstDate.subtractDate(earliestDate);
        let deltaDST = firstDate.timezoneOffset - earliestDate.timezoneOffset;
        offset.inSeconds += deltaDST;
      }

      // we only will need to ask whether to send notifications, if there
      // are attendees at all
      let withAttendees = items.filter(aItem => aItem.getAttendees().length > 0);

      let notify = Ci.calIItipItem.USER;
      let destCal = null;
      if (Services.prefs.getBoolPref("calendar.paste.intoSelectedCalendar", false)) {
        destCal = getSelectedCalendar();
      } else {
        let pasteText = "paste";
        if (withAttendees.length) {
          if (withAttendees.every(item => item.isEvent())) {
            pasteText += "Event";
          } else if (withAttendees.every(item => item.isTodo())) {
            pasteText += "Task";
          } else {
            pasteText += "Item";
          }
          if (withAttendees.length > 1) {
            pasteText += "s";
          }
        }
        let validPasteText = pasteText != "paste" && !pasteText.endsWith("Item");
        pasteText += items.length == withAttendees.length ? "Only" : "Also";

        let calendars = cal
          .getCalendarManager()
          .getCalendars()
          .filter(cal.acl.isCalendarWritable)
          .filter(cal.acl.userCanAddItemsToCalendar)
          .filter(aCal => {
            let status = aCal.getProperty("currentStatus");
            return Components.isSuccessCode(status);
          });
        if (calendars.length > 1) {
          let args = {};
          args.calendars = calendars;
          args.promptText = cal.l10n.getCalString("pastePrompt");

          if (validPasteText) {
            pasteText = cal.l10n.getCalString(pasteText);
            let note = cal.l10n.getCalString("pasteNotifyAbout", [pasteText]);
            args.promptNotify = note;

            args.labelExtra1 = cal.l10n.getCalString("pasteDontNotifyLabel");
            args.onExtra1 = aCal => {
              destCal = aCal;
              notify = Ci.calIItipItem.NONE;
            };
            args.labelOk = cal.l10n.getCalString("pasteAndNotifyLabel");
            args.onOk = aCal => {
              destCal = aCal;
              notify = Ci.calIItipItem.AUTO;
            };
          } else {
            args.onOk = aCal => {
              destCal = aCal;
            };
          }

          window.openDialog(
            "chrome://calendar/content/chooseCalendarDialog.xhtml",
            "_blank",
            "chrome,titlebar,modal,resizable",
            args
          );
        } else if (calendars.length == 1) {
          destCal = calendars[0];
        }
      }
      if (!destCal) {
        return;
      }

      startBatchTransaction();
      for (let item of items) {
        // TODO: replace the UUID only it it already exists in the
        // calendar to avoid to break invitation scenarios where remote
        // parties rely on the UUID.
        let newItem = item.clone();
        // Set new UID to allow multiple paste actions of the same
        // clipboard content.
        newItem.id = cal.getUUID();
        if (offset) {
          cal.item.shiftOffset(newItem, offset);
        }

        let extResp = { responseMode: Ci.calIItipItem.NONE };
        if (item.getAttendees().length > 0) {
          extResp.responseMode = notify;
        }

        doTransaction("add", newItem, destCal, null, null, extResp);
      }
      endBatchTransaction();
      break;
    }
    default:
      break;
  }
}
