/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CalAttachment: "resource:///modules/CalAttachment.sys.mjs",
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
  CalDateTime: "resource:///modules/CalDateTime.sys.mjs",
  CalDuration: "resource:///modules/CalDuration.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["calendar/calendar.ftl", "calendar/calendar-alarms.ftl"], true)
);

const ALARM_RELATED_ABSOLUTE = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
const ALARM_RELATED_START = Ci.calIAlarm.ALARM_RELATED_START;
const ALARM_RELATED_END = Ci.calIAlarm.ALARM_RELATED_END;

/**
 * Constructor for `calIAlarm` objects.
 *
 * @class
 * @implements {calIAlarm}
 * @param {string} [icalString] - Optional iCal string for initializing existing alarms.
 */
export function CalAlarm(icalString) {
  this.wrappedJSObject = this;
  this.mProperties = new Map();
  this.mPropertyParams = {};
  this.mAttendees = [];
  this.mAttachments = [];
  if (icalString) {
    this.icalString = icalString;
  }
}

CalAlarm.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIAlarm"]),
  classID: Components.ID("{b8db7c7f-c168-4e11-becb-f26c1c4f5f8f}"),

  mProperties: null,
  mPropertyParams: null,
  mAction: null,
  mAbsoluteDate: null,
  mOffset: null,
  mDuration: null,
  mAttendees: null,
  mAttachments: null,
  mSummary: null,
  mDescription: null,
  mLastAck: null,
  mImmutable: false,
  mRelated: 0,
  mRepeat: 0,

  /**
   * calIAlarm
   */

  ensureMutable() {
    if (this.mImmutable) {
      throw Components.Exception("", Cr.NS_ERROR_OBJECT_IS_IMMUTABLE);
    }
  },

  get isMutable() {
    return !this.mImmutable;
  },

  makeImmutable() {
    if (this.mImmutable) {
      return;
    }

    const objectMembers = ["mAbsoluteDate", "mOffset", "mDuration", "mLastAck"];
    for (const member of objectMembers) {
      if (this[member] && this[member].isMutable) {
        this[member].makeImmutable();
      }
    }

    // Properties
    for (const propval of this.mProperties.values()) {
      if (propval?.isMutable) {
        propval.makeImmutable();
      }
    }

    this.mImmutable = true;
  },

  clone() {
    const cloned = new CalAlarm();

    cloned.mImmutable = false;

    const simpleMembers = ["mAction", "mSummary", "mDescription", "mRelated", "mRepeat"];

    const arrayMembers = ["mAttendees", "mAttachments"];

    const objectMembers = ["mAbsoluteDate", "mOffset", "mDuration", "mLastAck"];

    for (const member of simpleMembers) {
      cloned[member] = this[member];
    }

    for (const member of arrayMembers) {
      const newArray = [];
      for (const oldElem of this[member]) {
        newArray.push(oldElem.clone());
      }
      cloned[member] = newArray;
    }

    for (const member of objectMembers) {
      if (this[member] && this[member].clone) {
        cloned[member] = this[member].clone();
      } else {
        cloned[member] = this[member];
      }
    }

    // X-Props
    cloned.mProperties = new Map();
    for (let [name, value] of this.mProperties.entries()) {
      if (value instanceof lazy.CalDateTime || value instanceof Ci.calIDateTime) {
        value = value.clone();
      }

      cloned.mProperties.set(name, value);

      const propBucket = this.mPropertyParams[name];
      if (propBucket) {
        const newBucket = {};
        for (const param in propBucket) {
          newBucket[param] = propBucket[param];
        }
        cloned.mPropertyParams[name] = newBucket;
      }
    }
    return cloned;
  },

  get related() {
    return this.mRelated;
  },
  set related(aValue) {
    this.ensureMutable();
    switch (aValue) {
      case ALARM_RELATED_ABSOLUTE:
        this.mOffset = null;
        break;
      case ALARM_RELATED_START:
      case ALARM_RELATED_END:
        this.mAbsoluteDate = null;
        break;
    }

    this.mRelated = aValue;
  },

  get action() {
    return this.mAction || "DISPLAY";
  },
  set action(aValue) {
    this.ensureMutable();
    this.mAction = aValue;
  },

  get description() {
    if (this.action == "AUDIO") {
      return null;
    }
    return this.mDescription;
  },
  set description(aValue) {
    this.ensureMutable();
    this.mDescription = aValue;
  },

  get summary() {
    if (this.mAction == "DISPLAY" || this.mAction == "AUDIO") {
      return null;
    }
    return this.mSummary;
  },
  set summary(aValue) {
    this.ensureMutable();
    this.mSummary = aValue;
  },

  get offset() {
    return this.mOffset;
  },
  set offset(aValue) {
    if (aValue && !(aValue instanceof lazy.CalDuration) && !(aValue instanceof Ci.calIDuration)) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }
    if (this.related != ALARM_RELATED_START && this.related != ALARM_RELATED_END) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }
    this.ensureMutable();
    this.mOffset = aValue;
  },

  get alarmDate() {
    return this.mAbsoluteDate;
  },
  set alarmDate(aValue) {
    if (aValue && !(aValue instanceof lazy.CalDateTime) && !(aValue instanceof Ci.calIDateTime)) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }
    if (this.related != ALARM_RELATED_ABSOLUTE) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }
    this.ensureMutable();
    this.mAbsoluteDate = aValue;
  },

  get repeat() {
    if (!this.mDuration) {
      return 0;
    }
    return this.mRepeat || 0;
  },
  set repeat(aValue) {
    this.ensureMutable();
    if (aValue === null) {
      this.mRepeat = null;
    } else {
      this.mRepeat = parseInt(aValue, 10);
      if (isNaN(this.mRepeat)) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
    }
  },

  get repeatOffset() {
    if (!this.mRepeat) {
      return null;
    }
    return this.mDuration;
  },
  set repeatOffset(aValue) {
    this.ensureMutable();
    if (
      aValue !== null &&
      !(aValue instanceof lazy.CalDuration) &&
      !(aValue instanceof Ci.calIDuration)
    ) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }
    this.mDuration = aValue;
  },

  get repeatDate() {
    if (
      this.related != ALARM_RELATED_ABSOLUTE ||
      !this.mAbsoluteDate ||
      !this.mRepeat ||
      !this.mDuration
    ) {
      return null;
    }

    const alarmDate = this.mAbsoluteDate.clone();

    // All Day events are handled as 00:00:00
    alarmDate.isDate = false;
    alarmDate.addDuration(this.mDuration);
    return alarmDate;
  },

  getAttendees() {
    let attendees;
    if (this.action == "AUDIO" || this.action == "DISPLAY") {
      attendees = [];
    } else {
      attendees = this.mAttendees.concat([]);
    }
    return attendees;
  },

  addAttendee(aAttendee) {
    // Make sure its not duplicate
    this.deleteAttendee(aAttendee);

    // Now check if its valid
    if (this.action == "AUDIO" || this.action == "DISPLAY") {
      throw new Error("Alarm type AUDIO/DISPLAY may not have attendees");
    }

    // And add it (again)
    this.mAttendees.push(aAttendee);
  },

  deleteAttendee(aAttendee) {
    const deleteId = aAttendee.id;
    for (let i = 0; i < this.mAttendees.length; i++) {
      if (this.mAttendees[i].id == deleteId) {
        this.mAttendees.splice(i, 1);
        break;
      }
    }
  },

  clearAttendees() {
    this.mAttendees = [];
  },

  getAttachments() {
    let attachments;
    if (this.action == "AUDIO") {
      attachments = this.mAttachments.length ? [this.mAttachments[0]] : [];
    } else if (this.action == "DISPLAY") {
      attachments = [];
    } else {
      attachments = this.mAttachments.concat([]);
    }
    return attachments;
  },

  addAttachment(aAttachment) {
    // Make sure its not duplicate
    this.deleteAttachment(aAttachment);

    // Now check if its valid
    if (this.action == "AUDIO" && this.mAttachments.length) {
      throw new Error("Alarm type AUDIO may only have one attachment");
    } else if (this.action == "DISPLAY") {
      throw new Error("Alarm type DISPLAY may not have attachments");
    }

    // And add it (again)
    this.mAttachments.push(aAttachment);
  },

  deleteAttachment(aAttachment) {
    const deleteHash = aAttachment.hashId;
    for (let i = 0; i < this.mAttachments.length; i++) {
      if (this.mAttachments[i].hashId == deleteHash) {
        this.mAttachments.splice(i, 1);
        break;
      }
    }
  },

  clearAttachments() {
    this.mAttachments = [];
  },

  get icalString() {
    const comp = this.icalComponent;
    return comp ? comp.serializeToICS() : "";
  },
  set icalString(val) {
    this.ensureMutable();
    this.icalComponent = cal.icsService.parseICS(val);
  },

  promotedProps: {
    ACTION: "action",
    TRIGGER: "offset",
    REPEAT: "repeat",
    DURATION: "duration",
    SUMMARY: "summary",
    DESCRIPTION: "description",
    "X-MOZ-LASTACK": "lastAck",

    // These have complex setters and will be ignored in setProperty
    ATTACH: true,
    ATTENDEE: true,
  },

  get icalComponent() {
    const comp = cal.icsService.createIcalComponent("VALARM");

    // Set up action (REQUIRED)
    const actionProp = cal.icsService.createIcalProperty("ACTION");
    actionProp.value = this.action;
    comp.addProperty(actionProp);

    // Set up trigger (REQUIRED)
    const triggerProp = cal.icsService.createIcalProperty("TRIGGER");
    if (this.related == ALARM_RELATED_ABSOLUTE && this.mAbsoluteDate) {
      // Set the trigger to a specific datetime
      triggerProp.setParameter("VALUE", "DATE-TIME");
      triggerProp.valueAsDatetime = this.mAbsoluteDate.getInTimezone(cal.dtz.UTC);
    } else if (this.related != ALARM_RELATED_ABSOLUTE && this.mOffset) {
      triggerProp.valueAsIcalString = this.mOffset.icalString;
      if (this.related == ALARM_RELATED_END) {
        // An alarm related to the end of the event.
        triggerProp.setParameter("RELATED", "END");
      }
    } else {
      // No offset or absolute date is not valid.
      throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
    }
    comp.addProperty(triggerProp);

    // Set up repeat and duration (OPTIONAL, but if one exists, the other
    // MUST also exist)
    if (this.repeat && this.repeatOffset) {
      const repeatProp = cal.icsService.createIcalProperty("REPEAT");
      const durationProp = cal.icsService.createIcalProperty("DURATION");

      repeatProp.value = this.repeat;
      durationProp.valueAsIcalString = this.repeatOffset.icalString;

      comp.addProperty(repeatProp);
      comp.addProperty(durationProp);
    }

    // Set up attendees (REQUIRED for EMAIL action)
    /* TODO should we be strict here?
        if (this.action == "EMAIL" && !this.getAttendees().length) {
            throw Cr.NS_ERROR_NOT_INITIALIZED;
        } */
    for (const attendee of this.getAttendees()) {
      comp.addProperty(attendee.icalProperty);
    }

    /* TODO should we be strict here?
        if (this.action == "EMAIL" && !this.attachments.length) {
            throw Cr.NS_ERROR_NOT_INITIALIZED;
        } */

    for (const attachment of this.getAttachments()) {
      comp.addProperty(attachment.icalProperty);
    }

    // Set up summary (REQUIRED for EMAIL)
    if (this.summary || this.action == "EMAIL") {
      const summaryProp = cal.icsService.createIcalProperty("SUMMARY");
      // Summary needs to have a non-empty value
      summaryProp.value = this.summary || lazy.l10n.formatValueSync("alarm-default-summary");
      comp.addProperty(summaryProp);
    }

    // Set up the description (REQUIRED for DISPLAY and EMAIL)
    if (this.description || this.action == "DISPLAY" || this.action == "EMAIL") {
      const descriptionProp = cal.icsService.createIcalProperty("DESCRIPTION");
      // description needs to have a non-empty value
      descriptionProp.value =
        this.description || lazy.l10n.formatValueSync("alarm-default-description");
      comp.addProperty(descriptionProp);
    }

    // Set up lastAck
    if (this.lastAck) {
      const lastAckProp = cal.icsService.createIcalProperty("X-MOZ-LASTACK");
      lastAckProp.value = this.lastAck;
      comp.addProperty(lastAckProp);
    }

    // Set up X-Props. mProperties contains only non-promoted props
    // eslint-disable-next-line array-bracket-spacing
    for (const [propName, propValue] of this.mProperties.entries()) {
      const icalprop = cal.icsService.createIcalProperty(propName);
      icalprop.value = propValue;

      // Add parameters
      const propBucket = this.mPropertyParams[propName];
      if (propBucket) {
        for (const paramName in propBucket) {
          try {
            icalprop.setParameter(paramName, propBucket[paramName]);
          } catch (e) {
            if (e.result == Cr.NS_ERROR_ILLEGAL_VALUE) {
              // Illegal values should be ignored, but we could log them if
              // the user has enabled logging.
              cal.LOG(
                "Warning: Invalid alarm parameter value " + paramName + "=" + propBucket[paramName]
              );
            } else {
              throw e;
            }
          }
        }
      }
      comp.addProperty(icalprop);
    }
    return comp;
  },
  set icalComponent(aComp) {
    this.ensureMutable();
    if (!aComp || aComp.componentType != "VALARM") {
      // Invalid Component
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    const actionProp = aComp.getFirstProperty("ACTION");
    const triggerProp = aComp.getFirstProperty("TRIGGER");
    const repeatProp = aComp.getFirstProperty("REPEAT");
    const durationProp = aComp.getFirstProperty("DURATION");
    const summaryProp = aComp.getFirstProperty("SUMMARY");
    const descriptionProp = aComp.getFirstProperty("DESCRIPTION");
    const lastAckProp = aComp.getFirstProperty("X-MOZ-LASTACK");

    if (actionProp) {
      this.action = actionProp.value;
    } else {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    if (triggerProp) {
      if (triggerProp.getParameter("VALUE") == "DATE-TIME") {
        this.mAbsoluteDate = triggerProp.valueAsDatetime;
        this.related = ALARM_RELATED_ABSOLUTE;
      } else {
        this.mOffset = cal.createDuration(triggerProp.valueAsIcalString);

        const related = triggerProp.getParameter("RELATED");
        this.related = related == "END" ? ALARM_RELATED_END : ALARM_RELATED_START;
      }
    } else {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    if (durationProp && repeatProp) {
      this.repeatOffset = cal.createDuration(durationProp.valueAsIcalString);
      this.repeat = repeatProp.value;
    } else if (durationProp || repeatProp) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    } else {
      this.repeatOffset = null;
      this.repeat = 0;
    }

    // Set up attendees
    this.clearAttendees();
    for (const attendeeProp of cal.iterate.icalProperty(aComp, "ATTENDEE")) {
      const attendee = new lazy.CalAttendee();
      attendee.icalProperty = attendeeProp;
      this.addAttendee(attendee);
    }

    // Set up attachments
    this.clearAttachments();
    for (const attachProp of cal.iterate.icalProperty(aComp, "ATTACH")) {
      const attach = new lazy.CalAttachment();
      attach.icalProperty = attachProp;
      this.addAttachment(attach);
    }

    // Set up summary
    this.summary = summaryProp ? summaryProp.value : null;

    // Set up description
    this.description = descriptionProp ? descriptionProp.value : null;

    // Set up the alarm lastack. We can't use valueAsDatetime here since
    // the default for an X-Prop is TEXT and in older versions we didn't set
    // VALUE=DATE-TIME.
    this.lastAck = lastAckProp ? cal.createDateTime(lastAckProp.valueAsIcalString) : null;

    this.mProperties = new Map();
    this.mPropertyParams = {};

    // Other properties
    for (const prop of cal.iterate.icalProperty(aComp)) {
      if (!this.promotedProps[prop.propertyName]) {
        this.setProperty(prop.propertyName, prop.value);

        for (const [paramName, param] of cal.iterate.icalParameter(prop)) {
          if (!(prop.propertyName in this.mPropertyParams)) {
            this.mPropertyParams[prop.propertyName] = {};
          }
          this.mPropertyParams[prop.propertyName][paramName] = param;
        }
      }
    }
  },

  hasProperty(aName) {
    return this.getProperty(aName.toUpperCase()) != null;
  },

  getProperty(aName) {
    const name = aName.toUpperCase();
    if (name in this.promotedProps) {
      if (this.promotedProps[name] === true) {
        // Complex promoted props will return undefined
        return undefined;
      }
      return this[this.promotedProps[name]];
    }
    return this.mProperties.get(name);
  },

  setProperty(aName, aValue) {
    this.ensureMutable();
    const name = aName.toUpperCase();
    if (name in this.promotedProps) {
      if (this.promotedProps[name] === true) {
        cal.WARN(`Attempted to set complex property ${name} to a simple value ${aValue}`);
      } else {
        this[this.promotedProps[name]] = aValue;
      }
    } else {
      this.mProperties.set(name, aValue);
    }
    return aValue;
  },

  deleteProperty(aName) {
    this.ensureMutable();
    const name = aName.toUpperCase();
    if (name in this.promotedProps) {
      this[this.promotedProps[name]] = null;
    } else {
      this.mProperties.delete(name);
    }
  },

  get properties() {
    return [...this.mProperties.entries()];
  },

  toString(aItem) {
    function alarmString(aPrefix) {
      if (!aItem || aItem.isEvent()) {
        return `${aPrefix}-event`;
      } else if (aItem.isTodo()) {
        return `${aPrefix}-task`;
      }
      return aPrefix;
    }

    if (this.related == ALARM_RELATED_ABSOLUTE && this.mAbsoluteDate) {
      // this is an absolute alarm. Use the calendar default timezone and
      // format it.
      const formatDate = this.mAbsoluteDate.getInTimezone(cal.dtz.defaultTimezone);
      return cal.dtz.formatter.formatDateTime(formatDate);
    } else if (this.related != ALARM_RELATED_ABSOLUTE && this.mOffset) {
      // Relative alarm length
      let alarmlen = Math.abs(this.mOffset.inSeconds / 60);
      if (alarmlen == 0) {
        // No need to get the other information if the alarm is at the start
        // of the event/task.
        if (this.related == ALARM_RELATED_START) {
          return lazy.l10n.formatValueSync(alarmString("reminder-title-at-start"));
        } else if (this.related == ALARM_RELATED_END) {
          return lazy.l10n.formatValueSync(alarmString("reminder-title-at-end"));
        }
      }

      let unit;
      if (alarmlen % 1440 == 0) {
        // Alarm is in days
        unit = "unit-days";
        alarmlen /= 1440;
      } else if (alarmlen % 60 == 0) {
        unit = "unit-hours";
        alarmlen /= 60;
      } else {
        unit = "unit-minutes";
      }
      const unitString = lazy.l10n.formatValueSync(unit, { count: alarmlen });
      let originStringName = "reminder-custom-origin";

      // Origin
      switch (this.related) {
        case ALARM_RELATED_START:
          originStringName += "-begin";
          break;
        case ALARM_RELATED_END:
          originStringName += "-end";
          break;
      }

      if (this.offset.isNegative) {
        originStringName += "-before";
      } else {
        originStringName += "-after";
      }

      const originString = lazy.l10n.formatValueSync(alarmString(originStringName));
      return lazy.l10n.formatValueSync("reminder-custom-title", {
        unit: unitString,
        reminderCustomOrigin: originString,
      });
    }
    // This is an incomplete alarm, but then again we should never reach
    // this state.
    return "[Incomplete calIAlarm]";
  },
};
