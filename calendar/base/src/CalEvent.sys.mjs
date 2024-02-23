/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calItemBase.js */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

Services.scriptloader.loadSubScript("resource:///components/calItemBase.js");

/**
 * Constructor for `calIEvent` objects.
 *
 * @class
 * @implements {calIEvent}
 * @param {string} [icalString] - Optional iCal string for initializing existing events.
 */
export function CalEvent(icalString) {
  this.initItemBase();

  this.eventPromotedProps = {
    DTSTART: true,
    DTEND: true,
    __proto__: this.itemBasePromotedProps,
  };

  if (icalString) {
    this.icalString = icalString;
  }
}

var calEventClassID = Components.ID("{974339d5-ab86-4491-aaaf-2b2ca177c12b}");
var calEventInterfaces = [Ci.calIItemBase, Ci.calIEvent, Ci.calIInternalShallowCopy];
CalEvent.prototype = {
  __proto__: calItemBase.prototype,

  classID: calEventClassID,
  QueryInterface: cal.generateQI(["calIItemBase", "calIEvent", "calIInternalShallowCopy"]),
  classInfo: cal.generateCI({
    classID: calEventClassID,
    contractID: "@mozilla.org/calendar/event;1",
    classDescription: "Calendar Event",
    interfaces: calEventInterfaces,
  }),

  cloneShallow(aNewParent) {
    const cloned = new CalEvent();
    this.cloneItemBaseInto(cloned, aNewParent);
    return cloned;
  },

  createProxy(aRecurrenceId) {
    cal.ASSERT(!this.mIsProxy, "Tried to create a proxy for an existing proxy!", true);

    const proxy = new CalEvent();

    // override proxy's DTSTART/DTEND/RECURRENCE-ID
    // before master is set (and item might get immutable):
    const endDate = aRecurrenceId.clone();
    endDate.addDuration(this.duration);
    proxy.endDate = endDate;
    proxy.startDate = aRecurrenceId;

    proxy.initializeProxy(this, aRecurrenceId);
    proxy.mDirty = false;

    return proxy;
  },

  makeImmutable() {
    this.makeItemBaseImmutable();
  },

  isEvent() {
    return true;
  },

  get duration() {
    if (this.endDate && this.startDate) {
      return this.endDate.subtractDate(this.startDate);
    }
    // Return a null-duration if we don't have an end date
    return cal.createDuration();
  },

  get recurrenceStartDate() {
    return this.startDate;
  },

  icsEventPropMap: [
    { cal: "DTSTART", ics: "startTime" },
    { cal: "DTEND", ics: "endTime" },
  ],

  set icalString(value) {
    this.icalComponent = cal.icsService.parseICS(value);
  },

  get icalString() {
    const calcomp = cal.icsService.createIcalComponent("VCALENDAR");
    cal.item.setStaticProps(calcomp);
    calcomp.addSubcomponent(this.icalComponent);
    return calcomp.serializeToICS();
  },

  get icalComponent() {
    const icalcomp = cal.icsService.createIcalComponent("VEVENT");
    this.fillIcalComponentFromBase(icalcomp);
    this.mapPropsToICS(icalcomp, this.icsEventPropMap);

    for (const [name, value] of this.properties) {
      try {
        // When deleting a property of an occurrence, the property is not deleted
        // but instead set to null, so we need to prevent adding those properties.
        const wasReset = this.mIsProxy && value === null;
        if (!this.eventPromotedProps[name] && !wasReset) {
          const icalprop = cal.icsService.createIcalProperty(name);
          icalprop.value = value;
          const propBucket = this.mPropertyParams[name];
          if (propBucket) {
            for (const paramName in propBucket) {
              try {
                icalprop.setParameter(paramName, propBucket[paramName]);
              } catch (e) {
                if (e.result == Cr.NS_ERROR_ILLEGAL_VALUE) {
                  // Illegal values should be ignored, but we could log them if
                  // the user has enabled logging.
                  cal.LOG(
                    "Warning: Invalid event parameter value " +
                      paramName +
                      "=" +
                      propBucket[paramName]
                  );
                } else {
                  throw e;
                }
              }
            }
          }
          icalcomp.addProperty(icalprop);
        }
      } catch (e) {
        cal.ERROR("failed to set " + name + " to " + value + ": " + e + "\n");
      }
    }
    return icalcomp;
  },

  eventPromotedProps: null,

  set icalComponent(event) {
    this.modify();
    if (event.componentType != "VEVENT") {
      event = event.getFirstSubcomponent("VEVENT");
      if (!event) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
    }

    this.mEndDate = undefined;
    this.setItemBaseFromICS(event);
    this.mapPropsFromICS(event, this.icsEventPropMap);

    this.importUnpromotedProperties(event, this.eventPromotedProps);

    // Importing didn't really change anything
    this.mDirty = false;
  },

  isPropertyPromoted(name) {
    // avoid strict undefined property warning
    return this.eventPromotedProps[name] || false;
  },

  set startDate(value) {
    this.modify();

    // We're about to change the start date of an item which probably
    // could break the associated calIRecurrenceInfo. We're calling
    // the appropriate method here to adjust the internal structure in
    // order to free clients from worrying about such details.
    if (this.parentItem == this) {
      const rec = this.recurrenceInfo;
      if (rec) {
        rec.onStartDateChange(value, this.startDate);
      }
    }

    this.setProperty("DTSTART", value);
  },

  get startDate() {
    return this.getProperty("DTSTART");
  },

  mEndDate: undefined,
  get endDate() {
    let endDate = this.mEndDate;
    if (endDate === undefined) {
      endDate = this.getProperty("DTEND");
      if (!endDate && this.startDate) {
        endDate = this.startDate.clone();
        const dur = this.getProperty("DURATION");
        if (dur) {
          // If there is a duration set on the event, calculate the right end time.
          endDate.addDuration(cal.createDuration(dur));
        } else if (endDate.isDate) {
          // If the start time is a date-time the event ends on the same calendar
          // date and time of day. If the start time is a date the events
          // non-inclusive end is the end of the calendar date.
          endDate.day += 1;
        }
      }
      this.mEndDate = endDate;
    }
    return endDate;
  },

  set endDate(value) {
    this.deleteProperty("DURATION"); // setting endDate once removes DURATION
    this.setProperty("DTEND", value);
    this.mEndDate = value;
  },
};
