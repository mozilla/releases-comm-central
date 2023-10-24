/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs");
var { FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs");

var { updateAppInfo } = ChromeUtils.importESModule("resource://testing-common/AppInfo.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

updateAppInfo();

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

function createDate(aYear, aMonth, aDay, aHasTime, aHour, aMinute, aSecond, aTimezone) {
  const date = Cc["@mozilla.org/calendar/datetime;1"].createInstance(Ci.calIDateTime);
  date.resetTo(
    aYear,
    aMonth,
    aDay,
    aHour || 0,
    aMinute || 0,
    aSecond || 0,
    aTimezone || cal.dtz.UTC
  );
  date.isDate = !aHasTime;
  return date;
}

function createEventFromIcalString(icalString) {
  if (/^BEGIN:VCALENDAR/.test(icalString)) {
    const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
    parser.parseString(icalString);
    const items = parser.getItems();
    cal.ASSERT(items.length == 1);
    return items[0].QueryInterface(Ci.calIEvent);
  }
  const event = Cc["@mozilla.org/calendar/event;1"].createInstance(Ci.calIEvent);
  event.icalString = icalString;
  return event;
}

function createTodoFromIcalString(icalString) {
  const todo = Cc["@mozilla.org/calendar/todo;1"].createInstance(Ci.calITodo);
  todo.icalString = icalString;
  return todo;
}

function getMemoryCal() {
  return Cc["@mozilla.org/calendar/calendar;1?type=memory"].createInstance(
    Ci.calISyncWriteCalendar
  );
}

function getStorageCal() {
  // Whenever we get the storage calendar we need to request a profile,
  // otherwise the cleanup functions will not run
  do_get_profile();

  // create URI
  const db = Services.dirsvc.get("TmpD", Ci.nsIFile);
  db.append("test_storage.sqlite");
  const uri = Services.io.newFileURI(db);

  // Make sure timezone service is initialized
  Cc["@mozilla.org/calendar/timezone-service;1"].getService(Ci.calIStartupService).startup(null);

  // create storage calendar
  const stor = Cc["@mozilla.org/calendar/calendar;1?type=storage"].createInstance(
    Ci.calISyncWriteCalendar
  );
  stor.uri = uri;
  stor.id = cal.getUUID();
  return stor;
}

/**
 * Return an item property as string.
 *
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
  }
  return null;
}

function compareItemsSpecific(aLeftItem, aRightItem, aPropArray) {
  if (!aPropArray) {
    // left out:  "id", "calendar", "lastModifiedTime", "generation",
    // "stampTime" as these are expected to change
    aPropArray = [
      "start",
      "end",
      "duration",
      "title",
      "priority",
      "privacy",
      "creationDate",
      "status",
      "alarmLastAck",
      "recurrenceStartDate",
    ];
  }
  if (aLeftItem instanceof Ci.calIEvent) {
    aLeftItem.QueryInterface(Ci.calIEvent);
  } else if (aLeftItem instanceof Ci.calITodo) {
    aLeftItem.QueryInterface(Ci.calITodo);
  }
  for (let i = 0; i < aPropArray.length; i++) {
    equal(getProps(aLeftItem, aPropArray[i]), getProps(aRightItem, aPropArray[i]));
  }
}

/**
 * Unfold ics lines by removing any \r\n or \n followed by a linear whitespace
 * (space or htab).
 *
 * @param aLine     The line to unfold
 * @returns The unfolded line
 */
function ics_unfoldline(aLine) {
  return aLine.replace(/\r?\n[ \t]/g, "");
}

/**
 * Dedent the template string tagged with this function to make indented data
 * easier to read. Usage:
 *
 * let data = dedent`
 *     This is indented data it will be unindented so that the first line has
 *       no leading spaces and the second is indented by two spaces.
 * `;
 *
 * @param strings       The string fragments from the template string
 * @param ...values     The interpolated values
 * @returns The interpolated, dedented string
 */
function dedent(strings, ...values) {
  const parts = [];
  // Perform variable interpolation
  let minIndent = Infinity;
  for (const [i, string] of strings.entries()) {
    const innerparts = string.split("\n");
    if (i == 0) {
      innerparts.shift();
    }
    if (i == strings.length - 1) {
      innerparts.pop();
    }
    for (const [j, ip] of innerparts.entries()) {
      const match = ip.match(/^(\s*)\S*/);
      if (j != 0) {
        minIndent = Math.min(minIndent, match[1].length);
      }
    }
    parts.push(innerparts);
  }

  return parts
    .map((part, i) => {
      return (
        part
          .map((line, j) => {
            return j == 0 && i > 0 ? line : line.substr(minIndent);
          })
          .join("\n") + (i < values.length ? values[i] : "")
      );
    })
    .join("");
}

/**
 * Read a JSON file and return the JS object
 */
function readJSONFile(aFile) {
  const stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  try {
    stream.init(aFile, FileUtils.MODE_RDONLY, FileUtils.PERMS_FILE, 0);
    const bytes = NetUtil.readInputStream(stream, stream.available());
    const data = JSON.parse(new TextDecoder().decode(bytes));
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
  cal.timezoneService.startup({
    onResult() {
      do_test_finished();
      callback();
    },
  });
}

function do_load_calmgr(callback) {
  do_test_pending();
  cal.manager.startup({
    onResult() {
      do_test_finished();
      callback();
    },
  });
}

function do_calendar_startup(callback) {
  const obs = {
    observe() {
      Services.obs.removeObserver(this, "calendar-startup-done");
      do_test_finished();
      executeSoon(callback);
    },
  };

  const startupService = Cc["@mozilla.org/calendar/startup-service;1"].getService(
    Ci.nsISupports
  ).wrappedJSObject;

  if (startupService.started) {
    callback();
  } else {
    do_test_pending();
    Services.obs.addObserver(obs, "calendar-startup-done");
    if (this._profileInitialized) {
      Services.obs.notifyObservers(null, "profile-after-change", "xpcshell-do-get-profile");
    } else {
      do_get_profile(true);
    }
  }
}

/**
 * Monkey patch the function with the name x on obj and overwrite it with func.
 * The first parameter of this function is the original function that can be
 * called at any time.
 *
 * @param obj           The object the function is on.
 * @param name          The string name of the function.
 * @param func          The function to monkey patch with.
 */
function monkeyPatch(obj, x, func) {
  const old = obj[x];
  obj[x] = function () {
    const parent = old.bind(obj);
    const args = Array.from(arguments);
    args.unshift(parent);
    try {
      return func.apply(obj, args);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };
}

/**
 * Asserts the properties of an actual extract parser result to what was
 * expected.
 *
 * @param {object} actual - Mostly the actual output of parse().
 * @param {object} expected - The expected output.
 * @param {string} level - The variable name to refer to report on.
 */
function compareExtractResults(actual, expected, level = "") {
  for (const [key, value] of Object.entries(expected)) {
    const qualifiedKey = [level, Array.isArray(expected) ? `[${key}]` : `.${key}`].join("");
    if (value && typeof value == "object") {
      Assert.ok(actual[key], `${qualifiedKey} is not null`);
      compareExtractResults(actual[key], value, qualifiedKey);
      continue;
    }
    Assert.equal(actual[key], value, `${qualifiedKey} has value "${value}"`);
  }
}
