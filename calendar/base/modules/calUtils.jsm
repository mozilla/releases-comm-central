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
     * Returns a copy of an event that
     * - has a relation set to the original event
     * - has the same organizer but
     * - has any attendee removed
     * Intended to get a copy of a normal event invitation that behaves as if the PUBLISH method
     * was chosen instead.
     *
     * @param aItem         original item
     * @param aUid          (optional) UID to use for the new item
     */
    getPublishLikeItemCopy: function(aItem, aUid) {
        // avoid changing aItem
        let item = aItem.clone();
        // reset to a new UUID if applicable
        item.id = aUid || cal.getUUID();
        // add a relation to the original item
        let relation = cal.createRelation();
        relation.relId = aItem.id;
        relation.relType = "SIBLING";
        item.addRelation(relation);
        // remove attendees
        item.removeAllAttendees();
        if (!aItem.isMutable) {
            item = item.makeImmutable();
        }
        return item;
    },

    /**
     * Shortcut function to check whether an item is an invitation copy.
     */
    isInvitation: function(aItem) {
        let isInvitation = false;
        let calendar = cal.wrapInstance(aItem.calendar, Components.interfaces.calISchedulingSupport);
        if (calendar) {
            isInvitation = calendar.isInvitation(aItem);
        }
        return isInvitation;
    },

    /**
     * Returns a basically checked recipient list - malformed elements will be removed
     *
     * @param   string aRecipients  a comma-seperated list of e-mail addresses
     * @return  string              a comma-seperated list of e-mail addresses
     */
    validateRecipientList: function(aRecipients) {
        let compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
                                   .createInstance(Components.interfaces.nsIMsgCompFields);
        // Resolve the list considering also configured common names
        let members = compFields.splitRecipients(aRecipients, false, {});
        let list = [];
        let prefix = "";
        for (let member of members) {
            if (prefix != "") {
                // the previous member had no email address - this happens if a recipients CN
                // contains a ',' or ';' (splitRecipients(..) behaves wrongly here and produces an
                // additional member with only the first CN part of that recipient and no email
                // address while the next has the second part of the CN and the according email
                // address) - we still need to identify the original delimiter to append it to the
                // prefix
                let memberCnPart = member.match(/(.*) <.*>/);
                if (memberCnPart) {
                    let pattern = new RegExp(prefix + "([;,] *)" + memberCnPart[1]);
                    let delimiter = aRecipients.match(pattern);
                    if (delimiter) {
                        prefix = prefix + delimiter[1];
                    }
                }
            }
            let parts = (prefix + member).match(/(.*)( <.*>)/);
            if (parts) {
                if (parts[2] == " <>") {
                    // CN but no email address - we keep the CN part to prefix the next member's CN
                    prefix = parts[1];
                } else {
                    // CN with email address
                    let commonName = parts[1].trim();
                    // in case of any special characters in the CN string, we make sure to enclose
                    // it with dquotes - simple spaces don't require dquotes
                    if (commonName.match(/[-[\]{}()*+?.,;\\^$|#\f\n\r\t\v]/)) {
                        commonName = '"' + commonName.replace(/\\"|"/, "").trim() + '"';
                    }
                    list.push(commonName + parts[2]);
                    prefix = "";
                }
            } else if (member.length) {
                // email address only
                list.push(member);
                prefix = "";
            }
        }
        return list.join(", ");
    },

    /**
     * Shortcut function to check whether an item is an invitation copy and
     * has a participation status of either NEEDS-ACTION or TENTATIVE.
     *
     * @param aItem either calIAttendee or calIItemBase
     */
    isOpenInvitation: function(aItem) {
        let wrappedItem = cal.wrapInstance(aItem, Components.interfaces.calIAttendee);
        if (!wrappedItem) {
            aItem = cal.getInvitedAttendee(aItem);
        }
        if (aItem) {
            switch (aItem.participationStatus) {
                case "NEEDS-ACTION":
                case "TENTATIVE":
                    return true;
            }
        }
        return false;
    },

    /**
     * Prepends a mailto: prefix to an email address like string
     *
     * @param  {string}        the string to prepend the prefix if not already there
     * @return {string}        the string with prefix
     */
    prependMailTo: function(aId) {
        return aId.replace(/^(?:mailto:)?(.*)@/i, "mailto:$1@");
    },

    /**
     * Removes an existing mailto: prefix from an attendee id
     *
     * @param  {string}       the string to remove the prefix from if any
     * @return {string}       the string without prefix
     */
    removeMailTo: function(aId) {
        return aId.replace(/^mailto:/i, "");
    },

    /**
     * Resolves delegated-to/delegated-from calusers for a given attendee to also include the
     * respective CNs if available in a given set of attendees
     *
     * @param aAttendee  {calIAttendee}  The attendee to resolve the delegation information for
     * @param aAttendees {Array}         An array of calIAttendee objects to look up
     * @return           {Object}        An object with string attributes for delegators and delegatees
     */
    resolveDelegation: function(aAttendee, aAttendees) {
        let attendees = aAttendees || [aAttendee];

        // this will be replaced by a direct property getter in calIAttendee
        let delegators = [];
        let delegatees = [];
        let delegatorProp = aAttendee.getProperty("DELEGATED-FROM");
        if (delegatorProp) {
            delegators = typeof delegatorProp == "string" ? [delegatorProp] : delegatorProp;
        }
        let delegateeProp = aAttendee.getProperty("DELEGATED-TO");
        if (delegateeProp) {
            delegatees = typeof delegateeProp == "string" ? [delegateeProp] : delegateeProp;
        }

        for (let att of attendees) {
            let resolveDelegation = function(e, i, a) {
                if (e == att.id) {
                    a[i] = att.toString();
                }
            };
            delegators.forEach(resolveDelegation);
            delegatees.forEach(resolveDelegation);
        }
        return {
            delegatees: delegatees.join(", "),
            delegators: delegators.join(", ")
        };
    },

    /**
     * Shortcut function to get the invited attendee of an item.
     */
    getInvitedAttendee: function(aItem, aCalendar) {
        if (!aCalendar) {
            aCalendar = aItem.calendar;
        }
        let invitedAttendee = null;
        let calendar = cal.wrapInstance(aCalendar, Components.interfaces.calISchedulingSupport);
        if (calendar) {
            invitedAttendee = calendar.getInvitedAttendee(aItem);
        }
        return invitedAttendee;
    },

    /**
     * Returns all attendees from given set of attendees matching based on the attendee id
     * or a sent-by parameter compared to the specified email address
     *
     * @param  {Array}  aAttendees      An array of calIAttendee objects
     * @param  {String} aEmailAddress   A string containing the email address for lookup
     * @return {Array}                  Returns an array of matching attendees
     */
    getAttendeesBySender: function(aAttendees, aEmailAddress) {
        let attendees = [];
        // we extract the email address to make it work also for a raw header value
        let compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
                                   .createInstance(Components.interfaces.nsIMsgCompFields);
        let addresses = compFields.splitRecipients(aEmailAddress, true, {});
        if (addresses.length == 1) {
            let searchFor = cal.prependMailTo(addresses[0]);
            aAttendees.forEach(aAttendee => {
                if ([aAttendee.id, aAttendee.getProperty("SENT-BY")].includes(searchFor)) {
                    attendees.push(aAttendee);
                }
            });
        } else {
            cal.WARN("No unique email address for lookup!");
        }
        return attendees;
    },

    /**
     * Returns a wellformed email string like 'attendee@example.net',
     * 'Common Name <attendee@example.net>' or '"Name, Common" <attendee@example.net>'
     *
     * @param  {calIAttendee}  aAttendee - the attendee to check
     * @param  {boolean}       aIncludeCn - whether or not to return also the CN if available
     * @return {string}        valid email string or an empty string in case of error
     */
    getAttendeeEmail: function(aAttendee, aIncludeCn) {
        // If the recipient id is of type urn, we need to figure out the email address, otherwise
        // we fall back to the attendee id
        let email = aAttendee.id.match(/^urn:/i) ? aAttendee.getProperty("EMAIL") || "" : aAttendee.id;
        // Strip leading "mailto:" if it exists.
        email = email.replace(/^mailto:/i, "");
        // We add the CN if requested and available
        let commonName = aAttendee.commonName;
        if (aIncludeCn && email.length > 0 && commonName && commonName.length > 0) {
            if (commonName.match(/[,;]/)) {
                commonName = '"' + commonName + '"';
            }
            commonName = commonName + " <" + email + ">";
            if (cal.validateRecipientList(commonName) == commonName) {
                email = commonName;
            }
        }
        return email;
    },

    /**
     * Provides a string to use in email "to" header for given attendees
     *
     * @param  {array}   aAttendees - array of calIAttendee's to check
     * @return {string}  Valid string to use in a 'to' header of an email
     */
    getRecipientList: function(aAttendees) {
        let cbEmail = function(aVal, aInd, aArr) {
            let email = cal.getAttendeeEmail(aVal, true);
            if (!email.length) {
                cal.LOG("Dropping invalid recipient for email transport: " + aVal.toString());
            }
            return email;
        };
        return aAttendees.map(cbEmail)
                         .filter(aVal => aVal.length > 0)
                         .join(", ");
    },

    // The below functions will move to some different place once the
    // unifinder tress are consolidated.

    compareNativeTime: function(a, b) {
        if (a < b) {
            return -1;
        } else if (a > b) {
            return 1;
        } else {
            return 0;
        }
    },

    compareNativeTimeFilledAsc: function(a, b) {
        if (a == b) {
            return 0;
        }

        // In this filter, a zero time (not set) is always at the end.
        if (a == -62168601600000000) { // value for (0000/00/00 00:00:00)
            return 1;
        }
        if (b == -62168601600000000) { // value for (0000/00/00 00:00:00)
            return -1;
        }

        return (a < b ? -1 : 1);
    },

    compareNativeTimeFilledDesc: function(a, b) {
        if (a == b) {
            return 0;
        }

        // In this filter, a zero time (not set) is always at the end.
        if (a == -62168601600000000) { // value for (0000/00/00 00:00:00)
            return 1;
        }
        if (b == -62168601600000000) { // value for (0000/00/00 00:00:00)
            return -1;
        }

        return (a < b ? 1 : -1);
    },

    compareNumber: function(a, b) {
        a = Number(a);
        b = Number(b);
        if (a < b) {
            return -1;
        } else if (a > b) {
            return 1;
        } else {
            return 0;
        }
    },

    sortEntryComparer: function(sortType, modifier) {
        switch (sortType) {
            case "number":
                return function(sortEntryA, sortEntryB) {
                    let nsA = cal.sortEntryKey(sortEntryA);
                    let nsB = cal.sortEntryKey(sortEntryB);
                    return cal.compareNumber(nsA, nsB) * modifier;
                };
            case "date":
                return function(sortEntryA, sortEntryB) {
                    let nsA = cal.sortEntryKey(sortEntryA);
                    let nsB = cal.sortEntryKey(sortEntryB);
                    return cal.compareNativeTime(nsA, nsB) * modifier;
                };
            case "date_filled":
                return function(sortEntryA, sortEntryB) {
                    let nsA = cal.sortEntryKey(sortEntryA);
                    let nsB = cal.sortEntryKey(sortEntryB);
                    if (modifier == 1) {
                        return cal.compareNativeTimeFilledAsc(nsA, nsB);
                    } else {
                        return cal.compareNativeTimeFilledDesc(nsA, nsB);
                    }
                };
            case "string":
                return function(sortEntryA, sortEntryB) {
                    let seA = cal.sortEntryKey(sortEntryA);
                    let seB = cal.sortEntryKey(sortEntryB);
                    if (seA.length == 0 || seB.length == 0) {
                        // sort empty values to end (so when users first sort by a
                        // column, they can see and find the desired values in that
                        // column without scrolling past all the empty values).
                        return -(seA.length - seB.length) * modifier;
                    }
                    let collator = cal.createLocaleCollator();
                    let comparison = collator.compareString(0, seA, seB);
                    return comparison * modifier;
                };
            default:
                return function(sortEntryA, sortEntryB) {
                    return 0;
                };
        }
    },

    getItemSortKey: function(aItem, aKey, aStartTime) {
        function nativeTime(calDateTime) {
            if (calDateTime == null) {
                return -62168601600000000; // ns value for (0000/00/00 00:00:00)
            }
            return calDateTime.nativeTime;
        }

        switch (aKey) {
            case "priority":
                return aItem.priority || 5;

            case "title":
                return aItem.title || "";

            case "entryDate":
                return nativeTime(aItem.entryDate);

            case "startDate":
                return nativeTime(aItem.startDate);

            case "dueDate":
                return nativeTime(aItem.dueDate);

            case "endDate":
                return nativeTime(aItem.endDate);

            case "completedDate":
                return nativeTime(aItem.completedDate);

            case "percentComplete":
                return aItem.percentComplete;

            case "categories":
                return aItem.getCategories({}).join(", ");

            case "location":
                return aItem.getProperty("LOCATION") || "";

            case "status":
                if (cal.item.isToDo(aItem)) {
                    return ["NEEDS-ACTION", "IN-PROCESS", "COMPLETED", "CANCELLED"].indexOf(aItem.status);
                } else {
                    return ["TENTATIVE", "CONFIRMED", "CANCELLED"].indexOf(aItem.status);
                }
            case "calendar":
                return aItem.calendar.name || "";

            default:
                return null;
        }
    },

    getSortTypeForSortKey: function(aSortKey) {
        switch (aSortKey) {
            case "title":
            case "categories":
            case "location":
            case "calendar":
                return "string";

            // All dates use "date_filled"
            case "completedDate":
            case "startDate":
            case "endDate":
            case "dueDate":
            case "entryDate":
                return "date_filled";

            case "priority":
            case "percentComplete":
            case "status":
                return "number";
            default:
                return "unknown";
        }
    },

    sortEntry: function(aItem) {
        let key = cal.getItemSortKey(aItem, this.mSortKey, this.mSortStartedDate);
        return { mSortKey: key, mItem: aItem };
    },

    sortEntryItem: function(sortEntry) {
        return sortEntry.mItem;
    },

    sortEntryKey: function(sortEntry) {
        return sortEntry.mSortKey;
    },

    createLocaleCollator: function() {
        return Components.classes["@mozilla.org/intl/collation-factory;1"]
                         .getService(Components.interfaces.nsICollationFactory)
                         .CreateCollation();
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
     * Returns the most recent calendar window in an application independent way
     */
    getCalendarWindow: function() {
        return Services.wm.getMostRecentWindow("calendarMainWindow") ||
               Services.wm.getMostRecentWindow("mail:3pane");
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
XPCOMUtils.defineLazyModuleGetter(cal, "data", "resource://calendar/modules/calDataUtils.jsm", "caldata");
XPCOMUtils.defineLazyModuleGetter(cal, "dtz", "resource://calendar/modules/calDateTimeUtils.jsm", "caldtz");
XPCOMUtils.defineLazyModuleGetter(cal, "acl", "resource://calendar/modules/calACLUtils.jsm", "calacl");
XPCOMUtils.defineLazyModuleGetter(cal, "item", "resource://calendar/modules/calItemUtils.jsm", "calitem");
XPCOMUtils.defineLazyModuleGetter(cal, "view", "resource://calendar/modules/calViewUtils.jsm", "calview");

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
