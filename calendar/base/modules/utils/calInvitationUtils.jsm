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

  /**
   * Creates new icon and text label for the given event attendee.
   *
   * @param {Document} doc - The document the new label will belong to.
   * @param {calIAttendee} attendee - The attendee to create the label for.
   * @param {calIAttendee[]} attendees - The full list of attendees for the
   *   event.
   *
   * @return {HTMLDivElement} - The new attendee label.
   */
  createAttendeeLabel(doc, attendee, attendees) {
    let userType = attendee.userType || "INDIVIDUAL";
    let role = attendee.role || "REQ-PARTICIPANT";
    let partstat = attendee.participationStatus || "NEEDS-ACTION";
    // resolve delegatees/delegators to display also the CN
    let del = cal.itip.resolveDelegation(attendee, attendees);

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

    let attendeeLabel = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    attendeeLabel.classList.add("attendee-label");
    // NOTE: tooltip will not appear when the top level is XUL.
    attendeeLabel.setAttribute("title", tooltip);
    attendeeLabel.setAttribute("attendeeid", attendee.id);

    // FIXME: Replace icon with an img element with src and alt. The current
    // problem is that the icon image is set in CSS on the itip-icon class
    // with a background image that changes with the role attribute. This is
    // generally inaccessible (see Bug 1702560).
    let icon = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    icon.classList.add("itip-icon");
    icon.setAttribute("partstat", partstat);
    icon.setAttribute("usertype", userType);
    icon.setAttribute("role", role);
    attendeeLabel.appendChild(icon);

    let text = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
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
    let listItem = doc.createElementNS("http://www.w3.org/1999/xhtml", "li");
    listItem.classList.add("attendee-list-item");
    listItem.appendChild(attendeeLabel);
    return listItem;
  },

  /**
   * Creates a new element that lists the given attendees.
   *
   * @param {Document} doc - The document the new list will belong to.
   * @param {calIAttendee[]} attendees - The attendees to create the list for.
   *
   * @return {HTMLUListElement} - The list of attendees.
   */
  createAttendeesList(doc, attendees) {
    let list = doc.createElementNS("http://www.w3.org/1999/xhtml", "ul");
    list.classList.add("attendee-list");

    for (let attendee of attendees) {
      list.appendChild(
        this.createAttendeeListItem(doc, this.createAttendeeLabel(doc, attendee, attendees))
      );
    }

    return list;
  },

  /**
   * Returns the html representation of the event as a DOM document.
   *
   * @param  {calIItemBase} aEvent     The event to parse into html.
   * @param  {calItipItem}  aItipItem  The itip item, which contains aEvent.
   * @return {DOM}                     The html representation of aEvent.
   */
  createInvitationOverlay(aEvent, aItipItem) {
    // Creates HTML using the Node strings in the properties file
    let doc = cal.xml.parseFile("chrome://calendar/content/invitation-template.xhtml");
    let formatter = cal.dtz.formatter;

    let field = function(aField, aContentText, aConvert, aContentHTML) {
      let descr = doc.getElementById("imipHtml-" + aField + "-descr");
      if (descr) {
        let labelText = cal.l10n.getLtnString("imipHtml." + aField);
        descr.textContent = labelText;
      }
      if (aContentText) {
        let content = doc.getElementById("imipHtml-" + aField + "-content");
        doc.getElementById("imipHtml-" + aField + "-row").hidden = false;
        if (aConvert) {
          let docFragment = cal.view.textToHtmlDocumentFragment(aContentText, doc, aContentHTML);
          content.appendChild(docFragment);
        } else {
          content.textContent = aContentText;
        }
      }
    };

    // Simple fields
    let headerDescr = doc.getElementById("imipHtml-header");
    if (headerDescr) {
      headerDescr.textContent = calinvitation.getItipHeader(aItipItem);
    }

    field("summary", aEvent.title, true);
    field("location", aEvent.getProperty("LOCATION"), true);

    let dateString = formatter.formatItemInterval(aEvent);

    if (aEvent.recurrenceInfo) {
      let kDefaultTimezone = cal.dtz.defaultTimezone;
      let startDate = aEvent.startDate;
      let endDate = aEvent.endDate;
      startDate = startDate ? startDate.getInTimezone(kDefaultTimezone) : null;
      endDate = endDate ? endDate.getInTimezone(kDefaultTimezone) : null;
      let repeatString = recurrenceRule2String(
        aEvent.recurrenceInfo,
        startDate,
        endDate,
        startDate.isDate
      );
      if (repeatString) {
        dateString = repeatString;
      }

      let formattedExDates = [];
      let modifiedOccurrences = [];

      let dateComptor = function(a, b) {
        return a.startDate.compare(b.startDate);
      };

      // Show removed instances
      for (let exc of aEvent.recurrenceInfo.getRecurrenceItems()) {
        if (exc instanceof Ci.calIRecurrenceDate) {
          if (exc.isNegative) {
            // This is an EXDATE
            let excDate = exc.date.getInTimezone(kDefaultTimezone);
            formattedExDates.push(formatter.formatDateTime(excDate));
          } else {
            // This is an RDATE, close enough to a modified occurrence
            let excItem = aEvent.recurrenceInfo.getOccurrenceFor(exc.date);
            cal.data.binaryInsert(modifiedOccurrences, excItem, dateComptor, true);
          }
        }
      }
      if (formattedExDates.length > 0) {
        field("canceledOccurrences", formattedExDates.join("\n"));
      }

      // Show modified occurrences
      for (let recurrenceId of aEvent.recurrenceInfo.getExceptionIds()) {
        let exc = aEvent.recurrenceInfo.getExceptionFor(recurrenceId);
        let excLocation = exc.getProperty("LOCATION");

        // Only show modified occurrence if start, duration or location
        // has changed.
        exc.QueryInterface(Ci.calIEvent);
        if (
          exc.startDate.compare(exc.recurrenceId) != 0 ||
          exc.duration.compare(aEvent.duration) != 0 ||
          excLocation != aEvent.getProperty("LOCATION")
        ) {
          cal.data.binaryInsert(modifiedOccurrences, exc, dateComptor, true);
        }
      }

      let stringifyOcc = function(occ) {
        let formattedExc = formatter.formatItemInterval(occ);
        let occLocation = occ.getProperty("LOCATION");
        if (occLocation != aEvent.getProperty("LOCATION")) {
          let location = cal.l10n.getLtnString("imipHtml.newLocation", [occLocation]);
          formattedExc += " (" + location + ")";
        }
        return formattedExc;
      };

      if (modifiedOccurrences.length > 0) {
        field("modifiedOccurrences", modifiedOccurrences.map(stringifyOcc).join("\n"));
      }
    }

    field("when", dateString);
    field("comment", aEvent.getProperty("COMMENT"), true);

    // DESCRIPTION field
    let eventDescription = (aEvent.descriptionText || "")
      /* Remove the useless "Outlookism" squiggle. */
      .replace("*~*~*~*~*~*~*~*~*~*", "");
    field("description", eventDescription, true, aEvent.descriptionHTML);

    // URL
    field("url", aEvent.getProperty("URL"), true);

    // ATTACH - we only display URI but no BINARY type attachments here
    let links = [];
    let attachments = aEvent.getAttachments();
    for (let attachment of attachments) {
      if (attachment.uri) {
        links.push(attachment.uri.spec);
      }
    }
    field("attachments", links.join("\n"), true);

    // ATTENDEE and ORGANIZER fields
    let organizerCell = doc.getElementById("imipHtml-organizer-cell");
    let attendeeCell = doc.getElementById("imipHtml-attendees-cell");
    let attendees = aEvent.getAttendees();
    doc.getElementById("imipHtml-attendees-row").hidden = attendees.length < 1;
    doc.getElementById("imipHtml-organizer-row").hidden = !aEvent.organizer;

    field("organizer");
    if (aEvent.organizer) {
      organizerCell.appendChild(this.createAttendeeLabel(doc, aEvent.organizer, attendees));
    }

    // Fill rows for attendees and organizer
    field("attendees");
    attendeeCell.appendChild(this.createAttendeesList(doc, attendees));

    return doc;
  },

  /**
   * Expects and return a serialized DOM - use cal.xml.serializeDOM(aDOM)
   * @param  {String} aOldDoc    serialized DOM of the the old document
   * @param  {String} aNewDoc    serialized DOM of the the new document
   * @return {String}            updated serialized DOM of the new document
   */
  compareInvitationOverlay(aOldDoc, aNewDoc) {
    let systemColors = Services.prefs.getBoolPref("calendar.view.useSystemColors", false);
    /**
     * Add a styling class to the given element.
     *
     * @param {Element} el - The element to add the class to.
     * @param {string} className - The name of the styling class to add.
     */
    function _addStyleClass(el, className) {
      el.classList.add(className);
      el.toggleAttribute("systemcolors", systemColors);
    }

    /**
     * Extract the elements from an element and place them within a new element
     * that represents a change in content.
     *
     * @param {Element} el - The element to extract content from. This will be
     *   empty after the method returns.
     * @param {string} change - The change that the returned element should
     *   represent.
     *
     * @return {HTMLModElement} - A new container for the previous content of
     *   the element. It will be styled and semantically tagged according to the
     *   given change.
     */
    function _extractChangedContent(el, change) {
      // Static list of children, including text nodes.
      let nodeDoc = el.ownerDocument;
      let children = Array.from(el.childNodes);
      let wrapper;
      if (change === "removed") {
        wrapper = nodeDoc.createElementNS("http://www.w3.org/1999/xhtml", "del");
      } else {
        wrapper = nodeDoc.createElementNS("http://www.w3.org/1999/xhtml", "ins");
      }
      _addStyleClass(wrapper, change);
      for (let child of children) {
        el.removeChild(child);
        wrapper.appendChild(child);
      }
      return wrapper;
    }

    /**
     * Compares a row across the two documents. The row in the new document will
     * be shown if the row was shown in either document. Otherwise, it will
     * remain hidden.
     *
     * @param {Document} doc - The current document.
     * @param {Document} oldDoc - The old document to compare against.
     * @param {String} rowId - The id for the row to compare.
     * @param {Function} removedCallback - Method to call if the row is hidden
     *  in the current document, but shown in the old document.
     * @param {Function} addedCallback - Method to call if the row is shown
     *  in the current document, but hidden in the old document.
     * @param {Function} modifiedCallback - Method to call if the row is shown
     *  in both documents.
     */
    function _compareRows(doc, oldDoc, rowId, removedCallback, addedCallback, modifiedCallback) {
      let oldRow = oldDoc.getElementById(rowId);
      let row = doc.getElementById(rowId);
      if (row.hidden && !oldRow.hidden) {
        removedCallback();
        row.hidden = false;
      } else if (!row.hidden && oldRow.hidden) {
        addedCallback();
      } else if (!row.hidden && !oldRow.hidden) {
        modifiedCallback();
      }
    }

    /**
     * Compares content across the two documents. The content of the new
     * document will be modified to reflect the changes.
     *
     * @param {Document} doc - The current document (which will be modified).
     * @param {Document} oldDoc - The old document to compare against.
     * @param {String} rowId - The id for the row that contains the content.
     * @param {String} contentId - The id for the content element.
     */
    function _compareContent(doc, oldDoc, rowId, contentId) {
      let content = doc.getElementById(contentId);
      let oldContent = oldDoc.getElementById(contentId);
      _compareRows(
        doc,
        oldDoc,
        rowId,
        // Removed row.
        () => {
          let removed = _extractChangedContent(oldContent, "removed");
          while (content.lastChild) {
            content.lastChild.remove();
          }
          content.appendChild(removed);
        },
        // Added row.
        () => {
          let added = _extractChangedContent(content, "added");
          content.appendChild(added);
        },
        // Modified row.
        () => {
          if (content.textContent !== oldContent.textContent) {
            let added = _extractChangedContent(content, "added");
            let removed = _extractChangedContent(oldContent, "removed");
            content.appendChild(added);
            content.appendChild(doc.createElementNS("http://www.w3.org/1999/xhtml", "br"));
            content.appendChild(removed);
          }
        }
      );
    }

    let oldDoc = cal.xml.parseString(aOldDoc);
    let doc = cal.xml.parseString(aNewDoc);
    // elements to consider for comparison
    [
      ["imipHtml-summary-row", "imipHtml-summary-content"],
      ["imipHtml-location-row", "imipHtml-location-content"],
      ["imipHtml-when-row", "imipHtml-when-content"],
      ["imipHtml-canceledOccurrences-row", "imipHtml-canceledOccurrences-content"],
      ["imipHtml-modifiedOccurrences-row", "imipHtml-modifiedOccurrences-content"],
    ].forEach(ids => _compareContent(doc, oldDoc, ids[0], ids[1]));

    /**
     * Relate two attendee labels.
     *
     * @param {Element} attendeeLabel - An attendee label.
     * @param {Element} otherAttendeeLabel - Another attendee label to compare
     *   against.
     *
     * @return {string} - The relation between the two labels:
     *   "different" if the attendee names differ,
     *   "modified" if the attendance details differ,
     *   "same" otherwise.
     */
    function _attendeeDiff(attendeeLabel, otherAttendeeLabel) {
      if (attendeeLabel.textContent !== otherAttendeeLabel.textContent) {
        return "different";
      }
      let otherIcon = otherAttendeeLabel.querySelector(".itip-icon");
      let icon = attendeeLabel.querySelector(".itip-icon");
      for (let attr of ["role", "partstat", "usertype"]) {
        if (icon.getAttribute(attr) !== otherIcon.getAttribute(attr)) {
          return "modified";
        }
      }
      return "same";
    }

    /**
     * Wrap the given element in-place to describe the given change.
     * The wrapper will semantically and/or stylistically describe the change.
     *
     * @param {Element} - The element to wrap. The new wrapper will take its
     *   place in the parent container.
     * @param {string} - The change that the wrapper should represent.
     */
    function _wrapChanged(el, change) {
      let nodeDoc = el.ownerDocument;
      let wrapper;
      switch (change) {
        case "removed":
          wrapper = nodeDoc.createElementNS("http://www.w3.org/1999/xhtml", "del");
          break;
        case "added":
          wrapper = nodeDoc.createElementNS("http://www.w3.org/1999/xhtml", "ins");
          break;
      }
      if (wrapper) {
        el.replaceWith(wrapper);
        wrapper.appendChild(el);
        el = wrapper;
      }
      _addStyleClass(el, change);
    }

    let organizerCell = doc.querySelector("#imipHtml-organizer-cell");
    let organizerLabel = organizerCell.querySelector(".attendee-label");
    let oldOrganizerLabel = oldDoc.querySelector("#imipHtml-organizer-cell .attendee-label");
    _compareRows(
      doc,
      oldDoc,
      "imipHtml-organizer-row",
      // Removed row.
      () => {
        oldOrganizerLabel.remove();
        if (organizerLabel) {
          organizerLabel.remove();
        }
        organizerCell.appendChild(oldOrganizerLabel);
        _wrapChanged(oldOrganizerLabel, "removed");
      },
      // Added row.
      () => _wrapChanged(organizerLabel, "added"),
      // Modified row.
      () => {
        switch (_attendeeDiff(organizerLabel, oldOrganizerLabel)) {
          case "different":
            _wrapChanged(organizerLabel, "added");
            oldOrganizerLabel.remove();
            organizerCell.appendChild(oldOrganizerLabel);
            _wrapChanged(oldOrganizerLabel, "removed");
            break;
          case "modified":
            _wrapChanged(organizerLabel, "modified");
            break;
        }
      }
    );

    let attendeeCell = doc.querySelector("#imipHtml-attendees-cell");
    let attendeeList = attendeeCell.querySelector(".attendee-list");
    let oldAttendeeList = oldDoc.querySelector("#imipHtml-attendees-cell .attendee-list");
    _compareRows(
      doc,
      oldDoc,
      "imipHtml-attendees-row",
      // Removed row.
      () => {
        oldAttendeeList.remove();
        if (attendeeList) {
          attendeeList.remove();
        }
        attendeeCell.appendChild(oldAttendeeList);
        _wrapChanged(oldAttendeeList, "removed");
      },
      // Added row.
      () => _wrapChanged(attendeeList, "added"),
      // Modified row.
      () => {
        let oldAttendees = Array.from(oldAttendeeList.querySelectorAll(".attendee-label"));
        for (let attendeeLabel of attendeeList.querySelectorAll(".attendee-label")) {
          let added = true;
          for (let i = 0; added && i < oldAttendees.length; i++) {
            switch (_attendeeDiff(attendeeLabel, oldAttendees[i])) {
              case "different":
                break;
              case "modified":
                _wrapChanged(attendeeLabel, "modified");
              // Fallthrough.
              case "same":
                oldAttendees.splice(i, 1);
                added = false;
                break;
            }
          }
          if (added) {
            _wrapChanged(attendeeLabel, "added");
          }
        }
        for (let oldAttendeeLabel of oldAttendees) {
          oldAttendeeLabel.remove();
          attendeeList.appendChild(this.createAttendeeListItem(doc, oldAttendeeLabel));
          _wrapChanged(oldAttendeeLabel, "removed");
        }
      }
    );

    return cal.xml.serializeDOM(doc);
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
};
