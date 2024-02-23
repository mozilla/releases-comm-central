/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";
import { calItemBase, makeMemberAttrProperty } from "resource:///modules/CalItemBase.sys.mjs";

/**
 * Constructor for `calITodo` objects.
 *
 * @class
 * @implements {calITodo}
 * @param {string} [icalString] - Optional iCal string for initializing existing todos.
 */
export function CalTodo(icalString) {
  this.initItemBase();

  this.todoPromotedProps = {
    DTSTART: true,
    DTEND: true,
    DUE: true,
    COMPLETED: true,
    __proto__: this.itemBasePromotedProps,
  };

  if (icalString) {
    this.icalString = icalString;
  }

  // Set a default percentComplete if the icalString didn't already set it.
  if (!this.percentComplete) {
    this.percentComplete = 0;
  }
}

var calTodoClassID = Components.ID("{7af51168-6abe-4a31-984d-6f8a3989212d}");
var calTodoInterfaces = [Ci.calIItemBase, Ci.calITodo, Ci.calIInternalShallowCopy];
CalTodo.prototype = {
  __proto__: calItemBase.prototype,

  classID: calTodoClassID,
  QueryInterface: cal.generateQI(["calIItemBase", "calITodo", "calIInternalShallowCopy"]),
  classInfo: cal.generateCI({
    classID: calTodoClassID,
    contractID: "@mozilla.org/calendar/todo;1",
    classDescription: "Calendar Todo",
    interfaces: calTodoInterfaces,
  }),

  cloneShallow(aNewParent) {
    const cloned = new CalTodo();
    this.cloneItemBaseInto(cloned, aNewParent);
    return cloned;
  },

  createProxy(aRecurrenceId) {
    cal.ASSERT(!this.mIsProxy, "Tried to create a proxy for an existing proxy!", true);

    const proxy = new CalTodo();

    // override proxy's DTSTART/DUE/RECURRENCE-ID
    // before master is set (and item might get immutable):
    const duration = this.duration;
    if (duration) {
      const dueDate = aRecurrenceId.clone();
      dueDate.addDuration(duration);
      proxy.dueDate = dueDate;
    }
    proxy.entryDate = aRecurrenceId;

    proxy.initializeProxy(this, aRecurrenceId);
    proxy.mDirty = false;

    return proxy;
  },

  makeImmutable() {
    this.makeItemBaseImmutable();
  },

  isTodo() {
    return true;
  },

  get isCompleted() {
    return this.completedDate != null || this.percentComplete == 100 || this.status == "COMPLETED";
  },

  set isCompleted(completed) {
    if (completed) {
      if (!this.completedDate) {
        this.completedDate = cal.dtz.jsDateToDateTime(new Date());
      }
      this.status = "COMPLETED";
      this.percentComplete = 100;
    } else {
      this.deleteProperty("COMPLETED");
      this.deleteProperty("STATUS");
      this.deleteProperty("PERCENT-COMPLETE");
    }
  },

  get duration() {
    const dur = this.getProperty("DURATION");
    // pick up duration if available, otherwise calculate difference
    // between start and enddate
    if (dur) {
      return cal.createDuration(dur);
    }
    if (!this.entryDate || !this.dueDate) {
      return null;
    }
    return this.dueDate.subtractDate(this.entryDate);
  },

  set duration(value) {
    this.setProperty("DURATION", value);
  },

  get recurrenceStartDate() {
    // DTSTART is optional for VTODOs, so it's unclear if RRULE is allowed then,
    // so fallback to DUE if no DTSTART is present:
    return this.entryDate || this.dueDate;
  },

  icsEventPropMap: [
    { cal: "DTSTART", ics: "startTime" },
    { cal: "DUE", ics: "dueTime" },
    { cal: "COMPLETED", ics: "completedTime" },
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
    const icalcomp = cal.icsService.createIcalComponent("VTODO");
    this.fillIcalComponentFromBase(icalcomp);
    this.mapPropsToICS(icalcomp, this.icsEventPropMap);

    for (const [name, value] of this.properties) {
      try {
        // When deleting a property of an occurrence, the property is not actually deleted
        // but instead set to null, so we need to prevent adding those properties.
        const wasReset = this.mIsProxy && value === null;
        if (!this.todoPromotedProps[name] && !wasReset) {
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
                    "Warning: Invalid todo parameter value " +
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

  todoPromotedProps: null,

  set icalComponent(todo) {
    this.modify();
    if (todo.componentType != "VTODO") {
      todo = todo.getFirstSubcomponent("VTODO");
      if (!todo) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
    }

    this.mDueDate = undefined;
    this.setItemBaseFromICS(todo);
    this.mapPropsFromICS(todo, this.icsEventPropMap);

    this.importUnpromotedProperties(todo, this.todoPromotedProps);
    // Importing didn't really change anything
    this.mDirty = false;
  },

  isPropertyPromoted(name) {
    // avoid strict undefined property warning
    return this.todoPromotedProps[name] || false;
  },

  set entryDate(value) {
    this.modify();

    // We're about to change the start date of an item which probably
    // could break the associated calIRecurrenceInfo. We're calling
    // the appropriate method here to adjust the internal structure in
    // order to free clients from worrying about such details.
    if (this.parentItem == this) {
      const rec = this.recurrenceInfo;
      if (rec) {
        rec.onStartDateChange(value, this.entryDate);
      }
    }

    this.setProperty("DTSTART", value);
  },

  get entryDate() {
    return this.getProperty("DTSTART");
  },

  mDueDate: undefined,
  get dueDate() {
    let dueDate = this.mDueDate;
    if (dueDate === undefined) {
      dueDate = this.getProperty("DUE");
      if (!dueDate) {
        const entryDate = this.entryDate;
        const dur = this.getProperty("DURATION");
        if (entryDate && dur) {
          // If there is a duration set on the todo, calculate the right end time.
          dueDate = entryDate.clone();
          dueDate.addDuration(cal.createDuration(dur));
        }
      }
      this.mDueDate = dueDate;
    }
    return dueDate;
  },

  set dueDate(value) {
    this.deleteProperty("DURATION"); // setting dueDate once removes DURATION
    this.setProperty("DUE", value);
    this.mDueDate = value;
  },
};

makeMemberAttrProperty(CalTodo, "COMPLETED", "completedDate");
makeMemberAttrProperty(CalTodo, "PERCENT-COMPLETE", "percentComplete");
