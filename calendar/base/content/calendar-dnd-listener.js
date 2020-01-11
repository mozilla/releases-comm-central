/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/base/content/nsDragAndDrop.js */
/* import-globals-from calendar-item-editing.js */
/* import-globals-from calendar-management.js */
/* import-globals-from import-export.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

/* exported invokeEventDragSession, calendarViewDNDObserver,
 *          calendarMailButtonDNDObserver, calendarCalendarButtonDNDObserver,
 *          calendarTaskButtonDNDObserver
 */

var itemConversion = {
  /**
   * Converts an email message to a calendar item.
   *
   * @param aItem     The target calIItemBase.
   * @param aMessage  The nsIMsgHdr to convert from.
   */
  calendarItemFromMessage: function(aItem, aMsgHdr) {
    let msgFolder = aMsgHdr.folder;
    let msgUri = msgFolder.getUriForMsg(aMsgHdr);

    aItem.calendar = getSelectedCalendar();
    aItem.title = aMsgHdr.mime2DecodedSubject;

    cal.dtz.setDefaultStartEndHour(aItem);
    cal.alarms.setDefaultValues(aItem);

    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
    let streamListener = Cc["@mozilla.org/network/sync-stream-listener;1"].createInstance(
      Ci.nsISyncStreamListener
    );
    messenger
      .messageServiceFromURI(msgUri)
      .streamMessage(msgUri, streamListener, null, null, false, "", false);

    let plainTextMessage = "";
    plainTextMessage = msgFolder.getMsgTextFromStream(
      streamListener.inputStream,
      aMsgHdr.Charset,
      65536,
      32768,
      false,
      true,
      {}
    );
    aItem.setProperty("DESCRIPTION", plainTextMessage);
  },

  /**
   * Copy base item properties from aItem to aTarget. This includes properties
   * like title, location, description, priority, transparency,
   * attendees, categories, calendar, recurrence and possibly more.
   *
   * @param aItem     The item to copy from.
   * @param aTarget   the item to copy to.
   */
  copyItemBase: function(aItem, aTarget) {
    const copyProps = ["SUMMARY", "LOCATION", "DESCRIPTION", "URL", "CLASS", "PRIORITY"];

    for (let prop of copyProps) {
      aTarget.setProperty(prop, aItem.getProperty(prop));
    }

    // Attendees
    let attendees = aItem.getAttendees();
    for (let attendee of attendees) {
      aTarget.addAttendee(attendee.clone());
    }

    // Categories
    let categories = aItem.getCategories();
    aTarget.setCategories(categories);

    // Organizer
    aTarget.organizer = aItem.organizer ? aItem.organizer.clone() : null;

    // Calendar
    aTarget.calendar = getSelectedCalendar();

    // Recurrence
    if (aItem.recurrenceInfo) {
      aTarget.recurrenceInfo = aItem.recurrenceInfo.clone();
      aTarget.recurrenceInfo.item = aTarget;
    }
  },

  /**
   * Creates a task from the passed event. This function copies the base item
   * and a few event specific properties (dates, alarms, ...).
   *
   * @param aEvent    The event to copy from.
   * @return          The resulting task.
   */
  taskFromEvent: function(aEvent) {
    let item = cal.createTodo();

    this.copyItemBase(aEvent, item);

    // Dates and alarms
    if (!aEvent.startDate.isDate && !aEvent.endDate.isDate) {
      // Dates
      item.entryDate = aEvent.startDate.clone();
      item.dueDate = aEvent.endDate.clone();

      // Alarms
      for (let alarm of aEvent.getAlarms()) {
        item.addAlarm(alarm.clone());
      }
      item.alarmLastAck = aEvent.alarmLastAck ? aEvent.alarmLastAck.clone() : null;
    }

    // Map Status values
    let statusMap = {
      TENTATIVE: "NEEDS-ACTION",
      CONFIRMED: "IN-PROCESS",
      CANCELLED: "CANCELLED",
    };
    if (aEvent.getProperty("STATUS") in statusMap) {
      item.setProperty("STATUS", statusMap[aEvent.getProperty("STATUS")]);
    }
    return item;
  },

  /**
   * Creates an event from the passed task. This function copies the base item
   * and a few task specific properties (dates, alarms, ...). If the task has
   * no due date, the default event length is used.
   *
   * @param aTask     The task to copy from.
   * @return          The resulting event.
   */
  eventFromTask: function(aTask) {
    let item = cal.createEvent();

    this.copyItemBase(aTask, item);

    // Dates and alarms
    item.startDate = aTask.entryDate;
    if (!item.startDate) {
      if (aTask.dueDate) {
        item.startDate = aTask.dueDate.clone();
        item.startDate.minute -= Services.prefs.getIntPref("calendar.event.defaultlength", 60);
      } else {
        item.startDate = cal.dtz.getDefaultStartDate();
      }
    }

    item.endDate = aTask.dueDate;
    if (!item.endDate) {
      // Make the event be the default event length if no due date was
      // specified.
      item.endDate = item.startDate.clone();
      item.endDate.minute += Services.prefs.getIntPref("calendar.event.defaultlength", 60);
    }

    // Alarms
    for (let alarm of aTask.getAlarms()) {
      item.addAlarm(alarm.clone());
    }
    item.alarmLastAck = aTask.alarmLastAck ? aTask.alarmLastAck.clone() : null;

    // Map Status values
    let statusMap = {
      "NEEDS-ACTION": "TENTATIVE",
      COMPLETED: "CONFIRMED",
      "IN-PROCESS": "CONFIRMED",
      CANCELLED: "CANCELLED",
    };
    if (aTask.getProperty("STATUS") in statusMap) {
      item.setProperty("STATUS", statusMap[aTask.getProperty("STATUS")]);
    }
    return item;
  },
};

/**
 * A base class for drag and drop observers
 * @class calDNDBaseObserver
 */
function calDNDBaseObserver() {
  cal.ASSERT(false, "Inheriting objects call calDNDBaseObserver!");
}

calDNDBaseObserver.prototype = {
  // initialize this class's members
  initBase: function() {},

  getSupportedFlavours: function() {
    let flavourSet = new FlavourSet();
    flavourSet.appendFlavour("text/calendar");
    flavourSet.appendFlavour("text/x-moz-url");
    flavourSet.appendFlavour("text/x-moz-message");
    flavourSet.appendFlavour("text/unicode");
    flavourSet.appendFlavour("application/x-moz-file");
    return flavourSet;
  },

  /**
   * Action to take when dropping the event.
   */

  onDrop: function(aEvent, aTransferData, aDragSession) {
    let transferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
    transferable.init(null);
    transferable.addDataFlavor("text/calendar");
    transferable.addDataFlavor("text/x-moz-url");
    transferable.addDataFlavor("text/x-moz-message");
    transferable.addDataFlavor("text/unicode");
    transferable.addDataFlavor("application/x-moz-file");

    aDragSession.getData(transferable, 0);

    let data = {};
    let bestFlavor = {};
    transferable.getAnyTransferData(bestFlavor, data);

    try {
      data = data.value.QueryInterface(Ci.nsISupportsString);
    } catch (exc) {
      // we currently only supports strings:
      return;
    }

    // Treat unicode data with VEVENT in it as text/calendar
    if (bestFlavor.value == "text/unicode" && data.toString().includes("VEVENT")) {
      bestFlavor.value = "text/calendar";
    }

    switch (bestFlavor.value) {
      case "text/calendar": {
        if (AppConstants.platform == "macosx") {
          // Mac likes to convert all \r to \n, we need to reverse this.
          data = data.data.replace(/\n\n/g, "\r\n");
        }
        let parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
        parser.parseString(data);
        this.onDropItems(parser.getItems().concat(parser.getParentlessItems()));
        break;
      }
      case "text/unicode": {
        let droppedUrl = this.retrieveURLFromData(data, bestFlavor.value);
        if (!droppedUrl) {
          return;
        }

        let url = Services.io.newURI(droppedUrl);

        let localFileInstance = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        localFileInstance.initWithPath(url.pathQueryRef);

        let inputStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
          Ci.nsIFileInputStream
        );
        inputStream.init(localFileInstance, MODE_RDONLY, parseInt("0444", 8), {});

        try {
          // XXX support csv
          let importer = Cc["@mozilla.org/calendar/import;1?type=ics"].getService(Ci.calIImporter);
          let items = importer.importFromStream(inputStream);
          this.onDropItems(items);
        } finally {
          inputStream.close();
        }

        break;
      }
      case "application/x-moz-file-promise":
      case "text/x-moz-url": {
        let uri = Services.io.newURI(data.toString());
        let loader = cal.provider.createStreamLoader();
        let channel = Services.io.newChannelFromURI(
          uri,
          null,
          Services.scriptSecurityManager.getSystemPrincipal(),
          null,
          Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_DATA_IS_NULL,
          Ci.nsIContentPolicy.TYPE_OTHER
        );
        channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;

        let self = this;

        let listener = {
          onStreamComplete: function(aLoader, aContext, aStatus, aResultLength, aResult) {
            let parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
            let encoding = channel.contentCharset || "utf-8";
            let result = aResultLength
              ? new TextDecoder(encoding).decode(Uint8Array.from(aResult))
              : "";
            parser.parseString(result);
            self.onDropItems(parser.getItems().concat(parser.getParentlessItems()));
          },
        };

        try {
          loader.init(listener);
          channel.asyncOpen(loader);
        } catch (e) {
          cal.ERROR(e);
        }
        break;
      }
      case "text/x-moz-message": {
        let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
        this.onDropMessage(messenger.msgHdrFromURI(data));
        break;
      }
      default:
        cal.ASSERT(false, "unknown data flavour:" + bestFlavor.value + "\n");
        break;
    }
  },

  onDragStart: function(aEvent, aTransferData, aDragAction) {},
  onDragOver: function(aEvent, aFlavor, aDragSession) {},
  onDragExit: function(aEvent, aDragSession) {},

  onDropItems: function(aItems) {},
  onDropMessage: function(aMessage) {},

  retrieveURLFromData: function(aData, aFlavor) {
    switch (aFlavor) {
      case "text/unicode": {
        let data = aData.toString();
        let separator = data.indexOf("\n");
        if (separator != -1) {
          data = data.substr(0, separator);
        }
        return data;
      }
      case "application/x-moz-file":
        return aData.URL;
      default:
        return null;
    }
  },
};

/**
 * calViewDNDObserver::calViewDNDObserver
 *
 * Drag'n'drop handler for the calendar views. This handler is
 * derived from the base handler and just implements specific actions.
 */
function calViewDNDObserver() {
  this.wrappedJSObject = this;
  this.initBase();
}

calViewDNDObserver.prototype = {
  __proto__: calDNDBaseObserver.prototype,

  /**
   * calViewDNDObserver::onDropItems
   *
   * Gets called in case we're dropping an array of items
   * on one of the calendar views. In this case we just
   * try to add these items to the currently selected calendar.
   */
  onDropItems: function(aItems) {
    let destCal = getSelectedCalendar();
    startBatchTransaction();
    // we fall back explicitly to the popup to ask whether to send a
    // notification to participants if required
    let extResp = { responseMode: Ci.calIItipItem.USER };
    try {
      for (let item of aItems) {
        doTransaction("add", item, destCal, null, null, extResp);
      }
    } finally {
      endBatchTransaction();
    }
  },
};

/**
 * calMailButtonDNDObserver::calMailButtonDNDObserver
 *
 * Drag'n'drop handler for the 'mail mode'-button. This handler is
 * derived from the base handler and just implements specific actions.
 */
function calMailButtonDNDObserver() {
  this.wrappedJSObject = this;
  this.initBase();
}

calMailButtonDNDObserver.prototype = {
  __proto__: calDNDBaseObserver.prototype,

  /**
   * calMailButtonDNDObserver::onDropItems
   *
   * Gets called in case we're dropping an array of items
   * on the 'mail mode'-button.
   *
   * @param aItems        An array of items to handle.
   */
  onDropItems: function(aItems) {
    if (aItems && aItems.length > 0) {
      let item = aItems[0];
      let identity = item.calendar.getProperty("imip.identity");
      let parties = item.getAttendees();
      if (item.organizer) {
        parties.push(item.organizer);
      }
      if (identity) {
        // if no identity is defined, the composer will fall back to
        // whatever seems suitable - in this case we don't try to remove
        // the sender from the recipient list
        identity = identity.QueryInterface(Ci.nsIMsgIdentity);
        parties = parties.filter(aParty => {
          return identity.email != cal.email.getAttendeeEmail(aParty, false);
        });
      }
      let recipients = cal.email.createRecipientList(parties);
      cal.email.sendTo(recipients, item.title, item.getProperty("DESCRIPTION"), identity);
    }
  },

  /**
   * calMailButtonDNDObserver::onDropMessage
   *
   * Gets called in case we're dropping a message
   * on the 'mail mode'-button.
   *
   * @param aMessage     The message to handle.
   */
  onDropMessage: function(aMessage) {},
};

/**
 * calCalendarButtonDNDObserver::calCalendarButtonDNDObserver
 *
 * Drag'n'drop handler for the 'calendar mode'-button. This handler is
 * derived from the base handler and just implements specific actions.
 */
function calCalendarButtonDNDObserver() {
  this.wrappedJSObject = this;
  this.initBase();
}

calCalendarButtonDNDObserver.prototype = {
  __proto__: calDNDBaseObserver.prototype,

  /**
   * calCalendarButtonDNDObserver::onDropItems
   *
   * Gets called in case we're dropping an array of items
   * on the 'calendar mode'-button.
   *
   * @param aItems        An array of items to handle.
   */
  onDropItems: function(aItems) {
    for (let item of aItems) {
      let newItem = item;
      if (cal.item.isToDo(item)) {
        newItem = itemConversion.eventFromTask(item);
      }
      createEventWithDialog(null, null, null, null, newItem);
    }
  },

  /**
   * calCalendarButtonDNDObserver::onDropMessage
   *
   * Gets called in case we're dropping a message on the
   * 'calendar mode'-button. In this case we create a new
   * event from the mail. We open the default event dialog
   * and just use the subject of the message as the event title.
   *
   * @param aMessage     The message to handle.
   */
  onDropMessage: function(aMessage) {
    let newItem = cal.createEvent();
    itemConversion.calendarItemFromMessage(newItem, aMessage);
    createEventWithDialog(null, null, null, null, newItem);
  },
};

/**
 * calTaskButtonDNDObserver::calTaskButtonDNDObserver
 *
 * Drag'n'drop handler for the 'task mode'-button. This handler is
 * derived from the base handler and just implements specific actions.
 */
function calTaskButtonDNDObserver() {
  this.wrappedJSObject = this;
  this.initBase();
}

calTaskButtonDNDObserver.prototype = {
  __proto__: calDNDBaseObserver.prototype,

  /**
   * calTaskButtonDNDObserver::onDropItems
   *
   * Gets called in case we're dropping an array of items
   * on the 'task mode'-button.
   *
   * @param aItems        An array of items to handle.
   */
  onDropItems: function(aItems) {
    for (let item of aItems) {
      let newItem = item;
      if (cal.item.isEvent(item)) {
        newItem = itemConversion.taskFromEvent(item);
      }
      createTodoWithDialog(null, null, null, newItem);
    }
  },

  /**
   * calTaskButtonDNDObserver::onDropMessage
   *
   * Gets called in case we're dropping a message
   * on the 'task mode'-button.
   *
   * @param aMessage     The message to handle.
   */
  onDropMessage: function(aMessage) {
    let todo = cal.createTodo();
    itemConversion.calendarItemFromMessage(todo, aMessage);
    createTodoWithDialog(null, null, null, todo);
  },
};

/**
 * Invoke a drag session for the passed item. The passed box will be used as a
 * source.
 *
 * @param aItem     The item to drag.
 * @param aXULBox   The XUL box to invoke the drag session from.
 */
function invokeEventDragSession(aItem, aXULBox) {
  let transfer = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
  transfer.init(null);
  transfer.addDataFlavor("text/calendar");

  let flavourProvider = {
    QueryInterface: ChromeUtils.generateQI([Ci.nsIFlavorDataProvider]),

    item: aItem,
    getFlavorData: function(aInTransferable, aInFlavor, aOutData) {
      if (
        aInFlavor == "application/vnd.x-moz-cal-event" ||
        aInFlavor == "application/vnd.x-moz-cal-task"
      ) {
        aOutData.value = aItem;
      } else {
        cal.ASSERT(false, "error:" + aInFlavor);
      }
    },
  };

  if (cal.item.isEvent(aItem)) {
    transfer.addDataFlavor("application/vnd.x-moz-cal-event");
    transfer.setTransferData("application/vnd.x-moz-cal-event", flavourProvider);
  } else if (cal.item.isToDo(aItem)) {
    transfer.addDataFlavor("application/vnd.x-moz-cal-task");
    transfer.setTransferData("application/vnd.x-moz-cal-task", flavourProvider);
  }

  // Also set some normal data-types, in case we drag into another app
  let serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
    Ci.calIIcsSerializer
  );
  serializer.addItems([aItem]);

  let supportsString = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
  supportsString.data = serializer.serializeToString();
  transfer.setTransferData("text/calendar", supportsString);
  transfer.setTransferData("text/unicode", supportsString);

  let action = Ci.nsIDragService.DRAGDROP_ACTION_MOVE;
  let mutArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  mutArray.appendElement(transfer);
  aXULBox.sourceObject = aItem;
  try {
    cal.getDragService().invokeDragSession(aXULBox, null, null, mutArray, action);
  } catch (e) {
    if (e.result != Cr.NS_ERROR_FAILURE) {
      // Pressing Escape on some platforms results in NS_ERROR_FAILURE
      // being thrown. Catch this exception, but throw anything else.
      throw e;
    }
  }
}

/* exported calendarViewDNDObserver, calendarMailButtonDNDObserver,
   calendarCalendarButtonDNDObserver, calendarTaskButtonDNDObserver */
var calendarViewDNDObserver = new calViewDNDObserver();
var calendarMailButtonDNDObserver = new calMailButtonDNDObserver();
var calendarCalendarButtonDNDObserver = new calCalendarButtonDNDObserver();
var calendarTaskButtonDNDObserver = new calTaskButtonDNDObserver();
