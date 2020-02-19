/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported loadCalendarPrintDialog */

/* import-globals-from ../../../../../toolkit/components/printing/content/printUtils.js */
/* import-globals-from ../calendar-ui-utils.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var printContent = "";

/**
 * Gets the calendar view from the opening window
 */
function getCalendarView() {
  let theView = window.opener.currentView();
  if (!theView.startDay) {
    theView = null;
  }
  return theView;
}

/**
 * Loads the print dialog, setting up all needed elements.
 */
function loadCalendarPrintDialog() {
  // set the datepickers to the currently selected dates
  let theView = getCalendarView();
  if (theView) {
    document.getElementById("start-date-picker").value = cal.dtz.dateTimeToJsDate(theView.startDay);
    document.getElementById("end-date-picker").value = cal.dtz.dateTimeToJsDate(theView.endDay);
  } else {
    document.getElementById("printCurrentViewRadio").setAttribute("disabled", true);
  }
  if (!theView || !theView.getSelectedItems().length) {
    document.getElementById("selected").setAttribute("disabled", true);
  }
  document
    .getElementById(theView ? "printCurrentViewRadio" : "custom-range")
    .setAttribute("selected", true);

  // Get a list of formatters.
  // Walk the list, adding items to the layout menupopup.
  let layoutList = document.getElementById("layout-field");
  for (let { data } of Services.catMan.enumerateCategory("cal-print-formatters")) {
    let contractid = Services.catMan.getCategoryEntry("cal-print-formatters", data);
    let formatter = Cc[contractid].getService(Ci.calIPrintFormatter);
    // Use the contractid as value
    let option = document.createElementNS("http://www.w3.org/1999/xhtml", "option");
    option.textContent = formatter.name;
    option.setAttribute("value", contractid);
    layoutList.appendChild(option);
  }
  layoutList.selectedIndex = 0;

  opener.setCursor("auto");

  eventsAndTasksOptions("tasks");

  refreshHtml();

  document.getElementById("start-date-picker").addEventListener("change", onDatePick);
  document.getElementById("end-date-picker").addEventListener("change", onDatePick);

  self.focus();
}

/**
 * Retrieves a settings object containing info on what to print. The
 * receiverFunc will be called with the settings object containing various print
 * settings.
 *
 * @param receiverFunc  The callback function to call on completion.
 */
function getPrintSettings(receiverFunc) {
  let tempTitle = document.getElementById("title-field").value;
  let settings = {};
  let requiresFetch = true;
  settings.title = tempTitle || cal.l10n.getCalString("Untitled");
  settings.layoutCId = document.getElementById("layout-field").value;
  settings.start = null;
  settings.end = null;
  settings.eventList = [];
  settings.printEvents = document.getElementById("events").checked;
  settings.printTasks = document.getElementById("tasks").checked;
  settings.printCompletedTasks = document.getElementById("completed-tasks").checked;
  settings.printTasksWithNoDueDate = document.getElementById("tasks-with-no-due-date").checked;
  let theView = getCalendarView();
  switch (document.getElementById("view-field").selectedItem.value) {
    case "currentView":
    case "": {
      // just in case
      settings.start = theView.startDay.clone();
      settings.end = theView.endDay.clone();
      settings.end.day += 1;
      settings.start.isDate = false;
      settings.end.isDate = false;
      break;
    }
    case "selected": {
      let selectedItems = theView.getSelectedItems();
      settings.eventList = selectedItems.filter(item => {
        if (cal.item.isEvent(item) && !settings.printEvents) {
          return false;
        }
        if (cal.item.isToDo(item) && !settings.printTasks) {
          return false;
        }
        return true;
      });

      // If tasks should be printed, also include selected tasks from the
      // opening window.
      if (settings.printTasks) {
        let selectedTasks = window.opener.getSelectedTasks();
        for (let task of selectedTasks) {
          settings.eventList.push(task);
        }
      }

      // We've set the event list above, no need to fetch items below.
      requiresFetch = false;
      break;
    }
    case "custom": {
      // We return the time from the timepickers using the selected
      // timezone, as not doing so in timezones with a positive offset
      // from UTC may cause the printout to include the wrong days.
      let currentTimezone = cal.dtz.defaultTimezone;
      settings.start = cal.dtz.jsDateToDateTime(document.getElementById("start-date-picker").value);
      settings.start = settings.start.getInTimezone(currentTimezone);
      settings.end = cal.dtz.jsDateToDateTime(document.getElementById("end-date-picker").value);
      settings.end = settings.end.getInTimezone(currentTimezone);
      settings.end = settings.end.clone();
      settings.end.day += 1;
      break;
    }
    default: {
      dump("Error : no case in printDialog.js::printCalendar()");
      break;
    }
  }

  // Some filters above might have filled the events list themselves. If not,
  // then fetch the items here.
  if (requiresFetch) {
    let listener = {
      QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
      onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDateTime) {
        receiverFunc(settings);
      },
      onGetResult(aCalendar, aStatus, aItemType, aDetail, aItems) {
        settings.eventList = settings.eventList.concat(aItems);
        if (!settings.printTasksWithNoDueDate) {
          let eventWithDueDate = [];
          for (let item of settings.eventList) {
            if (item.dueDate || item.endDate) {
              eventWithDueDate.push(item);
            }
          }
          settings.eventList = eventWithDueDate;
        }
      },
    };
    let filter = getFilter(settings);
    if (filter) {
      cal.view
        .getCompositeCalendar(window.opener)
        .getItems(filter, 0, settings.start, settings.end, listener);
    } else {
      // No filter means no items, just complete with the empty list set above
      receiverFunc(settings);
    }
  } else {
    receiverFunc(settings);
  }
}

/**
 * Sets up the filter for a getItems call based on the javascript settings
 * object
 *
 * @param settings      The settings data to base upon
 */
function getFilter(settings) {
  let filter = 0;
  if (settings.printTasks) {
    filter |= Ci.calICalendar.ITEM_FILTER_TYPE_TODO;
    if (settings.printCompletedTasks) {
      filter |= Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
    } else {
      filter |= Ci.calICalendar.ITEM_FILTER_COMPLETED_NO;
    }
  }

  if (settings.printEvents) {
    filter |=
      Ci.calICalendar.ITEM_FILTER_TYPE_EVENT | Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
  }
  return filter;
}

/**
 * Looks at the selections the user has made (start date, layout, etc.), and
 * updates the HTML in the iframe accordingly. This is also called when a
 * dialog UI element has changed, since we'll want to refresh the preview.
 */
function refreshHtml(finishFunc) {
  getPrintSettings(settings => {
    document.title = cal.l10n.getCalString("PrintPreviewWindowTitle", [settings.title]);

    let printformatter = Cc[settings.layoutCId].createInstance(Ci.calIPrintFormatter);
    printContent = "";
    try {
      let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
      const PR_UINT32_MAX = 4294967295; // signals "infinite-length"
      pipe.init(true, true, 0, PR_UINT32_MAX, null);
      printformatter.formatToHtml(
        pipe.outputStream,
        settings.start,
        settings.end,
        settings.eventList,
        settings.title
      );
      pipe.outputStream.close();
      // convert byte-array to UTF-8 string:
      let convStream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(
        Ci.nsIConverterInputStream
      );
      convStream.init(
        pipe.inputStream,
        "UTF-8",
        0,
        Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER
      );
      try {
        let portion = {};
        while (convStream.readString(-1, portion)) {
          printContent += portion.value;
        }
      } finally {
        convStream.close();
      }
    } catch (e) {
      Cu.reportError("Calendar print dialog:refreshHtml: " + e);
    }

    printContent = "data:text/html," + encodeURIComponent(printContent);
    document.getElementById("content").src = printContent;

    if (finishFunc) {
      finishFunc();
    }
  });
}

/**
 * Prints the document and then closes the window
 */
document.addEventListener("dialogaccept", event => {
  refreshHtml(() => {
    let printSettings = PrintUtils.getPrintSettings();
    // Evicts "about:blank" header
    printSettings.docURL = " ";

    // we don't do anything with statusFeedback, msgPrintEngine requires it
    let statusFeedback = Cc["@mozilla.org/messenger/statusfeedback;1"].createInstance();
    statusFeedback = statusFeedback.QueryInterface(Ci.nsIMsgStatusFeedback);

    let printWindow = window.openDialog(
      "chrome://messenger/content/msgPrintEngine.xhtml",
      "",
      "chrome,dialog=no,all",
      1,
      [printContent],
      statusFeedback,
      false,
      0
    );

    let closer = aEvent => {
      // printWindow is loaded multiple time in the print process and only
      // at the end with fully loaded document, so we must not register a
      // onetime listener here nor should we close too early so that the
      // the opener is still available when the document finally loaded
      if (aEvent.type == "unload" && printWindow.document.readyState == "complete") {
        printWindow.removeEventListener("unload", closer);
        window.close();
      }
    };
    printWindow.addEventListener("unload", closer);

    if (gSavePrintSettings) {
      let PSSVC = Cc["@mozilla.org/gfx/printsettings-service;1"].getService(
        Ci.nsIPrintSettingsService
      );
      PSSVC.savePrintSettingsToPrefs(printSettings, true, printSettings.kInitSaveAll);
      PSSVC.savePrintSettingsToPrefs(printSettings, false, printSettings.kInitSavePrinterName);
    }
  });
  event.preventDefault(); // leave open
});

/**
 * Called when once a date has been selected in the datepicker.
 */
function onDatePick() {
  let radioGroup = document.getElementById("view-field");
  radioGroup.value = "custom";

  setTimeout(refreshHtml);
}

function eventsAndTasksOptions(targetId) {
  let checkbox = document.getElementById(targetId);
  let checked = checkbox.getAttribute("checked") == "true";
  // Workaround to make the checkbox persistent (bug 15232).
  checkbox.setAttribute("checked", checked ? "true" : "false");

  if (targetId == "tasks") {
    setElementValue("tasks-with-no-due-date", !checked, "disabled");
    setElementValue("completed-tasks", !checked, "disabled");
  }
}
