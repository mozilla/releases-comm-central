/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { recurrenceRule2String } = ChromeUtils.import(
  "resource:///modules/calendar/calRecurrenceUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

const EXPORTED_SYMBOLS = ["calinvitation"];

var calinvitation = {
  /**
   * Returns a header title for an ITIP item depending on the response method
   * @param  {calItipItem}     aItipItem  the itip item to check
   * @return {String}          the header title
   */
  getItipHeader(aItipItem) {
    let header;

    if (aItipItem) {
      let item = aItipItem.getItemList()[0];
      let summary = item.getProperty("SUMMARY") || "";
      let organizer = item.organizer;
      let organizerString = organizer ? organizer.commonName || organizer.toString() : "";

      switch (aItipItem.responseMethod) {
        case "REQUEST":
          header = cal.l10n.getLtnString("itipRequestBody", [organizerString, summary]);
          break;
        case "CANCEL":
          header = cal.l10n.getLtnString("itipCancelBody", [organizerString, summary]);
          break;
        case "COUNTER":
        // falls through
        case "REPLY": {
          let attendees = item.getAttendees();
          let sender = cal.itip.getAttendeesBySender(attendees, aItipItem.sender);
          if (sender.length == 1) {
            if (aItipItem.responseMethod == "COUNTER") {
              header = cal.l10n.getLtnString("itipCounterBody", [sender[0].toString(), summary]);
            } else {
              let statusString =
                sender[0].participationStatus == "DECLINED"
                  ? "itipReplyBodyDecline"
                  : "itipReplyBodyAccept";
              header = cal.l10n.getLtnString(statusString, [sender[0].toString()]);
            }
          } else {
            header = "";
          }
          break;
        }
        case "DECLINECOUNTER":
          header = cal.l10n.getLtnString("itipDeclineCounterBody", [organizerString, summary]);
          break;
      }
    }

    if (!header) {
      header = cal.l10n.getLtnString("imipHtml.header");
    }

    return header;
  },

  _createAddedElement(doc) {
    let el = doc.createElement("ins");
    el.classList.add("added");
    return el;
  },

  _createRemovedElement(doc) {
    let el = doc.createElement("del");
    el.classList.add("removed");
    return el;
  },

  /**
   * Creates new icon and text label for the given event attendee.
   *
   * @param {Document} doc - The document the new label will belong to.
   * @param {calIAttendee} attendee - The attendee to create the label for.
   * @param {calIAttendee[]} attendeeList - The full list of attendees for the
   *   event.
   * @param {calIAttendee} [oldAttendee] - The previous version of this attendee
   *   for this event.
   * @param {calIAttendee[]} [attendeeList] - The previous list of attendees for
   *   this event. This is not optional if oldAttendee is given.
   *
   * @return {HTMLDivElement} - The new attendee label.
   */
  createAttendeeLabel(doc, attendee, attendeeList, oldAttendee, oldAttendeeList) {
    let userType = attendee.userType || "INDIVIDUAL";
    let role = attendee.role || "REQ-PARTICIPANT";
    let partstat = attendee.participationStatus || "NEEDS-ACTION";

    let modified =
      oldAttendee &&
      ((oldAttendee.userType || "INDIVIDUAL") != userType ||
        (oldAttendee.role || "REQ-PARTICIPANT") != role ||
        (oldAttendee.participationStatus || "NEEDS-ACTION") != partstat);

    // resolve delegatees/delegators to display also the CN
    let del = cal.itip.resolveDelegation(attendee, attendeeList);
    if (oldAttendee && !modified) {
      let oldDel = cal.itip.resolveDelegation(oldAttendee, oldAttendeeList);
      modified = oldDel.delegatees !== del.delegatees || oldDel.delegator !== del.delegator;
    }

    let userTypeString = cal.l10n.getLtnString("imipHtml.attendeeUserType2." + userType, [
      attendee.toString(),
    ]);
    let roleString = cal.l10n.getLtnString("imipHtml.attendeeRole2." + role, [userTypeString]);
    let partstatString = cal.l10n.getLtnString("imipHtml.attendeePartStat2." + partstat, [
      attendee.commonName || attendee.toString(),
      del.delegatees,
    ]);
    let tooltip = cal.l10n.getLtnString("imipHtml.attendee.combined", [roleString, partstatString]);

    let name = attendee.toString();
    if (del.delegators) {
      name += " " + cal.l10n.getLtnString("imipHtml.attendeeDelegatedFrom", [del.delegators]);
    }

    let attendeeLabel = doc.createElement("div");
    attendeeLabel.classList.add("attendee-label");
    // NOTE: tooltip will not appear when the top level is XUL.
    attendeeLabel.setAttribute("title", tooltip);
    attendeeLabel.setAttribute("attendeeid", attendee.id);

    if (modified) {
      attendeeLabel.classList.add("modified");
    }

    // FIXME: Replace icon with an img element with src and alt. The current
    // problem is that the icon image is set in CSS on the itip-icon class
    // with a background image that changes with the role attribute. This is
    // generally inaccessible (see Bug 1702560).
    let icon = doc.createElement("div");
    icon.classList.add("itip-icon");
    icon.setAttribute("partstat", partstat);
    icon.setAttribute("usertype", userType);
    icon.setAttribute("attendeerole", role);
    attendeeLabel.appendChild(icon);

    let text = doc.createElement("div");
    text.classList.add("attendee-name");
    text.appendChild(doc.createTextNode(name));
    attendeeLabel.appendChild(text);

    return attendeeLabel;
  },

  /**
   * Create an new list item element for an attendee, to be used as a child of
   * an "attendee-list" element.
   * @param {Document} doc - The document the new list item will belong to.
   * @param {Element} attendeeLabel - The attendee label to place within the
   *   list item.
   *
   * return {HTMLLIElement} - The attendee list item.
   */
  createAttendeeListItem(doc, attendeeLabel) {
    let listItem = doc.createElement("li");
    listItem.classList.add("attendee-list-item");
    listItem.appendChild(attendeeLabel);
    return listItem;
  },

  /**
   * Creates a new element that lists the given attendees.
   *
   * @param {Document} doc - The document the new list will belong to.
   * @param {calIAttendee[]} attendees - The attendees to create the list for.
   * @param {calIAttendee[]} [oldAttendees] - A list of attendees for a
   *   previous version of the event.
   *
   * @return {HTMLUListElement} - The list of attendees.
   */
  createAttendeesList(doc, attendees, oldAttendees) {
    let list = doc.createElement("ul");
    list.classList.add("attendee-list");

    let oldAttendeeData;
    if (oldAttendees) {
      oldAttendeeData = [];
      for (let attendee of oldAttendees) {
        let data = { attendee, item: null };
        oldAttendeeData.push(data);
      }
    }

    for (let attendee of attendees) {
      let attendeeLabel;
      let oldData;
      if (oldAttendeeData) {
        oldData = oldAttendeeData.find(old => old.attendee.id == attendee.id);
        if (oldData) {
          // Same attendee.
          attendeeLabel = this.createAttendeeLabel(
            doc,
            attendee,
            attendees,
            oldData.attendee,
            oldAttendees
          );
        } else {
          // Added attendee.
          attendeeLabel = this._createAddedElement(doc);
          attendeeLabel.appendChild(this.createAttendeeLabel(doc, attendee, attendees));
        }
      } else {
        attendeeLabel = this.createAttendeeLabel(doc, attendee, attendees);
      }
      let listItem = this.createAttendeeListItem(doc, attendeeLabel);
      if (oldData) {
        oldData.item = listItem;
      }
      list.appendChild(listItem);
    }

    if (oldAttendeeData) {
      let next = null;
      // Traverse from the end of the list to the start.
      for (let i = oldAttendeeData.length - 1; i >= 0; i--) {
        let data = oldAttendeeData[i];
        if (!data.item) {
          // Removed attendee.
          let attendeeLabel = this._createRemovedElement(doc);
          attendeeLabel.appendChild(this.createAttendeeLabel(doc, data.attendee, attendees));
          let listItem = this.createAttendeeListItem(doc, attendeeLabel);
          data.item = listItem;

          // Insert the removed attendee list item *before* the list item that
          // corresponds to the attendee that follows this attendee in the
          // oldAttendees list.
          //
          // NOTE: by traversing from the end of the list to the start, we are
          // prioritising being next to the attendee that follows us, rather
          // than being next to the attendee that precedes us in the oldAttendee
          // list.
          //
          // Specifically, if a new attendee is added between these two old
          // neighbours, the added attendee will be shown earlier than the
          // removed attendee in the list.
          //
          // E.g., going from the list
          //   [first@person, removed@person, second@person]
          // to
          //   [first@person, added@person, second@person]
          // will be shown as
          //   first@person
          //   + added@person
          //   - removed@person
          //   second@person
          // because the removed@person's uses second@person as their reference
          // point.
          //
          // NOTE: next.item is always non-null because next.item is always set
          // by the end of the last loop.
          list.insertBefore(listItem, next ? next.item : null);
        }
        next = data;
      }
    }

    return list;
  },

  /**
   * Returns the html representation of the event as a DOM document.
   *
   * @param {calIItemBase} event - The event to parse into html.
   * @param {calItipItem} itipItem - The itip item, which contains the event.
   * @return {Document} The html representation of the event.
   */
  createInvitationOverlay(event, itipItem) {
    // Creates HTML using the Node strings in the properties file
    const parser = new DOMParser();
    let doc = parser.parseFromString(calinvitation.htmlTemplate, "text/html");
    this.updateInvitationOverlay(doc, event, itipItem);
    return doc;
  },

  /**
   * Update the document created by createInvitationOverlay to show the new
   * event details, and optionally show changes in the event against an older
   * version of it.
   *
   * For example, this can be used for email invitations to update the invite to
   * show the most recent version of the event found in the calendar, whilst
   * also showing the event details that were removed since the original email
   * invitation. I.e. contrasting the event found in the calendar with the event
   * found within the email. Alternatively, if the email invitation is newer
   * than the event found in the calendar, you can switch the comparison around.
   * (As used in imip-bar.js.)
   *
   * @param {Document} doc - The document to update, previously created through
   *   createInvitationOverlay.
   * @param {calIItemBase} event - The newest version of the event.
   * @param {calItipItem} itipItem - The itip item, which contains the event.
   * @param {calIItemBase} [oldEvent] - A previous version of the event to
   *   show as updated.
   */
  updateInvitationOverlay(doc, event, itipItem, oldEvent) {
    doc.body.toggleAttribute(
      "systemcolors",
      Services.prefs.getBoolPref("calendar.view.useSystemColors", false)
    );

    let headerDescr = doc.getElementById("imipHtml-header");
    if (headerDescr) {
      headerDescr.textContent = calinvitation.getItipHeader(itipItem);
    }

    let formatter = cal.dtz.formatter;

    /**
     * Set whether the given field should be shown.
     *
     * @param {string} fieldName - The name of the field.
     * @param {boolean} show - Whether the field should be shown.
     */
    let showField = (fieldName, show) => {
      let row = doc.getElementById("imipHtml-" + fieldName + "-row");
      if (row.hidden && show) {
        // Make sure the field name is set.
        doc.getElementById("imipHtml-" + fieldName + "-descr").textContent = cal.l10n.getLtnString(
          "imipHtml." + fieldName
        );
      }
      row.hidden = !show;
    };

    /**
     * Set the given element to display the given value.
     *
     * @param {Element} element - The element to display the value within.
     * @param {string} value - The value to show.
     * @param {boolean} [convert=false] - Whether the value will need converting
     *   to a sanitised document fragment.
     * @param {string} [html] - The html to use as the value. This is only used
     *   if convert is set to true.
     */
    let setElementValue = (element, value, convert = false, html) => {
      if (convert) {
        element.appendChild(cal.view.textToHtmlDocumentFragment(value, doc, html));
      } else {
        element.textContent = value;
      }
    };

    /**
     * Set the given field.
     *
     * If oldEvent is set, and the new value differs from the old one, it will
     * be shown as added and/or removed content.
     *
     * If neither events have a value, the field will be hidden.
     *
     * @param {string} fieldName - The name of the field to set.
     * @param {Function} getValue - A method to retrieve the field value from an
     *   event. Should return a string, or a falsey value if the event has no
     *   value for this field.
     * @param {boolean} [convert=false] - Whether the value will need converting
     *   to a sanitised document fragment.
     * @param {Function} [getHtml] - A method to retrieve the value as a html.
     */
    let setField = (fieldName, getValue, convert = false, getHtml) => {
      let cell = doc.getElementById("imipHtml-" + fieldName + "-content");
      while (cell.lastChild) {
        cell.lastChild.remove();
      }
      let value = getValue(event);
      let oldValue = oldEvent && getValue(oldEvent);
      let html = getHtml && getHtml(event);
      let oldHtml = oldEvent && getHtml && getHtml(event);
      if (oldEvent && (oldValue || value) && oldValue !== value) {
        // Different values, with at least one being truthy.
        showField(fieldName, true);
        if (!oldValue) {
          let added = this._createAddedElement(doc);
          setElementValue(added, value, convert, html);
          cell.appendChild(added);
        } else if (!value) {
          let removed = this._createRemovedElement(doc);
          setElementValue(removed, oldValue, convert, oldHtml);
          cell.appendChild(removed);
        } else {
          let added = this._createAddedElement(doc);
          setElementValue(added, value, convert, html);
          let removed = this._createRemovedElement(doc);
          setElementValue(removed, oldValue, convert, oldHtml);

          cell.appendChild(added);
          cell.appendChild(doc.createElement("br"));
          cell.appendChild(removed);
        }
      } else if (value) {
        // Same truthy value.
        showField(fieldName, true);
        setElementValue(cell, value, convert, html);
      } else {
        showField(fieldName, false);
      }
    };

    setField("summary", ev => ev.title, true);
    setField("location", ev => ev.getProperty("LOCATION"), true);

    let kDefaultTimezone = cal.dtz.defaultTimezone;
    setField("when", ev => {
      if (ev.recurrenceInfo) {
        let startDate = ev.startDate?.getInTimezone(kDefaultTimezone) ?? null;
        let endDate = ev.endDate?.getInTimezone(kDefaultTimezone) ?? null;
        let repeatString = recurrenceRule2String(
          ev.recurrenceInfo,
          startDate,
          endDate,
          startDate.isDate
        );
        if (repeatString) {
          return repeatString;
        }
      }
      return formatter.formatItemInterval(ev);
    });

    setField("canceledOccurrences", ev => {
      if (!ev.recurrenceInfo) {
        return null;
      }
      let formattedExDates = [];

      // Show removed instances
      for (let exc of ev.recurrenceInfo.getRecurrenceItems()) {
        if (exc instanceof Ci.calIRecurrenceDate && exc.isNegative) {
          // This is an EXDATE
          let excDate = exc.date.getInTimezone(kDefaultTimezone);
          formattedExDates.push(formatter.formatDateTime(excDate));
        }
      }
      if (formattedExDates.length > 0) {
        return formattedExDates.join("\n");
      }
      return null;
    });

    let dateComptor = (a, b) => a.startDate.compare(b.startDate);

    setField("modifiedOccurrences", ev => {
      if (!ev.recurrenceInfo) {
        return null;
      }
      let modifiedOccurrences = [];

      for (let exc of ev.recurrenceInfo.getRecurrenceItems()) {
        if (exc instanceof Ci.calIRecurrenceDate && !exc.isNegative) {
          // This is an RDATE, close enough to a modified occurrence
          let excItem = ev.recurrenceInfo.getOccurrenceFor(exc.date);
          cal.data.binaryInsert(modifiedOccurrences, excItem, dateComptor, true);
        }
      }
      for (let recurrenceId of ev.recurrenceInfo.getExceptionIds()) {
        let exc = ev.recurrenceInfo.getExceptionFor(recurrenceId);
        let excLocation = exc.getProperty("LOCATION");

        // Only show modified occurrence if start, duration or location
        // has changed.
        exc.QueryInterface(Ci.calIEvent);
        if (
          exc.startDate.compare(exc.recurrenceId) != 0 ||
          exc.duration.compare(ev.duration) != 0 ||
          excLocation != ev.getProperty("LOCATION")
        ) {
          cal.data.binaryInsert(modifiedOccurrences, exc, dateComptor, true);
        }
      }

      if (modifiedOccurrences.length > 0) {
        let evLocation = ev.getProperty("LOCATION");
        return modifiedOccurrences
          .map(occ => {
            let formattedExc = formatter.formatItemInterval(occ);
            let occLocation = occ.getProperty("LOCATION");
            if (occLocation != evLocation) {
              formattedExc +=
                " (" + cal.l10n.getLtnString("imipHtml.newLocation", [occLocation]) + ")";
            }
            return formattedExc;
          })
          .join("\n");
      }
      return null;
    });

    setField(
      "description",
      // We remove the useless "Outlookism" squiggle.
      ev => ev.descriptionText?.replace("*~*~*~*~*~*~*~*~*~*", ""),
      true,
      ev => ev.descriptionHTML
    );

    setField("url", ev => ev.getProperty("URL"), true);
    setField(
      "attachments",
      ev => {
        // ATTACH - we only display URI but no BINARY type attachments here
        let links = [];
        for (let attachment of ev.getAttachments()) {
          if (attachment.uri) {
            links.push(attachment.uri.spec);
          }
        }
        return links.join("\n");
      },
      true
    );

    // ATTENDEE and ORGANIZER fields
    let attendees = event.getAttendees();
    let oldAttendees = oldEvent?.getAttendees();

    let organizerCell = doc.getElementById("imipHtml-organizer-cell");
    while (organizerCell.lastChild) {
      organizerCell.lastChild.remove();
    }

    let organizer = event.organizer;
    if (oldEvent) {
      let oldOrganizer = oldEvent.organizer;
      if (!organizer && !oldOrganizer) {
        showField("organizer", false);
      } else {
        showField("organizer", true);

        let removed = false;
        let added = false;
        if (!organizer) {
          removed = true;
        } else if (!oldOrganizer) {
          added = true;
        } else if (organizer.id !== oldOrganizer.id) {
          removed = true;
          added = true;
        } else {
          // Same organizer, potentially modified.
          organizerCell.appendChild(
            this.createAttendeeLabel(doc, organizer, attendees, oldOrganizer, oldAttendees)
          );
        }
        // Append added first.
        if (added) {
          let addedEl = this._createAddedElement(doc);
          addedEl.appendChild(this.createAttendeeLabel(doc, organizer, attendees));
          organizerCell.appendChild(addedEl);
        }
        if (removed) {
          let removedEl = this._createRemovedElement(doc);
          removedEl.appendChild(this.createAttendeeLabel(doc, oldOrganizer, oldAttendees));
          organizerCell.appendChild(removedEl);
        }
      }
    } else if (!organizer) {
      showField("organizer", false);
    } else {
      showField("organizer", true);
      organizerCell.appendChild(this.createAttendeeLabel(doc, organizer, attendees));
    }

    let attendeesCell = doc.getElementById("imipHtml-attendees-cell");
    while (attendeesCell.lastChild) {
      attendeesCell.lastChild.remove();
    }

    // Hide if we have no attendees, and neither does the old event.
    if (attendees.length == 0 && (!oldEvent || oldAttendees.length == 0)) {
      showField("attendees", false);
    } else {
      // oldAttendees is undefined if oldEvent is undefined.
      showField("attendees", true);
      attendeesCell.appendChild(this.createAttendeesList(doc, attendees, oldAttendees));
    }
  },

  /**
   * Returns the header section for an invitation email.
   * @param   {String}         aMessageId  the message id to use for that email
   * @param   {nsIMsgIdentity} aIdentity   the identity to use for that email
   * @returns {String}                     the source code of the header section of the email
   */
  getHeaderSection(aMessageId, aIdentity, aToList, aSubject) {
    let recipient = aIdentity.fullName + " <" + aIdentity.email + ">";
    let from = aIdentity.fullName.length
      ? cal.email.validateRecipientList(recipient)
      : aIdentity.email;
    let header =
      "MIME-version: 1.0\r\n" +
      (aIdentity.replyTo
        ? "Return-path: " + calinvitation.encodeMimeHeader(aIdentity.replyTo, true) + "\r\n"
        : "") +
      "From: " +
      calinvitation.encodeMimeHeader(from, true) +
      "\r\n" +
      (aIdentity.organization
        ? "Organization: " + calinvitation.encodeMimeHeader(aIdentity.organization) + "\r\n"
        : "") +
      "Message-ID: " +
      aMessageId +
      "\r\n" +
      "To: " +
      calinvitation.encodeMimeHeader(aToList, true) +
      "\r\n" +
      "Date: " +
      calinvitation.getRfc5322FormattedDate() +
      "\r\n" +
      "Subject: " +
      calinvitation.encodeMimeHeader(aSubject.replace(/(\n|\r\n)/, "|")) +
      "\r\n";
    let validRecipients;
    if (aIdentity.doCc) {
      validRecipients = cal.email.validateRecipientList(aIdentity.doCcList);
      if (validRecipients != "") {
        header += "Cc: " + calinvitation.encodeMimeHeader(validRecipients, true) + "\r\n";
      }
    }
    if (aIdentity.doBcc) {
      validRecipients = cal.email.validateRecipientList(aIdentity.doBccList);
      if (validRecipients != "") {
        header += "Bcc: " + calinvitation.encodeMimeHeader(validRecipients, true) + "\r\n";
      }
    }
    return header;
  },

  /**
   * Returns a datetime string according to section 3.3 of RfC5322
   * @param  {Date}   [optional] Js Date object to format; if not provided current DateTime is used
   * @return {String}            Datetime string with a modified tz-offset notation compared to
   *                             Date.toString() like "Fri, 20 Nov 2015 09:45:36 +0100"
   */
  getRfc5322FormattedDate(aDate = null) {
    let date = aDate || new Date();
    let str = date
      .toString()
      .replace(
        /^(\w{3}) (\w{3}) (\d{2}) (\d{4}) ([0-9:]{8}) GMT([+-])(\d{4}).*$/,
        "$1, $3 $2 $4 $5 $6$7"
      );
    // according to section 3.3 of RfC5322, +0000 should be used for defined timezones using
    // UTC time, while -0000 should indicate a floating time instead
    let timezone = cal.dtz.defaultTimezone;
    if (timezone && timezone.isFloating) {
      str.replace(/\+0000$/, "-0000");
    }
    return str;
  },

  /**
   * Converts a given unicode text to utf-8 and normalizes line-breaks to \r\n
   * @param  {String} aText   a unicode encoded string
   * @return {String}         the converted uft-8 encoded string
   */
  encodeUTF8(aText) {
    return calinvitation.convertFromUnicode("UTF-8", aText).replace(/(\r\n)|\n/g, "\r\n");
  },

  /**
   * Converts a given unicode text
   * @param  {String} aCharset   target character set
   * @param  {String} aSrc       unicode text to convert
   * @return {String}            the converted string
   */
  convertFromUnicode(aCharset, aSrc) {
    let unicodeConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(
      Ci.nsIScriptableUnicodeConverter
    );
    unicodeConverter.charset = aCharset;
    return unicodeConverter.ConvertFromUnicode(aSrc);
  },

  /**
   * Converts a header to a mime encoded header
   * @param  {String}  aHeader   a header to encode
   * @param  {boolean} aIsEmail  if enabled, only the CN but not the email address gets
   *                             converted - default value is false
   * @return {String}            the encoded string
   */
  encodeMimeHeader(aHeader, aIsEmail = false) {
    let fieldNameLen = aHeader.indexOf(": ") + 2;
    return MailServices.mimeConverter.encodeMimePartIIStr_UTF8(
      aHeader,
      aIsEmail,
      fieldNameLen,
      Ci.nsIMimeConverter.MIME_ENCODED_WORD_SIZE
    );
  },

  /**
   * Parses a counterproposal to extract differences to the existing event
   * @param  {calIEvent|calITodo} aProposedItem  The counterproposal
   * @param  {calIEvent|calITodo} aExistingItem  The item to compare with
   * @return {JSObject}                          Objcet of result and differences of parsing
   * @return {String} JsObject.result.type       Parsing result: OK|OLDVERSION|ERROR|NODIFF
   * @return {String} JsObject.result.descr      Parsing result description
   * @return {Array}  JsObject.differences       Array of objects consisting of property, proposed
   *                                                 and original properties.
   * @return {String} JsObject.comment           A comment of the attendee, if any
   */
  parseCounter(aProposedItem, aExistingItem) {
    let isEvent = aProposedItem.isEvent();
    // atm we only support a subset of properties, for a full list see RfC 5546 section 3.2.7
    let properties = ["SUMMARY", "LOCATION", "DTSTART", "DTEND", "COMMENT"];
    if (!isEvent) {
      cal.LOG("Parsing of counterproposals is currently only supported for events.");
      properties = [];
    }

    let diff = [];
    let status = { descr: "", type: "OK" };
    // As required in https://tools.ietf.org/html/rfc5546#section-3.2.7 a valid counterproposal
    // is referring to as existing UID and must include the same sequence number and organizer as
    // the original request being countered
    if (
      aProposedItem.id == aExistingItem.id &&
      aProposedItem.organizer &&
      aExistingItem.organizer &&
      aProposedItem.organizer.id == aExistingItem.organizer.id
    ) {
      let proposedSequence = aProposedItem.getProperty("SEQUENCE") || 0;
      let existingSequence = aExistingItem.getProperty("SEQUENCE") || 0;
      if (existingSequence >= proposedSequence) {
        if (existingSequence > proposedSequence) {
          // in this case we prompt the organizer with the additional information that the
          // received proposal refers to an outdated version of the event
          status.descr = "This is a counterproposal to an already rescheduled event.";
          status.type = "OUTDATED";
        } else if (aProposedItem.stampTime.compare(aExistingItem.stampTime) == -1) {
          // now this is the same sequence but the proposal is not based on the latest
          // update of the event - updated events may have minor changes, while for major
          // ones there has been a rescheduling
          status.descr = "This is a counterproposal not based on the latest event update.";
          status.type = "NOTLATESTUPDATE";
        }
        for (let prop of properties) {
          let newValue = aProposedItem.getProperty(prop) || null;
          let oldValue = aExistingItem.getProperty(prop) || null;
          if (
            (["DTSTART", "DTEND"].includes(prop) && newValue.toString() != oldValue.toString()) ||
            (!["DTSTART", "DTEND"].includes(prop) && newValue != oldValue)
          ) {
            diff.push({
              property: prop,
              proposed: newValue,
              original: oldValue,
            });
          }
        }
      } else {
        status.descr = "Invalid sequence number in counterproposal.";
        status.type = "ERROR";
      }
    } else {
      status.descr = "Mismatch of uid or organizer in counterproposal.";
      status.type = "ERROR";
    }
    if (status.type != "ERROR" && !diff.length) {
      status.descr = "No difference in counterproposal detected.";
      status.type = "NODIFF";
    }
    return { result: status, differences: diff };
  },

  /**
   * The HTML template used to format invitations for display.
   * This used to be in a separate file (invitation-template.xhtml) and should
   * probably be moved back there. But loading on-the-fly was causing a nasty
   * C++ reentrancy issue (see bug 1679299).
   */
  htmlTemplate: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="chrome://messagebody/skin/imip.css" />
    <link rel="stylesheet" href="chrome://messagebody/skin/calendar-attendees.css" />
  </head>
  <body>
    <details id="imipHTMLDetails" class="invitation-details">
      <summary id="imipHtml-header"></summary>
      <div class="invitation-border">
        <table class="invitation-table">
          <tr id="imipHtml-summary-row" hidden="hidden">
            <th id="imipHtml-summary-descr" class="description" scope="row"></th>
            <td id="imipHtml-summary-content" class="content"></td>
          </tr>
          <tr id="imipHtml-location-row" hidden="hidden">
            <th id="imipHtml-location-descr" class="description" scope="row"></th>
            <td id="imipHtml-location-content" class="content"></td>
          </tr>
          <tr id="imipHtml-when-row" hidden="hidden">
            <th id="imipHtml-when-descr" class="description" scope="row"></th>
            <td id="imipHtml-when-content" class="content"></td>
          </tr>
          <tr id="imipHtml-canceledOccurrences-row" hidden="hidden">
            <th id="imipHtml-canceledOccurrences-descr"
                class="description"
                scope="row">
            </th>
            <td id="imipHtml-canceledOccurrences-content" class="content"></td>
          </tr>
          <tr id="imipHtml-modifiedOccurrences-row" hidden="hidden">
            <th id="imipHtml-modifiedOccurrences-descr"
                class="description"
                scope="row">
            </th>
            <td id="imipHtml-modifiedOccurrences-content" class="content"></td>
          </tr>
          <tr id="imipHtml-organizer-row" hidden="hidden">
            <th id="imipHtml-organizer-descr"
                class="description"
                scope="row">
            </th>
            <td id="imipHtml-organizer-cell" class="content"></td>
          </tr>
          <tr id="imipHtml-description-row" hidden="hidden">
            <th id="imipHtml-description-descr"
                class="description"
                scope="row">
            </th>
            <td id="imipHtml-description-content" class="content"></td>
          </tr>
          <tr id="imipHtml-attachments-row" hidden="hidden">
            <th id="imipHtml-attachments-descr"
                class="description"
                scope="row"></th>
            <td id="imipHtml-attachments-content" class="content"></td>
          </tr>
          <tr id="imipHtml-comment-row" hidden="hidden">
            <th id="imipHtml-comment-descr" class="description" scope="row"></th>
            <td id="imipHtml-comment-content" class="content"></td>
          </tr>
          <tr id="imipHtml-attendees-row" hidden="hidden">
            <th id="imipHtml-attendees-descr"
                class="description"
                scope="row">
            </th>
            <td id="imipHtml-attendees-cell" class="content"></td>
          </tr>
          <tr id="imipHtml-url-row" hidden="hidden">
            <th id="imipHtml-url-descr" class="description" scope="row"></th>
            <td id="imipHtml-url-content" class="content"></td>
          </tr>
        </table>
      </div>
    </details>
  </body>
</html>
`,
};
