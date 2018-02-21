/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gCalThreadingEnabled;

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");

// Usually the backend loader gets loaded via profile-after-change, but in case
// a calendar component hooks in earlier, its very likely it will use calUtils.
// Getting the service here will load if its not already loaded
Components.classes["@mozilla.org/calendar/backend-loader;1"].getService();

this.EXPORTED_SYMBOLS = ["cal"];
var cal = {
    // These functions exist to reduce boilerplate code for creating instances
    // as well as getting services and other (cached) objects.
    createEvent: _instance("@mozilla.org/calendar/event;1",
                           Components.interfaces.calIEvent,
                           "icalString"),
    createTodo: _instance("@mozilla.org/calendar/todo;1",
                          Components.interfaces.calITodo,
                          "icalString"),
    createDateTime: _instance("@mozilla.org/calendar/datetime;1",
                              Components.interfaces.calIDateTime,
                              "icalString"),
    createDuration: _instance("@mozilla.org/calendar/duration;1",
                              Components.interfaces.calIDuration,
                              "icalString"),
    createAttendee: _instance("@mozilla.org/calendar/attendee;1",
                              Components.interfaces.calIAttendee,
                              "icalString"),
    createAttachment: _instance("@mozilla.org/calendar/attachment;1",
                                Components.interfaces.calIAttachment,
                                "icalString"),
    createAlarm: _instance("@mozilla.org/calendar/alarm;1",
                           Components.interfaces.calIAlarm,
                           "icalString"),
    createRelation: _instance("@mozilla.org/calendar/relation;1",
                              Components.interfaces.calIRelation,
                              "icalString"),
    createRecurrenceDate: _instance("@mozilla.org/calendar/recurrence-date;1",
                                    Components.interfaces.calIRecurrenceDate,
                                    "icalString"),
    createRecurrenceRule: _instance("@mozilla.org/calendar/recurrence-rule;1",
                                    Components.interfaces.calIRecurrenceRule,
                                    "icalString"),
    createRecurrenceInfo: _instance("@mozilla.org/calendar/recurrence-info;1",
                                    Components.interfaces.calIRecurrenceInfo,
                                    "item"),

    createLocaleCollator: function() {
        return Components.classes["@mozilla.org/intl/collation-factory;1"]
                         .getService(Components.interfaces.nsICollationFactory)
                         .CreateCollation();
    },

    getCalendarManager: _service("@mozilla.org/calendar/manager;1",
                                 Components.interfaces.calICalendarManager),
    getIcsService: _service("@mozilla.org/calendar/ics-service;1",
                            Components.interfaces.calIICSService),
    getTimezoneService: _service("@mozilla.org/calendar/timezone-service;1",
                                 Components.interfaces.calITimezoneService),
    getCalendarSearchService: _service("@mozilla.org/calendar/calendarsearch-service;1",
                                       Components.interfaces.calICalendarSearchProvider),
    getFreeBusyService: _service("@mozilla.org/calendar/freebusy-service;1",
                                 Components.interfaces.calIFreeBusyService),
    getWeekInfoService: _service("@mozilla.org/calendar/weekinfo-service;1",
                                 Components.interfaces.calIWeekInfoService),
    getDateFormatter: _service("@mozilla.org/calendar/datetime-formatter;1",
                               Components.interfaces.calIDateTimeFormatter),
    getDragService: _service("@mozilla.org/widget/dragservice;1",
                             Components.interfaces.nsIDragService),

    /**
     * Loads an array of calendar scripts into the passed scope.
     *
     * @param scriptNames an array of calendar script names
     * @param scope       scope to load into
     * @param baseDir     base dir; defaults to calendar-js/
     */
    loadScripts: function(scriptNames, scope, baseDir) {
        if (!baseDir) {
            baseDir = __LOCATION__.parent.parent.clone();
            baseDir.append("calendar-js");
        }

        for (let script of scriptNames) {
            if (!script) {
                // If the array element is null, then just skip this script.
                continue;
            }
            let scriptFile = baseDir.clone();
            scriptFile.append(script);
            let scriptUrlSpec = Services.io.newFileURI(scriptFile).spec;
            try {
                Services.scriptloader.loadSubScript(scriptUrlSpec, scope);
            } catch (exc) {
                Components.utils.reportError(exc + " (" + scriptUrlSpec + ")");
            }
        }
    },

    loadingNSGetFactory: function(scriptNames, components, scope) {
        return function(cid) {
            if (!this.inner) {
                let global = Components.utils.getGlobalForObject(scope);
                cal.loadScripts(scriptNames, global);
                if (typeof components == "function") {
                    components = components.call(global);
                }
                this.inner = XPCOMUtils.generateNSGetFactory(components);
            }
            return this.inner(cid);
        };
    },

    /**
     * Schedules execution of the passed function to the current thread's queue.
     */
    postPone: function(func) {
        if (this.threadingEnabled) {
            Services.tm.currentThread.dispatch({ run: func },
                                               Components.interfaces.nsIEventTarget.DISPATCH_NORMAL);
        } else {
            func();
        }
    },

    /**
     * Create an adapter for the given interface. If passed, methods will be
     * added to the template object, otherwise a new object will be returned.
     *
     * @param iface     The interface to adapt, either using
     *                    Components.interfaces or the name as a string.
     * @param template  (optional) A template object to extend
     * @return          If passed the adapted template object, otherwise a
     *                    clean adapter.
     *
     * Currently supported interfaces are:
     *  - calIObserver
     *  - calICalendarManagerObserver
     *  - calIOperationListener
     *  - calICompositeObserver
     */
    createAdapter: function(iface, template) {
        let methods;
        let adapter = template || {};
        switch (iface.name || iface) {
            case "calIObserver":
                methods = [
                    "onStartBatch", "onEndBatch", "onLoad", "onAddItem",
                    "onModifyItem", "onDeleteItem", "onError",
                    "onPropertyChanged", "onPropertyDeleting"
                ];
                break;
            case "calICalendarManagerObserver":
                methods = [
                    "onCalendarRegistered", "onCalendarUnregistering",
                    "onCalendarDeleting"
                ];
                break;
            case "calIOperationListener":
                methods = ["onGetResult", "onOperationComplete"];
                break;
            case "calICompositeObserver":
                methods = [
                    "onCalendarAdded", "onCalendarRemoved",
                    "onDefaultCalendarChanged"
                ];
                break;
            default:
                methods = [];
                break;
        }

        for (let method of methods) {
            if (!(method in template)) {
                adapter[method] = function() {};
            }
        }
        adapter.QueryInterface = XPCOMUtils.generateQI([iface]);

        return adapter;
    },

    get threadingEnabled() {
        if (gCalThreadingEnabled === undefined) {
            gCalThreadingEnabled = !Preferences.get("calendar.threading.disabled", false);
        }
        return gCalThreadingEnabled;
    },

    /**
     * Sort an array of strings according to the current locale.
     * Modifies aStringArray, returning it sorted.
     */
    sortArrayByLocaleCollator: function(aStringArray) {
        let localeCollator = cal.createLocaleCollator();
        function compare(a, b) { return localeCollator.compareString(0, a, b); }
        aStringArray.sort(compare);
        return aStringArray;
    },

    /**
     * Gets the month name string in the right form depending on a base string.
     *
     * @param aMonthNum     The month numer to get, 1-based.
     * @param aBundleName   The Bundle to get the string from
     * @param aStringBase   The base string name, .monthFormat will be appended
     */
    formatMonth: function(aMonthNum, aBundleName, aStringBase) {
        let monthForm = cal.calGetString(aBundleName, aStringBase + ".monthFormat") || "nominative";

        if (monthForm == "nominative") {
            // Fall back to the default name format
            monthForm = "name";
        }

        return cal.calGetString("dateFormat", "month." + aMonthNum + "." + monthForm);
    },

    /**
     * Adds an observer listening for the topic.
     *
     * @param func function to execute on topic
     * @param topic topic to listen for
     * @param oneTime whether to listen only once
     */
    addObserver: function(func, topic, oneTime) {
        let observer = { // nsIObserver:
            observe: function(subject, topic_, data) {
                if (topic == topic_) {
                    if (oneTime) {
                        Services.obs.removeObserver(this, topic);
                    }
                    func(subject, topic, data);
                }
            }
        };
        Services.obs.addObserver(observer, topic);
    },

    /**
     * Wraps an instance, making sure the xpcom wrapped object is used.
     *
     * @param aObj the object under consideration
     * @param aInterface the interface to be wrapped
     *
     * Use this function to QueryInterface the object to a particular interface.
     * You may only expect the return value to be wrapped, not the original passed object.
     * For example:
     * // BAD USAGE:
     * if (cal.wrapInstance(foo, Ci.nsIBar)) {
     *   foo.barMethod();
     * }
     * // GOOD USAGE:
     * foo = cal.wrapInstance(foo, Ci.nsIBar);
     * if (foo) {
     *   foo.barMethod();
     * }
     *
     */
    wrapInstance: function(aObj, aInterface) {
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
     * Adds an xpcom shutdown observer.
     *
     * @param func function to execute
     */
    addShutdownObserver: function(func) {
        cal.addObserver(func, "xpcom-shutdown", true /* one time */);
    },

    /**
     * Due to wrapped js objects, some objects may have cyclic references.
     * You can register properties of objects to be cleaned up on xpcom-shutdown.
     *
     * @param obj    object
     * @param prop   property to be deleted on shutdown
     *               (if null, |object| will be deleted)
     */
    registerForShutdownCleanup: shutdownCleanup
};

// Sub-modules for calUtils
XPCOMUtils.defineLazyModuleGetter(cal, "acl", "resource://calendar/modules/calACLUtils.jsm", "calacl");
XPCOMUtils.defineLazyModuleGetter(cal, "category", "resource://calendar/modules/calCategoryUtils.jsm", "calcategory");
XPCOMUtils.defineLazyModuleGetter(cal, "data", "resource://calendar/modules/calDataUtils.jsm", "caldata");
XPCOMUtils.defineLazyModuleGetter(cal, "dtz", "resource://calendar/modules/calDateTimeUtils.jsm", "caldtz");
XPCOMUtils.defineLazyModuleGetter(cal, "email", "resource://calendar/modules/calEmailUtils.jsm", "calemail");
XPCOMUtils.defineLazyModuleGetter(cal, "item", "resource://calendar/modules/calItemUtils.jsm", "calitem");
XPCOMUtils.defineLazyModuleGetter(cal, "itip", "resource://calendar/modules/calItipUtils.jsm", "calitip");
XPCOMUtils.defineLazyModuleGetter(cal, "unifinder", "resource://calendar/modules/calUnifinderUtils.jsm", "calunifinder");
XPCOMUtils.defineLazyModuleGetter(cal, "view", "resource://calendar/modules/calViewUtils.jsm", "calview");
XPCOMUtils.defineLazyModuleGetter(cal, "window", "resource://calendar/modules/calWindowUtils.jsm", "calwindow");

/**
 * Returns a function that provides access to the given service.
 *
 * @param cid           The contract id to create
 * @param iid           The interface id to create with
 * @return {function}   A function that returns the given service
 */
function _service(cid, iid) {
    return function() {
        return Components.classes[cid].getService(iid);
    };
}

/**
 * Returns a function that creates an instance of the given component and
 * optionally initializes it using the property name passed.
 *
 * @param cid           The contract id to create
 * @param iid           The interface id to create with
 * @param prop          The property name used for initialization
 * @return {function}   A function that creates the given instance, which takes an
 *                          initialization value.
 */
function _instance(cid, iid, prop) {
    return function(propval) {
        let thing = Components.classes[cid].createInstance(iid);
        if (propval) {
            thing[prop] = propval;
        }
        return thing;
    };
}

// will be used to clean up global objects on shutdown
// some objects have cyclic references due to wrappers
function shutdownCleanup(obj, prop) {
    if (!shutdownCleanup.mEntries) {
        shutdownCleanup.mEntries = [];
        cal.addShutdownObserver(() => {
            for (let entry of shutdownCleanup.mEntries) {
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

// Interim import of all symbols into cal:
// This should serve as a clean start for new code, e.g. new code could use
// cal.createDatetime instead of plain createDatetime NOW.
cal.loadScripts(["calUtils.js"], cal);
// Some functions in calUtils.js refer to other in the same file, thus include
// the code in global scope (although only visible to this module file), too:
cal.loadScripts(["calUtils.js"], Components.utils.getGlobalForObject(cal));

// Backwards compatibility for bug 905097. Please remove with Thunderbird 61.
ChromeUtils.import("resource://calendar/modules/calUtilsCompat.jsm");
injectCalUtilsCompat(cal);
