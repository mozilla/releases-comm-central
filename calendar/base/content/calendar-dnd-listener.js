/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calendar-item-editing.js */
/* import-globals-from calendar-management.js */
/* import-globals-from import-export.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

/* exported invokeEventDragSession, calendarViewDNDObserver,
 *          calendarMailButtonDNDObserver, calendarCalendarButtonDNDObserver,
 *          calendarTaskButtonDNDObserver
 */

var itemConversion = {
  /**
   * Converts an email message to a calendar item.
   *
   * @param {Object} aItem - The target calIItemBase.
   * @param {Object} aMsgHdr - The nsIMsgHdr to convert from.
   */
  calendarItemFromMessage(aItem, aMsgHdr) {
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
   * @param {Object} aItem - The item to copy from.
   * @param {Object} aTarget - The item to copy to.
   */
  copyItemBase(aItem, aTarget) {
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
   * @param {Object} aEvent - The event to copy from.
   * @return {Object} The resulting task.
   */
  taskFromEvent(aEvent) {
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
   * @param {Object} aTask - The task to copy from.
   * @return {Object} The resulting event.
   */
  eventFromTask(aTask) {
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
  /**
   * Action to take when dropping the event.
   */

  onDrop(event) {
    let dragSession = Cc["@mozilla.org/widget/dragservice;1"]
      .getService(Ci.nsIDragService)
      .getCurrentSession();
    // Handles text/x-moz-message, text/x-moz-address and text/x-moz-url flavours.
    if (this.onDropEventData(event.dataTransfer)) {
      return;
    }

    let transferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
    transferable.init(null);
    transferable.addDataFlavor("text/calendar");
    transferable.addDataFlavor("text/unicode");

    dragSession.getData(transferable, 0);

    let transData = {};
    let bestFlavor = {};
    transferable.getAnyTransferData(bestFlavor, transData);

    try {
      transData = transData.value.QueryInterface(Ci.nsISupportsString);
    } catch (exc) {
      // we currently only supports strings:
      return;
    }

    // Treat unicode data with VEVENT in it as text/calendar
    if (bestFlavor.value == "text/unicode" && transData.toString().includes("VEVENT")) {
      bestFlavor.value = "text/calendar";
    }

    switch (bestFlavor.value) {
      case "text/calendar": {
        if (AppConstants.platform == "macosx") {
          // Mac likes to convert all \r to \n, we need to reverse this.
          transData = transData.data.replace(/\n\n/g, "\r\n");
        }
        let parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
        parser.parseString(transData);
        this.onDropItems(parser.getItems().concat(parser.getParentlessItems()));
        break;
      }
      case "text/unicode": {
        let droppedUrl = transData.toString().split("\n")[0];
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
    }
  },

  onDragStart(event) {},
  onDragOver(event) {
    event.preventDefault();
  },
  onDragExit(event) {},

  onDropItems(items) {},
  onDropMessage(message) {},

  /**
   * Extract the data of dataTransfer object in the drop event if presents. It will
   * extract data of following flavours: text/x-moz-message, text/x-moz-address and
   * text/x-moz-url.
   *
   * @param {Object} dataTransfer - The dataTransfer object from the drop event.
   * @return {boolean} Returns true if we have data from the given flavours.
   */
  onDropEventData(dataTransfer) {
    let flavours = ["text/x-moz-message", "text/x-moz-address", "text/x-moz-url"];

    let dataFlavor, data;
    const MAX = 8; // Let's say we want to handle max 8 items.
    for (let i = 0; i < dataTransfer.mozItemCount && i < MAX; i++) {
      let types = Array.from(dataTransfer.mozTypesAt(i));
      for (let flavour of flavours) {
        if (types.includes(flavour)) {
          let flavorData = dataTransfer.mozGetDataAt(flavour, i);
          if (flavorData) {
            data = flavorData;
            dataFlavor = flavour;
          }
          break;
        }
      }

      switch (dataFlavor) {
        case "text/x-moz-address":
          if ("onAddressDrop" in this) {
            this.onAddressDrop(data);
          }
          break;
        case "text/x-moz-url": {
          data = data.toString().split("\n")[0];
          if (!data) {
            return false;
          }
          let url = Services.io.newURI(data);
          this.onDropURL(url);
          break;
        }
        case "text/x-moz-message": {
          let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
          this.onDropMessage(messenger.msgHdrFromURI(data));
          break;
        }
        default:
          cal.ASSERT(false, "unknown data flavour:" + dataFlavor + "\n");
          break;
      }
    }
    return !!dataFlavor;
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
  onDropItems(aItems) {
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
}

calMailButtonDNDObserver.prototype = {
  __proto__: calDNDBaseObserver.prototype,

  /**
   * calMailButtonDNDObserver::onDropItems
   *
   * Gets called in case we're dropping an array of items
   * on the 'mail mode'-button.
   *
   * @param {Object} aItems - An array of items to handle.
   */
  onDropItems(aItems) {
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
   * @param {Object} aMessage - The message to handle.
   */
  onDropMessage(aMessage) {},
};

/**
 * calCalendarButtonDNDObserver::calCalendarButtonDNDObserver
 *
 * Drag'n'drop handler for the 'open calendar tab'-button. This handler is
 * derived from the base handler and just implements specific actions.
 */
function calCalendarButtonDNDObserver() {
  this.wrappedJSObject = this;
}

calCalendarButtonDNDObserver.prototype = {
  __proto__: calDNDBaseObserver.prototype,

  /**
   * calCalendarButtonDNDObserver::onDropItems
   *
   * Gets called in case we're dropping an array of items
   * on the 'open calendar tab'-button.
   *
   * @param {Object} aItems - An array of items to handle.
   */
  onDropItems(aItems) {
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
   * 'open calendar tab'-button. In this case we create a new
   * event from the mail. We open the default event dialog
   * and just use the subject of the message as the event title.
   *
   * @param {Object} aMessage - The message to handle.
   */
  onDropMessage(aMessage) {
    let newItem = cal.createEvent();
    itemConversion.calendarItemFromMessage(newItem, aMessage);
    createEventWithDialog(null, null, null, null, newItem);
  },

  /**
   * calCalendarButtonDNDObserver::onDropURL
   *
   * Gets called in case we're dropping a uri on the 'open calendar tab'-button.
   *
   * @param {string} uri - The uri to handle.
   */
  onDropURL(uri) {
    let newItem = cal.createEvent();
    newItem.calendar = getSelectedCalendar();
    cal.dtz.setDefaultStartEndHour(newItem);
    cal.alarms.setDefaultValues(newItem);
    let attachment = cal.createAttachment();
    attachment.uri = uri;
    newItem.addAttachment(attachment);
    createEventWithDialog(null, null, null, null, newItem);
  },

  /**
   * calCalendarButtonDNDObserver::onAddressDrop
   *
   * Gets called in case we're dropping addresses on the 'open calendar tab'-button.
   *
   * @param {string} addresses - The addresses to handle.
   */
  onAddressDrop(addresses) {
    let parsedInput = MailServices.headerParser.makeFromDisplayAddress(addresses);
    let attendee = cal.createAttendee();
    attendee.id = "";
    attendee.rsvp = "TRUE";
    attendee.role = "REQ-PARTICIPANT";
    attendee.participationStatus = "NEEDS-ACTION";
    let attendees = parsedInput
      .filter(address => address.name.length > 0)
      .map((address, index) => {
        // Convert address to attendee.
        if (index > 0) {
          attendee = attendee.clone();
        }
        attendee.id = cal.email.prependMailTo(address.email);
        let commonName = null;
        if (address.name.length > 0) {
          // We remove any double quotes within CN due to bug 1209399.
          let name = address.name.replace(/(?:(?:[\\]")|(?:"))/g, "");
          if (address.email != name) {
            commonName = name;
          }
        }
        attendee.commonName = commonName;
        return attendee;
      });
    let newItem = cal.createEvent();
    newItem.calendar = getSelectedCalendar();
    cal.dtz.setDefaultStartEndHour(newItem);
    cal.alarms.setDefaultValues(newItem);
    for (let attendee of attendees) {
      newItem.addAttendee(attendee);
    }
    createEventWithDialog(null, null, null, null, newItem);
  },
};

/**
 * calTaskButtonDNDObserver::calTaskButtonDNDObserver
 *
 * Drag'n'drop handler for the 'open tasks tab'-button. This handler is
 * derived from the base handler and just implements specific actions.
 */
function calTaskButtonDNDObserver() {
  this.wrappedJSObject = this;
}

calTaskButtonDNDObserver.prototype = {
  __proto__: calDNDBaseObserver.prototype,

  /**
   * calTaskButtonDNDObserver::onDropItems
   *
   * Gets called in case we're dropping an array of items
   * on the 'open tasks tab'-button.
   *
   * @param {Object} aItems - An array of items to handle.
   */
  onDropItems(aItems) {
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
   * on the 'open tasks tab'-button.
   *
   * @param {Object} aMessage - The message to handle.
   */
  onDropMessage(aMessage) {
    let todo = cal.createTodo();
    itemConversion.calendarItemFromMessage(todo, aMessage);
    createTodoWithDialog(null, null, null, todo);
  },

  /**
   * calTaskButtonDNDObserver::onDropURL
   *
   * Gets called in case we're dropping a uri on the 'open tasks tab'-button.
   *
   * @param {string} uri - The uri to handle.
   */
  onDropURL(uri) {
    let todo = cal.createTodo();
    todo.calendar = getSelectedCalendar();
    cal.dtz.setDefaultStartEndHour(todo);
    cal.alarms.setDefaultValues(todo);
    let attachment = cal.createAttachment();
    attachment.uri = uri;
    todo.addAttachment(attachment);
    createTodoWithDialog(null, null, null, todo);
  },
};

/**
 * Invoke a drag session for the passed item. The passed box will be used as a
 * source.
 *
 * @param {Object} aItem - The item to drag.
 * @param {Object} aXULBox - The XUL box to invoke the drag session from.
 */
function invokeEventDragSession(aItem, aXULBox) {
  let transfer = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
  transfer.init(null);
  transfer.addDataFlavor("text/calendar");

  let flavourProvider = {
    QueryInterface: ChromeUtils.generateQI([Ci.nsIFlavorDataProvider]),

    item: aItem,
    getFlavorData(aInTransferable, aInFlavor, aOutData) {
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
