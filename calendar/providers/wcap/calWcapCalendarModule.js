/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");

//
// init code for globals, prefs:
//

// constants:
var NS_OK = Components.results.NS_OK;
var NS_ERROR_UNEXPECTED = Components.results.NS_ERROR_UNEXPECTED;
var nsIException = Components.interfaces.nsIException;
var nsISupports = Components.interfaces.nsISupports;
var calIWcapSession = Components.interfaces.calIWcapSession;
var calIWcapCalendar = Components.interfaces.calIWcapCalendar;
var calIWcapErrors = Components.interfaces.calIWcapErrors;
var calICalendar = Components.interfaces.calICalendar;
var calIItemBase = Components.interfaces.calIItemBase;
var calIOperationListener = Components.interfaces.calIOperationListener;
var calIFreeBusyProvider = Components.interfaces.calIFreeBusyProvider;
var calIFreeBusyInterval = Components.interfaces.calIFreeBusyInterval;
var calICalendarSearchProvider = Components.interfaces.calICalendarSearchProvider;
var calIErrors = Components.interfaces.calIErrors;

// some string resources:
var g_privateItemTitle;
var g_confidentialItemTitle;
var g_busyItemTitle;
var g_busyPhantomItemUuidPrefix;

// global preferences:

// caching the last data retrievals:
var CACHE_LAST_RESULTS = 4;
// timer secs for invalidation:
var CACHE_LAST_RESULTS_INVALIDATE = 120;

// logging:
var LOG_LEVEL = 0;

function initWcapProvider() {
    try {        
        initLogging();

        // some string resources:
        g_privateItemTitle = cal.calGetString("wcap", "privateItem.title.text");
        g_confidentialItemTitle = cal.calGetString("wcap", "confidentialItem.title.text");
        g_busyItemTitle = cal.calGetString("wcap", "busyItem.title.text");
        g_busyPhantomItemUuidPrefix = ("PHANTOM_uuid_" + cal.getUUID());

        CACHE_LAST_RESULTS = Preferences.get("calendar.wcap.cache_last_results", 4);
        CACHE_LAST_RESULTS_INVALIDATE = Preferences.get("calendar.wcap.cache_last_results_invalidate", 120);
    } catch (exc) {
        logError(exc, "error in init sequence");
    }
}

/** Module Registration */
var scriptLoadOrder = [
    "calUtils.js",
    "calWcapUtils.js",
    "calWcapErrors.js",
    "calWcapRequest.js",
    "calWcapSession.js",
    "calWcapCalendar.js",
    "calWcapCalendarItems.js"
];

function getComponents() {
    initWcapProvider();

    return [
        calWcapCalendar,
        calWcapNetworkRequest,
        calWcapSession
    ];
}

var NSGetFactory = cal.loadingNSGetFactory(scriptLoadOrder, getComponents, this);
