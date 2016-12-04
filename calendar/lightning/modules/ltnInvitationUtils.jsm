/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calXMLUtils.jsm");
Components.utils.import("resource://calendar/modules/calRecurrenceUtils.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://calendar/modules/ltnUtils.jsm");
Components.utils.import("resource:///modules/mailServices.js");

this.EXPORTED_SYMBOLS = ["ltn"]; // even though it's defined in ltnUtils.jsm, import needs this
ltn.invitation = {
    /**
     * Returns a header title for an ITIP item depending on the response method
     * @param  {calItipItem}     aItipItem  the itip item to check
     * @return {String}          the header title
     */
    getItipHeader: function(aItipItem) {
        let header;

        if (aItipItem) {
            let item = aItipItem.getItemList({})[0];
            let summary = item.getProperty("SUMMARY") || "";
            let organizer = item.organizer;
            let organizerString = (organizer) ?
              (organizer.commonName || organizer.toString()) : "";

            switch (aItipItem.responseMethod) {
                case "REQUEST":
                    header = ltn.getString("lightning",
                                           "itipRequestBody",
                                           [organizerString, summary]);
                    break;
                case "CANCEL":
                    header = ltn.getString("lightning",
                                           "itipCancelBody",
                                           [organizerString, summary]);
                    break;
                case "COUNTER":
                    // falls through
                case "REPLY":
                    let attendees = item.getAttendees({});
                    let sender = cal.getAttendeesBySender(attendees, aItipItem.sender);
                    if (sender.length == 1) {
                        if (aItipItem.responseMethod == "COUNTER") {
                            header = cal.calGetString("lightning",
                                                      "itipCounterBody",
                                                      [sender[0].toString(), summary],
                                                      "lightning");
                        } else {
                            let statusString = (sender[0].participationStatus == "DECLINED" ?
                                                "itipReplyBodyDecline" : "itipReplyBodyAccept");
                            header = cal.calGetString("lightning",
                                                      statusString,
                                                      [sender[0].toString()],
                                                      "lightning");
                        }
                    } else {
                        header = "";
                    }
                    break;
                case "DECLINECOUNTER":
                    header = ltn.getString("lightning",
                                           "itipDeclineCounterBody",
                                           [organizerString, summary]);
                    break;
            }
        }

        if (!header) {
            header = ltn.getString("lightning", "imipHtml.header", null);
        }

        return header;
    },

    /**
     * Returns the html representation of the event as a DOM document.
     *
     * @param  {calIItemBase} aEvent     The event to parse into html.
     * @param  {calItipItem}  aItipItem  The itip item, which containes aEvent.
     * @return {DOM}                     The html representation of aEvent.
     */
    createInvitationOverlay: function(aEvent, aItipItem) {
        // Creates HTML using the Node strings in the properties file
        let doc = cal.xml.parseFile("chrome://lightning/content/lightning-invitation.xhtml");
        let formatter = cal.getDateFormatter();

        let linkConverter = Components.classes["@mozilla.org/txttohtmlconv;1"]
                                      .getService(Components.interfaces.mozITXTToHTMLConv);

        let field = function(aField, aContentText, aConvert) {
            let descr = doc.getElementById("imipHtml-" + aField + "-descr");
            if (descr) {
                let labelText = ltn.getString("lightning", "imipHtml." + aField, null);
                descr.textContent = labelText;
            }

            if (aContentText) {
                let content = doc.getElementById("imipHtml-" + aField + "-content");
                doc.getElementById("imipHtml-" + aField + "-row").hidden = false;
                if (aConvert) {
                    // we convert special characters first to not mix up html conversion
                    let mode = Components.interfaces.mozITXTToHTMLConv.kEntities;
                    let contentText = linkConverter.scanTXT(aContentText, mode);
                    try {
                        // kGlyphSubstitution may lead to unexpected results when used in scanHTML
                        mode = Components.interfaces.mozITXTToHTMLConv.kStructPhrase +
                               Components.interfaces.mozITXTToHTMLConv.kGlyphSubstitution +
                               Components.interfaces.mozITXTToHTMLConv.kURLs;
                        content.innerHTML = linkConverter.scanHTML(contentText, mode);
                    } catch (e) {
                        mode = Components.interfaces.mozITXTToHTMLConv.kStructPhrase +
                               Components.interfaces.mozITXTToHTMLConv.kURLs;
                        content.innerHTML = linkConverter.scanHTML(contentText, mode);
                    }
                } else {
                    content.textContent = aContentText;
                }
            }
        };

        // Simple fields
        let headerDescr = doc.getElementById("imipHtml-header-descr");
        if (headerDescr) {
            headerDescr.textContent = ltn.invitation.getItipHeader(aItipItem);
        }

        field("summary", aEvent.title, true);
        field("location", aEvent.getProperty("LOCATION"), true);

        let dateString = formatter.formatItemInterval(aEvent);

        if (aEvent.recurrenceInfo) {
            let kDefaultTimezone = cal.calendarDefaultTimezone();
            let startDate = aEvent.startDate;
            let endDate = aEvent.endDate;
            startDate = startDate ? startDate.getInTimezone(kDefaultTimezone) : null;
            endDate = endDate ? endDate.getInTimezone(kDefaultTimezone) : null;
            let repeatString = recurrenceRule2String(aEvent.recurrenceInfo, startDate,
                                                     endDate, startDate.isDate);
            if (repeatString) {
                dateString = repeatString;
            }

            let formattedExDates = [];
            let modifiedOccurrences = [];

            let dateComptor = function(a, b) {
                return a.startDate.compare(b.startDate);
            };

            // Show removed instances
            for (let exc of aEvent.recurrenceInfo.getRecurrenceItems({})) {
                if (exc instanceof Components.interfaces.calIRecurrenceDate) {
                    if (exc.isNegative) {
                        // This is an EXDATE
                        formattedExDates.push(formatter.formatDateTime(exc.date));
                    } else {
                        // This is an RDATE, close enough to a modified occurrence
                        let excItem = aEvent.recurrenceInfo.getOccurrenceFor(exc.date);
                        cal.binaryInsert(modifiedOccurrences, excItem, dateComptor, true);
                    }
                }
            }
            if (formattedExDates.length > 0) {
                field("canceledOccurrences", formattedExDates.join("\n"));
            }

            // Show modified occurrences
            for (let recurrenceId of aEvent.recurrenceInfo.getExceptionIds({})) {
                let exc = aEvent.recurrenceInfo.getExceptionFor(recurrenceId);
                let excLocation = exc.getProperty("LOCATION");

                // Only show modified occurrence if start, duration or location
                // has changed.
                if (exc.startDate.compare(exc.recurrenceId) != 0 ||
                    exc.duration.compare(aEvent.duration) != 0 ||
                    excLocation != aEvent.getProperty("LOCATION")) {
                    cal.binaryInsert(modifiedOccurrences, exc, dateComptor, true);
                }
            }

            let stringifyOcc = function(occ) {
                let formattedExc = formatter.formatItemInterval(occ);
                let occLocation = occ.getProperty("LOCATION");
                if (occLocation != aEvent.getProperty("LOCATION")) {
                    let location = ltn.getString("lightning", "imipHtml.newLocation", [occLocation]);
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
        let eventDescription = (aEvent.getProperty("DESCRIPTION") || "")
                                    /* Remove the useless "Outlookism" squiggle. */
                                    .replace("*~*~*~*~*~*~*~*~*~*", "");
        field("description", eventDescription, true);

        // URL
        field("url", aEvent.getProperty("URL"), true);

        // ATTACH - we only display URI but no BINARY type attachments here
        let links = [];
        let attachments = aEvent.getAttachments({});
        for (let attachment of attachments) {
            if (attachment.uri) {
                links.push(attachment.uri.spec);
            }
        }
        field("attachments", links.join("<br>"), true);

        // ATTENDEE and ORGANIZER fields
        let attendees = aEvent.getAttendees({});
        let attendeeTemplate = doc.getElementById("attendee-template");
        let attendeeTable = doc.getElementById("attendee-table");
        let organizerTable = doc.getElementById("organizer-table");
        doc.getElementById("imipHtml-attendees-row").hidden = (attendees.length < 1);
        doc.getElementById("imipHtml-organizer-row").hidden = !aEvent.organizer;

        let setupAttendee = function(aAttendee) {
            let row = attendeeTemplate.cloneNode(true);
            row.removeAttribute("id");
            row.removeAttribute("hidden");

            // resolve delegatees/delegators to display also the CN
            let del = cal.resolveDelegation(aAttendee, attendees);
            if (del.delegators != "") {
                del.delegators = " " + ltn.getString("lightning", "imipHtml.attendeeDelegatedFrom",
                                                     [del.delegators]);
            }

            // display itip icon
            let role = aAttendee.role || "REQ-PARTICIPANT";
            let partstat = aAttendee.participationStatus || "NEEDS-ACTION";
            let userType = aAttendee.userType || "INDIVIDUAL";
            let itipIcon = row.getElementsByClassName("itip-icon")[0];
            itipIcon.setAttribute("role", role);
            itipIcon.setAttribute("usertype", userType);
            itipIcon.setAttribute("partstat", partstat);
            let attName = aAttendee.commonName && aAttendee.commonName.length
                          ? aAttendee.commonName : aAttendee.toString();
            let userTypeString = ltn.getString("lightning", "imipHtml.attendeeUserType2." + userType,
                                               [aAttendee.toString()]);
            let roleString = ltn.getString("lightning", "imipHtml.attendeeRole2." + role,
                                           [userTypeString]);
            let partstatString = ltn.getString("lightning", "imipHtml.attendeePartStat2." + partstat,
                                               [attName, del.delegatees]);
            let itipTooltip = ltn.getString("lightning", "imipHtml.attendee.combined",
                                            [roleString, partstatString]);
            row.setAttribute("title", itipTooltip);
            // display attendee
            row.getElementsByClassName("attendee-name")[0].textContent = aAttendee.toString() +
                                                                         del.delegators;
            return row;
        };

        // Fill rows for attendees and organizer
        field("attendees");
        for (let attendee of attendees) {
            attendeeTable.appendChild(setupAttendee(attendee));
        }

        field("organizer");
        if (aEvent.organizer) {
            organizerTable.appendChild(setupAttendee(aEvent.organizer));
        }

        return doc;
    },

    /**
     * Expects and return a serialized DOM - use cal.xml.serializeDOM(aDOM)
     * @param  {String} aOldDoc    serialized DOM of the the old document
     * @param  {String} aNewDoc    serialized DOM of the the new document
     * @param  {String} aIgnoreId  attendee id to ignore, usually the organizer
     * @return {String}            updated serialized DOM of the new document
     */
    compareInvitationOverlay: function(aOldDoc, aNewDoc, aIgnoreId) {
        /**
         * Transforms text node content to formated child nodes. Decorations are defined in imip.css
         * @param {Node}    aToNode text node to change
         * @param {String}  aType   use 'newline' for the same, 'added' or 'removed' for decoration
         * @param {String}  aText   [optional]
         * @param {Boolean} aClear  [optional] for consecutive changes on the same node, set to false
         */
        function _content2Child(aToNode, aType, aText = "", aClear = true) {
            let nodeDoc = aToNode.ownerDocument;
            if (aClear && aToNode.hasChildNodes()) {
                aToNode.removeChild(aToNode.firstChild);
            }
            let n = nodeDoc.createElement(aType.toLowerCase() == "newline" ? "br" : "span");
            switch (aType) {
                case "added":
                case "modified":
                case "removed":
                    n.className = aType;
                    if (Preferences.get("calendar.view.useSystemColors", false)) {
                        n.setAttribute("systemcolors", true);
                    }
                    break;
            }
            n.textContent = aText;
            aToNode.appendChild(n);
        }
        /**
         * Extracts attendees from the given document
         * @param   {Node}   aDoc      document to search in
         * @param   {String} aElement  element name as used in _compareElement()
         * @returns {Array}            attendee nodes
         */
        function _getAttendees(aDoc, aElement) {
            let attendees = [];
            for (let att of aDoc.getElementsByClassName("attendee-name")) {
                if (!att.parentNode.hidden &&
                    att.parentNode.parentNode.id == (aElement + "-table")) {
                    attendees[att.textContent] = att;
                }
            }
            return attendees;
        }
        /**
         * Compares both documents for elements related to the given name
         * @param {String} aElement  part of the element id within the html template
         */
        function _compareElement(aElement) {
            let element = aElement == "attendee" ? aElement + "s" : aElement;
            let oldRow = aOldDoc.getElementById("imipHtml-" + element + "-row");
            let newRow = aNewDoc.getElementById("imipHtml-" + element + "-row");
            let row = doc.getElementById("imipHtml-" + element + "-row");
            let oldContent = aOldDoc.getElementById("imipHtml-" + aElement + "-content");
            let content = doc.getElementById("imipHtml-" + aElement + "-content");

            if (newRow.hidden && !oldRow.hidden) {
                // element was removed
                // we only need to check for simple elements here: attendee or organizer row
                // cannot be removed
                if (oldContent) {
                    _content2Child(content, "removed", oldContent.textContent);
                    row.hidden = false;
                }
            } else if (!newRow.hidden && oldRow.hidden) {
                // the element was added
                // we only need to check for simple elements here: attendee or organizer row
                // must have been there before
                if (content) {
                    _content2Child(content, "added", content.textContent);
                }
            } else if (!newRow.hidden && !oldRow.hidden) {
                // the element may have been modified
                if (content) {
                    if (content.textContent != oldContent.textContent) {
                        _content2Child(content, "added", content.textContent);
                        _content2Child(content, "newline", null, false);
                        _content2Child(content, "removed", oldContent.textContent, false);
                    }
                } else {
                    content = doc.getElementById(aElement + "-table");
                    oldContent = aOldDoc.getElementById(aElement + "-table");
                    let excludeAddress = cal.removeMailTo(aIgnoreId);
                    if (content && oldContent && !content.isEqualNode(oldContent)) {
                        // extract attendees
                        let attendees = _getAttendees(doc, aElement);
                        let oldAttendees = _getAttendees(aOldDoc, aElement);
                        // decorate newly added attendees
                        for (let att of Object.keys(attendees)) {
                            if (!(att in oldAttendees)) {
                                _content2Child(attendees[att], "added", att);
                            }
                        }
                        for (let att of Object.keys(oldAttendees)) {
                            // if att is the user his/herself, who accepted an invitation he/she was
                            // not invited to, we exclude him/her from decoration
                            let notExcluded = excludeAddress == "" ||
                                               !att.includes(excludeAddress);
                            // decorate removed attendees
                            if (!(att in attendees) && notExcluded) {
                                _content2Child(oldAttendees[att], "removed", att);
                                content.appendChild(oldAttendees[att].parentNode.cloneNode(true));
                            } else if ((att in attendees) && notExcluded) {
                                // highlight partstat, role or usertype changes
                                let oldAtts = oldAttendees[att].parentNode
                                                               .getElementsByClassName("itip-icon")[0]
                                                               .attributes;
                                let newAtts = attendees[att].parentNode
                                                            .getElementsByClassName("itip-icon")[0]
                                                            .attributes;
                                let hasChanged = function(name) {
                                    return oldAtts.getNamedItem(name).value !=
                                           newAtts.getNamedItem(name).value;
                                };
                                if (["role", "partstat", "usertype"].some(hasChanged)) {
                                    _content2Child(attendees[att], "modified", att);
                                }
                            }
                        }
                    }
                }
            }
        }
        aOldDoc = cal.xml.parseString(aOldDoc);
        aNewDoc = cal.xml.parseString(aNewDoc);
        let doc = aNewDoc.cloneNode(true);
        // elements to consider for comparison
        ["summary", "location", "when", "canceledOccurrences",
         "modifiedOccurrences", "organizer", "attendee"].forEach(_compareElement);
        return cal.xml.serializeDOM(doc);
    },

    /**
     * Returns the header section for an invitation email.
     * @param   {String}         aMessageId  the message id to use for that email
     * @param   {nsIMsgIdentity} aIdentity   the identity to use for that email
     * @returns {String}                     the source code of the header section of the email
     */
    getHeaderSection: function(aMessageId, aIdentity, aToList, aSubject) {
        let recipient = aIdentity.fullName + " <" + aIdentity.email + ">";
        let from = aIdentity.fullName.length ? cal.validateRecipientList(recipient)
                                             : aIdentity.email;
        let header = "MIME-version: 1.0\r\n" +
                     (aIdentity.replyTo ? "Return-path: " +
                                          ltn.invitation.encodeMimeHeader(aIdentity.replyTo, true) +
                                          "\r\n" : "") +
                     "From: " + ltn.invitation.encodeMimeHeader(from, true) + "\r\n" +
                     (aIdentity.organization ? "Organization: " +
                                               ltn.invitation.encodeMimeHeader(aIdentity.organization) +
                                               "\r\n" : "") +
                     "Message-ID: " + aMessageId + "\r\n" +
                     "To: " + ltn.invitation.encodeMimeHeader(aToList, true) + "\r\n" +
                     "Date: " + ltn.invitation.getRfc5322FormattedDate() + "\r\n" +
                     "Subject: " + ltn.invitation
                                      .encodeMimeHeader(aSubject.replace(/(\n|\r\n)/, "|")) + "\r\n";
        let validRecipients;
        if (aIdentity.doCc) {
            validRecipients = cal.validateRecipientList(aIdentity.doCcList);
            if (validRecipients != "") {
                header += "Cc: " + ltn.invitation.encodeMimeHeader(validRecipients, true) + "\r\n";
            }
        }
        if (aIdentity.doBcc) {
            validRecipients = cal.validateRecipientList(aIdentity.doBccList);
            if (validRecipients != "") {
                header += "Bcc: " + ltn.invitation.encodeMimeHeader(validRecipients, true) + "\r\n";
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
    getRfc5322FormattedDate: function(aDate = null) {
        let date = aDate || new Date();
        let str = date.toString()
                      .replace(/^(\w{3}) (\w{3}) (\d{2}) (\d{4}) ([0-9:]{8}) GMT([+-])(\d{4}).*$/,
                               "$1, $3 $2 $4 $5 $6$7");
        // according to section 3.3 of RfC5322, +0000 should be used for defined timezones using
        // UTC time, while -0000 should indicate a floating time instead
        let timezone = cal.calendarDefaultTimezone();
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
    encodeUTF8: function(aText) {
        return ltn.invitation.convertFromUnicode("UTF-8", aText).replace(/(\r\n)|\n/g, "\r\n");
    },

    /**
     * Converts a given unicode text
     * @param  {String} aCharset   target character set
     * @param  {String} aSrc       unicode text to convert
     * @return {String}            the converted string
     */
    convertFromUnicode: function(aCharset, aSrc) {
        let unicodeConverter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
                                         .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
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
    encodeMimeHeader: function(aHeader, aIsEmail = false) {
        let fieldNameLen = aHeader.indexOf(": ") + 2;
        return MailServices.mimeConverter
                           .encodeMimePartIIStr_UTF8(aHeader,
                                                     aIsEmail,
                                                     "UTF-8",
                                                     fieldNameLen,
                                                     Components.interfaces
                                                               .nsIMimeConverter
                                                               .MIME_ENCODED_WORD_SIZE);
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
    parseCounter: function(aProposedItem, aExistingItem) {
        let isEvent = cal.isEvent(aProposedItem);
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
        if (aProposedItem.id == aExistingItem.id &&
            aProposedItem.organizer && aExistingItem.organizer &&
            aProposedItem.organizer.id == aExistingItem.organizer.id) {
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
                    if ((["DTSTART", "DTEND"].includes(prop) && newValue.toString() != oldValue.toString()) ||
                        (!["DTSTART", "DTEND"].includes(prop) && newValue != oldValue)) {
                        diff.push({
                            property: prop,
                            proposed: newValue,
                            original: oldValue
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
    }
};
