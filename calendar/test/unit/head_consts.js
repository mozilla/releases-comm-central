/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported do_calendar_startup, do_load_calmgr, do_load_timezoneservice,
 *          readJSONFile, ics_unfoldline, compareItemsSpecific, getStorageCal,
 *          getMemoryCal, createTodoFromIcalString, createEventFromIcalString,
 *          createDate, Cc, Ci, Cr, Cu
 */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");

Components.utils.import("resource://testing-common/AppInfo.jsm");
updateAppInfo();

var { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

(function() {
    let bindir = Services.dirsvc.get("CurProcD", Components.interfaces.nsIFile);
    bindir.append("extensions");
    bindir.append("{e2fda1a4-762b-4020-b5ad-a41df1933103}");
    bindir.append("chrome.manifest");
    dump("Loading" + bindir.path + "\n");
    Components.manager.autoRegister(bindir);
})();

Components.utils.import("resource://calendar/modules/calUtils.jsm");

// we might want to use calUtils.jsm only in the future throughout all tests,
// but for now source in good old calUtils.js:
cal.loadScripts(["calUtils.js"], Components.utils.getGlobalForObject(Cc));

function createDate(aYear, aMonth, aDay, aHasTime, aHour, aMinute, aSecond, aTimezone) {
    let date = Cc["@mozilla.org/calendar/datetime;1"]
               .createInstance(Ci.calIDateTime);
    date.resetTo(aYear,
               aMonth,
               aDay,
               aHour || 0,
               aMinute || 0,
               aSecond || 0,
               aTimezone || UTC());
    date.isDate = !aHasTime;
    return date;
}

function createEventFromIcalString(icalString) {
    if (/^BEGIN:VCALENDAR/.test(icalString)) {
        let parser = Components.classes["@mozilla.org/calendar/ics-parser;1"]
                               .createInstance(Components.interfaces.calIIcsParser);
        parser.parseString(icalString);
        let items = parser.getItems({});
        ASSERT(items.length == 1);
        return items[0];
    } else {
        let event = Cc["@mozilla.org/calendar/event;1"].createInstance(Ci.calIEvent);
        event.icalString = icalString;
        return event;
    }
}

function createTodoFromIcalString(icalString) {
    let todo = Cc["@mozilla.org/calendar/todo;1"]
               .createInstance(Ci.calITodo);
    todo.icalString = icalString;
    return todo;
}

function getMemoryCal() {
    return Cc["@mozilla.org/calendar/calendar;1?type=memory"]
             .createInstance(Ci.calISyncWriteCalendar);
}

function getStorageCal() {
    // Whenever we get the storage calendar we need to request a profile,
    // otherwise the cleanup functions will not run
    do_get_profile();

    // create URI
    let db = Services.dirsvc.get("TmpD", Ci.nsIFile);
    db.append("test_storage.sqlite");
    let uri = Services.io.newFileURI(db);

    // Make sure timezone service is initialized
    Components.classes["@mozilla.org/calendar/timezone-service;1"]
              .getService(Components.interfaces.calIStartupService)
              .startup(null);

    // create storage calendar
    let stor = Cc["@mozilla.org/calendar/calendar;1?type=storage"]
              .createInstance(Ci.calISyncWriteCalendar);
    stor.uri = uri;
    stor.id = cal.getUUID();
    return stor;
}

/**
 * Return an item property as string.
 * @param aItem
 * @param string aProp possible item properties: start, end, duration,
 *                     generation, title,
 *                     id, calendar, creationDate, lastModifiedTime,
 *                     stampTime, priority, privacy, status,
 *                     alarmLastAck, recurrenceStartDate
 *                     and any property that can be obtained using getProperty()
 */
function getProps(aItem, aProp) {
    let value = null;
    switch (aProp) {
        case "start":
            value = aItem.startDate || aItem.entryDate || null;
            break;
        case "end":
            value = aItem.endDate || aItem.dueDate || null;
            break;
        case "duration":
            value = aItem.duration || null;
            break;
        case "generation":
            value = aItem.generation;
            break;
        case "title":
            value = aItem.title;
            break;
        case "id":
            value = aItem.id;
            break;
        case "calendar":
            value = aItem.calendar.id;
            break;
        case "creationDate":
            value = aItem.creationDate;
            break;
        case "lastModifiedTime":
            value = aItem.lastModifiedTime;
            break;
        case "stampTime":
            value = aItem.stampTime;
            break;
        case "priority":
            value = aItem.priority;
            break;
        case "privacy":
            value = aItem.privacy;
            break;
        case "status":
            value = aItem.status;
            break;
        case "alarmLastAck":
            value = aItem.alarmLastAck;
            break;
        case "recurrenceStartDate":
            value = aItem.recurrenceStartDate;
            break;
        default:
            value = aItem.getProperty(aProp);
    }
    if (value) {
        return value.toString();
    } else {
        return null;
    }
}

function compareItemsSpecific(aLeftItem, aRightItem, aPropArray) {
    if (!aPropArray) {
        // left out:  "id", "calendar", "lastModifiedTime", "generation",
        // "stampTime" as these are expected to change
        aPropArray = ["start", "end", "duration",
                      "title", "priority", "privacy", "creationDate",
                      "status", "alarmLastAck",
                      "recurrenceStartDate"];
    }
    for (let i = 0; i < aPropArray.length; i++) {
        equal(getProps(aLeftItem, aPropArray[i]),
              getProps(aRightItem, aPropArray[i]),
              Components.stack.caller);
    }
}


/**
 * Unfold ics lines by removing any \r\n or \n followed by a linear whitespace
 * (space or htab).
 *
 * @param aLine     The line to unfold
 * @return          The unfolded line
 */
function ics_unfoldline(aLine) {
    return aLine.replace(/\r?\n[ \t]/g, "");
}

/**
 * Read a JSON file and return the JS object
 */
function readJSONFile(aFile) {
    let stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    try {
        stream.init(aFile, FileUtils.MODE_RDONLY, FileUtils.PERMS_FILE, 0);
        let json = Cc["@mozilla.org/dom/json;1"].createInstance(Components.interfaces.nsIJSON);
        let data = json.decodeFromStream(stream, stream.available());
        return data;
    } catch (ex) {
        dump("readJSONFile: Error reading JSON file: " + ex);
    } finally {
        stream.close();
    }
    return false;
}

function do_load_timezoneservice(callback) {
    do_test_pending();
    cal.getTimezoneService().startup({
        onResult: function() {
            do_test_finished();
            callback();
        }
    });
}

function do_load_calmgr(callback) {
    do_test_pending();
    cal.getCalendarManager().startup({
        onResult: function() {
            do_test_finished();
            callback();
        }
    });
}

function do_calendar_startup(callback) {
    let obs = {
        observe: function() {
            Services.obs.removeObserver(this, "calendar-startup-done");
            do_test_finished();
            do_execute_soon(callback);
        }
    };

    let startupService = Components.classes["@mozilla.org/calendar/startup-service;1"]
                                   .getService(Components.interfaces.nsISupports).wrappedJSObject;

    if (startupService.started) {
        callback();
    } else {
        do_test_pending();
        Services.obs.addObserver(obs, "calendar-startup-done", false);
        if (_profileInitialized) {
            Services.obs.notifyObservers(null, "profile-after-change", "xpcshell-do-get-profile");
        } else {
            do_get_profile(true);
        }
    }
}
