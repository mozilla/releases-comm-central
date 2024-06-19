/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from item-editing/calendar-item-editing.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));

/* exported getItemsFromIcsFile, putItemsIntoCal, exportEntireCalendar */

// File constants copied from file-utils.js
var MODE_RDONLY = 0x01;
var MODE_WRONLY = 0x02;
var MODE_CREATE = 0x08;
var MODE_TRUNCATE = 0x20;

/**
 * Given an ICS file, return an array of calendar items parsed from it.
 *
 * @param {nsIFile} file - File to get items from.
 * @returns {calIItemBase[]} Array of calendar items.
 */
function getItemsFromIcsFile(file) {
  const importer = Cc["@mozilla.org/calendar/import;1?type=ics"].getService(Ci.calIImporter);

  const inputStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
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
        cal.showError(lazy.l10n.formatValueSync("timezone-error", { filePath: file.path }), window);
        break;
      default:
        cal.showError(lazy.l10n.formatValueSync("unable-to-read") + file.path + "\n" + ex, window);
    }
  } finally {
    inputStream.close();
  }

  if (!items.length && !exception) {
    // The ics did not contain any events, so we should
    // notify the user about it, if we haven't before.
    cal.showError(
      lazy.l10n.formatValueSync("no-items-in-calendar-file2", { filePath: file.path }),
      window
    );
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
 * @param {calIItemBase} item - The item which failed to import.
 * @param {number | nsIException} error  The error number from Components.results, or
 *                                     the exception which contains the error number.
 */

/**
 * Listener for the stages of putItemsIntoCal().
 *
 * @typedef PutItemsIntoCalListener
 * @property {Function}   onStart
 * @property {onError}    onDuplicate
 * @property {onError}    onError
 * @property {onProgress} onProgress
 * @property {Function}   onEnd
 */

/**
 * Put items into a certain calendar, catching errors and showing them to the
 * user.
 *
 * @param {calICalendar} destCal - The destination calendar.
 * @param {calIItemBase[]} aItems - An array of items to put into the calendar.
 * @param {string} aFilePath - The original file path, for error messages.
 * @param {PutItemsIntoCalListener} [aListener] - Optional listener.
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
  const total = aItems.length;

  for (const item of aItems) {
    try {
      await destCal.addItem(item);
    } catch (e) {
      if (e == Ci.calIErrors.DUPLICATE_ID) {
        await callListener("onDuplicate", item, e);
      } else {
        console.error(e);
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
 * @param {calIEvent[]} calendarEventArray - Array of calendar events that should be saved to file.
 * @param {string} [aDefaultFileName] - Initial filename shown in SaveAs dialog.
 */
function saveEventsToFile(calendarEventArray, aDefaultFileName) {
  if (!calendarEventArray || !calendarEventArray.length) {
    return;
  }

  // Show the 'Save As' dialog and ask for a filename to save to
  const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  picker.init(
    window.browsingContext,
    lazy.l10n.formatValueSync("filepicker-title-export"),
    Ci.nsIFilePicker.modeSave
  );

  let filename;
  if (aDefaultFileName && aDefaultFileName.length && aDefaultFileName.length > 0) {
    filename = aDefaultFileName;
  } else if (calendarEventArray.length == 1 && calendarEventArray[0].title) {
    filename = calendarEventArray[0].title;
  } else {
    filename = lazy.l10n.formatValueSync("default-file-name");
  }
  // Remove characters usually illegal on the file system.
  picker.defaultString = filename.replace(/[/\\?%*:|"<>]/g, "-");

  picker.defaultExtension = "ics";

  // Get a list of exporters
  const contractids = [];
  let currentListLength = 0;
  let defaultCIDIndex = 0;
  for (const { data } of Services.catMan.enumerateCategory("cal-exporters")) {
    const contractid = Services.catMan.getCategoryEntry("cal-exporters", data);
    let exporter;
    try {
      exporter = Cc[contractid].getService(Ci.calIExporter);
    } catch (e) {
      cal.WARN("Could not initialize exporter: " + contractid + "\nError: " + e);
      continue;
    }
    const types = exporter.getFileTypes();
    for (const type of types) {
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

    const exporter = Cc[contractids[filterIndex]].getService(Ci.calIExporter);

    let filePath = picker.file.path;
    if (!filePath.includes(".")) {
      filePath += "." + exporter.getFileTypes()[0].defaultExtension;
    }

    const localFileInstance = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    localFileInstance.initWithPath(filePath);

    const outputStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
      Ci.nsIFileOutputStream
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
      cal.showError(lazy.l10n.formatValueSync("unable-to-write", { filePath }), window);
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
  const getItemsFromCal = async function (aCal) {
    const items = await aCal.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null);
    saveEventsToFile(items, aCal.name);
  };

  if (aCalendar) {
    getItemsFromCal(aCalendar);
  } else {
    const calendars = cal.manager.getCalendars();

    if (calendars.length == 1) {
      // There's only one calendar, so it's silly to ask what calendar
      // the user wants to import into.
      getItemsFromCal(calendars[0]);
    } else {
      // Ask what calendar to import into
      const args = {};
      args.onOk = getItemsFromCal;
      args.promptText = lazy.l10n.formatValueSync("export-prompt");
      openDialog(
        "chrome://calendar/content/chooseCalendarDialog.xhtml",
        "_blank",
        "chrome,titlebar,modal,resizable",
        args
      );
    }
  }
}
