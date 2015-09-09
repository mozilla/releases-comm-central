/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calXMLUtils.jsm");
Components.utils.import("resource://calendar/modules/calRecurrenceUtils.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://calendar/modules/ltnUtils.jsm");

this.EXPORTED_SYMBOLS = ["ltn"]; // even though it's defined in ltnUtils.jsm, import needs this
ltn.invitation = {
    /**
     * Returns a header title for an ITIP item depending on the response method
     * @param  {calItipItem}     aItipItem  the itip item to check
     * @return {String}          the header title
     */
    getItipHeader: function (aItipItem) {
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
                case "REPLY": {
                    // This is a reply received from someone else, there should
                    // be just one attendee, the attendee that replied. If
                    // there is more than one attendee, just take the first so
                    // code doesn't break here.
                    let attendees = item.getAttendees({});
                    if (attendees && attendees.length >= 1) {
                        let sender = attendees[0];
                        let statusString = (sender.participationStatus == "DECLINED" ?
                                            "itipReplyBodyDecline" :
                                            "itipReplyBodyAccept");

                        header = ltn.getString("lightning", statusString, [sender.toString()]);
                    } else {
                        header = "";
                    }
                    break;
                }
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
    createInvitationOverlay: function (aEvent, aItipItem) {
        // Creates HTML using the Node strings in the properties file
        let doc = cal.xml.parseFile("chrome://lightning/content/lightning-invitation.xhtml");
        let formatter = cal.getDateFormatter();

        let linkConverter = Components.classes["@mozilla.org/txttohtmlconv;1"]
                                      .getService(Components.interfaces.mozITXTToHTMLConv);

        let field = function (aField, aContentText, aConvert) {
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
                    mode = Components.interfaces.mozITXTToHTMLConv.kStructPhrase +
                           Components.interfaces.mozITXTToHTMLConv.kGlyphSubstitution +
                           Components.interfaces.mozITXTToHTMLConv.kURLs;
                    content.innerHTML = linkConverter.scanHTML(contentText, mode);
                } else {
                    content.textContent = aContentText;
                }
            }
        }

        // Simple fields
        let headerDescr = doc.getElementById("imipHtml-header-descr");
        if (headerDescr) {
            headerDescr.textContent = ltn.invitation.getItipHeader(aItipItem);
        }

        field("summary", aEvent.title);
        field("location", aEvent.getProperty("LOCATION"));

        let dateString = formatter.formatItemInterval(aEvent);

        if (aEvent.recurrenceInfo) {
            let kDefaultTimezone = cal.calendarDefaultTimezone();
            let startDate =  aEvent.startDate;
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

            let dateComptor = function (a,b) {
                return a.startDate.compare(b.startDate);
            }

            // Show removed instances
            for (let exc of aEvent.recurrenceInfo.getRecurrenceItems({})) {
                if (exc instanceof Components.interfaces.calIRecurrenceDate) {
                    if (exc.isNegative) {
                        // This is an EXDATE
                        formattedExDates.push(formatter.formatDateTime(exc.date));
                    } else {
                        // This is an RDATE, close enough to a modified occurrence
                        let excItem = aEvent.recurrenceInfo.getOccurrenceFor(exc.date);
                        cal.binaryInsert(modifiedOccurrences, excItem, dateComptor, true)
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
                    cal.binaryInsert(modifiedOccurrences, exc, dateComptor, true)
                }
            }

            let stringifyOcc = function (occ) {
                let formattedExc = formatter.formatItemInterval(occ);
                let occLocation = occ.getProperty("LOCATION");
                if (occLocation != aEvent.getProperty("LOCATION")) {
                    let location = ltn.getString("lightning", "imipHtml.newLocation", [occLocation]);
                    formattedExc += " (" + location + ")";
                }
                return formattedExc;
            }

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

        // ATTENDEE and ORGANIZER fields
        let attendees = aEvent.getAttendees({});
        let attendeeTemplate = doc.getElementById("attendee-template");
        let attendeeTable = doc.getElementById("attendee-table");
        let organizerTable = doc.getElementById("organizer-table");
        doc.getElementById("imipHtml-attendees-row").hidden = (attendees.length < 1);
        doc.getElementById("imipHtml-organizer-row").hidden = !aEvent.organizer;

        let setupAttendee = function (attendee) {
            let row = attendeeTemplate.cloneNode(true);
            row.removeAttribute("id");
            row.removeAttribute("hidden");
            row.getElementsByClassName("status-icon")[0].setAttribute("status",
                                                                      attendee.participationStatus);
            row.getElementsByClassName("attendee-name")[0].textContent = attendee.toString();
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
    compareInvitationOverlay: function (aOldDoc, aNewDoc, aIgnoreId) {
        /**
         * Transforms text node content to formated child nodes. Decorations are defined in imip.css
         * @param {Node}    aToNode text node to change
         * @param {String}  aType   use 'newline' for the same, 'added' or 'removed' for decoration
         * @param {String}  aText   [optional]
         * @param {Boolean} aClear  [optional] for consecutive changes on the same node, set to false
         */
        function _content2Child(aToNode, aType, aText = '', aClear = true) {
            let nodeDoc = aToNode.ownerDocument;
            if (aClear && aToNode.hasChildNodes()) {
                aToNode.removeChild(aToNode.firstChild);
            }
            let n = nodeDoc.createElement((aType.toLowerCase() == 'newline') ? 'br' : 'span');
            switch (aType) {
                case 'added':
                case 'modified':
                case 'removed':
                    n.className = aType;
                    if (Preferences.get('calendar.view.useSystemColors', false)) {
                        n.setAttribute('systemcolors', true);
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
            for (let att of aDoc.getElementsByClassName('attendee-name')) {
                if (!att.parentNode.hidden &&
                    att.parentNode.parentNode.id == (aElement + '-table')) {
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
            let element = (aElement == 'attendee') ? aElement + 's' : aElement;
            let oldRow = aOldDoc.getElementById('imipHtml-' + element + '-row');
            let newRow = aNewDoc.getElementById('imipHtml-' + element + '-row');
            let row = doc.getElementById('imipHtml-' + element + '-row');
            let oldContent = aOldDoc.getElementById('imipHtml-' + aElement + '-content');
            let content = doc.getElementById('imipHtml-' + aElement + '-content');

            if (newRow.hidden && !oldRow.hidden) {
                // element was removed
                // we only need to check for simple elements here: attendee or organizer row
                // cannot be removed
                if (oldContent) {
                    _content2Child(content, 'removed', oldContent.textContent);
                    row.hidden = false;
                }
            } else if (!newRow.hidden && oldRow.hidden) {
                // the element was added
                // we only need to check for simple elements here: attendee or organizer row
                // must have been there before
                if (content) {
                    _content2Child(content, 'added', content.textContent);
                }
            } else if (!newRow.hidden && !oldRow.hidden) {
                // the element may have been modified
                if (content) {
                    if (content.textContent != oldContent.textContent) {
                        _content2Child(content, 'added', content.textContent);
                        _content2Child(content, 'newline', null, false);
                        _content2Child(content, 'removed', oldContent.textContent, false);
                    }
                } else {
                    content = doc.getElementById(aElement + '-table');
                    oldContent = aOldDoc.getElementById(aElement + '-table');
                    let excludeAddress = cal.removeMailTo(aIgnoreId);
                    if (content && oldContent && !content.isEqualNode(oldContent)) {
                        // extract attendees
                        let attendees = _getAttendees(doc, aElement);
                        let oldAttendees = _getAttendees(aOldDoc, aElement);
                        // decorate newly added attendees
                        for (let att of Object.keys(attendees)) {
                            if (!(att in oldAttendees)) {
                                _content2Child(attendees[att], 'added', att);
                            }
                        }
                        // decorate removed attendees
                        for (let att of Object.keys(oldAttendees)) {
                            // if att is the user his/herself, who accepted an invitation he/she was
                            // not invited to, we must exclude him/her here
                            if (!(att in attendees) && !att.includes(excludeAddress)) {
                                _content2Child(oldAttendees[att], 'removed', att);
                                content.appendChild(oldAttendees[att].parentNode.cloneNode(true));
                            }
                        }
                        // highlight partstat changes (excluding the user)
                        for (let att of Object.keys(oldAttendees)) {
                            if ((att in attendees) && !att.includes(excludeAddress)) {
                                let oldPS = oldAttendees[att].parentNode.childNodes[1].childNodes[0];
                                let newPS = attendees[att].parentNode.childNodes[1].childNodes[0];
                                if (oldPS.attributes[1].value != newPS.attributes[1].value) {
                                    _content2Child(attendees[att], 'modified', att);
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
        ['summary', 'location', 'when', 'canceledOccurrences',
         'modifiedOccurrences', 'organizer', 'attendee'].forEach(_compareElement);
        return cal.xml.serializeDOM(doc);
    }
};
