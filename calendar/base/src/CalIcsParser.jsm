/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["CalIcsParser"];

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  CalEvent: "resource:///modules/CalEvent.jsm",
  CalTodo: "resource:///modules/CalTodo.jsm",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.jsm",
});

function CalIcsParser() {
  this.wrappedJSObject = this;
  this.mItems = [];
  this.mParentlessItems = [];
  this.mComponents = [];
  this.mProperties = [];
}
CalIcsParser.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIIcsParser"]),
  classID: Components.ID("{6fe88047-75b6-4874-80e8-5f5800f14984}"),

  processIcalComponent(rootComp, aAsyncParsing) {
    let calComp;
    // libical returns the vcalendar component if there is just one vcalendar.
    // If there are multiple vcalendars, it returns an xroot component, with
    // vcalendar children. We need to handle both cases.
    if (rootComp) {
      if (rootComp.componentType == "VCALENDAR") {
        calComp = rootComp;
      } else {
        calComp = rootComp.getFirstSubcomponent("VCALENDAR");
      }
    }

    if (!calComp) {
      let message = "Parser Error. Could not find 'VCALENDAR' component.\n";
      try {
        // we try to also provide the parsed component - if that fails due to an error in
        // libical, we append the error message of the caught exception, which includes
        // already a stack trace.
        cal.ERROR(message + rootComp + "\n" + cal.STACK(10));
      } catch (e) {
        cal.ERROR(message + e);
      }
    }

    let self = this;
    let state = new parserState(this, aAsyncParsing);

    while (calComp) {
      // Get unknown properties from the VCALENDAR
      for (let prop of cal.iterate.icalProperty(calComp)) {
        if (prop.propertyName != "VERSION" && prop.propertyName != "PRODID") {
          this.mProperties.push(prop);
        }
      }

      let isGCal = /^-\/\/Google Inc\/\/Google Calendar /.test(calComp.prodid);
      for (let subComp of cal.iterate.icalSubcomponent(calComp)) {
        state.submit(subComp, isGCal);
      }
      calComp = rootComp.getNextSubcomponent("VCALENDAR");
    }

    // eslint-disable-next-line mozilla/use-returnValue
    state.join(() => {
      let fakedParents = {};
      // tag "exceptions", i.e. items with rid:
      for (let item of state.excItems) {
        let parent = state.uid2parent[item.id];

        if (!parent) {
          // a parentless one, fake a master and override it's occurrence
          parent = item.isEvent() ? new lazy.CalEvent() : new lazy.CalTodo();
          parent.id = item.id;
          parent.setProperty("DTSTART", item.recurrenceId);
          parent.setProperty("X-MOZ-FAKED-MASTER", "1"); // this tag might be useful in the future
          parent.recurrenceInfo = new lazy.CalRecurrenceInfo(parent);
          fakedParents[item.id] = true;
          state.uid2parent[item.id] = parent;
          state.items.push(parent);
        }
        if (item.id in fakedParents) {
          let rdate = cal.createRecurrenceDate();
          rdate.date = item.recurrenceId;
          parent.recurrenceInfo.appendRecurrenceItem(rdate);
          // we'll keep the parentless-API until we switch over using itip-process for import (e.g. in dnd code)
          self.mParentlessItems.push(item);
        }

        parent.recurrenceInfo.modifyException(item, true);
      }

      if (Object.keys(state.tzErrors).length > 0) {
        // Use an alert rather than a prompt because problems may appear in
        // remote subscribed calendars the user cannot change.
        if (Cc["@mozilla.org/alerts-service;1"]) {
          let notifier = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
          let title = cal.l10n.getCalString("TimezoneErrorsAlertTitle");
          let text = cal.l10n.getCalString("TimezoneErrorsSeeConsole");
          try {
            let alert = Cc["@mozilla.org/alert-notification;1"].createInstance(
              Ci.nsIAlertNotification
            );
            alert.init(title, "", title, text);
            notifier.showAlert(alert);
          } catch (e) {
            // The notifier may not be available, e.g. on xpcshell tests
          }
        }
      }

      // We are done, push the items to the parser and notify the listener
      self.mItems = self.mItems.concat(state.items);
      self.mComponents = self.mComponents.concat(state.extraComponents);

      if (aAsyncParsing) {
        aAsyncParsing.onParsingComplete(Cr.NS_OK, self);
      }
    });
  },

  parseString(aICSString, aAsyncParsing) {
    if (aAsyncParsing) {
      let self = this;

      // We are using two types of very similar listeners here:
      // aAsyncParsing is a calIcsParsingListener that returns the ics
      //   parser containing the processed items.
      // The listener passed to parseICSAsync is a calICsComponentParsingListener
      //   required by the ics service, that receives the parsed root component.
      cal.icsService.parseICSAsync(aICSString, {
        onParsingComplete(rc, rootComp) {
          if (Components.isSuccessCode(rc)) {
            self.processIcalComponent(rootComp, aAsyncParsing);
          } else {
            cal.ERROR("Error Parsing ICS: " + rc);
            aAsyncParsing.onParsingComplete(rc, self);
          }
        },
      });
    } else {
      try {
        let icalComp = cal.icsService.parseICS(aICSString);
        this.processIcalComponent(icalComp);
      } catch (exc) {
        cal.ERROR(exc.message + " when parsing\n" + aICSString);
      }
    }
  },

  parseFromStream(aStream, aAsyncParsing) {
    // Read in the string. Note that it isn't a real string at this point,
    // because likely, the file is utf8. The multibyte chars show up as multiple
    // 'chars' in this string. So call it an array of octets for now.

    let stringData = NetUtil.readInputStreamToString(aStream, aStream.available(), {
      charset: "utf-8",
    });
    this.parseString(stringData, aAsyncParsing);
  },

  getItems() {
    return this.mItems.concat([]);
  },

  getParentlessItems() {
    return this.mParentlessItems.concat([]);
  },

  getProperties() {
    return this.mProperties.concat([]);
  },

  getComponents() {
    return this.mComponents.concat([]);
  },
};

/**
 * The parser state, which helps process ical components without clogging up the
 * event queue.
 *
 * @param aParser       The parser that is using this state
 */
function parserState(aParser, aListener) {
  this.parser = aParser;
  this.listener = aListener;

  this.extraComponents = [];
  this.items = [];
  this.uid2parent = {};
  this.excItems = [];
  this.tzErrors = {};
}

parserState.prototype = {
  parser: null,
  joinFunc: null,
  threadCount: 0,

  extraComponents: null,
  items: null,
  uid2parent: null,
  excItems: null,
  tzErrors: null,
  listener: null,

  /**
   * Checks if the timezones are missing and notifies the user via error console
   *
   * @param item      The item to check for
   * @param date      The datetime object to check with
   */
  checkTimezone(item, date) {
    function isPhantomTimezone(timezone) {
      return !timezone.icalComponent && !timezone.isUTC && !timezone.isFloating;
    }

    if (date && isPhantomTimezone(date.timezone)) {
      let tzid = date.timezone.tzid;
      let hid = item.hashId + "#" + tzid;
      if (!(hid in this.tzErrors)) {
        // For now, publish errors to console and alert user.
        // In future, maybe make them available through an interface method
        // so this UI code can be removed from the parser, and caller can
        // choose whether to alert, or show user the problem items and ask
        // for fixes, or something else.
        let msgArgs = [tzid, item.title, cal.dtz.formatter.formatDateTime(date)];
        let msg = cal.l10n.getCalString("unknownTimezoneInItem", msgArgs);

        cal.ERROR(msg + "\n" + item.icalString);
        this.tzErrors[hid] = true;
      }
    }
  },

  /**
   * Submit processing of a subcomponent to the event queue
   *
   * @param subComp       The component to process
   * @param isGCal        If this is a Google Calendar invitation
   */
  submit(subComp, isGCal) {
    let self = this;
    let runner = {
      run() {
        let item = null;
        switch (subComp.componentType) {
          case "VEVENT":
            item = new lazy.CalEvent();
            item.icalComponent = subComp;
            if (isGCal) {
              cal.view.fixGoogleCalendarDescription(item);
            }
            self.checkTimezone(item, item.startDate);
            self.checkTimezone(item, item.endDate);
            break;
          case "VTODO":
            item = new lazy.CalTodo();
            item.icalComponent = subComp;
            self.checkTimezone(item, item.entryDate);
            self.checkTimezone(item, item.dueDate);
            // completed is defined to be in UTC
            break;
          case "VTIMEZONE":
            // this should already be attached to the relevant
            // events in the calendar, so there's no need to
            // do anything with it here.
            break;
          default:
            self.extraComponents.push(subComp);
            break;
        }

        if (item) {
          let rid = item.recurrenceId;
          if (rid) {
            self.excItems.push(item);
          } else {
            self.items.push(item);
            if (item.recurrenceInfo) {
              self.uid2parent[item.id] = item;
            }
          }
        }
        self.threadCount--;
        self.checkCompletion();
      },
    };

    this.threadCount++;
    if (this.listener) {
      // If we have a listener, we are doing this asynchronously. Go ahead
      // and use the thread manager to dispatch the above runner
      Services.tm.currentThread.dispatch(runner, Ci.nsIEventTarget.DISPATCH_NORMAL);
    } else {
      // No listener means synchonous. Just run the runner instead
      runner.run();
    }
  },

  /**
   * Checks if the processing of all events has completed. If a join function
   * has been set, this function is called.
   *
   * @returns True, if all tasks have been completed
   */
  checkCompletion() {
    if (this.joinFunc && this.threadCount == 0) {
      this.joinFunc();
      return true;
    }
    return false;
  },

  /**
   * Sets a join function that is called when all tasks have been completed
   *
   * @param joinFunc      The join function to call
   */
  join(joinFunc) {
    this.joinFunc = joinFunc;
    this.checkCompletion();
  },
};
