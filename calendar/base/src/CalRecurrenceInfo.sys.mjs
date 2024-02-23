/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

function getRidKey(date) {
  if (!date) {
    return null;
  }
  const timezone = date.timezone;
  if (!timezone.isUTC && !timezone.isFloating) {
    date = date.getInTimezone(cal.dtz.UTC);
  }
  return date.icalString;
}

/**
 * Constructor for `calIRecurrenceInfo` objects.
 *
 * @class
 * @implements {calIRecurrenceInfo}
 * @param {calIItemBase} [item] - Optional calendar item for which this recurrence applies.
 */
export function CalRecurrenceInfo(item) {
  this.wrappedJSObject = this;
  this.mRecurrenceItems = [];
  this.mExceptionMap = {};
  if (item) {
    this.item = item;
  }
}

CalRecurrenceInfo.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIRecurrenceInfo"]),
  classID: Components.ID("{04027036-5884-4a30-b4af-f2cad79f6edf}"),

  mImmutable: false,
  mBaseItem: null,
  mEndDate: null,
  mRecurrenceItems: null,
  mPositiveRules: null,
  mNegativeRules: null,
  mExceptionMap: null,

  /**
   * Helpers
   */
  ensureBaseItem() {
    if (!this.mBaseItem) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
    }
  },
  ensureMutable() {
    if (this.mImmutable) {
      throw Components.Exception("", Cr.NS_ERROR_OBJECT_IS_IMMUTABLE);
    }
  },
  ensureSortedRecurrenceRules() {
    if (!this.mPositiveRules || !this.mNegativeRules) {
      this.mPositiveRules = [];
      this.mNegativeRules = [];
      for (const ritem of this.mRecurrenceItems) {
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
  makeImmutable() {
    if (this.mImmutable) {
      return;
    }

    for (const ritem of this.mRecurrenceItems) {
      if (ritem.isMutable) {
        ritem.makeImmutable();
      }
    }

    for (const ex in this.mExceptionMap) {
      const item = this.mExceptionMap[ex];
      if (item.isMutable) {
        item.makeImmutable();
      }
    }

    this.mImmutable = true;
  },

  clone() {
    const cloned = new CalRecurrenceInfo();
    cloned.mBaseItem = this.mBaseItem;

    const clonedItems = [];
    for (const ritem of this.mRecurrenceItems) {
      clonedItems.push(ritem.clone());
    }
    cloned.mRecurrenceItems = clonedItems;

    const clonedExceptions = {};
    for (const exitem in this.mExceptionMap) {
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

    value = cal.unwrapInstance(value);
    this.mBaseItem = value;
    // patch exception's parentItem:
    for (const ex in this.mExceptionMap) {
      const exitem = this.mExceptionMap[ex];
      exitem.parentItem = value;
    }
  },

  get isFinite() {
    this.ensureBaseItem();

    for (const ritem of this.mRecurrenceItems) {
      if (!ritem.isFinite) {
        return false;
      }
    }
    return true;
  },

  /**
   * Get the item ending date (end date for an event, due date or entry date if available for a task).
   *
   * @param {calIEvent | calITodo} item - The item.
   * @returns {calIDateTime | null} The ending date or null.
   */
  getItemEndingDate(item) {
    if (item.isEvent()) {
      if (item.endDate) {
        return item.endDate;
      }
    } else if (item.isTodo()) {
      // Due date must be considered since it is used when displaying the task in agenda view.
      if (item.dueDate) {
        return item.dueDate;
      } else if (item.entryDate) {
        return item.entryDate;
      }
    }
    return null;
  },

  get recurrenceEndDate() {
    // The lowest and highest possible values of a PRTime (64-bit integer) when in javascript,
    // which stores them as floating-point values.
    const MIN_PRTIME = -9223372036854775000;
    const MAX_PRTIME = 9223372036854775000;

    // If this object is mutable, skip this optimisation, so that we don't have to work out every
    // possible modification and invalidate the cached value. Immutable objects are unlikely to
    // exist for long enough to really benefit anyway.
    if (this.isMutable) {
      return MAX_PRTIME;
    }

    if (this.mEndDate === null) {
      if (this.isFinite) {
        this.mEndDate = MIN_PRTIME;
        const lastOccurrence = this.getPreviousOccurrence(cal.createDateTime("99991231T235959Z"));
        if (lastOccurrence) {
          const endingDate = this.getItemEndingDate(lastOccurrence);
          if (endingDate) {
            this.mEndDate = endingDate.nativeTime;
          }
        }

        // A modified occurrence may have a new ending date positioned after last occurrence one.
        for (const rid in this.mExceptionMap) {
          const item = this.mExceptionMap[rid];

          const endingDate = this.getItemEndingDate(item);
          if (endingDate && this.mEndDate < endingDate.nativeTime) {
            this.mEndDate = endingDate.nativeTime;
          }
        }
      } else {
        this.mEndDate = MAX_PRTIME;
      }
    }

    return this.mEndDate;
  },

  getRecurrenceItems() {
    this.ensureBaseItem();

    return this.mRecurrenceItems;
  },

  setRecurrenceItems(aItems) {
    this.ensureBaseItem();
    this.ensureMutable();

    // XXX should we clone these?
    this.mRecurrenceItems = aItems;
    this.mPositiveRules = null;
    this.mNegativeRules = null;
  },

  countRecurrenceItems() {
    this.ensureBaseItem();

    return this.mRecurrenceItems.length;
  },

  getRecurrenceItemAt(aIndex) {
    this.ensureBaseItem();

    if (aIndex < 0 || aIndex >= this.mRecurrenceItems.length) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    return this.mRecurrenceItems[aIndex];
  },

  appendRecurrenceItem(aItem) {
    this.ensureBaseItem();
    this.ensureMutable();
    this.ensureSortedRecurrenceRules();

    aItem = cal.unwrapInstance(aItem);
    this.mRecurrenceItems.push(aItem);
    if (aItem.isNegative) {
      this.mNegativeRules.push(aItem);
    } else {
      this.mPositiveRules.push(aItem);
    }
  },

  deleteRecurrenceItemAt(aIndex) {
    this.ensureBaseItem();
    this.ensureMutable();

    if (aIndex < 0 || aIndex >= this.mRecurrenceItems.length) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    if (this.mRecurrenceItems[aIndex].isNegative) {
      this.mNegativeRules = null;
    } else {
      this.mPositiveRules = null;
    }

    this.mRecurrenceItems.splice(aIndex, 1);
  },

  deleteRecurrenceItem(aItem) {
    aItem = cal.unwrapInstance(aItem);
    const pos = this.mRecurrenceItems.indexOf(aItem);
    if (pos > -1) {
      this.deleteRecurrenceItemAt(pos);
    } else {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }
  },

  insertRecurrenceItemAt(aItem, aIndex) {
    this.ensureBaseItem();
    this.ensureMutable();
    this.ensureSortedRecurrenceRules();

    if (aIndex < 0 || aIndex > this.mRecurrenceItems.length) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    aItem = cal.unwrapInstance(aItem);
    if (aItem.isNegative) {
      this.mNegativeRules.push(aItem);
    } else {
      this.mPositiveRules.push(aItem);
    }

    this.mRecurrenceItems.splice(aIndex, 0, aItem);
  },

  clearRecurrenceItems() {
    this.ensureBaseItem();
    this.ensureMutable();

    this.mRecurrenceItems = [];
    this.mPositiveRules = [];
    this.mNegativeRules = [];
  },

  /*
   * calculations
   */
  getNextOccurrence(aTime) {
    this.ensureBaseItem();
    this.ensureSortedRecurrenceRules();

    const startDate = this.mBaseItem.recurrenceStartDate;
    const nextOccurrences = [];
    let invalidOccurrences;
    const negMap = {};
    let minOccRid;

    // Go through all negative rules to create a map of occurrences that
    // should be skipped when going through occurrences.
    for (const ritem of this.mNegativeRules) {
      // TODO Infinite rules (i.e EXRULE) are not taken into account,
      // because its very performance hungry and could potentially
      // lead to a deadlock (i.e RRULE is canceled out by an EXRULE).
      // This is ok for now, since EXRULE is deprecated anyway.
      if (ritem.isFinite) {
        // Get all occurrences starting at our recurrence start date.
        // This is fine, since there will never be an EXDATE that
        // occurs before the event started and its illegal to EXDATE an
        // RDATE.
        const rdates = ritem.getOccurrences(startDate, startDate, null, 0);
        // Map all negative dates.
        for (const rdate of rdates) {
          negMap[getRidKey(rdate)] = true;
        }
      } else {
        cal.WARN(
          "Item '" +
            this.mBaseItem.title +
            "'" +
            (this.mBaseItem.calendar ? " (" + this.mBaseItem.calendar.name + ")" : "") +
            " has an infinite negative rule (EXRULE)"
        );
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
        const rDateInstance = cal.wrapInstance(this.mPositiveRules[i], Ci.calIRecurrenceDate);
        const rRuleInstance = cal.wrapInstance(this.mPositiveRules[i], Ci.calIRecurrenceRule);
        if (rDateInstance) {
          // RDATEs are special. there is only one date in this rule,
          // so no need to search anything.
          const rdate = rDateInstance.date;
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
          const searchStart = nextOccurrences[i] || startDate;

          // Search for the next occurrence after aTime. If the last
          // round was invalid, then in this round we need to search
          // after nextOccurrences[i] to make sure getNextOccurrence()
          // doesn't find the same occurrence again.
          const searchDate =
            nextOccurrences[i] && nextOccurrences[i].compare(aTime) > 0
              ? nextOccurrences[i]
              : aTime;

          nextOccurrences[i] = rRuleInstance.getNextOccurrence(searchStart, searchDate);
        }

        // As decided in bug 734245, an EXDATE of type DATE shall also match a DTSTART of type DATE-TIME
        const nextKey = getRidKey(nextOccurrences[i]);
        const isInExceptionMap =
          nextKey && (this.mExceptionMap[nextKey.substring(0, 8)] || this.mExceptionMap[nextKey]);
        const isInNegMap = nextKey && (negMap[nextKey.substring(0, 8)] || negMap[nextKey]);
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
        cal.ERROR("Could not find next occurrence after 100 runs!");
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
    for (const ex in this.mExceptionMap) {
      const exc = this.mExceptionMap[ex];
      const start = exc.recurrenceStartDate;
      if (start.compare(aTime) > 0 && (!minOccDate || start.compare(minOccDate) <= 0)) {
        // This exception is earlier, save its rid (for getting the
        // occurrence later on) and its date (for comparing to other
        // exceptions).
        minOccRid = exc.recurrenceId;
        minOccDate = start;
      }
    }

    // If we found a recurrence id any time above, then return the
    // occurrence for it.
    return minOccRid ? this.getOccurrenceFor(minOccRid) : null;
  },

  getPreviousOccurrence(aTime) {
    // HACK We never know how early an RDATE might be before the actual
    // recurrence start. Since rangeStart cannot be null for recurrence
    // items like calIRecurrenceRule, we need to work around by supplying a
    // very early date. Again, this might have a high performance penalty.
    const early = cal.createDateTime();
    early.icalString = "00000101T000000Z";

    const rids = this.calculateDates(early, aTime, 0);
    // The returned dates are sorted, so the last one is a good
    // candidate, if it exists.
    return rids.length > 0 ? this.getOccurrenceFor(rids[rids.length - 1].id) : null;
  },

  // internal helper function;
  calculateDates(aRangeStart, aRangeEnd, aMaxCount) {
    this.ensureBaseItem();
    this.ensureSortedRecurrenceRules();

    // workaround for UTC- timezones
    const rangeStart = cal.dtz.ensureDateTime(aRangeStart);
    const rangeEnd = cal.dtz.ensureDateTime(aRangeEnd);

    // If aRangeStart falls in the middle of an occurrence, libical will
    // not return that occurrence when we go and ask for an
    // icalrecur_iterator_new.  This actually seems fairly rational, so
    // instead of hacking libical, I'm going to move aRangeStart back far
    // enough to make sure we get the occurrences we might miss.
    const searchStart = rangeStart.clone();
    const baseDuration = this.mBaseItem.duration;
    if (baseDuration) {
      const duration = baseDuration.clone();
      duration.isNegative = true;
      searchStart.addDuration(duration);
    }

    const startDate = this.mBaseItem.recurrenceStartDate;
    if (startDate == null) {
      // Todo created by other apps may have a saved recurrence but
      // start and due dates disabled.  Since no recurrenceStartDate,
      // treat as undated task.
      return [];
    }

    let dates = [];

    // toss in exceptions first. Save a map of all exceptions ids, so we
    // don't add the wrong occurrences later on.
    const occurrenceMap = {};
    for (const ex in this.mExceptionMap) {
      const item = this.mExceptionMap[ex];
      const occDate = cal.item.checkIfInRange(item, aRangeStart, aRangeEnd, true);
      occurrenceMap[ex] = true;
      if (occDate) {
        dates.push({ id: item.recurrenceId, rstart: occDate });
      }
    }

    // DTSTART/DUE is always part of the (positive) expanded set:
    // DTSTART always equals RECURRENCE-ID for items expanded from RRULE
    const baseOccDate = cal.item.checkIfInRange(this.mBaseItem, aRangeStart, aRangeEnd, true);
    const baseOccDateKey = getRidKey(baseOccDate);
    if (baseOccDate && !occurrenceMap[baseOccDateKey]) {
      occurrenceMap[baseOccDateKey] = true;
      dates.push({ id: baseOccDate, rstart: baseOccDate });
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
    for (const ritem of this.mPositiveRules) {
      const cur_dates = ritem.getOccurrences(startDate, searchStart, rangeEnd, maxCount);
      if (cur_dates.length == 0) {
        continue;
      }

      // if positive, we just add these date to the existing set,
      // but only if they're not already there

      let index = 0;
      const len = cur_dates.length;

      // skip items before rangeStart due to searchStart libical hack:
      if (rangeStart && baseDuration) {
        for (; index < len; ++index) {
          const date = cur_dates[index].clone();
          date.addDuration(baseDuration);
          if (rangeStart.compare(date) < 0) {
            break;
          }
        }
      }
      for (; index < len; ++index) {
        const date = cur_dates[index];
        const dateKey = getRidKey(date);
        if (occurrenceMap[dateKey]) {
          // Don't add occurrences twice (i.e exception was
          // already added before)
          continue;
        }
        dates.push({ id: date, rstart: date });
        occurrenceMap[dateKey] = true;
      }
    }

    dates.sort((a, b) => a.rstart.compare(b.rstart));

    // Apply negative rules
    for (const ritem of this.mNegativeRules) {
      const cur_dates = ritem.getOccurrences(startDate, searchStart, rangeEnd, maxCount);
      if (cur_dates.length == 0) {
        continue;
      }

      // XXX: i'm pretty sure negative dates can't really have exceptions
      // (like, you can't make a date "real" by defining an RECURRENCE-ID which
      // is an EXDATE, and then giving it a real DTSTART) -- so we don't
      // check exceptions here
      for (const dateToRemove of cur_dates) {
        const dateToRemoveKey = getRidKey(dateToRemove);
        if (dateToRemove.isDate) {
          // As decided in bug 734245, an EXDATE of type DATE shall also match a DTSTART of type DATE-TIME
          const toRemove = [];
          for (const occurenceKey in occurrenceMap) {
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

  getOccurrenceDates(aRangeStart, aRangeEnd, aMaxCount) {
    let dates = this.calculateDates(aRangeStart, aRangeEnd, aMaxCount);
    dates = dates.map(date => date.rstart);
    return dates;
  },

  getOccurrences(aRangeStart, aRangeEnd, aMaxCount) {
    const results = [];
    const dates = this.calculateDates(aRangeStart, aRangeEnd, aMaxCount);
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
    return results;
  },

  getOccurrenceFor(aRecurrenceId) {
    const proxy = this.getExceptionFor(aRecurrenceId);
    if (!proxy) {
      return this.item.createProxy(aRecurrenceId);
    }
    return proxy;
  },

  removeOccurrenceAt(aRecurrenceId) {
    this.ensureBaseItem();
    this.ensureMutable();

    const rdate = cal.createRecurrenceDate();
    rdate.isNegative = true;
    rdate.date = aRecurrenceId.clone();

    this.removeExceptionFor(rdate.date);

    this.appendRecurrenceItem(rdate);
  },

  restoreOccurrenceAt(aRecurrenceId) {
    this.ensureBaseItem();
    this.ensureMutable();
    this.ensureSortedRecurrenceRules();

    for (let i = 0; i < this.mRecurrenceItems.length; i++) {
      const rdate = cal.wrapInstance(this.mRecurrenceItems[i], Ci.calIRecurrenceDate);
      if (rdate) {
        if (rdate.isNegative && rdate.date.compare(aRecurrenceId) == 0) {
          return this.deleteRecurrenceItemAt(i);
        }
      }
    }

    throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
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
  modifyException(anItem, aTakeOverOwnership) {
    this.ensureBaseItem();

    anItem = cal.unwrapInstance(anItem);

    if (
      anItem.parentItem.calendar != this.mBaseItem.calendar &&
      anItem.parentItem.id != this.mBaseItem.id
    ) {
      cal.ERROR("recurrenceInfo::addException: item parentItem != this.mBaseItem (calendar/id)!");
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    if (anItem.recurrenceId == null) {
      cal.ERROR("recurrenceInfo::addException: item with null recurrenceId!");
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
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

    const exKey = getRidKey(itemtoadd.recurrenceId);
    this.mExceptionMap[exKey] = itemtoadd;
  },

  getExceptionFor(aRecurrenceId) {
    this.ensureBaseItem();
    // Interface calIRecurrenceInfo specifies result be null if not found.
    // To avoid strict "reference to undefined property" warning, appending
    // "|| null" gives explicit result in case where property undefined
    // (or false, 0, null, or "", but here it should never be those values).
    return this.mExceptionMap[getRidKey(aRecurrenceId)] || null;
  },

  removeExceptionFor(aRecurrenceId) {
    this.ensureBaseItem();
    delete this.mExceptionMap[getRidKey(aRecurrenceId)];
  },

  getExceptionIds() {
    this.ensureBaseItem();

    const ids = [];
    for (const ex in this.mExceptionMap) {
      const item = this.mExceptionMap[ex];
      ids.push(item.recurrenceId);
    }
    return ids;
  },

  // changing the startdate of an item needs to take exceptions into account.
  // in case we're about to modify a parentItem (aka 'folded' item), we need
  // to modify the recurrenceId's of all possibly existing exceptions as well.
  onStartDateChange(aNewStartTime, aOldStartTime) {
    // passing null for the new starttime would indicate an error condition,
    // since having a recurrence without a starttime is invalid.
    cal.ASSERT(aNewStartTime, "invalid arg!", true);

    // no need to check for changes if there's no previous starttime.
    if (!aOldStartTime) {
      return;
    }

    // convert both dates to UTC since subtractDate is not timezone aware.
    const timeDiff = aNewStartTime
      .getInTimezone(cal.dtz.UTC)
      .subtractDate(aOldStartTime.getInTimezone(cal.dtz.UTC));

    const rdates = {};

    // take RDATE's and EXDATE's into account.
    const kCalIRecurrenceDate = Ci.calIRecurrenceDate;
    const ritems = this.getRecurrenceItems();
    for (let ritem of ritems) {
      const rDateInstance = cal.wrapInstance(ritem, kCalIRecurrenceDate);
      const rRuleInstance = cal.wrapInstance(ritem, Ci.calIRecurrenceRule);
      if (rDateInstance) {
        ritem = rDateInstance;
        const date = ritem.date;
        date.addDuration(timeDiff);
        if (!ritem.isNegative) {
          rdates[getRidKey(date)] = date;
        }
        ritem.date = date;
      } else if (rRuleInstance) {
        ritem = rRuleInstance;
        if (!ritem.isByCount) {
          const untilDate = ritem.untilDate;
          if (untilDate) {
            untilDate.addDuration(timeDiff);
            ritem.untilDate = untilDate;
          }
        }
      }
    }

    const startTimezone = aNewStartTime.timezone;
    const modifiedExceptions = [];
    for (const exid of this.getExceptionIds()) {
      let ex = this.getExceptionFor(exid);
      if (ex) {
        ex = ex.clone();
        // track RECURRENCE-IDs in DTSTART's or RDATE's timezone,
        // otherwise those won't match any longer w.r.t DST:
        let rid = ex.recurrenceId;
        const rdate = rdates[getRidKey(rid)];
        rid = rid.getInTimezone(rdate ? rdate.timezone : startTimezone);
        rid.addDuration(timeDiff);
        ex.recurrenceId = rid;
        cal.item.shiftOffset(ex, timeDiff);
        modifiedExceptions.push(ex);
        this.removeExceptionFor(exid);
      }
    }
    for (const modifiedEx of modifiedExceptions) {
      this.modifyException(modifiedEx, true);
    }
  },

  onIdChange(aNewId) {
    // patch all overridden items' id:
    for (const ex in this.mExceptionMap) {
      const item = this.mExceptionMap[ex];
      item.id = aNewId;
    }
  },
};
