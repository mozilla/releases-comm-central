/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calendar-item-editing.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/* exported loadEventsFromFile, exportEntireCalendar */

// File constants copied from file-utils.js
var MODE_RDONLY = 0x01;
var MODE_WRONLY = 0x02;
var MODE_CREATE = 0x08;
var MODE_TRUNCATE = 0x20;

/**
 * Shows a file dialog, reads the selected file(s) and tries to parse events from it.
 *
 * @param aCalendar  (optional) If specified, the items will be imported directly
 *                              into the calendar
 */
function loadEventsFromFile(aCalendar) {
  return new Promise(resolve => {
    let picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    picker.init(window, cal.l10n.getCalString("filepickerTitleImport"), Ci.nsIFilePicker.modeOpen);
    picker.defaultExtension = "ics";

    // Get a list of importers
    let contractids = [];
    let currentListLength = 0;
    let defaultCIDIndex = 0;
    for (let { data } of Services.catMan.enumerateCategory("cal-importers")) {
      let contractid = Services.catMan.getCategoryEntry("cal-importers", data);
      let importer;
      try {
        importer = Cc[contractid].getService(Ci.calIImporter);
      } catch (e) {
        cal.WARN("Could not initialize importer: " + contractid + "\nError: " + e);
        continue;
      }
      let types = importer.getFileTypes();
      for (let type of types) {
        picker.appendFilter(type.description, type.extensionFilter);
        if (type.extensionFilter == "*." + picker.defaultExtension) {
          picker.filterIndex = currentListLength;
          defaultCIDIndex = currentListLength;
        }
        contractids.push(contractid);
        currentListLength++;
      }
    }

    picker.open(async returnValue => {
      if (returnValue != Ci.nsIFilePicker.returnOK || !picker.file || !picker.file.path) {
        return;
      }

      let filterIndex = picker.filterIndex;
      if (picker.filterIndex < 0 || picker.filterIndex > contractids.length) {
        // For some reason the wrong filter was selected, assume default extension
        filterIndex = defaultCIDIndex;
      }

      let filePath = picker.file.path;
      let importer = Cc[contractids[filterIndex]].getService(Ci.calIImporter);

      let inputStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
        Ci.nsIFileInputStream
      );
      let items = [];
      let exception;

      try {
        inputStream.init(picker.file, MODE_RDONLY, parseInt("0444", 8), {});
        items = importer.importFromStream(inputStream);
      } catch (ex) {
        exception = ex;
        switch (ex.result) {
          case Ci.calIErrors.INVALID_TIMEZONE:
            cal.showError(cal.l10n.getCalString("timezoneError", [filePath]), window);
            break;
          default:
            cal.showError(cal.l10n.getCalString("unableToRead") + filePath + "\n" + ex, window);
        }
      } finally {
        inputStream.close();
      }

      if (!items.length && !exception) {
        // the ics did not contain any events, so there's no need to proceed. But we should
        // notify the user about it, if we haven't before.
        cal.showError(cal.l10n.getCalString("noItemsInCalendarFile", [filePath]), window);
        return;
      }

      if (aCalendar) {
        await putItemsIntoCal(aCalendar, items);
        resolve();
        return;
      }

      let calendars = cal.getCalendarManager().getCalendars();
      calendars = calendars.filter(cal.acl.isCalendarWritable);

      if (calendars.length == 1) {
        // There's only one calendar, so it's silly to ask what calendar
        // the user wants to import into.
        await putItemsIntoCal(calendars[0], items, filePath);
        resolve();
      } else if (calendars.length > 1) {
        // Ask what calendar to import into
        let args = {};
        args.onOk = async aCal => {
          await putItemsIntoCal(aCal, items, filePath);
          resolve();
        };
        args.calendars = calendars;
        args.promptText = cal.l10n.getCalString("importPrompt");
        openDialog(
          "chrome://calendar/content/chooseCalendarDialog.xhtml",
          "_blank",
          "chrome,titlebar,modal,resizable",
          args
        );
      }
    });
  });
}

/**
 * Put items into a certain calendar, catching errors and showing them to the
 * user.
 *
 * @param destCal       The destination calendar.
 * @param aItems        An array of items to put into the calendar.
 * @param aFilePath     The original file path, for error messages.
 */
async function putItemsIntoCal(destCal, aItems, aFilePath) {
  // Set batch for the undo/redo transaction manager
  startBatchTransaction();

  // And set batch mode on the calendar, to tell the views to not
  // redraw until all items are imported
  destCal.startBatch();

  // This listener is needed to find out when the last addItem really
  // finished. Using a counter to find the last item (which might not
  // be the last item added)
  let count = 0;
  let failedCount = 0;
  let duplicateCount = 0;
  // Used to store the last error. Only the last error, because we don't
  // want to bomb the user with thousands of error messages in case
  // something went really wrong.
  // (example of something very wrong: importing the same file twice.
  //  quite easy to trigger, so we really should do this)
  let lastError;

  let pcal = cal.async.promisifyCalendar(destCal);
  for (let item of aItems) {
    // XXX prompt when finding a duplicate.
    try {
      await pcal.addItem(item);
      count++;
      // See if it is time to end the calendar's batch.
      if (count == aItems.length) {
        destCal.endBatch();
        if (failedCount) {
          cal.showError(
            cal.l10n.getCalString("importItemsFailed", [failedCount, lastError.toString()]),
            window
          );
        } else if (duplicateCount) {
          cal.showError(
            cal.l10n.getCalString("duplicateError", [duplicateCount, aFilePath]),
            window
          );
        }
      }
    } catch (e) {
      count++;
      if (e == Ci.calIErrors.DUPLICATE_ID) {
        duplicateCount++;
      } else {
        failedCount++;
        lastError = e;
      }

      Cu.reportError("Import error: " + e);
    }
  }

  // End transmgr batch
  endBatchTransaction();
}

/**
 * Save data to a file. Create the file or overwrite an existing file.
 *
 * @param calendarEventArray (required) Array of calendar events that should
 *                                      be saved to file.
 * @param aDefaultFileName   (optional) Initial filename shown in SaveAs dialog.
 */
function saveEventsToFile(calendarEventArray, aDefaultFileName) {
  if (!calendarEventArray || !calendarEventArray.length) {
    return;
  }

  // Show the 'Save As' dialog and ask for a filename to save to
  let picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

  picker.init(window, cal.l10n.getCalString("filepickerTitleExport"), Ci.nsIFilePicker.modeSave);

  if (aDefaultFileName && aDefaultFileName.length && aDefaultFileName.length > 0) {
    picker.defaultString = aDefaultFileName;
  } else if (calendarEventArray.length == 1 && calendarEventArray[0].title) {
    picker.defaultString = calendarEventArray[0].title;
  } else {
    picker.defaultString = cal.l10n.getCalString("defaultFileName");
  }

  picker.defaultExtension = "ics";

  // Get a list of exporters
  let contractids = [];
  let currentListLength = 0;
  let defaultCIDIndex = 0;
  for (let { data } of Services.catMan.enumerateCategory("cal-exporters")) {
    let contractid = Services.catMan.getCategoryEntry("cal-exporters", data);
    let exporter;
    try {
      exporter = Cc[contractid].getService(Ci.calIExporter);
    } catch (e) {
      cal.WARN("Could not initialize exporter: " + contractid + "\nError: " + e);
      continue;
    }
    let types = exporter.getFileTypes();
    for (let type of types) {
      picker.appendFilter(type.description, type.extensionFilter);
      if (type.extensionFilter == "*." + picker.defaultExtension) {
        picker.filterIndex = currentListLength;
        defaultCIDIndex = currentListLength;
      }
      contractids.push(contractid);
      currentListLength++;
    }
  }

  // Now find out as what to save, convert the events and save to file.
  picker.open(rv => {
    if (rv == Ci.nsIFilePicker.returnCancel || !picker.file || !picker.file.path) {
      return;
    }

    let filterIndex = picker.filterIndex;
    if (picker.filterIndex < 0 || picker.filterIndex > contractids.length) {
      // For some reason the wrong filter was selected, assume default extension
      filterIndex = defaultCIDIndex;
    }

    let exporter = Cc[contractids[filterIndex]].getService(Ci.calIExporter);

    let filePath = picker.file.path;
    if (!filePath.includes(".")) {
      filePath += "." + exporter.getFileTypes()[0].defaultExtension;
    }

    const nsIFile = Ci.nsIFile;
    const nsIFileOutputStream = Ci.nsIFileOutputStream;

    let outputStream;
    let localFileInstance = Cc["@mozilla.org/file/local;1"].createInstance(nsIFile);
    localFileInstance.initWithPath(filePath);

    outputStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
      nsIFileOutputStream
    );
    try {
      outputStream.init(
        localFileInstance,
        MODE_WRONLY | MODE_CREATE | MODE_TRUNCATE,
        parseInt("0664", 8),
        0
      );

      // XXX Do the right thing with unicode and stuff. Or, again, should the
      //     exporter handle that?
      exporter.exportToStream(outputStream, calendarEventArray, null);
      outputStream.close();
    } catch (ex) {
      cal.showError(cal.l10n.getCalString("unableToWrite") + filePath, window);
    }
  });
}

/**
 * Exports all the events and tasks in a calendar.  If aCalendar is not specified,
 * the user will be prompted with a list of calendars to choose which one to export.
 *
 * @param aCalendar     (optional) A specific calendar to export
 */
function exportEntireCalendar(aCalendar) {
  let itemArray = [];
  let getListener = {
    QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
    onOperationComplete: function(aOpCalendar, aStatus, aOperationType, aId, aDetail) {
      saveEventsToFile(itemArray, aOpCalendar.name);
    },
    onGetResult: function(aOpCalendar, aStatus, aItemType, aDetail, aItems) {
      for (let item of aItems) {
        itemArray.push(item);
      }
    },
  };

  let getItemsFromCal = function(aCal) {
    aCal.getItems(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null, getListener);
  };

  if (aCalendar) {
    getItemsFromCal(aCalendar);
  } else {
    let calendars = cal.getCalendarManager().getCalendars();

    if (calendars.length == 1) {
      // There's only one calendar, so it's silly to ask what calendar
      // the user wants to import into.
      getItemsFromCal(calendars[0]);
    } else {
      // Ask what calendar to import into
      let args = {};
      args.onOk = getItemsFromCal;
      args.promptText = cal.l10n.getCalString("exportPrompt");
      openDialog(
        "chrome://calendar/content/chooseCalendarDialog.xhtml",
        "_blank",
        "chrome,titlebar,modal,resizable",
        args
      );
    }
  }
}
