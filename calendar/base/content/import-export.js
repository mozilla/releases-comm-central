/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

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
    const nsIFilePicker = Components.interfaces.nsIFilePicker;

    let picker = Components.classes["@mozilla.org/filepicker;1"]
                           .createInstance(nsIFilePicker);
    picker.init(window,
                calGetString("calendar", "filepickerTitleImport"),
                nsIFilePicker.modeOpen);
    picker.defaultExtension = "ics";

    // Get a list of importers
    let contractids = [];
    let catman = Components.classes["@mozilla.org/categorymanager;1"]
                           .getService(Components.interfaces.nsICategoryManager);
    let catenum = catman.enumerateCategory("cal-importers");
    let currentListLength = 0;
    let defaultCIDIndex = 0;
    while (catenum.hasMoreElements()) {
        let entry = catenum.getNext();
        entry = entry.QueryInterface(Components.interfaces.nsISupportsCString);
        let contractid = catman.getCategoryEntry("cal-importers", entry);
        let importer;
        try {
            importer = Components.classes[contractid]
                                 .getService(Components.interfaces.calIImporter);
        } catch (e) {
            cal.WARN("Could not initialize importer: " + contractid + "\nError: " + e);
            continue;
        }
        let types = importer.getFileTypes({});
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

    let rv = picker.show();

    if (rv != nsIFilePicker.returnCancel &&
        picker.file && picker.file.path && picker.file.path.length > 0) {
        let filterIndex = picker.filterIndex;
        if (picker.filterIndex < 0 || picker.filterIndex > contractids.length) {
            // For some reason the wrong filter was selected, assume default extension
            filterIndex = defaultCIDIndex;
        }

        let filePath = picker.file.path;
        let importer = Components.classes[contractids[filterIndex]]
                                 .getService(Components.interfaces.calIImporter);

        const nsIFileInputStream = Components.interfaces.nsIFileInputStream;

        let inputStream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                                    .createInstance(nsIFileInputStream);
        let items = [];
        let exception;

        try {
            inputStream.init(picker.file, MODE_RDONLY, parseInt("0444", 8), {});
            items = importer.importFromStream(inputStream, {});
        } catch (ex) {
            exception = ex;
            switch (ex.result) {
                case Components.interfaces.calIErrors.INVALID_TIMEZONE:
                    showError(cal.calGetString("calendar", "timezoneError", [filePath]));
                    break;
                default:
                    showError(cal.calGetString("calendar", "unableToRead") + filePath + "\n" + ex);
            }
        } finally {
            inputStream.close();
        }

        if (!items.length && !exception) {
            // the ics did not contain any events, so there's no need to proceed. But we should
            // notify the user about it, if we haven't before.
            showError(cal.calGetString("calendar", "noItemsInCalendarFile", [filePath]));
            return;
        }

        if (aCalendar) {
            putItemsIntoCal(aCalendar, items);
            return;
        }

        let calendars = cal.getCalendarManager().getCalendars({});
        calendars = calendars.filter(isCalendarWritable);

        if (calendars.length < 1) {
            // XXX alert something?
            return;
        } else if (calendars.length == 1) {
            // There's only one calendar, so it's silly to ask what calendar
            // the user wants to import into.
            putItemsIntoCal(calendars[0], items, filePath);
        } else {
            // Ask what calendar to import into
            let args = {};
            args.onOk = (aCal) => { putItemsIntoCal(aCal, items, filePath); };
            args.calendars = calendars;
            args.promptText = calGetString("calendar", "importPrompt");
            openDialog("chrome://calendar/content/chooseCalendarDialog.xul",
                       "_blank", "chrome,titlebar,modal,resizable", args);
        }
    }
}

/**
 * Put items into a certain calendar, catching errors and showing them to the
 * user.
 *
 * @param destCal       The destination calendar.
 * @param aItems        An array of items to put into the calendar.
 * @param aFilePath     The original file path, for error messages.
 */
function putItemsIntoCal(destCal, aItems, aFilePath) {
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
    // wan't to bomb the user with thousands of error messages in case
    // something went really wrong.
    // (example of something very wrong: importing the same file twice.
    //  quite easy to trigger, so we really should do this)
    let lastError;
    let listener = {
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
        onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
            count++;
            if (!Components.isSuccessCode(aStatus)) {
                if (aStatus == Components.interfaces.calIErrors.DUPLICATE_ID) {
                    duplicateCount++;
                } else {
                    failedCount++;
                    lastError = aStatus;
                }
            }
            // See if it is time to end the calendar's batch.
            if (count == aItems.length) {
                destCal.endBatch();
                if (!failedCount && duplicateCount) {
                    showError(calGetString("calendar", "duplicateError", [duplicateCount, aFilePath]));
                } else if (failedCount) {
                    showError(calGetString("calendar", "importItemsFailed", [failedCount, lastError.toString()]));
                }
            }
        }
    };

    for (let item of aItems) {
        // XXX prompt when finding a duplicate.
        try {
            destCal.addItem(item, listener);
        } catch (e) {
            failedCount++;
            lastError = e;
            // Call the listener's operationComplete, to increase the
            // counter and not miss failed items. Otherwise, endBatch might
            // never be called.
            listener.onOperationComplete(null, null, null, null, null);
            Components.utils.reportError("Import error: " + e);
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
    const nsIFilePicker = Components.interfaces.nsIFilePicker;

    let picker = Components.classes["@mozilla.org/filepicker;1"]
                       .createInstance(nsIFilePicker);

    picker.init(window,
                calGetString("calendar", "filepickerTitleExport"),
                nsIFilePicker.modeSave);

    if (aDefaultFileName && aDefaultFileName.length && aDefaultFileName.length > 0) {
        picker.defaultString = aDefaultFileName;
    } else if (calendarEventArray.length == 1 && calendarEventArray[0].title) {
        picker.defaultString = calendarEventArray[0].title;
    } else {
        picker.defaultString = calGetString("calendar", "defaultFileName");
    }

    picker.defaultExtension = "ics";

    // Get a list of exporters
    let contractids = [];
    let catman = Components.classes["@mozilla.org/categorymanager;1"]
                           .getService(Components.interfaces.nsICategoryManager);
    let catenum = catman.enumerateCategory("cal-exporters");
    let currentListLength = 0;
    let defaultCIDIndex = 0;
    while (catenum.hasMoreElements()) {
        let entry = catenum.getNext();
        entry = entry.QueryInterface(Components.interfaces.nsISupportsCString);
        let contractid = catman.getCategoryEntry("cal-exporters", entry);
        let exporter;
        try {
            exporter = Components.classes[contractid]
                                 .getService(Components.interfaces.calIExporter);
        } catch (e) {
            cal.WARN("Could not initialize exporter: " + contractid + "\nError: " + e);
            continue;
        }
        let types = exporter.getFileTypes({});
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

    let rv = picker.show();

    // Now find out as what to save, convert the events and save to file.
    if (rv != nsIFilePicker.returnCancel && picker.file && picker.file.path.length > 0) {
        let filterIndex = picker.filterIndex;
        if (picker.filterIndex < 0 || picker.filterIndex > contractids.length) {
            // For some reason the wrong filter was selected, assume default extension
            filterIndex = defaultCIDIndex;
        }

        let exporter = Components.classes[contractids[filterIndex]]
                                 .getService(Components.interfaces.calIExporter);

        let filePath = picker.file.path;
        if (!filePath.includes(".")) {
            filePath += "." + exporter.getFileTypes({})[0].defaultExtension;
        }

        const nsILocalFile = Components.interfaces.nsILocalFile;
        const nsIFileOutputStream = Components.interfaces.nsIFileOutputStream;

        let outputStream;
        let localFileInstance = Components.classes["@mozilla.org/file/local;1"]
                                          .createInstance(nsILocalFile);
        localFileInstance.initWithPath(filePath);

        outputStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
                                 .createInstance(nsIFileOutputStream);
        try {
            outputStream.init(localFileInstance,
                              MODE_WRONLY | MODE_CREATE | MODE_TRUNCATE,
                              parseInt("0664", 8),
                              0);

            // XXX Do the right thing with unicode and stuff. Or, again, should the
            //     exporter handle that?
            exporter.exportToStream(outputStream,
                                    calendarEventArray.length,
                                    calendarEventArray,
                                    null);
            outputStream.close();
        } catch (ex) {
            showError(calGetString("calendar", "unableToWrite") + filePath);
        }
    }
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
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
        onOperationComplete: function(aOpCalendar, aStatus, aOperationType, aId, aDetail) {
            saveEventsToFile(itemArray, aOpCalendar.name);
        },
        onGetResult: function(aOpCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
            for (let item of aItems) {
                itemArray.push(item);
            }
        }
    };

    let getItemsFromCal = function(aCal) {
        aCal.getItems(Components.interfaces.calICalendar.ITEM_FILTER_ALL_ITEMS,
                      0, null, null, getListener);
    };

    if (aCalendar) {
        getItemsFromCal(aCalendar);
    } else {
        let count = {};
        let calendars = getCalendarManager().getCalendars(count);

        if (count.value == 1) {
            // There's only one calendar, so it's silly to ask what calendar
            // the user wants to import into.
            getItemsFromCal(calendars[0]);
        } else {
            // Ask what calendar to import into
            let args = {};
            args.onOk = getItemsFromCal;
            args.promptText = calGetString("calendar", "exportPrompt");
            openDialog("chrome://calendar/content/chooseCalendarDialog.xul",
                       "_blank", "chrome,titlebar,modal,resizable", args);
        }
    }
}
