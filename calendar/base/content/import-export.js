/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from item-editing/calendar-item-editing.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/* exported loadEventsFromFile, exportEntireCalendar */

// File constants copied from file-utils.js
var MODE_RDONLY = 0x01;
var MODE_WRONLY = 0x02;
var MODE_CREATE = 0x08;
var MODE_TRUNCATE = 0x20;

/**
 * Loads events from a file into a calendar. If called without a file argument,
 * the user is asked to pick a file.
 *
 * @param {nsIFile} [fileArg] - Optional, a file to load events from.
 * @return {Promise<boolean>} True if the import dialog was opened, false if
 *                              not (e.g. on cancel of file picker dialog).
 */
async function loadEventsFromFile(fileArg) {
  let file = fileArg;
  if (!file) {
    file = await pickFileToImport();
    if (!file) {
      // Probably the user clicked "cancel" (no file and the promise was not
      // rejected in pickFileToImport).
      return false;
    }
  }

  Services.ww.openWindow(
    null,
    "chrome://calendar/content/calendar-ics-file-dialog.xhtml",
    "_blank",
    "chrome,titlebar,modal,centerscreen",
    file
  );
  return true;
}

/**
 * Show a file picker dialog and return the file.
 *
 * @return {Promise<nsIFile | undefined>} The picked file or undefined if the
 *                                        user cancels the dialog.
 */
function pickFileToImport() {
  return new Promise(resolve => {
    let picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    picker.init(window, cal.l10n.getCalString("filepickerTitleImport"), Ci.nsIFilePicker.modeOpen);
    picker.defaultExtension = "ics";

    let currentListLength = 0;
    for (let { data } of Services.catMan.enumerateCategory("cal-importers")) {
      let contractId = Services.catMan.getCategoryEntry("cal-importers", data);
      let importer;
      try {
        importer = Cc[contractId].getService(Ci.calIImporter);
      } catch (e) {
        cal.WARN("Could not initialize importer: " + contractId + "\nError: " + e);
        continue;
      }
      let types = importer.getFileTypes();
      for (let type of types) {
        picker.appendFilter(type.description, type.extensionFilter);
        if (type.extensionFilter == "*." + picker.defaultExtension) {
          picker.filterIndex = currentListLength;
        }
        currentListLength++;
      }
    }

    picker.open(returnValue => {
      if (returnValue == Ci.nsIFilePicker.returnCancel) {
        resolve();
      }
      resolve(picker.file);
    });
  });
}

/**
 * Given a file, return the contractId for an importer for the file type.
 *
 * @param {nsIFile} file - A file.
 * @return {string} A contract ID.
 */
function getContractIdForImportingFile(file) {
  let fileNameLower = file.leafName.toLowerCase();
  let contractId = "@mozilla.org/calendar/import;1?type=";

  if (fileNameLower.endsWith(".ics")) {
    return contractId + "ics";
  } else if (fileNameLower.endsWith(".csv")) {
    return contractId + "csv";
  }
  throw new Error("No importer for this type of file: " + file.leafName);
}

/**
 * Given a file (e.g. an ICS or CSV file), return an array of calendar items
 * parsed from it.
 *
 * @param {nsIFile} file - File to get items from.
 * @return {calIItemBase[]} Array of calendar items.
 */
function getItemsFromFile(file) {
  let contractId = getContractIdForImportingFile(file);
  let importer = Cc[contractId].getService(Ci.calIImporter);

  let inputStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  let items = [];
  let exception;

  try {
    inputStream.init(file, MODE_RDONLY, 0o444, {});
    items = importer.importFromStream(inputStream);
  } catch (ex) {
    exception = ex;
    switch (ex.result) {
      case Ci.calIErrors.INVALID_TIMEZONE:
        cal.showError(cal.l10n.getCalString("timezoneError", [file.path]), window);
        break;
      default:
        cal.showError(cal.l10n.getCalString("unableToRead") + file.path + "\n" + ex, window);
    }
  } finally {
    inputStream.close();
  }

  if (!items.length && !exception) {
    // The ics did not contain any events, so we should
    // notify the user about it, if we haven't before.
    cal.showError(cal.l10n.getCalString("noItemsInCalendarFile2", [file.path]), window);
  }

  return items;
}

/**
 * @callback onProgress
 * @param {number} count
 * @param {number} total
 */

/**
 * @callback onError
 * @param {calIItemBase} item          The item which failed to import.
 * @param {Number|nsIException} error  The error number from Components.results, or
 *                                     the exception which contains the error number.
 */

/**
 * Listener for the stages of putItemsIntoCal().
 * @typedef PutItemsIntoCalListener
 * @property {function}   onStart
 * @property {onError}    onDuplicate
 * @property {onError}    onError
 * @property {onProgress} onProgress
 * @property {function}   onEnd
 */

/**
 * Put items into a certain calendar, catching errors and showing them to the
 * user.
 *
 * @param {calICalendar} destCal    The destination calendar.
 * @param {calIItemBase[]} aItems   An array of items to put into the calendar.
 * @param {string} aFilePath        The original file path, for error messages.
 * @param {PutItemsIntoCalListener} [aListener]  Optional listener.
 */
async function putItemsIntoCal(destCal, aItems, aListener) {
  async function callListener(method, ...args) {
    if (aListener && typeof aListener[method] == "function") {
      await aListener[method](...args);
    }
  }

  await callListener("onStart");

  // Set batch for the undo/redo transaction manager
  startBatchTransaction();

  let count = 0;
  let total = aItems.length;

  // Using wrappedJSObject is a hack that is needed to prevent a proxy error.
  let pcal = cal.async.promisifyCalendar(destCal.wrappedJSObject);
  for (let item of aItems) {
    try {
      await pcal.addItem(item);
    } catch (e) {
      if (e == Ci.calIErrors.DUPLICATE_ID) {
        await callListener("onDuplicate", item, e);
      } else {
        Cu.reportError(e);
        await callListener("onError", item, e);
      }
    }

    count++;
    await callListener("onProgress", count, total);
  }

  // End transmgr batch
  endBatchTransaction();

  await callListener("onEnd");
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
    QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
    onOperationComplete(aOpCalendar, aStatus, aOperationType, aId, aDetail) {
      saveEventsToFile(itemArray, aOpCalendar.name);
    },
    onGetResult(aOpCalendar, aStatus, aItemType, aDetail, aItems) {
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
