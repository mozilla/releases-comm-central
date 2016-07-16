/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function getRidKey(date) {
    if (!date) {
        return null;
    }
    let timezone = date.timezone;
    if (!timezone.isUTC && !timezone.isFloating) {
        date = date.getInTimezone(UTC());
    }
    return date.icalString;
}

function calRecurrenceInfo() {
    this.mRecurrenceItems = [];
    this.mExceptionMap = {};

    this.wrappedJSObject = this;
}

var calRecurrenceInfoClassID = Components.ID("{04027036-5884-4a30-b4af-f2cad79f6edf}");
var calRecurrenceInfoInterfaces = [Components.interfaces.calIRecurrenceInfo];
calRecurrenceInfo.prototype = {
    mImmutable: false,
    mBaseItem: null,
    mRecurrenceItems: null,
    mPositiveRules: null,
    mNegativeRules: null,
    mExceptionMap: null,

    classID: calRecurrenceInfoClassID,
    QueryInterface: XPCOMUtils.generateQI(calRecurrenceInfoInterfaces),
    classInfo: XPCOMUtils.generateCI({
        classID: calRecurrenceInfoClassID,
        contractID: "@mozilla.org/calendar/recurrence-info;1",
        classDescription: "Calendar Recurrence Info",
        interfaces: calRecurrenceInfoInterfaces,
    }),

    /**
     * Helpers
     */
    ensureBaseItem: function() {
        if (!this.mBaseItem) {
            throw Components.results.NS_ERROR_NOT_INITIALIZED;
        }
    },
    ensureMutable: function() {
        if (this.mImmutable) {
            throw Components.results.NS_ERROR_OBJECT_IS_IMMUTABLE;
        }
    },
    ensureSortedRecurrenceRules: function() {
        if (!this.mPositiveRules || !this.mNegativeRules) {
            this.mPositiveRules = [];
            this.mNegativeRules = [];
            for (let ritem of this.mRecurrenceItems) {
                if (ritem.isNegative) {
                    this.mNegativeRules.push(ritem);
                } else {
                    this.mPositiveRules.push(ritem);
                }
            }
        }
    },

    /**
     * Mutability bits
     */
    get isMutable() {
        return !this.mImmutable;
    },
    makeImmutable: function() {
        if (this.mImmutable) {
            return;
        }

        for (let ritem of this.mRecurrenceItems) {
            if (ritem.isMutable) {
                ritem.makeImmutable();
            }
        }

        for (let ex in this.mExceptionMap) {
            let item = this.mExceptionMap[ex];
            if (item.isMutable) {
                item.makeImmutable();
            }
        }

        this.mImmutable = true;
    },

    clone: function() {
        let cloned = new calRecurrenceInfo();
        cloned.mBaseItem = this.mBaseItem;

        let clonedItems = [];
        for (let ritem of this.mRecurrenceItems) {
            clonedItems.push(ritem.clone());
        }
        cloned.mRecurrenceItems = clonedItems;

        let clonedExceptions = {};
        for (let exitem in this.mExceptionMap) {
            clonedExceptions[exitem] = this.mExceptionMap[exitem].cloneShallow(this.mBaseItem);
        }
        cloned.mExceptionMap = clonedExceptions;

        return cloned;
    },

    /*
     * calIRecurrenceInfo
     */
    get item() {
        return this.mBaseItem;
    },
    set item(value) {
        this.ensureMutable();

        value = calTryWrappedJSObject(value);
        this.mBaseItem = value;
        // patch exception's parentItem:
        for (let ex in this.mExceptionMap) {
            let exitem = this.mExceptionMap[ex];
            exitem.parentItem = value;
        }
    },

    get isFinite() {
        this.ensureBaseItem();

        for (let ritem of this.mRecurrenceItems) {
            if (!ritem.isFinite) {
                return false;
            }
        }
        return true;
    },

    getRecurrenceItems: function(aCount) {
        this.ensureBaseItem();

        aCount.value = this.mRecurrenceItems.length;
        return this.mRecurrenceItems;
    },

    setRecurrenceItems: function(aCount, aItems) {
        this.ensureBaseItem();
        this.ensureMutable();

        // XXX should we clone these?
        this.mRecurrenceItems = aItems;
        this.mPositiveRules = null;
        this.mNegativeRules = null;
    },

    countRecurrenceItems: function() {
        this.ensureBaseItem();

        return this.mRecurrenceItems.length;
    },

    getRecurrenceItemAt: function(aIndex) {
        this.ensureBaseItem();

        if (aIndex < 0 || aIndex >= this.mRecurrenceItems.length) {
            throw Components.results.NS_ERROR_INVALID_ARG;
        }

        return this.mRecurrenceItems[aIndex];
    },

    appendRecurrenceItem: function(aItem) {
        this.ensureBaseItem();
        this.ensureMutable();
        this.ensureSortedRecurrenceRules();

        this.mRecurrenceItems.push(aItem);
        if (aItem.isNegative) {
            this.mNegativeRules.push(aItem);
        } else {
            this.mPositiveRules.push(aItem);
        }
    },

    deleteRecurrenceItemAt: function(aIndex) {
        this.ensureBaseItem();
        this.ensureMutable();

        if (aIndex < 0 || aIndex >= this.mRecurrenceItems.length) {
            throw Components.results.NS_ERROR_INVALID_ARG;
        }

        if (this.mRecurrenceItems[aIndex].isNegative) {
            this.mNegativeRules = null;
        } else {
            this.mPositiveRules = null;
        }

        this.mRecurrenceItems.splice(aIndex, 1);
    },

    deleteRecurrenceItem: function(aItem) {
        // Because xpcom objects can be wrapped in various ways, testing for
        // mere == sometimes returns false even when it should be true.  Use
        // the interface pointer returned by sip to avoid that problem.
        let sip1 = Components.classes["@mozilla.org/supports-interface-pointer;1"]
                            .createInstance(Components.interfaces.nsISupportsInterfacePointer);
        sip1.data = aItem;
        sip1.dataIID = Components.interfaces.calIRecurrenceItem;

        let pos;
        if ((pos = this.mRecurrenceItems.indexOf(sip1.data)) > -1) {
            this.deleteRecurrenceItemAt(pos);
        } else {
            throw Components.results.NS_ERROR_INVALID_ARG;
        }
    },

    insertRecurrenceItemAt: function(aItem, aIndex) {
        this.ensureBaseItem();
        this.ensureMutable();
        this.ensureSortedRecurrenceRules();

        if (aIndex < 0 || aIndex > this.mRecurrenceItems.length) {
            throw Components.results.NS_ERROR_INVALID_ARG;
        }

        if (aItem.isNegative) {
            this.mNegativeRules.push(aItem);
        } else {
            this.mPositiveRules.push(aItem);
        }

        this.mRecurrenceItems.splice(aIndex, 0, aItem);
    },

    clearRecurrenceItems: function() {
        this.ensureBaseItem();
        this.ensureMutable();

        this.mRecurrenceItems = [];
        this.mPositiveRules = [];
        this.mNegativeRules = [];
    },

    /*
     * calculations
     */
    getNextOccurrence: function(aTime) {
        this.ensureBaseItem();
        this.ensureSortedRecurrenceRules();

        let startDate = this.mBaseItem.recurrenceStartDate;
        let nextOccurrences = [];
        let invalidOccurrences;
        let negMap = {};
        let minOccRid;

        // Go through all negative rules to create a map of occurrences that
        // should be skipped when going through occurrences.
        for (let ritem of this.mNegativeRules) {
            // TODO Infinite rules (i.e EXRULE) are not taken into account,
            // because its very performance hungry and could potentially
            // lead to a deadlock (i.e RRULE is canceled out by an EXRULE).
            // This is ok for now, since EXRULE is deprecated anyway.
            if (ritem.isFinite) {
                // Get all occurrences starting at our recurrence start date.
                // This is fine, since there will never be an EXDATE that
                // occurrs before the event started and its illegal to EXDATE an
                // RDATE.
                let rdates = ritem.getOccurrences(startDate,
                                                  startDate,
                                                  null,
                                                  0,
                                                  {});
                // Map all negative dates.
                for (let rdate of rdates) {
                    negMap[getRidKey(rdate)] = true;
                }
            } else {
                WARN("Item '" + this.mBaseItem.title + "'" +
                     (this.mBaseItem.calendar ? " (" + this.mBaseItem.calendar.name + ")" : "") +
                     " has an infinite negative rule (EXRULE)");
            }
        }

        let bailCounter = 0;
        do {
            invalidOccurrences = 0;
            // Go through all positive rules and get the next recurrence id
            // according to that rule. If for all rules the rid is "invalid",
            // (i.e an EXDATE removed it, or an exception moved it somewhere
            // else), then get the respective next rid.
            //
            // If in a loop at least one rid is valid (i.e not an exception, not
            // an exdate, is after aTime), then remember the lowest one.
            for (let i = 0; i < this.mPositiveRules.length; i++) {
                let rDateInstance = cal.wrapInstance(this.mPositiveRules[i], Components.interfaces.calIRecurrenceDate);
                let rRuleInstance = cal.wrapInstance(this.mPositiveRules[i], Components.interfaces.calIRecurrenceRule);
                if (rDateInstance) {
                    // RDATEs are special. there is only one date in this rule,
                    // so no need to search anything.
                    let rdate = rDateInstance.date;
                    if (!nextOccurrences[i] && rdate.compare(aTime) > 0) {
                        // The RDATE falls into range, save it.
                        nextOccurrences[i] = rdate;
                    } else {
                        // The RDATE doesn't fall into range. This rule will
                        // always be invalid, since it can't give out a date.
                        nextOccurrences[i] = null;
                        invalidOccurrences++;
                    }
                } else if (rRuleInstance) {
                    // RRULEs must not start searching before |startDate|, since
                    // the pattern is only valid afterwards. If an occurrence
                    // was found in a previous round, we can go ahead and start
                    // searching from that occurrence.
                    let searchStart = nextOccurrences[i] || startDate;

                    // Search for the next occurrence after aTime. If the last
                    // round was invalid, then in this round we need to search
                    // after nextOccurrences[i] to make sure getNextOccurrence()
                    // doesn't find the same occurrence again.
                    let searchDate = nextOccurrences[i] && nextOccurrences[i].compare(aTime) > 0
                        ? nextOccurrences[i]
                        : aTime;

                    nextOccurrences[i] = rRuleInstance
                                             .getNextOccurrence(searchStart, searchDate);
                }

                // As decided in bug 734245, an EXDATE of type DATE shall also match a DTSTART of type DATE-TIME
                let nextKey = getRidKey(nextOccurrences[i]);
                let isInExceptionMap = nextKey && (this.mExceptionMap[nextKey.substring(0, 8)] ||
                                                   this.mExceptionMap[nextKey]);
                let isInNegMap = nextKey && (negMap[nextKey.substring(0, 8)] ||
                                             negMap[nextKey]);
                if (nextKey && (isInNegMap || isInExceptionMap)) {
                    // If the found recurrence id points to either an exception
                    // (will handle later) or an EXDATE, then nextOccurrences[i]
                    // is invalid and we might need to try again next round.
                    invalidOccurrences++;
                } else if (nextOccurrences[i]) {
                    // We have a valid recurrence id (not an exception, not an
                    // EXDATE, falls into range). We only need to save the
                    // earliest occurrence after aTime (checking for aTime is
                    // not needed, since getNextOccurrence() above returns only
                    // occurrences after aTime).
                    if (!minOccRid || minOccRid.compare(nextOccurrences[i]) > 0) {
                        minOccRid = nextOccurrences[i];
                    }
                }
            }

            // To make sure users don't just report bugs like "the application
            // hangs", bail out after 100 runs. If this happens, it is most
            // likely a bug.
            if (bailCounter++ > 100) {
                ERROR("Could not find next occurrence after 100 runs!");
                return null;
            }

            // We counted how many positive rules found out that their next
            // candidate is invalid. If all rules produce invalid next
            // occurrences, a second round is needed.
        } while (invalidOccurrences == this.mPositiveRules.length);

        // Since we need to compare occurrences by date, save the rid found
        // above also as a date. This works out because above we skipped
        // exceptions.
        let minOccDate = minOccRid;

        // Scan exceptions for any dates earlier than the above found
        // minOccDate, but still after aTime.
        for (let ex in this.mExceptionMap) {
            let exc = this.mExceptionMap[ex];
            let start = exc.recurrenceStartDate;
            if (start.compare(aTime) > 0 &&
                (!minOccDate || start.compare(minOccDate) <= 0)) {
                // This exception is earlier, save its rid (for getting the
                // occurrence later on) and its date (for comparing to other
                // exceptions).
                minOccRid = exc.recurrenceId;
                minOccDate = start;
            }
        }

        // If we found a recurrence id any time above, then return the
        // occurrence for it.
        return (minOccRid ? this.getOccurrenceFor(minOccRid) : null);
    },

    getPreviousOccurrence: function(aTime) {
        // TODO libical currently does not provide us with easy means of
        // getting the previous occurrence. This could be fixed to improve
        // performance greatly. Filed as libical feature request 1944020.

        // HACK We never know how early an RDATE might be before the actual
        // recurrence start. Since rangeStart cannot be null for recurrence
        // items like calIRecurrenceRule, we need to work around by supplying a
        // very early date. Again, this might have a high performance penalty.
        let early = createDateTime();
        early.icalString = "00000101T000000Z";

        let rids = this.calculateDates(early,
                                       aTime,
                                       0);
        // The returned dates are sorted, so the last one is a good
        // candidate, if it exists.
        return (rids.length > 0 ? this.getOccurrenceFor(rids[rids.length - 1].id) : null);
    },

    // internal helper function;
    calculateDates: function(aRangeStart, aRangeEnd, aMaxCount) {
        this.ensureBaseItem();
        this.ensureSortedRecurrenceRules();

        function ridDateSortComptor(a, b) {
            return a.rstart.compare(b.rstart);
        }

        // workaround for UTC- timezones
        let rangeStart = ensureDateTime(aRangeStart);
        let rangeEnd = ensureDateTime(aRangeEnd);

        // If aRangeStart falls in the middle of an occurrence, libical will
        // not return that occurrence when we go and ask for an
        // icalrecur_iterator_new.  This actually seems fairly rational, so
        // instead of hacking libical, I'm going to move aRangeStart back far
        // enough to make sure we get the occurrences we might miss.
        let searchStart = rangeStart.clone();
        let baseDuration = this.mBaseItem.duration;
        if (baseDuration) {
            let duration = baseDuration.clone();
            duration.isNegative = true;
            searchStart.addDuration(duration);
        }

        let startDate = this.mBaseItem.recurrenceStartDate;
        if (startDate == null) {
            // Todo created by other apps may have a saved recurrence but
            // start and due dates disabled.  Since no recurrenceStartDate,
            // treat as undated task.
            return [];
        }

        let dates = [];

        // toss in exceptions first. Save a map of all exceptions ids, so we
        // don't add the wrong occurrences later on.
        let occurrenceMap = {};
        for (let ex in this.mExceptionMap) {
            let item = this.mExceptionMap[ex];
            let occDate = checkIfInRange(item, aRangeStart, aRangeEnd, true);
            occurrenceMap[ex] = true;
            if (occDate) {
                binaryInsert(dates, { id: item.recurrenceId, rstart: occDate }, ridDateSortComptor);
            }
        }

        // DTSTART/DUE is always part of the (positive) expanded set:
        // DTSTART always equals RECURRENCE-ID for items expanded from RRULE
        let baseOccDate = checkIfInRange(this.mBaseItem, aRangeStart, aRangeEnd, true);
        let baseOccDateKey = getRidKey(baseOccDate);
        if (baseOccDate && !occurrenceMap[baseOccDateKey]) {
            occurrenceMap[baseOccDateKey] = true;
            binaryInsert(dates, { id: baseOccDate, rstart: baseOccDate }, ridDateSortComptor);
        }

        // if both range start and end are specified, we ask for all of the occurrences,
        // to make sure we catch all possible exceptions.  If aRangeEnd isn't specified,
        // then we have to ask for aMaxCount, and hope for the best.
        let maxCount;
        if (rangeStart && rangeEnd) {
            maxCount = 0;
        } else {
            maxCount = aMaxCount;
        }

        // Apply positive rules
        for (let ritem of this.mPositiveRules) {
            let cur_dates = ritem.getOccurrences(startDate,
                                                 searchStart,
                                                 rangeEnd,
                                                 maxCount, {});
            if (cur_dates.length == 0) {
                continue;
            }

            // if positive, we just add these date to the existing set,
            // but only if they're not already there

            let index = 0;
            let len = cur_dates.length;

            // skip items before rangeStart due to searchStart libical hack:
            if (rangeStart && baseDuration) {
                for (; index < len; ++index) {
                    let date = cur_dates[index].clone();
                    date.addDuration(baseDuration);
                    if (rangeStart.compare(date) < 0) {
                        break;
                    }
                }
            }
            for (; index < len; ++index) {
                let date = cur_dates[index];
                let dateKey = getRidKey(date);
                if (occurrenceMap[dateKey]) {
                    // Don't add occurrences twice (i.e exception was
                    // already added before)
                    continue;
                }
                // TODO if cur_dates[] is also sorted, then this binary
                // search could be optimized further
                binaryInsert(dates, { id: date, rstart: date }, ridDateSortComptor);
                occurrenceMap[dateKey] = true;
            }
        }

        // Apply negative rules
        for (let ritem of this.mNegativeRules) {
            let cur_dates = ritem.getOccurrences(startDate,
                                                 searchStart,
                                                 rangeEnd,
                                                 maxCount, {});
            if (cur_dates.length == 0) {
                continue;
            }

            // XXX: i'm pretty sure negative dates can't really have exceptions
            // (like, you can't make a date "real" by defining an RECURRENCE-ID which
            // is an EXDATE, and then giving it a real DTSTART) -- so we don't
            // check exceptions here
            for (let dateToRemove of cur_dates) {
                let dateToRemoveKey = getRidKey(dateToRemove);
                if (dateToRemove.isDate) {
                    // As decided in bug 734245, an EXDATE of type DATE shall also match a DTSTART of type DATE-TIME
                    let toRemove = [];
                    for (let occurenceKey in occurrenceMap) {
                        if (occurrenceMap[occurenceKey] && occurenceKey.substring(0, 8) == dateToRemoveKey) {
                            dates = dates.filter(date => date.id.compare(dateToRemove) != 0);
                            toRemove.push(occurenceKey);
                        }
                    }
                    for (let i = 0; i < toRemove.length; i++) {
                        delete occurrenceMap[toRemove[i]];
                    }
                } else if (occurrenceMap[dateToRemoveKey]) {
                    // TODO PERF Theoretically we could use occurrence map
                    // to construct the array of occurrences. Right now I'm
                    // just using the occurrence map to skip the filter
                    // action if the occurrence isn't there anyway.
                    dates = dates.filter(date => date.id.compare(dateToRemove) != 0);
                    delete occurrenceMap[dateToRemoveKey];
                }
            }
        }

        // The list was already sorted above, chop anything over aMaxCount, if
        // specified.
        if (aMaxCount && dates.length > aMaxCount) {
            dates = dates.slice(0, aMaxCount);
        }

        return dates;
    },

    getOccurrenceDates: function(aRangeStart, aRangeEnd, aMaxCount, aCount) {
        let dates = this.calculateDates(aRangeStart, aRangeEnd, aMaxCount);
        dates = dates.map(date => date.rstart);
        aCount.value = dates.length;
        return dates;
    },

    getOccurrences: function(aRangeStart, aRangeEnd, aMaxCount, aCount) {
        let results = [];
        let dates = this.calculateDates(aRangeStart, aRangeEnd, aMaxCount);
        if (dates.length) {
            let count;
            if (aMaxCount) {
                count = Math.min(aMaxCount, dates.length);
            } else {
                count = dates.length;
            }

            for (let i = 0; i < count; i++) {
                results.push(this.getOccurrenceFor(dates[i].id));
            }
        }

        aCount.value = results.length;
        return results;
    },

    getOccurrenceFor: function(aRecurrenceId) {
        let proxy = this.getExceptionFor(aRecurrenceId);
        if (!proxy) {
            return this.item.createProxy(aRecurrenceId);
        }
        return proxy;
    },

    removeOccurrenceAt: function(aRecurrenceId) {
        this.ensureBaseItem();
        this.ensureMutable();

        let rdate = Components.classes["@mozilla.org/calendar/recurrence-date;1"]
                              .createInstance(Components.interfaces.calIRecurrenceDate);
        rdate.isNegative = true;
        rdate.date = aRecurrenceId.clone();

        this.removeExceptionFor(rdate.date);

        this.appendRecurrenceItem(rdate);
    },

    restoreOccurrenceAt: function(aRecurrenceId) {
        this.ensureBaseItem();
        this.ensureMutable();
        this.ensureSortedRecurrenceRules();

        for (let i = 0; i < this.mRecurrenceItems.length; i++) {
            let rdate = cal.wrapInstance(this.mRecurrenceItems[i], Components.interfaces.calIRecurrenceDate);
            if (rdate) {
                if (rdate.isNegative && rdate.date.compare(aRecurrenceId) == 0) {
                    return this.deleteRecurrenceItemAt(i);
                }
            }
        }

        throw Components.results.NS_ERROR_INVALID_ARG;
    },

    //
    // exceptions
    //

    //
    // Some notes:
    //
    // The way I read ICAL, RECURRENCE-ID is used to specify a
    // particular instance of a recurring event, according to the
    // RRULEs/RDATEs/etc. specified in the base event.  If one of
    // these is to be changed ("an exception"), then it can be
    // referenced via the UID of the original event, and a
    // RECURRENCE-ID of the start time of the instance to change.
    // This, to me, means that an event where one of the instances has
    // changed to a different time has a RECURRENCE-ID of the original
    // start time, and a DTSTART/DTEND representing the new time.
    //
    // ITIP, however, seems to want something different -- you're
    // supposed to use UID/RECURRENCE-ID to select from the current
    // set of occurrences of an event.  If you change the DTSTART for
    // an instance, you're supposed to use the old (original) DTSTART
    // as the RECURRENCE-ID, and put the new time as the DTSTART.
    // However, after that change, to refer to that instance in the
    // future, you have to use the modified DTSTART as the
    // RECURRENCE-ID.  This madness is described in ITIP end of
    // section 3.7.1.
    //
    // This implementation does the first approach (RECURRENCE-ID will
    // never change even if DTSTART for that instance changes), which
    // I think is the right thing to do for CalDAV; I don't know what
    // we'll do for incoming ITIP events though.
    //
    modifyException: function(anItem, aTakeOverOwnership) {
        this.ensureBaseItem();

        anItem = calTryWrappedJSObject(anItem);

        if (anItem.parentItem.calendar != this.mBaseItem.calendar &&
            anItem.parentItem.id != this.mBaseItem.id) {
            ERROR("recurrenceInfo::addException: item parentItem != this.mBaseItem (calendar/id)!");
            throw Components.results.NS_ERROR_INVALID_ARG;
        }

        if (anItem.recurrenceId == null) {
            ERROR("recurrenceInfo::addException: item with null recurrenceId!");
            throw Components.results.NS_ERROR_INVALID_ARG;
        }

        let itemtoadd;
        if (aTakeOverOwnership && anItem.isMutable) {
            itemtoadd = anItem;
            itemtoadd.parentItem = this.mBaseItem;
        } else {
            itemtoadd = anItem.cloneShallow(this.mBaseItem);
        }

        // we're going to assume that the recurrenceId is valid here,
        // because presumably the item came from one of our functions

        let exKey = getRidKey(itemtoadd.recurrenceId);
        this.mExceptionMap[exKey] = itemtoadd;
    },

    getExceptionFor: function(aRecurrenceId) {
        this.ensureBaseItem();
        // Interface calIRecurrenceInfo specifies result be null if not found.
        // To avoid strict "reference to undefined property" warning, appending
        // "|| null" gives explicit result in case where property undefined
        // (or false, 0, null, or "", but here it should never be those values).
        return this.mExceptionMap[getRidKey(aRecurrenceId)] || null;
    },

    removeExceptionFor: function(aRecurrenceId) {
        this.ensureBaseItem();
        delete this.mExceptionMap[getRidKey(aRecurrenceId)];
    },

    getExceptionIds: function(aCount) {
        this.ensureBaseItem();

        let ids = [];
        for (let ex in this.mExceptionMap) {
            let item = this.mExceptionMap[ex];
            ids.push(item.recurrenceId);
        }

        aCount.value = ids.length;
        return ids;
    },

    // changing the startdate of an item needs to take exceptions into account.
    // in case we're about to modify a parentItem (aka 'folded' item), we need
    // to modify the recurrenceId's of all possibly existing exceptions as well.
    onStartDateChange: function(aNewStartTime, aOldStartTime) {
        // passing null for the new starttime would indicate an error condition,
        // since having a recurrence without a starttime is invalid.
        cal.ASSERT(aNewStartTime, "invalid arg!", true);

        // no need to check for changes if there's no previous starttime.
        if (!aOldStartTime) {
            return;
        }

        // convert both dates to UTC since subtractDate is not timezone aware.
        let timeDiff = aNewStartTime.getInTimezone(UTC()).subtractDate(aOldStartTime.getInTimezone(UTC()));

        let rdates = {};

        // take RDATE's and EXDATE's into account.
        const kCalIRecurrenceDate = Components.interfaces.calIRecurrenceDate;
        let ritems = this.getRecurrenceItems({});
        for (let ritem of ritems) {
            let rDateInstance = cal.wrapInstance(ritem, kCalIRecurrenceDate);
            let rRuleInstance = cal.wrapInstance(ritem, Components.interfaces.calIRecurrenceRule);
            if (rDateInstance) {
                ritem = rDateInstance;
                let date = ritem.date;
                date.addDuration(timeDiff);
                if (!ritem.isNegative) {
                    rdates[getRidKey(date)] = date;
                }
                ritem.date = date;
            } else if (rRuleInstance) {
                ritem = rRuleInstance;
                if (!ritem.isByCount) {
                    let untilDate = ritem.untilDate;
                    if (untilDate) {
                        untilDate.addDuration(timeDiff);
                        ritem.untilDate = untilDate;
                    }
                }
            }
        }

        let startTimezone = aNewStartTime.timezone;
        let modifiedExceptions = [];
        for (let exid of this.getExceptionIds({})) {
            let ex = this.getExceptionFor(exid);
            if (ex) {
                ex = ex.clone();
                // track RECURRENCE-IDs in DTSTART's or RDATE's timezone,
                // otherwise those won't match any longer w.r.t DST:
                let rid = ex.recurrenceId;
                let rdate = rdates[getRidKey(rid)];
                rid = rid.getInTimezone(rdate ? rdate.timezone : startTimezone);
                rid.addDuration(timeDiff);
                ex.recurrenceId = rid;
                cal.shiftItem(ex, timeDiff);
                modifiedExceptions.push(ex);
                this.removeExceptionFor(exid);
            }
        }
        for (let modifiedEx of modifiedExceptions) {
            this.modifyException(modifiedEx, true);
        }
    },

    onIdChange: function(aNewId) {
        // patch all overridden items' id:
        for (let ex in this.mExceptionMap) {
            let item = this.mExceptionMap[ex];
            item.id = aNewId;
        }
    }
};
