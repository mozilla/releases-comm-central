/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ICAL, unwrapSetter } from "resource:///modules/calendar/Ical.sys.mjs";

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CalDateTime: "resource:///modules/CalDateTime.sys.mjs",
  CalDuration: "resource:///modules/CalDuration.sys.mjs",
  CalTimezone: "resource:///modules/CalTimezone.sys.mjs",
});

export function CalIcalProperty(innerObject) {
  this.innerObject = innerObject || new ICAL.Property();
  this.wrappedJSObject = this;
}

CalIcalProperty.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIIcalProperty"]),
  classID: Components.ID("{423ac3f0-f612-48b3-953f-47f7f8fd705b}"),

  get icalString() {
    return this.innerObject.toICALString() + ICAL.newLineChar;
  },
  get icalProperty() {
    return this.innerObject;
  },
  set icalProperty(val) {
    this.innerObject = val;
  },

  get parent() {
    return this.innerObject.parent;
  },
  toString() {
    return this.innerObject.toICAL();
  },

  get value() {
    // Unescaped value for properties of TEXT, escaped otherwise.
    if (this.innerObject.type == "text") {
      return this.innerObject.getValues().join(",");
    }
    return this.valueAsIcalString;
  },
  set value(val) {
    // Unescaped value for properties of TEXT, escaped otherwise.
    if (this.innerObject.type == "text") {
      this.innerObject.setValue(val);
      return;
    }
    this.valueAsIcalString = val;
  },

  get valueAsIcalString() {
    const propertyStr = this.innerObject.toICALString();
    if (propertyStr.match(/:/g).length == 1) {
      // For property containing only one colon, e.g. `GEO:latitude;longitude`,
      // the left hand side must be the property name, the right hand side must
      // be property value.
      return propertyStr.slice(propertyStr.indexOf(":") + 1);
    }
    // For property containing many or no colons, retrieve the property value
    // according to its type. An example is
    // `ATTENDEE;MEMBER="mailto:foo@example.com": mailto:bar@example.com`
    const type = this.innerObject.type;
    return this.innerObject
      .getValues()
      .map(val => {
        if (type == "text") {
          return ICAL.stringify.value(val, type, ICAL.design.icalendar);
        } else if (typeof val == "number" || typeof val == "string") {
          return val;
        } else if ("toICALString" in val) {
          return val.toICALString();
        }
        return val.toString();
      })
      .join(",");
  },
  set valueAsIcalString(val) {
    const mockLine = this.propertyName + ":" + val;
    const prop = ICAL.Property.fromString(mockLine, ICAL.design.icalendar);

    if (this.innerObject.isMultiValue) {
      this.innerObject.setValues(prop.getValues());
    } else {
      this.innerObject.setValue(prop.getFirstValue());
    }
  },

  get valueAsDatetime() {
    const val = this.innerObject.getFirstValue();
    const isIcalTime =
      val && typeof val == "object" && "icalclass" in val && val.icalclass == "icaltime";
    return isIcalTime ? new lazy.CalDateTime(val) : null;
  },
  set valueAsDatetime(rawval) {
    unwrapSetter(
      ICAL.Time,
      rawval,
      function (val) {
        if (
          val &&
          val.zone &&
          val.zone != ICAL.Timezone.utcTimezone &&
          val.zone != ICAL.Timezone.localTimezone
        ) {
          this.innerObject.setParameter("TZID", val.zone.tzid);
          if (this.parent) {
            const tzref = new lazy.CalTimezone(val.zone);
            this.parent.addTimezoneReference(tzref);
          }
        } else {
          this.innerObject.removeParameter("TZID");
        }
        this.innerObject.setValue(val);
      },
      this
    );
  },

  get propertyName() {
    return this.innerObject.name.toUpperCase();
  },

  getParameter(name) {
    // Unfortunately getting the "VALUE" parameter won't work, since in
    // jCal it has been translated to the value type id.
    if (name == "VALUE") {
      const defaultType = this.innerObject.getDefaultType();
      if (this.innerObject.type != defaultType) {
        // Default type doesn't match object type, so we have a VALUE
        // parameter
        return this.innerObject.type.toUpperCase();
      }
    }

    return this.innerObject.getParameter(name.toLowerCase());
  },
  setParameter(name, value) {
    // Similar problems for setting the value parameter. Calendar code
    // expects setting the value parameter to just change the value type
    // and attempt to use the previous value as the new one. To do this in
    // ICAL.js we need to save the value, reset the type and then try to
    // set the value again.
    if (name == "VALUE") {
      let oldValues;
      const type = this.innerObject.type;
      const designSet = this.innerObject._designSet;

      const wasMultiValue = this.innerObject.isMultiValue;
      if (wasMultiValue) {
        oldValues = this.innerObject.getValues();
      } else {
        const oldValue = this.innerObject.getFirstValue();
        oldValues = oldValue ? [oldValue] : [];
      }

      this.innerObject.resetType(value.toLowerCase());
      try {
        oldValues = oldValues.map(oldValue => {
          const strvalue = ICAL.stringify.value(oldValue.toString(), type, designSet);
          return ICAL.parse._parseValue(strvalue, value, designSet);
        });
      } catch (e) {
        // If there was an error reparsing the value, then just keep it
        // empty.
        oldValues = null;
      }

      if (oldValues && oldValues.length) {
        if (wasMultiValue && this.innerObject.isMultiValue) {
          this.innerObject.setValues(oldValues);
        } else {
          this.innerObject.setValue(oldValues.join(","));
        }
      }
    } else {
      this.innerObject.setParameter(name.toLowerCase(), value);
    }
  },
  removeParameter(name) {
    // Again, VALUE needs special handling. Removing the value parameter is
    // kind of like resetting it to the default type. So find out the
    // default type and then set the value parameter to it.
    if (name == "VALUE") {
      const propname = this.innerObject.name.toLowerCase();
      if (propname in ICAL.design.icalendar.property) {
        const details = ICAL.design.icalendar.property[propname];
        if ("defaultType" in details) {
          this.setParameter("VALUE", details.defaultType);
        }
      }
    } else {
      this.innerObject.removeParameter(name.toLowerCase());
    }
  },

  clearXParameters() {
    cal.WARN(
      "calIICSService::clearXParameters is no longer implemented, please use removeParameter"
    );
  },

  paramIterator: null,
  getFirstParameterName() {
    const innerObject = this.innerObject;
    this.paramIterator = (function* () {
      const defaultType = innerObject.getDefaultType();
      if (defaultType != innerObject.type) {
        yield "VALUE";
      }

      const paramNames = Object.keys(innerObject.jCal[1] || {});
      for (const name of paramNames) {
        yield name.toUpperCase();
      }
    })();
    return this.getNextParameterName();
  },

  getNextParameterName() {
    if (this.paramIterator) {
      const next = this.paramIterator.next();
      if (next.done) {
        this.paramIterator = null;
      }

      return next.value;
    }
    return this.getFirstParameterName();
  },
};

function calIcalComponent(innerObject) {
  this.innerObject = innerObject || new ICAL.Component();
  this.wrappedJSObject = this;
  this.mReferencedZones = {};
}

calIcalComponent.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIIcalComponent"]),
  classID: Components.ID("{51ac96fd-1279-4439-a85b-6947b37f4cea}"),

  clone() {
    return new calIcalComponent(new ICAL.Component(this.innerObject.toJSON()));
  },

  get parent() {
    return this.innerObject.parent ? new calIcalComponent(this.innerObject.parent) : null;
  },

  get icalTimezone() {
    return this.innerObject.name == "vtimezone" ? this.innerObject : null;
  },
  get icalComponent() {
    return this.innerObject;
  },
  set icalComponent(val) {
    this.innerObject = val;
  },

  componentIterator: null,
  getFirstSubcomponent(kind) {
    if (kind == "ANY") {
      kind = null;
    } else if (kind) {
      kind = kind.toLowerCase();
    }
    const innerObject = this.innerObject;
    this.componentIterator = (function* () {
      const comps = innerObject.getAllSubcomponents(kind);
      if (comps) {
        for (const comp of comps) {
          yield new calIcalComponent(comp);
        }
      }
    })();
    return this.getNextSubcomponent(kind);
  },
  getNextSubcomponent(kind) {
    if (this.componentIterator) {
      const next = this.componentIterator.next();
      if (next.done) {
        this.componentIterator = null;
      }

      return next.value;
    }
    return this.getFirstSubcomponent(kind);
  },

  get componentType() {
    return this.innerObject.name.toUpperCase();
  },

  get uid() {
    return this.innerObject.getFirstPropertyValue("uid");
  },
  set uid(val) {
    this.innerObject.updatePropertyWithValue("uid", val);
  },

  get prodid() {
    return this.innerObject.getFirstPropertyValue("prodid");
  },
  set prodid(val) {
    this.innerObject.updatePropertyWithValue("prodid", val);
  },

  get version() {
    return this.innerObject.getFirstPropertyValue("version");
  },
  set version(val) {
    this.innerObject.updatePropertyWithValue("version", val);
  },

  get method() {
    return this.innerObject.getFirstPropertyValue("method");
  },
  set method(val) {
    this.innerObject.updatePropertyWithValue("method", val);
  },

  get status() {
    return this.innerObject.getFirstPropertyValue("status");
  },
  set status(val) {
    this.innerObject.updatePropertyWithValue("status", val);
  },

  get summary() {
    return this.innerObject.getFirstPropertyValue("summary");
  },
  set summary(val) {
    this.innerObject.updatePropertyWithValue("summary", val);
  },

  get description() {
    return this.innerObject.getFirstPropertyValue("description");
  },
  set description(val) {
    this.innerObject.updatePropertyWithValue("description", val);
  },

  get location() {
    return this.innerObject.getFirstPropertyValue("location");
  },
  set location(val) {
    this.innerObject.updatePropertyWithValue("location", val);
  },

  get categories() {
    return this.innerObject.getFirstPropertyValue("categories");
  },
  set categories(val) {
    this.innerObject.updatePropertyWithValue("categories", val);
  },

  get URL() {
    return this.innerObject.getFirstPropertyValue("url");
  },
  set URL(val) {
    this.innerObject.updatePropertyWithValue("url", val);
  },

  get priority() {
    // If there is no value for this integer property, then we must return
    // the designated INVALID_VALUE.
    const INVALID_VALUE = Ci.calIIcalComponent.INVALID_VALUE;
    const prop = this.innerObject.getFirstProperty("priority");
    const val = prop ? prop.getFirstValue() : null;
    return val === null ? INVALID_VALUE : val;
  },
  set priority(val) {
    this.innerObject.updatePropertyWithValue("priority", val);
  },

  _setTimeAttr(propName, val) {
    const prop = this.innerObject.updatePropertyWithValue(propName, val);
    if (
      val &&
      val.zone &&
      val.zone != ICAL.Timezone.utcTimezone &&
      val.zone != ICAL.Timezone.localTimezone
    ) {
      prop.setParameter("TZID", val.zone.tzid);
      this.addTimezoneReference(new lazy.CalTimezone(val.zone));
    } else {
      prop.removeParameter("TZID");
    }
  },

  get startTime() {
    const val = this.innerObject.getFirstPropertyValue("dtstart");
    return val ? new lazy.CalDateTime(val) : null;
  },
  set startTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "dtstart"), this);
  },

  get endTime() {
    const val = this.innerObject.getFirstPropertyValue("dtend");
    return val ? new lazy.CalDateTime(val) : null;
  },
  set endTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "dtend"), this);
  },

  get duration() {
    const val = this.innerObject.getFirstPropertyValue("duration");
    return val ? new lazy.CalDuration(val) : null;
  },

  get dueTime() {
    const val = this.innerObject.getFirstPropertyValue("due");
    return val ? new lazy.CalDateTime(val) : null;
  },
  set dueTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "due"), this);
  },

  get stampTime() {
    const val = this.innerObject.getFirstPropertyValue("dtstamp");
    return val ? new lazy.CalDateTime(val) : null;
  },
  set stampTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "dtstamp"), this);
  },

  get createdTime() {
    const val = this.innerObject.getFirstPropertyValue("created");
    return val ? new lazy.CalDateTime(val) : null;
  },
  set createdTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "created"), this);
  },

  get completedTime() {
    const val = this.innerObject.getFirstPropertyValue("completed");
    return val ? new lazy.CalDateTime(val) : null;
  },
  set completedTime(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "completed"), this);
  },

  get lastModified() {
    const val = this.innerObject.getFirstPropertyValue("last-modified");
    return val ? new lazy.CalDateTime(val) : null;
  },
  set lastModified(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "last-modified"), this);
  },

  get recurrenceId() {
    const val = this.innerObject.getFirstPropertyValue("recurrence-id");
    return val ? new lazy.CalDateTime(val) : null;
  },
  set recurrenceId(val) {
    unwrapSetter(ICAL.Time, val, this._setTimeAttr.bind(this, "recurrence-id"), this);
  },

  serializeToICS() {
    return this.innerObject.toString() + ICAL.newLineChar;
  },
  toString() {
    return this.innerObject.toString();
  },

  addSubcomponent(comp) {
    comp.getReferencedTimezones().forEach(this.addTimezoneReference, this);
    const jscomp = comp.wrappedJSObject.innerObject;
    this.innerObject.addSubcomponent(jscomp);
  },

  propertyIterator: null,
  getFirstProperty(kind) {
    if (kind == "ANY") {
      kind = null;
    } else if (kind) {
      kind = kind.toLowerCase();
    }
    const innerObject = this.innerObject;
    this.propertyIterator = (function* () {
      const props = innerObject.getAllProperties(kind);
      if (!props) {
        return;
      }
      for (const prop of props) {
        const hell = prop.getValues();
        if (hell.length > 1) {
          // Uh oh, multiple property values. Our code expects each as one
          // property. I hate API incompatibility!
          for (const devil of hell) {
            const thisprop = new ICAL.Property(prop.toJSON(), prop.parent);
            thisprop.removeAllValues();
            thisprop.setValue(devil);
            yield new CalIcalProperty(thisprop);
          }
        } else {
          yield new CalIcalProperty(prop);
        }
      }
    })();

    return this.getNextProperty(kind);
  },

  getNextProperty(kind) {
    if (this.propertyIterator) {
      const next = this.propertyIterator.next();
      if (next.done) {
        this.propertyIterator = null;
      }

      return next.value;
    }
    return this.getFirstProperty(kind);
  },

  _getNextParentVCalendar() {
    let vcalendar = this; // eslint-disable-line consistent-this
    while (vcalendar && vcalendar.componentType != "VCALENDAR") {
      vcalendar = vcalendar.parent;
    }
    return vcalendar || this;
  },

  addProperty(prop) {
    try {
      const datetime = prop.valueAsDatetime;
      if (datetime && datetime.timezone) {
        this._getNextParentVCalendar().addTimezoneReference(datetime.timezone);
      }
    } catch (e) {
      // If there is an issue adding the timezone reference, don't make
      // that break adding the property.
    }

    const jsprop = prop.wrappedJSObject.innerObject;
    this.innerObject.addProperty(jsprop);
  },

  addTimezoneReference(timezone) {
    if (timezone) {
      if (!(timezone.tzid in this.mReferencedZones) && this.componentType == "VCALENDAR") {
        const comp = timezone.icalComponent;
        if (comp) {
          this.addSubcomponent(comp);
        }
      }

      this.mReferencedZones[timezone.tzid] = timezone;
    }
  },

  getReferencedTimezones() {
    return Object.keys(this.mReferencedZones).map(timezone => this.mReferencedZones[timezone]);
  },

  serializeToICSStream() {
    const data = this.innerObject.toString();
    const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
      Ci.nsIStringInputStream
    );
    stream.setUTF8Data(data, data.length);
    return stream;
  },
};

export function CalICSService() {
  this.wrappedJSObject = this;
}

CalICSService.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIICSService"]),
  classID: Components.ID("{c61cb903-4408-41b3-bc22-da0b27efdfe1}"),

  parseICS(serialized) {
    const comp = ICAL.parse(serialized);
    return new calIcalComponent(new ICAL.Component(comp));
  },

  parseICSAsync(serialized, listener) {
    // XXX: should we cache the worker?
    const worker = new ChromeWorker("resource:///modules/CalICSService.worker.mjs", {
      type: "module",
    });
    worker.onmessage = function (event) {
      const icalComp = new calIcalComponent(new ICAL.Component(event.data));
      listener.onParsingComplete(Cr.OK, icalComp);
    };
    worker.onerror = function (event) {
      cal.ERROR(`Parsing failed; ${event.message}. ICS data:\n${serialized}`);
      listener.onParsingComplete(Cr.NS_ERROR_FAILURE, null);
    };
    worker.postMessage(serialized);
  },

  createIcalComponent(kind) {
    return new calIcalComponent(new ICAL.Component(kind.toLowerCase()));
  },

  createIcalProperty(kind) {
    return new CalIcalProperty(new ICAL.Property(kind.toLowerCase()));
  },

  createIcalPropertyFromString(str) {
    return new CalIcalProperty(ICAL.Property.fromString(str.trim(), ICAL.design.icalendar));
  },
};
