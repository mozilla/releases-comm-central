/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Backwards compat for calUtils migration.
 */

ChromeUtils.import("resource://gre/modules/Deprecated.jsm");

/* exported injectCalUtilsCompat */

this.EXPORTED_SYMBOLS = ["injectCalUtilsCompat"];

/**
 * Migration data for backwards compatibility, will be used with
 * injectCalUtilsCompat.
 */
var migrations = {
    acl: {
        isCalendarWritable: "isCalendarWritable",
        userCanAddItemsToCalendar: "userCanAddItemsToCalendar",
        userCanDeleteItemsFromCalendar: "userCanDeleteItemsFromCalendar",
        userCanModifyItem: "userCanModifyItem"
    },
    category: {
        setupDefaultCategories: "setupDefaultCategories",
        getPrefCategoriesArray: "fromPrefs",
        categoriesStringToArray: "stringToArray",
        categoriesArrayToString: "arrayToString"
    },
    data: {
        binarySearch: "binarySearch",
        binaryInsertNode: "binaryInsertNode",
        binaryInsert: "binaryInsert",
        compareObjects: "compareObjects",
        // isPropertyValueSame has been removed, it can simply be done with Array every()
    },
    dtz: {
        now: "now",
        ensureDateTime: "ensureDateTime",
        getRecentTimezones: "getRecentTimezones",
        saveRecentTimezone: "saveRecentTimezone",
        getDefaultStartDate: "getDefaultStartDate",
        setDefaultStartEndHour: "setDefaultStartEndHour",
        calGetStartDateProp: "startDateProp",
        calGetEndDateProp: "endDateProp",
        sameDay: "sameDay",
        jsDateToDateTime: "jsDateToDateTime",
        dateTimeToJsDate: "dateTimeToJsDate",
        fromRFC3339: "fromRFC3339",
        toRFC3339: "toRFC3339",

        // The following are now getters
        calendarDefaultTimezone: "defaultTimezone",
        floating: "floating",
        UTC: "UTC"
    },
    email: {
        sendMailTo: "sendMailTo",
        calIterateEmailIdentities: "iterateIdentities",
        prependMailTo: "prependMailTo",
        removeMailTo: "removeMailTo",
        getRecipientList: "createRecipientList",
        getAttendeeEmail: "getAttendeeEmail",
        validateRecipientList: "validateRecipientList",
        attendeeMatchesAddresses: "attendeeMatchesAddresses"
    },
    item: {
        // ItemDiff also belongs here, but is separately migrated in
        // calItemUtils.jsm
        isItemSupported: "isItemSupported",
        isEventCalendar: "isEventCalendar",
        isTaskCalendar: "isTaskCalendar",
        isEvent: "isEvent",
        isToDo: "isToDo",
        checkIfInRange: "checkIfInRange",
        setItemProperty: "setItemProperty",
        getEventDefaultTransparency: "getEventDefaultTransparency"
    },
    iterate: {
        itemIterator: "items",
        forEach: "forEach",
        ical: {
            calendarComponentIterator: "items",
            subcomponentIterator: "icalSubcomponent",
            propertyIterator: "icalProperty",
            paramIterator: "icalParameter"
        }
    },
    itip: {
        getPublishLikeItemCopy: "getPublishLikeItemCopy",
        isInvitation: "isInvitation",
        isOpenInvitation: "isOpenInvitation",
        resolveDelegation: "resolveDelegation",
        getInvitedAttendee: "getInvitedAttendee",
        getAttendeesBySender: "getAttendeesBySender"
    },
    provider: {
        prepHttpChannel: "prepHttpChannel",
        sendHttpRequest: "sendHttpRequest",
        createStreamLoader: "createStreamLoader",
        convertByteArray: "convertByteArray",
        InterfaceRequestor_getInterface: "InterfaceRequestor_getInterface",
        getImipTransport: "getImipTransport",
        getEmailIdentityOfCalendar: "getEmailIdentityOfCalendar",
        promptOverwrite: "promptOverwrite",
        getCalendarDirectory: "getCalendarDirectory"
    },
    unifinder: {
        sortEntryComparer: "sortEntryComparer",
        getItemSortKey:  "getItemSortKey",
        // compareNative*, compareNumber, sortEntry, sortEntryItem, sortEntryKey and
        // getSortTypeForSortKey are no longer available. There is a new
        // cal.unifinder.sortItems though that should do everything necessary.
    },
    view: {
        isMouseOverBox: "isMouseOverBox",
        // calRadioGroupSelectItem and applyAttributeToMenuChildren are no longer available.
        removeChildElementsByAttribute: "removeChildElementsByAttribute",
        getParentNodeOrThis: "getParentNodeOrThis",
        getParentNodeOrThisByAttribute: "getParentNodeOrThisByAttribute",
        formatStringForCSSRule: "formatStringForCSSRule",
        getCompositeCalendar: "getCompositeCalendar",
        hashColor: "hashColor",
        getContrastingTextColor: "getContrastingTextColor"
    },
    window: {
        openCalendarWizard: "openCalendarWizard",
        openCalendarProperties: "openCalendarProperties",
        calPrint: "openPrintDialog",
        getCalendarWindow: "getCalendarWindow"
    }
};


/**
 * Generate a forward function on the given global, for the namespace from the
 * migrations data.
 *
 * @param global        The global object to inject on.
 * @param namespace     The new namespace in the cal object.
 * @param from          The function/property name being migrated from
 * @param to            The function/property name being migrated to
 */
function generateForward(global, namespace, from, to, targetGlobal=null) {
    // Protect from footguns
    if (typeof global[from] != "undefined") {
        throw new Error(from + " is already defined on the cal. namespace!");
    }

    global[from] = function(...args) {
        let suffix = "";
        let target = (targetGlobal || global)[namespace][to];
        if (typeof target == "function") {
            target = target(...args);
            suffix = "()";
        }

        Deprecated.warning(`calUtils' cal.${from}() has changed to cal.${namespace}.${to}${suffix}`,
                           "https://bugzilla.mozilla.org/show_bug.cgi?id=905097",
                           Components.stack.caller);

        return target;
    };
}

/**
 * Inject the backwards compatibility functions using above migration data
 *
 * @param global        The global object to inject on.
 */
function injectCalUtilsCompat(global) {
    for (let [namespace, nsdata] of Object.entries(migrations)) {
        for (let [from, to] of Object.entries(nsdata)) {
            if (typeof to == "object") {
                global[from] = {};
                for (let [frominner, toinner] of Object.entries(to)) {
                    generateForward(global[from], namespace, frominner, toinner, global);
                }
            } else {
                generateForward(global, namespace, from, to);
            }
        }
    }

    // calGetString is special, as the argument order and kind has changed as well
    global.calGetString = function(aBundleName, aStringName, aParams, aComponent="calendar") {
        Deprecated.warning("calUtils' cal.calGetString() has changed to cal.l10n.get*String()" +
                           " and the parameter order has changed",
                           "https://bugzilla.mozilla.org/show_bug.cgi?id=905097",
                           Components.stack.caller);
        return global.l10n.getAnyString(aComponent, aBundleName, aStringName, aParams);
    };

    global.ProviderBase = class extends global.provider.BaseClass {
        initProviderBase() {
            Deprecated.warning("calProviderUtils' cal.ProviderBase() has changed to cal.provider.BaseClass()",
                               "https://bugzilla.mozilla.org/show_bug.cgi?id=905097",
                               Components.stack.caller);
            super.initProviderBase();
        }
    };

    global.BadCertHandler = class extends global.provider.BadCertHandler {
        constructor() {
            Deprecated.warning("calProviderUtils' cal.BadCertHandler() has changed to cal.provider.BadCertHandler()",
                               "https://bugzilla.mozilla.org/show_bug.cgi?id=905097",
                               Components.stack.caller);
            super();
        }
    };

    global.FreeBusyInterval = class extends global.provider.FreeBusyInterval {
        constructor() {
            Deprecated.warning("calProviderUtils' cal.FreeBusyInterval() has changed to cal.provider.FreeBusyInterval()",
                               "https://bugzilla.mozilla.org/show_bug.cgi?id=905097",
                               Components.stack.caller);
            super();
        }
    };
}
