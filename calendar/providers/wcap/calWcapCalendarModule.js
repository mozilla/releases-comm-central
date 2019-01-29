/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported NS_OK, NS_ERROR_UNEXPECTED, nsIException, calIWcapSession,
 *          calIWcapCalendar, calIWcapErrors, calICalendar, calIItemBase,
 *          calIOperationListener, calIFreeBusyProvider, calIFreeBusyInterval,
 *          calICalendarSearchProvider, calIErrors, g_privateItemTitle,
 *          g_confidentialItemTitle, g_busyItemTitle,
 *          g_busyPhantomItemUuidPrefix, CACHE_LAST_RESULTS,
 *          CACHE_LAST_RESULTS_INVALIDATE, LOG_LEVEL
 */

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
const { Preferences } = ChromeUtils.import("resource://gre/modules/Preferences.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

//
// init code for globals, prefs:
//

// constants:
var NS_OK = Cr.NS_OK;
var NS_ERROR_UNEXPECTED = Cr.NS_ERROR_UNEXPECTED;
var nsIException = Ci.nsIException;
var calIWcapSession = Ci.calIWcapSession;
var calIWcapCalendar = Ci.calIWcapCalendar;
var calIWcapErrors = Ci.calIWcapErrors;
var calICalendar = Ci.calICalendar;
var calIItemBase = Ci.calIItemBase;
var calIOperationListener = Ci.calIOperationListener;
var calIFreeBusyProvider = Ci.calIFreeBusyProvider;
var calIFreeBusyInterval = Ci.calIFreeBusyInterval;
var calICalendarSearchProvider = Ci.calICalendarSearchProvider;
var calIErrors = Ci.calIErrors;

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
        g_privateItemTitle = getWcapString("privateItem.title.text");
        g_confidentialItemTitle = getWcapString("confidentialItem.title.text");
        g_busyItemTitle = getWcapString("busyItem.title.text");
        g_busyPhantomItemUuidPrefix = "PHANTOM_uuid_" + cal.getUUID();

        CACHE_LAST_RESULTS = Preferences.get("calendar.wcap.cache_last_results", 4);
        CACHE_LAST_RESULTS_INVALIDATE = Preferences.get("calendar.wcap.cache_last_results_invalidate", 120);
    } catch (exc) {
        logError(exc, "error in init sequence");
    }
}

/** Module Registration */
this.NSGetFactory = (cid) => {
    let scriptLoadOrder = [
        "resource://calendar/calendar-js/calWcapUtils.js",
        "resource://calendar/calendar-js/calWcapErrors.js",
        "resource://calendar/calendar-js/calWcapRequest.js",
        "resource://calendar/calendar-js/calWcapSession.js",
        "resource://calendar/calendar-js/calWcapCalendar.js",
        "resource://calendar/calendar-js/calWcapCalendarItems.js"
    ];

    for (let script of scriptLoadOrder) {
        Services.scriptloader.loadSubScript(script, this);
    }

    initWcapProvider();

    let components = [calWcapCalendar, calWcapNetworkRequest, calWcapSession];
    this.NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
    return this.NSGetFactory(cid);
};
