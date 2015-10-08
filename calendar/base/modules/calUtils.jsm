/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// New code must not load/import calUtils.js, but should use calUtils.jsm.

var gCalThreadingEnabled;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");

// Usually the backend loader gets loaded via profile-after-change, but in case
// a calendar component hooks in earlier, its very likely it will use calUtils.
// Getting the service here will load if its not already loaded
Components.classes["@mozilla.org/calendar/backend-loader;1"].getService();

this.EXPORTED_SYMBOLS = ["cal"];
var cal = {
    // new code should land here,
    // and more code should be moved from calUtils.js into this object to avoid
    // clashes with other extensions

    getDragService: generateServiceAccessor("@mozilla.org/widget/dragservice;1",
                                                Components.interfaces.nsIDragService),

    /**
     * Loads an array of calendar scripts into the passed scope.
     *
     * @param scriptNames an array of calendar script names
     * @param scope       scope to load into
     * @param baseDir     base dir; defaults to calendar-js/
     */
    loadScripts: function cal_loadScripts(scriptNames, scope, baseDir) {
        if (!baseDir) {
            baseDir = __LOCATION__.parent.parent.clone();
            baseDir.append("calendar-js");
        }

        for each (let script in scriptNames) {
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
        return function NSGetFactory(cid) {
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
    postPone: function cal_postPone(func) {
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
    createAdapter: function createAdapter(iface, template) {
        let methods;
        let adapter = template || {};
        switch (iface.name || iface) {
            case "calIObserver":
                methods = ["onStartBatch", "onEndBatch", "onLoad", "onAddItem",
                           "onModifyItem", "onDeleteItem", "onError",
                           "onPropertyChanged", "onPropertyDeleting"];
                break;
            case "calICalendarManagerObserver":
                methods = ["onCalendarRegistered", "onCalendarUnregistering",
                           "onCalendarDeleting"];
                break;
            case "calIOperationListener":
                methods = ["onGetResult", "onOperationComplete"];
                break;
            case "calICompositeObserver":
                methods = ["onCalendarAdded", "onCalendarRemoved",
                           "onDefaultCalendarChanged"];
                break;
            default:
                methods = [];
                break;
        }

        for each (let method in methods) {
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

    /*
     * Checks whether a calendar supports events
     *
     * @param aCalendar
     */
    isEventCalendar: function cal_isEventCalendar(aCalendar) {
        return (aCalendar.getProperty("capabilities.events.supported") !== false);
    },

    /*
     * Checks whether a calendar supports tasks
     *
     * @param aCalendar
     */
    isTaskCalendar: function cal_isTaskCalendar(aCalendar) {
        return (aCalendar.getProperty("capabilities.tasks.supported") !== false);
    },

    /**
     * Checks whether a timezone lacks a definition.
     */
    isPhantomTimezone: function cal_isPhantomTimezone(tz) {
        return (!tz.icalComponent && !tz.isUTC && !tz.isFloating);
    },

    /**
     * Shifts an item by the given timely offset.
     *
     * @param item an item
     * @param offset an offset (calIDuration)
     */
    shiftItem: function cal_shiftItem(item, offset) {
        // When modifying dates explicitly using the setters is important
        // since those may triggers e.g. calIRecurrenceInfo::onStartDateChange
        // or invalidate other properties. Moreover don't modify the date-time objects
        // without cloning, because changes cannot be calculated if doing so.
        if (cal.isEvent(item)) {
            let date = item.startDate.clone();
            date.addDuration(offset);
            item.startDate = date;
            date = item.endDate.clone();
            date.addDuration(offset);
            item.endDate = date;
        } else /* isToDo */ {
            if (item.entryDate) {
                let date = item.entryDate.clone();
                date.addDuration(offset);
                item.entryDate = date;
            }
            if (item.dueDate) {
                let date = item.dueDate.clone();
                date.addDuration(offset);
                item.dueDate = date;
            }
        }
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
    getPublishLikeItemCopy: function (aItem, aUid) {
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
     * Shortcut function to serialize an item (including all overridden items).
     */
    getSerializedItem: function cal_getSerializedItem(aItem) {
        let serializer = Components.classes["@mozilla.org/calendar/ics-serializer;1"]
                                   .createInstance(Components.interfaces.calIIcsSerializer);
        serializer.addItems([aItem], 1);
        return serializer.serializeToString();
    },

    /**
     * Shortcut function to check whether an item is an invitation copy.
     */
    isInvitation: function cal_isInvitation(aItem) {
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
    validateRecipientList: function (aRecipients) {
        let compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
                                   .createInstance(Components.interfaces.nsIMsgCompFields);
        // Resolve the list considering also configured display names
        let result = compFields.splitRecipients(aRecipients, false, {});
        // Malformed e-mail addresses with display name in list will result in "Display name <>".
        // So, we need an additional check on the e-mail address itself and sort out malformed
        // entries from the previous list (both objects have always the same length)
        if (result.length > 0) {
            let resultAddress = compFields.splitRecipients(aRecipients, true, {});
            result = result.filter((v, idx) => !!resultAddress[idx]);
        }
        return result.join(",");
    },

    /**
     * Shortcut function to check whether an item is an invitation copy and
     * has a participation status of either NEEDS-ACTION or TENTATIVE.
     *
     * @param aItem either calIAttendee or calIItemBase 
     */
    isOpenInvitation: function cal_isOpenInvitation(aItem) {
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
     * Shortcut function to get the invited attendee of an item.
     */
    getInvitedAttendee: function cal_getInvitedAttendee(aItem, aCalendar) {
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
     * Returns a wellformed email string like 'attendee@example.net',
     * 'Common Name <attendee@example.net>' or '"Name, Common" <attendee@example.net>'
     *
     * @param  {calIAttendee}  aAttendee - the attendee to check 
     * @param  {boolean}       aIncludeCn - whether or not to return also the CN if available
     * @return {string}        valid email string or an empty string in case of error
     */
    getAttendeeEmail: function (aAttendee, aIncludeCn) {
        // If the recipient id is of type urn, we need to figure out the email address, otherwise
        // we fall back to the attendee id
        let email = aAttendee.id.match(/^urn:/i) ? aAttendee.getProperty("EMAIL") || "" : aAttendee.id;
        // Strip leading "mailto:" if it exists.
        email = email.replace(/^mailto:/i, "");
        // We add the CN if requested and available
        let cn = aAttendee.commonName;
        if (aIncludeCn && email.length > 0 && cn && cn.length > 0) {
            if (cn.match(/[,;]/)) {
                cn = '"' + cn + '"';
            }
            cn = cn + " <" + email + ">";
            if (cal.validateRecipientList(cn) == cn) {
                email = cn;
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
    getRecipientList: function (aAttendees) {
        let cbEmail = function (aVal, aInd, aArr) {
            let email = cal.getAttendeeEmail(aVal, true);
            if (!email.length) {
                cal.LOG("Dropping invalid recipient for email transport: " + aVal.toString());
            }
            return email;
        }
        return aToList.map(cbEmail)
                      .filter(function (aVal, aInd, aArr) {return (aVal.length)})
                      .join(', ');
    },

    /**
     * Returns the default transparency to apply for an event depending on whether its an all-day event
     *
     * @param aIsAllDay      If true, the default transparency for all-day events is returned
     */
    getEventDefaultTransparency: function (aIsAllDay) {
        let transp = null;
        if (aIsAllDay) {
            transp = Preferences.get("calendar.events.defaultTransparency.allday.transparent", false)
                     ? "TRANSPARENT"
                     : "OPAQUE";
        } else {
            transp = Preferences.get("calendar.events.defaultTransparency.standard.transparent", false)
                     ? "TRANSPARENT"
                     : "OPAQUE";
        }
        return transp;
    },

    // The below functions will move to some different place once the
    // unifinder tress are consolidated.

    compareNativeTime: function cal_compareNativeTime(a, b) {
      return (a < b ? -1 :
              a > b ?  1 : 0);
    },

    compareNativeTimeFilledAsc: function cal_compareNativeTimeFilledAsc(a, b) {
      if (a == b)
        return 0;

      // In this filter, a zero time (not set) is always at the end.
      if (a == -62168601600000000) // value for (0000/00/00 00:00:00)
        return 1;
      if (b == -62168601600000000) // value for (0000/00/00 00:00:00)
        return -1;

      return (a < b ? -1 : 1);
    },

    compareNativeTimeFilledDesc: function cal_compareNativeTimeFilledDesc(a, b) {
      if (a == b)
        return 0;

      // In this filter, a zero time (not set) is always at the end.
      if (a == -62168601600000000) // value for (0000/00/00 00:00:00)
        return 1;
      if (b == -62168601600000000) // value for (0000/00/00 00:00:00)
        return -1;

      return (a < b ? 1 : -1);
    },

    compareNumber: function cal_compareNumber(a, b) {
      a = Number(a);
      b = Number(b);
      return ((a < b) ? -1 :      // avoid underflow problems of subtraction
              (a > b) ?  1 : 0);
    },

    sortEntryComparer: function cal_sortEntryComparer(sortType, modifier) {
      switch (sortType) {
        case "number":
          return function compareNumbers(sortEntryA, sortEntryB) {
            let nsA = cal.sortEntryKey(sortEntryA);
            let nsB = cal.sortEntryKey(sortEntryB);
            return cal.compareNumber(nsA, nsB) * modifier;
          };
        case "date":
          return function compareTimes(sortEntryA, sortEntryB) {
            let nsA = cal.sortEntryKey(sortEntryA);
            let nsB = cal.sortEntryKey(sortEntryB);
            return cal.compareNativeTime(nsA, nsB) * modifier;
          };
        case "date_filled":
          return function compareTimesFilled(sortEntryA, sortEntryB) {
            let nsA = cal.sortEntryKey(sortEntryA);
            let nsB = cal.sortEntryKey(sortEntryB);
            if (modifier == 1) {
              return cal.compareNativeTimeFilledAsc(nsA, nsB);
            } else {
              return cal.compareNativeTimeFilledDesc(nsA, nsB);
            }
          };
        case "string":
          return function compareStrings(sortEntryA, sortEntryB) {
            let sA = cal.sortEntryKey(sortEntryA);
            let sB = cal.sortEntryKey(sortEntryB);
            if (sA.length == 0 || sB.length == 0) {
              // sort empty values to end (so when users first sort by a
              // column, they can see and find the desired values in that
              // column without scrolling past all the empty values).
              return -(sA.length - sB.length) * modifier;
            }
            let collator = cal.createLocaleCollator();
            let comparison = collator.compareString(0, sA, sB);
            return comparison * modifier;
          };
        default:
          return function compareOther(sortEntryA, sortEntryB) {
            return 0;
          };
      }
    },

    getItemSortKey: function cal_getItemSortKey(aItem, aKey, aStartTime) {
      switch(aKey) {
        case "priority":
          return aItem.priority || 5;

        case "title":
          return aItem.title || "";

        case "entryDate":
            return cal.nativeTime(aItem.entryDate);

        case "startDate":
            return cal.nativeTime(aItem.startDate);

        case "dueDate":
          return cal.nativeTime(aItem.dueDate);

        case "endDate":
          return cal.nativeTime(aItem.endDate);

        case "completedDate":
          return cal.nativeTime(aItem.completedDate);

        case "percentComplete":
          return aItem.percentComplete;

        case "categories":
          return aItem.getCategories({}).join(", ");

        case "location":
          return aItem.getProperty("LOCATION") || "";

        case "status":
          if (cal.isToDo(aItem)) {
            return ["NEEDS-ACTION", "IN-PROCESS", "COMPLETED", "CANCELLED" ].indexOf(aItem.status);
          } else {
            return ["TENTATIVE", "CONFIRMED", "CANCELLED"].indexOf(aItem.status);
          }
        case "calendar":
          return aItem.calendar.name || "";

        default:
          return null;
      }
    },

    getSortTypeForSortKey: function cal_getSortTypeForSortKey(aSortKey) {
      switch(aSortKey) {
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

    nativeTimeOrNow: function cal_nativeTimeOrNow(calDateTime, sortStartedTime) {
        // Treat null/0 as 'now' when sort started, so incomplete tasks stay current.
        // Time is computed once per sort (just before sort) so sort is stable.
        if (calDateTime == null) {
            return sortStartedTime.nativeTime;
        }
        var ns = calDateTime.nativeTime;
        if (ns == -62168601600000000) { // ns value for (0000/00/00 00:00:00)
            return sortStartedTime;
        }
        return ns;
    },

    nativeTime: function cal_nativeTime(calDateTime) {
        if (calDateTime == null) {
            return -62168601600000000; // ns value for (0000/00/00 00:00:00)
        }
        return calDateTime.nativeTime;
    },

    /**
     * Returns a calIDateTime corresponding to a javascript Date.
     *
     * @param aDate     a javascript date
     * @param aTimezone (optional) a timezone that should be enforced
     * @returns         a calIDateTime
     *
     * @warning  Use of this function is strongly discouraged.  calIDateTime should
     *           be used directly whenever possible.
     *           If you pass a timezone, then the passed jsDate's timezone will be ignored,
     *           but only its local time portions are be taken.
     */
    jsDateToDateTime: function jsDateToDateTime(aDate, aTimezone) {
        let newDate = cal.createDateTime();
        if (aTimezone) {
            newDate.resetTo(aDate.getFullYear(),
                            aDate.getMonth(),
                            aDate.getDate(),
                            aDate.getHours(),
                            aDate.getMinutes(),
                            aDate.getSeconds(),
                            aTimezone);
        } else {
            newDate.nativeTime = aDate.getTime() * 1000;
        }
        return newDate;
    },

    /**
     * Convert a calIDateTime to a Javascript date object. This is the
     * replacement for the former .jsDate property.
     *
     * @param cdt       The calIDateTime instnace
     * @return          The Javascript date equivalent.
     */
    dateTimeToJsDate: function(cdt) {
        if (cdt.timezone.isFloating) {
            return new Date(cdt.year, cdt.month, cdt.day,
                            cdt.hour, cdt.minute, cdt.second);
        } else {
            return new Date(cdt.nativeTime / 1000);
        }
    },

    sortEntry: function cal_sortEntry(aItem) {
        let key = cal.getItemSortKey(aItem, this.mSortKey, this.mSortStartedDate);
        return { mSortKey : key, mItem: aItem };
    },

    sortEntryItem: function cal_sortEntryItem(sortEntry) {
        return sortEntry.mItem;
    },

    sortEntryKey: function cal_sortEntryKey(sortEntry) {
        return sortEntry.mSortKey;
    },

    createLocaleCollator: function cal_createLocaleCollator() {
        return Components.classes["@mozilla.org/intl/collation-factory;1"]
                         .getService(Components.interfaces.nsICollationFactory)
                         .CreateCollation(Services.locale.getApplicationLocale());
     },

    /**
     * Sort an array of strings according to the current locale.
     * Modifies aStringArray, returning it sorted.
     */
    sortArrayByLocaleCollator: function cal_sortArrayByLocaleCollator(aStringArray) {
        var localeCollator = cal.createLocaleCollator();
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
    formatMonth: function formatMonth(aMonthNum, aBundleName, aStringBase) {
        let monthForm = cal.calGetString(aBundleName, aStringBase + ".monthFormat") || "nominative";

        if (monthForm == "nominative") {
            // Fall back to the default name format
            monthForm = "name";
        }

        return cal.calGetString("dateFormat", "month." + aMonthNum + "." + monthForm);
    },

    /**
     * moves an item to another startDate
     *
     * @param aOldItem             The Item to be modified
     * @param aNewDate             The date at which the new item is going to start
     * @return                     The modified item
     */
    moveItem: function cal_moveItem(aOldItem, aNewDate) {
        let newItem = aOldItem.clone();
        let start = (aOldItem[calGetStartDateProp(aOldItem)] ||
                     aOldItem[calGetEndDateProp(aOldItem)]).clone();
        let isDate = start.isDate;
        start.resetTo(aNewDate.year, aNewDate.month, aNewDate.day,
                      start.hour, start.minute, start.second,
                      start.timezone);
        start.isDate = isDate;
        if (newItem[calGetStartDateProp(newItem)]) {
            newItem[calGetStartDateProp(newItem)] = start;
            let oldDuration = aOldItem.duration;
            if (oldDuration) {
                let oldEnd = aOldItem[calGetEndDateProp(aOldItem)];
                let newEnd = start.clone();
                newEnd.addDuration(oldDuration);
                newEnd = newEnd.getInTimezone(oldEnd.timezone);
                newItem[calGetEndDateProp(newItem)] = newEnd;
            }
        } else if (newItem[calGetEndDateProp(newItem)]) {
            newItem[calGetEndDateProp(newItem)] = start;
        }
        return newItem;
    },

    /**
     * sets the 'isDate' property of an item
     *
     * @param aItem         The Item to be modified
     * @param aIsDate       True or false indicating the new value of 'isDate'
     * @return              The modified item
     */
    setItemToAllDay: function cal_setItemToAllDay(aItem, aIsDate){
        let start = aItem[calGetStartDateProp(aItem)];
        let end = aItem[calGetEndDateProp(aItem)];
        if (start || end) {
            let item = aItem.clone();
            if (start && (start.isDate != aIsDate)) {
               start = start.clone();
               start.isDate = aIsDate;
               item[calGetStartDateProp(item)] = start;
            }
            if (end && (end.isDate != aIsDate)) {
               end = end.clone();
               end.isDate = aIsDate;
               item[calGetEndDateProp(item)] = end;
            }
            return item;
        } else {
            return aItem;
        }
    },

    /**
     * checks if the mousepointer of an event resides over a XULBox during an event
     *
     * @param aMouseEvent   The event eg. a 'mouseout' or 'mousedown' event
     * @param aXULBox       The xul element
     * @return              true or false depending on whether the mouse pointer
     *                      resides over the xulelement
     */
    isMouseOverBox: function cal_isMouseOverBox(aMouseEvent, aXULElement) {
        let boxObject = aXULElement.boxObject;
        let boxWidth = boxObject.width;
        let boxHeight = boxObject.height;
        let boxScreenX = boxObject.screenX;
        let boxScreenY = boxObject.screenY;
        let mouseX = aMouseEvent.screenX;
        let mouseY = aMouseEvent.screenY;
        let xIsWithin = (mouseX >= boxScreenX) &&
                        (mouseX <= (boxScreenX + boxWidth));
        let yIsWithin = (mouseY >= boxScreenY) &&
                        (mouseY <= (boxScreenY + boxHeight));
        return (xIsWithin && yIsWithin);
    },

    /**
     * removes those childnodes from a node that contain a specified attribute
     * and where the value of this attribute matches a passed value
     * @param aParentNode   The parent node that contains the child nodes in question
     * @param aAttribute    The name of the attribute
     * @param aAttribute    The value of the attribute
     */
    removeChildElementsByAttribute: function removeChildElementsByAttribute(aParentNode, aAttribute, aValue) {
        let childNode = aParentNode.lastChild;
        while (childNode) {
            let prevChildNode = childNode.previousSibling;
            if (!aAttribute || aAttribute === undefined) {
                childNode.remove();
             } else if (!aValue || aValue === undefined) {
                childNode.remove();
            } else if (childNode && childNode.hasAttribute(aAttribute)
                && childNode.getAttribute(aAttribute) == aValue) {
                childNode.remove();
            }
            childNode = prevChildNode;
        };
    },

    /**
     * Returns the most recent calendar window in an application independent way
     */
    getCalendarWindow: function cal_getCalendarWindow() {
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
    addObserver: function cal_addObserver(func, topic, oneTime) {
        let observer = { // nsIObserver:
            observe: function cal_addObserver_observe(subject, topic_, data) {
                if (topic == topic_) {
                    if (oneTime) {
                        Services.obs.removeObserver(this, topic);
                    }
                    func(subject, topic, data);
                }
            }
        };
        Services.obs.addObserver(observer, topic, false /* don't hold weakly */);
    },

    /**
     * Wraps an instance. Replaces calInstanceOf from calUtils.js 
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
     *   }
     *
     */
    wrapInstance: function wrapInstance(aObj, aInterface) {
        if (!aObj)
            return null;
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
    addShutdownObserver: function cal_addShutdownObserver(func) {
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

// local to this module;
// will be used to clean up global objects on shutdown
// some objects have cyclic references due to wrappers
function shutdownCleanup(obj, prop) {
    if (!shutdownCleanup.mEntries) {
        shutdownCleanup.mEntries = [];
        cal.addShutdownObserver(function() {
                for each (let entry in shutdownCleanup.mEntries) {
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

// local to this module;
// will be used to generate service accessor functions
function generateServiceAccessor(id, iface) {
    return function this_() {
        if (!("mService" in this_)) {
            this_.mService = Components.classes[id].getService(iface);
            shutdownCleanup(this_, "mService");
        }
        return this_.mService;
    };
}

// Interim import of all symbols into cal:
// This should serve as a clean start for new code, e.g. new code could use
// cal.createDatetime instead of plain createDatetime NOW.
cal.loadScripts(["calUtils.js"], cal);
// Some functions in calUtils.js refer to other in the same file, thus include
// the code in global scope (although only visible to this module file), too:
cal.loadScripts(["calUtils.js"], Components.utils.getGlobalForObject(cal));
