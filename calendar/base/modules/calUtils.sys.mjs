/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const { ICAL } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");
ICAL.design.strict = false;

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CalDateTime: "resource:///modules/CalDateTime.sys.mjs",
  CalDuration: "resource:///modules/CalDuration.sys.mjs",
  CalRecurrenceDate: "resource:///modules/CalRecurrenceDate.sys.mjs",
  CalRecurrenceRule: "resource:///modules/CalRecurrenceRule.sys.mjs",
});

// The calendar console instance
var gCalendarConsole = console.createInstance({
  prefix: "Calendar",
  consoleID: "calendar",
  maxLogLevel: Services.prefs.getBoolPref("calendar.debug.log", false) ? "All" : "Warn",
});

export var cal = {
  // These functions exist to reduce boilerplate code for creating instances
  // as well as getting services and other (cached) objects.
  createDateTime(value) {
    const instance = new lazy.CalDateTime();
    if (value) {
      instance.icalString = value;
    }
    return instance;
  },
  createDuration(value) {
    const instance = new lazy.CalDuration();
    if (value) {
      instance.icalString = value;
    }
    return instance;
  },
  createRecurrenceDate(value) {
    const instance = new lazy.CalRecurrenceDate();
    if (value) {
      instance.icalString = value;
    }
    return instance;
  },
  createRecurrenceRule(value) {
    const instance = new lazy.CalRecurrenceRule();
    if (value) {
      instance.icalString = value;
    }
    return instance;
  },

  /**
   * The calendar console instance
   */
  console: gCalendarConsole,

  /**
   * Logs a calendar message to the console. Needs calendar.debug.log enabled to show messages.
   * Shortcut to cal.console.log()
   */
  LOG: gCalendarConsole.log.bind(gCalendarConsole),
  LOGverbose: gCalendarConsole.debug.bind(gCalendarConsole),

  /**
   * Logs a calendar warning to the console. Shortcut to cal.console.warn()
   */
  WARN: gCalendarConsole.warn.bind(gCalendarConsole),

  /**
   * Logs a calendar error to the console. Shortcut to cal.console.error()
   */
  ERROR: gCalendarConsole.error.bind(gCalendarConsole),

  /**
   * Uses the prompt service to display an error message. Use this sparingly,
   * as it interrupts the user.
   *
   * @param {string} aMsg - The message to be shown
   * @param {?nsIWindow} aWindow - The window to show the message in, or null
   *   for any window.
   */
  showError(aMsg, aWindow = null) {
    Services.prompt.alert(aWindow, cal.l10n.getCalString("genericErrorTitle"), aMsg);
  },

  /**
   * Returns a string describing the current js-stack with filename and line
   * numbers.
   *
   * @param {number} aDepth - (optional) The number of frames to include.
   *   Defaults to 5.
   * @param {number} aSkip - (optional) Number of frames to skip.
   */
  STACK(aDepth = 10, aSkip = 0) {
    let stack = "";
    let frame = Components.stack.caller;
    for (let i = 1; i <= aDepth + aSkip && frame; i++) {
      if (i > aSkip) {
        stack += `${i}: [${frame.filename}:${frame.lineNumber}] ${frame.name}\n`;
      }
      frame = frame.caller;
    }
    return stack;
  },

  /**
   * Logs a message and the current js-stack, if aCondition fails.
   *
   * @param {boolean} aCondition - The condition to test for.
   * @param {string} aMessage - The message to report in the case the assert
   *   fails.
   * @param {boolean} aCritical - If true, throw an error to stop current code
   *   execution. If false, code flow will continue. May be a result code.
   */
  ASSERT(aCondition, aMessage, aCritical = false) {
    if (aCondition) {
      return;
    }

    const string = `Assert failed: ${aMessage}\n ${cal.STACK(0, 1)}`;
    if (aCritical) {
      const rescode = aCritical === true ? Cr.NS_ERROR_UNEXPECTED : aCritical;
      throw new Components.Exception(string, rescode);
    } else {
      console.error(string);
    }
  },

  /**
   * Generates the QueryInterface function. This is a replacement for
   * XPCOMUtils.generateQI, which is being replaced. Unfortunately Calendar's
   * code depends on some of its classes providing nsIClassInfo, which causes
   * xpconnect/xpcom to make all methods available, e.g. for an event both
   * calIItemBase and calIEvent.
   *
   * @param {(string[]|nsIIDRef[])} aInterfaces - The interfaces to generate QI
   *   for.
   * @returns {Function} The QueryInterface function.
   */
  generateQI(aInterfaces) {
    if (aInterfaces.length == 1) {
      cal.WARN(
        "When generating QI for one interface, please use ChromeUtils.generateQI",
        cal.STACK(10)
      );
      return ChromeUtils.generateQI(aInterfaces);
    }
    /* Note that Ci[Ci.x] == Ci.x for all x */
    const names = [];
    if (aInterfaces) {
      for (let i = 0; i < aInterfaces.length; i++) {
        const iface = aInterfaces[i];
        const name = (iface && iface.name) || String(iface);
        if (name in Ci) {
          names.push(name);
        }
      }
    }
    return makeQI(names);
  },

  /**
   * Generate a ClassInfo implementation for a component. The returned object
   * must be assigned to the 'classInfo' property of a JS object. The first and
   * only argument should be an object that contains a number of optional
   * properties: "interfaces", "contractID", "classDescription", "classID" and
   * "flags". The values of the properties will be returned as the values of the
   * various properties of the nsIClassInfo implementation.
   */
  generateCI(classInfo) {
    if ("QueryInterface" in classInfo) {
      throw Error("In generateCI, don't use a component for generating classInfo");
    }
    /* Note that Ci[Ci.x] == Ci.x for all x */
    const _interfaces = [];
    for (let i = 0; i < classInfo.interfaces.length; i++) {
      const iface = classInfo.interfaces[i];
      if (Ci[iface]) {
        _interfaces.push(Ci[iface]);
      }
    }
    return {
      get interfaces() {
        return [Ci.nsIClassInfo, Ci.nsISupports].concat(_interfaces);
      },
      getScriptableHelper() {
        return null;
      },
      contractID: classInfo.contractID,
      classDescription: classInfo.classDescription,
      classID: classInfo.classID,
      flags: classInfo.flags,
      QueryInterface: ChromeUtils.generateQI(["nsIClassInfo"]),
    };
  },

  /**
   * Create an adapter for the given interface. If passed, methods will be
   * added to the template object, otherwise a new object will be returned.
   *
   * @param {(object|string)} iface - The interface to adapt, either using
   *   Components.interfaces or the name as a string.
   * @param {?object} template - (optional) A template object to extend.
   * @returns {object} If passed the adapted template object, otherwise a clean
   *   adapter.
   *
   * Currently supported interfaces are:
   *  - calIObserver
   *  - calICalendarManagerObserver
   *  - calIOperationListener
   *  - calICompositeObserver
   */
  createAdapter(iface, template) {
    let methods;
    const adapter = template || {};
    switch (iface.name || iface) {
      case "calIObserver":
        methods = [
          "onStartBatch",
          "onEndBatch",
          "onLoad",
          "onAddItem",
          "onModifyItem",
          "onDeleteItem",
          "onError",
          "onPropertyChanged",
          "onPropertyDeleting",
        ];
        break;
      case "calICalendarManagerObserver":
        methods = ["onCalendarRegistered", "onCalendarUnregistering", "onCalendarDeleting"];
        break;
      case "calIOperationListener":
        methods = ["onGetResult", "onOperationComplete"];
        break;
      case "calICompositeObserver":
        methods = ["onCalendarAdded", "onCalendarRemoved", "onDefaultCalendarChanged"];
        break;
      default:
        methods = [];
        break;
    }

    for (const method of methods) {
      if (!(method in template)) {
        adapter[method] = function () {};
      }
    }
    adapter.QueryInterface = ChromeUtils.generateQI([iface]);

    return adapter;
  },

  /**
   * Make a UUID, without enclosing brackets, e.g. 0d3950fd-22e5-4508-91ba-0489bdac513f
   *
   * @returns {string} The generated UUID
   */
  getUUID() {
    // generate uuids without braces to avoid problems with
    // CalDAV servers that don't support filenames with {}
    return Services.uuid.generateUUID().toString().replace(/[{}]/g, "");
  },

  /**
   * Adds an observer listening for the topic.
   *
   * @param {Function} func - Function to execute on topic.
   * @param {string} topic - Topic to listen for.
   * @param {boolean} oneTime - Whether to listen only once.
   */
  addObserver(func, topic, oneTime) {
    const observer = {
      // nsIObserver:
      observe(subject, topic_, data) {
        if (topic == topic_) {
          if (oneTime) {
            Services.obs.removeObserver(this, topic);
          }
          func(subject, topic, data);
        }
      },
    };
    Services.obs.addObserver(observer, topic);
  },

  /**
   * Wraps an instance, making sure the xpcom wrapped object is used.
   *
   * @param {object} aObj - The object under consideration.
   * @param {object} aInterface - The interface to be wrapped.
   *
   * Use this function to QueryInterface the object to a particular interface.
   * You may only expect the return value to be wrapped, not the original passed
   * object.
   *
   * For example:
   *
   * // BAD USAGE:
   * if (cal.wrapInstance(foo, Ci.nsIBar)) {
   *   foo.barMethod();
   * }
   *
   * // GOOD USAGE:
   * foo = cal.wrapInstance(foo, Ci.nsIBar);
   * if (foo) {
   *   foo.barMethod();
   * }
   *
   */
  wrapInstance(aObj, aInterface) {
    if (!aObj) {
      return null;
    }

    try {
      return aObj.QueryInterface(aInterface);
    } catch (e) {
      return null;
    }
  },

  /**
   * Tries to get rid of wrappers, if this is not possible then return the
   * passed object.
   *
   * @param {object} aObj - The object under consideration.
   * @returns {object} The possibly unwrapped object.
   */
  unwrapInstance(aObj) {
    return aObj && aObj.wrappedJSObject ? aObj.wrappedJSObject : aObj;
  },

  /**
   * Adds an xpcom shutdown observer.
   *
   * @param {Function} func - Function to execute.
   */
  addShutdownObserver(func) {
    cal.addObserver(func, "xpcom-shutdown", true /* one time */);
  },

  /**
   * Due to wrapped JS objects, some objects may have cyclic references.
   * You can register properties of objects to be cleaned up on XPCOM-shutdown.
   *
   * @param {object} obj - Object.
   * @param {?object} prop - Property to be deleted on shutdown (if null,
   *   |object| will be deleted).
   */
  registerForShutdownCleanup: shutdownCleanup,
};

/**
 * Update the logging preferences for the calendar console based on the state of verbose logging and
 * normal calendar logging.
 */
function updateLogPreferences() {
  if (cal.verboseLogEnabled) {
    gCalendarConsole.maxLogLevel = "all";
  } else if (cal.debugLogEnabled) {
    gCalendarConsole.maxLogLevel = "log";
  } else {
    gCalendarConsole.maxLogLevel = "warn";
  }
}

// Preferences
XPCOMUtils.defineLazyPreferenceGetter(
  cal,
  "debugLogEnabled",
  "calendar.debug.log",
  false,
  updateLogPreferences
);
XPCOMUtils.defineLazyPreferenceGetter(
  cal,
  "verboseLogEnabled",
  "calendar.debug.log.verbose",
  false,
  updateLogPreferences
);
XPCOMUtils.defineLazyPreferenceGetter(
  cal,
  "threadingEnabled",
  "calendar.threading.disabled",
  false
);

// Services
XPCOMUtils.defineLazyServiceGetter(
  cal,
  "manager",
  "@mozilla.org/calendar/manager;1",
  "calICalendarManager"
);
XPCOMUtils.defineLazyServiceGetter(
  cal,
  "icsService",
  "@mozilla.org/calendar/ics-service;1",
  "calIICSService"
);
XPCOMUtils.defineLazyServiceGetter(
  cal,
  "timezoneService",
  "@mozilla.org/calendar/timezone-service;1",
  "calITimezoneService"
);
XPCOMUtils.defineLazyServiceGetter(
  cal,
  "freeBusyService",
  "@mozilla.org/calendar/freebusy-service;1",
  "calIFreeBusyService"
);
XPCOMUtils.defineLazyServiceGetter(
  cal,
  "weekInfoService",
  "@mozilla.org/calendar/weekinfo-service;1",
  "calIWeekInfoService"
);
XPCOMUtils.defineLazyServiceGetter(
  cal,
  "dragService",
  "@mozilla.org/widget/dragservice;1",
  "nsIDragService"
);

// Sub-modules for calUtils
// XXX: https://bugzilla.mozilla.org/show_bug.cgi?id=1745807 should drop the
// pattern seen here of "namespacing" calendar utils onto the `cal` object.
// Until that work is done, we ignore the lint requirement that lazy objects be
// named `lazy`.
// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(cal, {
  acl: "resource:///modules/calendar/utils/calACLUtils.sys.mjs",
  alarms: "resource:///modules/calendar/utils/calAlarmUtils.sys.mjs",
  auth: "resource:///modules/calendar/utils/calAuthUtils.sys.mjs",
  category: "resource:///modules/calendar/utils/calCategoryUtils.sys.mjs",
  data: "resource:///modules/calendar/utils/calDataUtils.sys.mjs",
  dtz: "resource:///modules/calendar/utils/calDateTimeUtils.sys.mjs",
  email: "resource:///modules/calendar/utils/calEmailUtils.sys.mjs",
  invitation: "resource:///modules/calendar/utils/calInvitationUtils.sys.mjs",
  item: "resource:///modules/calendar/utils/calItemUtils.sys.mjs",
  iterate: "resource:///modules/calendar/utils/calIteratorUtils.sys.mjs",
  itip: "resource:///modules/calendar/utils/calItipUtils.sys.mjs",
  l10n: "resource:///modules/calendar/utils/calL10NUtils.sys.mjs",
  print: "resource:///modules/calendar/utils/calPrintUtils.sys.mjs",
  provider: "resource:///modules/calendar/utils/calProviderUtils.sys.mjs",
  unifinder: "resource:///modules/calendar/utils/calUnifinderUtils.sys.mjs",
  view: "resource:///modules/calendar/utils/calViewUtils.sys.mjs",
  window: "resource:///modules/calendar/utils/calWindowUtils.sys.mjs",
  xml: "resource:///modules/calendar/utils/calXMLUtils.sys.mjs",
});

// will be used to clean up global objects on shutdown
// some objects have cyclic references due to wrappers
function shutdownCleanup(obj, prop) {
  if (!shutdownCleanup.mEntries) {
    shutdownCleanup.mEntries = [];
    cal.addShutdownObserver(() => {
      for (const entry of shutdownCleanup.mEntries) {
        if (entry.mProp) {
          delete entry.mObj[entry.mProp];
        } else {
          delete entry.mObj;
        }
      }
      delete shutdownCleanup.mEntries;
    });
  }
  shutdownCleanup.mEntries.push({ mObj: obj, mProp: prop });
}

/**
 * This is the makeQI function from XPCOMUtils.sys.mjs, it is separate to avoid
 * leaks.
 *
 * @param {(string[]|nsIIDRef[])} aInterfaces - The interfaces to make QI for.
 * @returns {Function} The QueryInterface function.
 */
function makeQI(aInterfaces) {
  return function (iid) {
    if (iid.equals(Ci.nsISupports)) {
      return this;
    }
    if (iid.equals(Ci.nsIClassInfo) && "classInfo" in this) {
      return this.classInfo;
    }
    for (let i = 0; i < aInterfaces.length; i++) {
      if (Ci[aInterfaces[i]].equals(iid)) {
        return this;
      }
    }

    throw Components.Exception("", Cr.NS_ERROR_NO_INTERFACE);
  };
}
