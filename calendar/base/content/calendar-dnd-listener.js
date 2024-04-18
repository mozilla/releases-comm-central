/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals getSelectedCalendar, MODE_RDONLY, startBatchTransaction, doTransaction,
   endBatchTransaction, createEventWithDialog, createTodoWithDialog */

/* exported invokeEventDragSession,
 *          calendarMailButtonDNDObserver, calendarCalendarButtonDNDObserver,
 *          calendarTaskButtonDNDObserver
 */

/* eslint-enable valid-jsdoc */

var calendarViewDNDObserver;
var calendarMailButtonDNDObserver;
var calendarCalendarButtonDNDObserver;
var calendarTaskButtonDNDObserver;

// Wrap in a block to prevent leaking to window scope.
{
  var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  var { AppConstants } = ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs");
  var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

  ChromeUtils.defineESModuleGetters(this, {
    CalAttachment: "resource:///modules/CalAttachment.sys.mjs",
    CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
    CalEvent: "resource:///modules/CalEvent.sys.mjs",
    CalTodo: "resource:///modules/CalTodo.sys.mjs",
  });

  var itemConversion = {
    /**
     * Converts an email message to a calendar item.
     *
     * @param {calIItemBase} item - The target calIItemBase.
     * @param {nsIMsgDBHdr} message - The nsIMsgDBHdr to convert from.
     */
    async calendarItemFromMessage(item, message) {
      const folder = message.folder;
      const msgUri = folder.getUriForMsg(message);

      item.calendar = getSelectedCalendar();
      item.title = message.mime2DecodedSubject;
      item.setProperty("URL", `mid:${message.messageId}`);

      cal.dtz.setDefaultStartEndHour(item);
      cal.alarms.setDefaultValues(item);

      let content = "";
      await new Promise((resolve, reject) => {
        const streamListener = {
          QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
          onDataAvailable(request, inputStream, offset, count) {
            const text = folder.getMsgTextFromStream(
              inputStream,
              message.charset,
              count, // bytesToRead
              32768, // maxOutputLen
              false, // compressQuotes
              true, // stripHTMLTags
              {} // out contentType
            );
            // If we ever got text, we're good. Ignore further chunks.
            content ||= text;
          },
          onStartRequest() {},
          onStopRequest(request, statusCode) {
            if (!Components.isSuccessCode(statusCode)) {
              reject(new Error(statusCode));
            }
            resolve();
          },
        };
        MailServices.messageServiceFromURI(msgUri).streamMessage(
          msgUri,
          streamListener,
          null,
          null,
          false,
          "",
          false
        );
      });
      item.descriptionText = content;
    },

    /**
     * Copy base item properties from aItem to aTarget. This includes properties
     * like title, location, description, priority, transparency, attendees,
     * categories, calendar, recurrence and possibly more.
     *
     * @param {object} aItem - The item to copy from.
     * @param {object} aTarget - The item to copy to.
     */
    copyItemBase(aItem, aTarget) {
      const copyProps = ["SUMMARY", "LOCATION", "DESCRIPTION", "URL", "CLASS", "PRIORITY"];

      for (const prop of copyProps) {
        aTarget.setProperty(prop, aItem.getProperty(prop));
      }

      // Attendees
      const attendees = aItem.getAttendees();
      for (const attendee of attendees) {
        aTarget.addAttendee(attendee.clone());
      }

      // Categories
      const categories = aItem.getCategories();
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
     * @param {object} aEvent - The event to copy from.
     * @returns {object} The resulting task.
     */
    taskFromEvent(aEvent) {
      const item = new CalTodo();

      this.copyItemBase(aEvent, item);

      // Dates and alarms
      if (!aEvent.startDate.isDate && !aEvent.endDate.isDate) {
        // Dates
        item.entryDate = aEvent.startDate.clone();
        item.dueDate = aEvent.endDate.clone();

        // Alarms
        for (const alarm of aEvent.getAlarms()) {
          item.addAlarm(alarm.clone());
        }
        item.alarmLastAck = aEvent.alarmLastAck ? aEvent.alarmLastAck.clone() : null;
      }

      // Map Status values
      const statusMap = {
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
     * @param {object} aTask - The task to copy from.
     * @returns {object} The resulting event.
     */
    eventFromTask(aTask) {
      const item = new CalEvent();

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
      for (const alarm of aTask.getAlarms()) {
        item.addAlarm(alarm.clone());
      }
      item.alarmLastAck = aTask.alarmLastAck ? aTask.alarmLastAck.clone() : null;

      // Map Status values
      const statusMap = {
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
   * CalDNDTransferHandler provides a base class for handling drag and drop data
   * transfers based on detected mime types. Actual processing of the dropped
   * data is left up to CalDNDListener however children of this class mostly
   * do some preprocessing first.
   *
   * The main methods here are the handleDataTransferItem() and handleString()
   * methods that initiate transfer from a DataTransferItem or string
   * respectively. Whether the data is passed as a DataTransferItem or string
   * mostly depends on whether dropped from an external application or
   * internally.
   *
   * @abstract
   */
  class CalDNDTransferHandler {
    /**
     * List of mime types this class handles (Overridden by child class).
     *
     * @type {string[]}
     */
    mimeTypes = [];

    /**
     * @param {CalDNDListener} listener - The listener that received the
     * original drop event. Most CalDNDTransferHandlers will invoke a method on
     * this class once data has been processed.
     */
    constructor(listener) {
      this.listener = listener;
    }

    /**
     * Returns true if the handler is able to process any of the given mime types.
     *
     * @param {string|string[]} mime - The mime type to handle.
     *
     * @returns {boolean}
     */
    willTransfer(mime) {
      return Array.isArray(mime)
        ? this.mimeTypes.find(type => mime.includes(type))
        : this.mimeTypes.includes(mime);
    }

    /**
     * Selects the most appropriate type from a list to use with mozGetDataAt().
     *
     * @param {string[]} types
     *
     * @returns {string?}
     */
    getMozType(types) {
      return types.find(type => this.mimeTypes.includes(type));
    }

    /**
     * Overridden by child classes that handle DataTransferItems. By default, no
     * processing is done.
     *
     * @param {DataTransferItem} item
     */
    async handleDataTransferItem() {}

    /**
     * Overridden by child classes that handle string data. By default, no
     * processing is done.
     *
     * @param {string} data
     */
    async handleString() {}
  }

  /**
   * CalDNDMozMessageTransferHandler handles messages dropped from the
   * message pane.
   */
  class CalDNDMozMessageTransferHandler extends CalDNDTransferHandler {
    mimeTypes = ["text/x-moz-message"];

    /**
     * Treats the provided data as a message uri. Invokes the listener's
     * onMessageDrop() method with the corresponding message header.
     *
     * @param {string} data
     */
    async handleString(data) {
      const messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
      this.listener.onDropMessage(messenger.msgHdrFromURI(data));
    }
  }

  /**
   * CalDNDAddressTransferHandler handles address book data internally dropped.
   */
  class CalDNDAddressTransferHandler extends CalDNDTransferHandler {
    mimeTypes = ["text/x-moz-address"];

    /**
     * Invokes the listener's onDropAddress() method.
     *
     * @param {string} data
     */
    async handleString(data) {
      this.listener.onDropAddress(data);
    }
  }

  /**
   * CalDNDDefaultTransferHandler serves as a "catch all" and should be included
   * last in the list of handlers.
   */
  class CalDNDDefaultTransferHandler extends CalDNDTransferHandler {
    willTransfer() {
      return true;
    }

    /**
     * If the dropped item is a file, it is treated as an event attachment,
     * otherwise it is ignored.
     *
     * @param {DataTransferItem} item
     */
    async handleDataTransferItem(item) {
      if (item.kind == "file") {
        const path = item.getAsFile().mozFullPath;
        if (path) {
          const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          file.initWithPath(path);

          const uri = Services.io.newFileURI(file);
          this.listener.onDropURL(uri);
        }
      }
    }
  }

  /**
   * CalDNDDirectTransferHandler provides a base class for CalDNDTransferHandlers
   * that directly extract the contents of a DataTransferItem for processing.
   *
   * @abstract
   */
  class CalDNDDirectTransferHandler extends CalDNDTransferHandler {
    /**
     * Extracts the raw string data from a DataTransferItem before passing to
     * handleString().
     *
     * @param {DataTransferItem} item
     */
    async handleDataTransferItem(item) {
      if (item.kind == "string") {
        const txt = await new Promise(resolve => item.getAsString(resolve));
        await this.handleString(txt);
      } else if (item.kind == "file") {
        const txt = await item.getAsFile().text();
        await this.handleString(txt);
      }
    }
  }

  /**
   * CalDNDICSTransferHandler handles internal or external data in ICS format.
   */
  class CalDNDICSTransferHandler extends CalDNDDirectTransferHandler {
    mimeTypes = ["text/calendar", "application/x-extension-ics"];

    /**
     * Parses the provided data as an ICS string before invoking the listener's
     * onDropItems() method.
     *
     * @param {string} data
     */
    async handleString(data) {
      if (AppConstants.platform == "macosx") {
        // Mac likes to convert all \r to \n, we need to reverse this.
        data = data.replace(/\n\n/g, "\r\n");
      }

      const parser = Cc["@mozilla.org/calendar/ics-parser;1"].createInstance(Ci.calIIcsParser);
      parser.parseString(data);
      this.listener.onDropItems(parser.getItems().concat(parser.getParentlessItems()));
    }
  }

  /**
   * CalDNDURLTransferHandler handles urls (dropped internally or externally).
   */
  class CalDNDURLTransferHandler extends CalDNDDirectTransferHandler {
    mimeTypes = ["text/uri-list", "text/x-moz-url"];

    _icsFilename = /filename=.*\.ics/;

    /**
     * Treats the provided data as a url. If we determine it is a url to an
     * ICS file, we delegate to the "text/calendar" handler. The listener's
     * onDropURL method is invoked otherwise.
     *
     * @param {string} data
     */
    async handleString(data) {
      data = data.split("\n")[0];
      if (!data) {
        return;
      }

      const uri = Services.io.newURI(data);

      // Below we attempt to detect ics files dropped from the message pane's
      // attachment list. These will appear as uris rather than file blobs so we
      // check the "filename" query parameter for a .ics extension.
      if (this._icsFilename.test(uri.query)) {
        const url = uri.mutate().setUsername("").setUserPass("").finalize().spec;

        const resp = await fetch(new Request(url, { method: "GET" }));
        const txt = await resp.text();
        await this.listener.getHandler("text/calendar").handleString(txt);
      } else {
        this.listener.onDropURL(uri);
      }
    }
  }

  /**
   * CalDNDPlainTextTransferHandler handles text/plain transfers coming mainly
   * from internally dropped text.
   */
  class CalDNDPlainTextTransferHandler extends CalDNDDirectTransferHandler {
    mimeTypes = ["text/plain"];

    _keyWords = ["VEVENT", "VTODO", "VCALENDAR"];

    _isICS(data) {
      return this._keyWords.some(kwrd => data.includes(kwrd));
    }

    /**
     * Treats the data provided as an uri to an .ics file and attempts to parse
     * its contents. If we detect calendar data however, we delegate to the
     * "text/calendar" handler.
     *
     * @param {string} data
     */
    async handleString(data) {
      if (this._isICS(data)) {
        this.listener.getHandler("text/calendar").handleString(data);
        return;
      }

      const droppedUrl = data.split("\n")[0];
      if (!droppedUrl) {
        return;
      }

      const url = Services.io.newURI(droppedUrl);

      const localFileInstance = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      localFileInstance.initWithPath(url.pathQueryRef);

      const inputStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
        Ci.nsIFileInputStream
      );
      inputStream.init(localFileInstance, MODE_RDONLY, parseInt("0444", 8), {});

      try {
        const importer = Cc["@mozilla.org/calendar/import;1?type=ics"].getService(Ci.calIImporter);
        const items = importer.importFromStream(inputStream);
        this.onDropItems(items);
      } finally {
        inputStream.close();
      }
    }
  }

  /**
   * This is the base class for calendar drag and drop listeners.
   */
  class CalDNDListener {
    /**
     * Limits the number of items to process from a drop operation. In the
     * future, this could be removed in favour of better UI for bulk operations.
     *
     * @type {number}
     */
    maxItemsTransferred = 8;

    /**
     * A list of CalDNDTransferHandlers for all of the supported mime types.
     * The order of this list is important as it dictates which types will be
     * selected first.
     *
     * @type {CalDNDTransferHandler[]}
     */
    mimeHandlers = [
      new CalDNDICSTransferHandler(this),
      new CalDNDMozMessageTransferHandler(this),
      new CalDNDAddressTransferHandler(this),
      new CalDNDURLTransferHandler(this),
      new CalDNDPlainTextTransferHandler(this),
      new CalDNDDefaultTransferHandler(this),
    ];

    /**
     * Provides the most suitable handler for the type or one of the types of a
     * list.
     *
     * @param {string|string[]} mime
     *
     * @returns {CalDNDTransferHandler}
     */
    getHandler(mime) {
      return this.mimeHandlers.find(handler => handler.willTransfer(mime));
    }

    /**
     * Prevents the browser's default behaviour when an item is dragged over the
     * drop target.
     *
     * @param {Event} event
     */
    onDragOver(event) {
      event.preventDefault();
    }

    /**
     * Handles calendar event items.
     *
     * @param {calIItemBase[]} items
     */
    onDropItems() {}

    /**
     * Handles mail messages.
     *
     * @param {nsIMsgHdr} msgHdr
     */
    onDropMessage() {}

    /**
     * Handles address book data.
     */
    onDropAddress() {}

    /**
     * Handles the drop event. The items property of DataTransfer can be
     * interpreted differently depending on whether the drop is coming from an
     * internal or external source (really its up to whatever is sending the
     * data to decide what the transfer entails).
     *
     * Mozilla seems to treat it as alternative formats for the data being
     * sent while external/other applications may only have one data transfer
     * item per single thing dropped. The item's interface seems to have
     * more accurate mime types than the ones of mozTypesAt() so working with
     * those are preferable however not always possible.
     *
     * This method tries to determine which of the APIs is more appropriate for
     * processing the drop. It does that by checking for a source node or a
     * difference between length of DataTransfer.items and DataTransfer
     * .mozItemCount.
     *
     * Note: While testing, it was noticed that dragging text from an external
     * application shows up erroneously as a file in DataTransfer.items. This is
     * dealt with too.
     *
     * @param {Event} event
     */
    async onDrop(event) {
      const { dataTransfer } = event;

      // No mozSourceNode means it's an external drop, however if the drop is
      // coming from Firefox then we can expect the same behaviour as done
      // internally. Generally there may be more DataTransferItems than
      // mozItemCount indicates.
      const isInternal =
        dataTransfer.mozSourceNode || dataTransfer.items.length != dataTransfer.mozItemCount;

      // For the strange case of copied text having the "file" kind, the files
      // property will have a length of zero.
      const actualFiles = Array.from(dataTransfer.items).filter(i => i.kind == "file").length;
      const isExternalText = actualFiles != dataTransfer.files.length;

      if (isInternal || isExternalText) {
        await this.onInternalDrop(dataTransfer);
      } else {
        await this.onExternalDrop(dataTransfer);
      }
    }

    /**
     * This method is intended for use when the drop event originates internally.
     *
     * @param {DataTransfer} dataTransfer
     */
    async onInternalDrop(dataTransfer) {
      for (let i = 0; i < dataTransfer.mozItemCount; i++) {
        if (i == this.maxItemsTransferred) {
          break;
        }

        const types = Array.from(dataTransfer.mozTypesAt(i));
        const handler = this.getHandler(types);
        const data = dataTransfer.mozGetDataAt(handler.getMozType(types), i);

        if (typeof data == "string") {
          await handler.handleString(data);
        }
      }
    }

    /**
     * This method is intended for use when the drop event originates externally.
     *
     * @param {DataTransfer} dataTransfer
     */
    async onExternalDrop(dataTransfer) {
      let i = 0;
      for (const item of dataTransfer.items) {
        if (i == this.maxItemsTransferred) {
          break;
        }

        const handler = this.getHandler(item.type);
        await handler.handleDataTransferItem(item, i, dataTransfer);
        i++;
      }
    }
  }

  /**
   * Drag'n'drop handler for the calendar views.
   */
  class CalViewDNDObserver extends CalDNDListener {
    wrappedJSObject = this;

    /**
     * Gets called in case we're dropping an array of items on one of the
     * calendar views. In this case we just try to add these items to the
     * currently selected calendar.
     *
     * @param {calIItemBase[]} items
     */
    onDropItems(items) {
      const destCal = getSelectedCalendar();
      startBatchTransaction();
      // we fall back explicitly to the popup to ask whether to send a
      // notification to participants if required
      const extResp = { responseMode: Ci.calIItipItem.USER };
      try {
        for (const item of items) {
          doTransaction("add", item, destCal, null, null, extResp);
        }
      } finally {
        endBatchTransaction();
      }
    }
  }

  /**
   * Drag'n'drop handler for the 'mail mode'-button. This handler is derived
   * from the base handler and just implements specific actions.
   */
  class CalMailButtonDNDObserver extends CalDNDListener {
    wrappedJSObject = this;

    /**
     * Gets called in case we're dropping an array of items on the
     * 'mail mode'-button.
     *
     * @param {calIItemBase[]} items
     */
    onDropItems(items) {
      if (items && items.length > 0) {
        const item = items[0];
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
        const recipients = cal.email.createRecipientList(parties);
        cal.email.sendTo(recipients, item.title, item.getProperty("DESCRIPTION"), identity);
      }
    }
  }

  /**
   * Drag'n'drop handler for the 'open calendar tab'-button. This handler is
   * derived from the base handler and just implements specific actions.
   */
  class CalCalendarButtonObserver extends CalDNDListener {
    wrappedJSObject = this;

    /**
     * Gets called in case we're dropping an array of items
     * on the 'open calendar tab'-button.
     *
     * @param {calIItemBase[]} items
     */
    onDropItems(items) {
      for (const item of items) {
        let newItem = item;
        if (item.isTodo()) {
          newItem = itemConversion.eventFromTask(item);
        }
        createEventWithDialog(null, null, null, null, newItem);
      }
    }

    /**
     * Gets called in case we're dropping a message on the 'open calendar tab'-
     * button. In this case we create a new event from the mail. We open the
     * default event dialog and just use the subject of the message as the event
     * title.
     *
     * @param {nsIMsgHdr} msgHdr
     */
    async onDropMessage(msgHdr) {
      const newItem = new CalEvent();
      await itemConversion.calendarItemFromMessage(newItem, msgHdr);
      createEventWithDialog(null, null, null, null, newItem);
    }

    /**
     * Gets called in case we're dropping a uri on the 'open calendar tab'-
     * button.
     *
     * @param {nsIURI} uri
     */
    onDropURL(uri) {
      const newItem = new CalEvent();
      newItem.calendar = getSelectedCalendar();
      cal.dtz.setDefaultStartEndHour(newItem);
      cal.alarms.setDefaultValues(newItem);
      const attachment = new CalAttachment();
      attachment.uri = uri;
      newItem.addAttachment(attachment);
      createEventWithDialog(null, null, null, null, newItem);
    }

    /**
     * Gets called in case we're dropping addresses on the 'open calendar tab'
     * -button.
     *
     * @param {string} addresses
     */
    onDropAddress(addresses) {
      const parsedInput = MailServices.headerParser.makeFromDisplayAddress(addresses);
      let attendee = new CalAttendee();
      attendee.id = "";
      attendee.rsvp = "TRUE";
      attendee.role = "REQ-PARTICIPANT";
      attendee.participationStatus = "NEEDS-ACTION";
      const attendees = parsedInput
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
            const name = address.name.replace(/(?:(?:[\\]")|(?:"))/g, "");
            if (address.email != name) {
              commonName = name;
            }
          }
          attendee.commonName = commonName;
          return attendee;
        });
      const newItem = new CalEvent();
      newItem.calendar = getSelectedCalendar();
      cal.dtz.setDefaultStartEndHour(newItem);
      cal.alarms.setDefaultValues(newItem);
      for (const attendee of attendees) {
        newItem.addAttendee(attendee);
      }
      createEventWithDialog(null, null, null, null, newItem);
    }
  }

  /**
   * Drag'n'drop handler for the 'open tasks tab'-button. This handler is
   * derived from the base handler and just implements specific actions.
   */
  class CalTaskButtonObserver extends CalDNDListener {
    wrappedJSObject = this;

    /**
     * Gets called in case we're dropping an array of items on the
     * 'open tasks tab'-button.
     *
     * @param {object} items - An array of items to handle.
     */
    onDropItems(items) {
      for (const item of items) {
        let newItem = item;
        if (item.isEvent()) {
          newItem = itemConversion.taskFromEvent(item);
        }
        createTodoWithDialog(null, null, null, newItem);
      }
    }

    /**
     * Gets called in case we're dropping a message on the 'open tasks tab'
     * -button.
     *
     * @param {nsIMsgHdr} msgHdr
     */
    async onDropMessage(msgHdr) {
      const todo = new CalTodo();
      await itemConversion.calendarItemFromMessage(todo, msgHdr);
      createTodoWithDialog(null, null, null, todo);
    }

    /**
     * Gets called in case we're dropping a uri on the 'open tasks tab'-button.
     *
     * @param {nsIURI} uri
     */
    onDropURL(uri) {
      const todo = new CalTodo();
      todo.calendar = getSelectedCalendar();
      cal.dtz.setDefaultStartEndHour(todo);
      cal.alarms.setDefaultValues(todo);
      const attachment = new CalAttachment();
      attachment.uri = uri;
      todo.addAttachment(attachment);
      createTodoWithDialog(null, null, null, todo);
    }
  }

  calendarViewDNDObserver = new CalViewDNDObserver();
  calendarMailButtonDNDObserver = new CalMailButtonDNDObserver();
  calendarCalendarButtonDNDObserver = new CalCalendarButtonObserver();
  calendarTaskButtonDNDObserver = new CalTaskButtonObserver();
}

/**
 * Invoke a drag session for the passed item. The passed box will be used as a
 * source.
 *
 * @param {object} aItem - The item to drag.
 * @param {object} aXULBox - The XUL box to invoke the drag session from.
 */
function invokeEventDragSession(aItem, aXULBox) {
  const transfer = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
  transfer.init(null);
  transfer.addDataFlavor("text/calendar");

  const flavourProvider = {
    QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

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

  if (aItem.isEvent()) {
    transfer.addDataFlavor("application/vnd.x-moz-cal-event");
    transfer.setTransferData("application/vnd.x-moz-cal-event", flavourProvider);
  } else if (aItem.isTodo()) {
    transfer.addDataFlavor("application/vnd.x-moz-cal-task");
    transfer.setTransferData("application/vnd.x-moz-cal-task", flavourProvider);
  }

  // Also set some normal data-types, in case we drag into another app
  const serializer = Cc["@mozilla.org/calendar/ics-serializer;1"].createInstance(
    Ci.calIIcsSerializer
  );
  serializer.addItems([aItem]);

  const supportsString = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
  supportsString.data = serializer.serializeToString();
  transfer.setTransferData("text/calendar", supportsString);
  transfer.setTransferData("text/plain", supportsString);

  const action = Ci.nsIDragService.DRAGDROP_ACTION_MOVE;
  const mutArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  mutArray.appendElement(transfer);
  aXULBox.sourceObject = aItem;
  try {
    cal.dragService.invokeDragSession(aXULBox, null, null, null, mutArray, action);
  } catch (e) {
    if (e.result != Cr.NS_ERROR_FAILURE) {
      // Pressing Escape on some platforms results in NS_ERROR_FAILURE
      // being thrown. Catch this exception, but throw anything else.
      throw e;
    }
  }
}
