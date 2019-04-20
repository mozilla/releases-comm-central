/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements, MozXULElement, Services */
/* import-globals-from ../calendar-ui-utils.js */

var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

/**
 * MozCalendarEventFreebusyTimebar is a widget showing the time slot labels - dates and a number of
 * times instances of each date. It is typically used in combination with a grid showing free and
 * busy times for attendees going to an event, as used in the Invite Attendees dialog.
 *
 * @extends {MozElements.RichListBox}
 */
class MozCalendarEventFreebusyTimebar extends MozElements.RichListBox {
    constructor() {
        super();

        this.mNumDays = 0;
        this.mRange = 0;
        this.mStartDate = null;
        this.mEndDate = null;
        this.mDayOffset = 0;
        this.mScrollOffset = 0;
        this.mStartHour = 0;
        this.mEndHour = 24;
        this.mForce24Hours = false;
        this.mZoomFactor = 100;
    }

    /**
     * Sets mZoomFactor to a new value, clears freebusy-day's children, and updates zoomFactor and
     * force24Hours properties of freebusy-day element.
     *
     * @param {Number} val       new mZoomFactor value
     * @returns {Number}         new mZoomFactor value
     */
    set zoomFactor(val) {
        this.mZoomFactor = val;

        let template = this.getElementsByTagName("calendar-event-freebusy-day")[0];
        let parent = template.parentNode;
        while (parent.childNodes.length > 1) {
            parent.lastChild.remove();
        }

        template.force24Hours = this.mForce24Hours;
        template.zoomFactor = this.mZoomFactor;

        return val;
    }

    /**
     * @returns {Number}       mZoomFactor value
     */
    get zoomFactor() {
        return this.mZoomFactor;
    }

    /**
     * Sets mForce24Hours to a new value, updates startHour and endHour properties, clears
     * freebusy-day's children, and updates zoomFactor and force24Hours properties of freebusy-day
     * element.
     *
     * @param {Boolean} val       new mForce24Hours value
     * @returns {Boolean}         new mForce24Hours value
     */
    set force24Hours(val) {
        this.mForce24Hours = val;
        this.initTimeRange();

        let template = this.getElementsByTagName("calendar-event-freebusy-day")[0];

        let parent = template.parentNode;
        while (parent.childNodes.length > 1) {
            parent.lastChild.remove();
        }

        template.force24Hours = this.mForce24Hours;
        template.zoomFactor = this.mZoomFactor;

        return val;
    }

    /**
     * @returns {Boolean}       mForce24Hours value
     */
    get force24Hours() {
        return this.mForce24Hours;
    }

    /**
     * @returns {Number}       The difference between the first two day-elements
     */
    get contentWidth() {
        let template = this.getElementsByTagName("calendar-event-freebusy-day")[0];
        return template.nextSibling.getBoundingClientRect().x - template.getBoundingClientRect().x;
    }

    /**
     * @returns {Number}       Parent node's width
     */
    get containerWidth() {
        return this.parentNode.getBoundingClientRect().width;
    }

    /**
     * Sets mStartDate to a new value and make it immutable.
     *
     * @param {calDateTime} val       new mStartDate value
     * @returns {calDateTime}         new mStartDate value
     */
    set startDate(val) {
        this.mStartDate = val.clone();
        this.mStartDate.makeImmutable();
        return val;
    }

    /**
     * @returns {calDateTime}       mStartDate value
     */
    get startDate() {
        return this.mStartDate;
    }

    /**
     * Sets mEndDate to a new value and make it immutable.
     *
     * @param {calDateTime} val       new mEndDate value
     * @returns {calDateTime}         new mEndDate value
     */
    set endDate(val) {
        this.mEndDate = val.clone();
        this.mEndDate.makeImmutable();
        return val;
    }

    /**
     * @returns {calDateTime}       mEndDate value
     */
    get endDate() {
        return this.mEndDate;
    }

    /**
     * Sets mDayOffset to a new value and adjust scroll-container children according to it.
     *
     * @param {Number} val       new mDayOffset value
     * @returns {Number}         new mDayOffset value
     */
    set dayOffset(val) {
        this.mDayOffset = val;
        let container = this.getElementsByTagName("scroll-container")[0];
        let date = this.mStartDate.clone();
        date.day += val;
        let numChilds = container.childNodes.length;
        for (let i = 0; i < numChilds; i++) {
            let child = container.childNodes[i];
            child.date = date;
            date.day++;
        }
        return val;
    }

    /**
     * @returns {Number}       The scale of the total shift needed to step one block further
     */
    get step() {
        // How much pixels spans a single day
        let oneday = this.contentWidth;

        // The difference in pixels between the content and the container.
        let shift = (oneday * this.mRange) - (this.containerWidth);

        // What we want to know is the scale of the total shift needed to step one block further.
        // Since the content is divided into 'numHours' equal parts, we can simply state:
        let numHours = this.mEndHour - this.mStartHour;
        return (this.contentWidth) / (numHours * shift);
    }

    /**
     * Sets mScrollOffset value.
     *
     * @param {Number} val       new mScrollOffset value
     * @returns {Number}         new mScrollOffset value
     */
    set scroll(val) {
        this.mScrollOffset = val;

        // How much pixels spans a single day
        let oneday = this.contentWidth;

        // The difference in pixels between the content and the container.
        let shift = (oneday * this.mRange) - (this.containerWidth);

        // Now calculate the (positive) offset in pixels which the content needs to be shifted.
        // This is a simple scaling in one dimension.
        let offset = Math.floor(val * shift);

        // Now find out how much days this offset effectively skips. This is a simple division which
        // always yields a positive integer value.
        this.dayOffset = (offset - (offset % oneday)) / oneday;

        // Set the pixel offset for the content which will always need to be in the range
        // [0 <= offset <= oneday].
        offset %= oneday;

        // Set the offset at the content node.
        let container = this.getElementsByTagName("scroll-container")[0];
        container.x = offset;
        return val;
    }

    /**
     * @returns {Number}       mScrollOffset value.
     */
    get scroll() {
        return this.mScrollOffset;
    }

    /**
     * Refreshes scroll-container's children. scroll-container contains date and time labels with
     * regular interval gap.
     */
    refresh() {
        let date = this.mStartDate.clone();
        let template = this.getElementsByTagName("calendar-event-freebusy-day")[0];
        let parent = template.parentNode;
        for (let child of parent.childNodes) {
            child.startDate = this.mStartDate;
            child.endDate = this.mEndDate;
            child.date = date;
            date.day++;
        }
        let offset = this.mDayOffset;
        this.dayOffset = offset;
    }

    /**
     * Dispatches timebar event which has details and height property, used for initializing
     * selection-bar.
     */
    dispatchTimebarEvent() {
        let template = this.getElementsByTagName("calendar-event-freebusy-day")[0];
        let event = document.createEvent("Events");
        event.initEvent("timebar", true, false);
        event.details = this.contentWidth;
        event.height = template.dayHeight;
        this.dispatchEvent(event);
    }

    /**
     * Updates mEndHour and mStartHour values.
     */
    initTimeRange() {
        if (this.force24Hours) {
            this.mStartHour = 0;
            this.mEndHour = 24;
        } else {
            this.mStartHour = Services.prefs.getIntPref("calendar.view.daystarthour", 8);
            this.mEndHour = Services.prefs.getIntPref("calendar.view.dayendhour", 19);
        }
    }
}
customElements.define("calendar-event-freebusy-timebar", MozCalendarEventFreebusyTimebar);

/**
 * MozCalendarEventAttendeesList is a widget allowing adding and removing of attendees of an event.
 * It shows if attendee if required or optional, the attendee status, type and adddress.
 * It is typically found in the Invite Attendees dialog.
 *
 * @extends {MozElements.RichListBox}
 */
class MozCalendarEventAttendeesList extends MozElements.RichListBox {
    constructor() {
        super();

        this.mMaxAttendees = 0;
        this.mContentHeight = 0;
        this.mRowHeight = 0;
        this.mNumColumns = 3;
        this.mIsOffline = 0;
        this.mIsReadOnly = false;
        this.mIsInvitation = false;
        this.mPopupOpen = false;
        this.mMaxAttendees = 0;

        this.addEventListener("click", this.onClick.bind(this));

        this.addEventListener("popupshown", (event) => {
            this.mPopupOpen = true;
        });

        this.addEventListener("popuphidden", (event) => {
            this.mPopupOpen = false;
        });

        this.addEventListener("keydown", (event) => {
            if (this.mIsReadOnly || this.mIsInvitation) {
                return;
            }
            if (event.originalTarget.localName == "input") {
                switch (event.key) {
                    case "Delete":
                    case "Backspace":
                        {
                            let curRowId = this.getRowByInputElement(event.originalTarget);
                            let allSelected = (event.originalTarget.textLength ==
                                event.originalTarget.selectionEnd -
                                event.originalTarget.selectionStart);

                            if (!event.originalTarget.value ||
                                event.originalTarget.textLength < 2 ||
                                allSelected) {
                                // if the user selected the entire attendee string, only one character was
                                // left or the row was already empty before hitting the key, we remove the
                                //  entire row to assure the attendee is deleted
                                this.deleteHit(event.originalTarget);

                                // if the last row was removed, we append an empty one which has the focus
                                // to enable adding a new attendee directly with freebusy information cleared
                                let targetRowId = (event.key == "Backspace" && curRowId > 2) ?
                                    curRowId - 1 : curRowId;
                                if (this.mMaxAttendees == 1) {
                                    this.appendNewRow(true);
                                } else {
                                    this.setFocus(targetRowId);
                                }

                                // set cursor to begin or end of focused input box based on deletion direction
                                let cPos = 0;
                                let input = this.getListItem(targetRowId).querySelector(".textbox-addressingWidget");
                                if (targetRowId != curRowId) {
                                    cPos = input.textLength;
                                }
                                input.setSelectionRange(cPos, cPos);
                            }

                            event.stopPropagation();
                            break;
                        }
                }
            }
        });

        this.addEventListener("keypress", (event) => {
            // In case we're currently showing the autocompletion popup
            // don't care about keypress-events and let them go. Otherwise
            // this event indicates the user wants to travel between
            // the different attendees. In this case we set the focus
            // appropriately and stop the event propagation.
            if (this.mPopupOpen || this.mIsReadOnly || this.mIsInvitation) {
                return;
            }
            if (event.originalTarget.localName == "input") {
                switch (event.key) {
                    case "ArrowUp":
                        this.arrowHit(event.originalTarget, -1);
                        event.stopPropagation();
                        break;
                    case "ArrowDown":
                        this.arrowHit(event.originalTarget, 1);
                        event.stopPropagation();
                        break;
                    case "Tab":
                        this.arrowHit(event.originalTarget, event.shiftKey ? -1 : +1);
                        break;
                }
            }
        }, true);
    }

    /**
     * Property telling whether the calendar-event-attendees-list is read-only or not.
     *
     * @returns {Boolean}       isReadOnly value
     */
    get isReadOnly() {
        return this.mIsReadOnly;
    }

    /**
     * Controls the read-only state of the attendee list by not allowing to add or remove or edit
     * attendees.
     *
     * @param {Boolean} val     New isReadOnly value
     * @returns {Boolean}       New isReadOnly value
     */
    set isReadOnly(val) {
        this.mIsReadOnly = val;
        return val;
    }

    /**
     * Flag that tells whether the event is an invitation or not.
     *
     * @param {Boolean} val     New isInvitation value
     * @returns {Boolean}       New isInvitation value
     */
    set isInvitation(val) {
        this.mIsInvitation = val;
        return val;
    }

    /**
     * Returns flags that tells whether the event is an invitation or not.
     *
     * @returns {Boolean}       isInvitation value
     */
    get isInvitation() {
        return this.mIsInvitation;
    }

    /**
     * The attendees shown in this attendee list.
     *
     * @returns {calIAttendee[]}        The attendees of the list
     */
    get attendees() {
        let attendees = [];

        for (let i = 1; true; i++) {
            let inputField = this.getInputElement(i);
            if (!inputField) {
                break;
            } else if (inputField.value == "") {
                continue;
            }

            // The inputfield already has a reference to the attendee object, we just need to fill
            // in the name.
            let attendee = inputField.attendee.clone();
            if (attendee.isOrganizer) {
                continue;
            }

            attendee.role = this.getRoleElement(i).getAttribute("role");
            // attendee.participationStatus = this.getStatusElement(i).getAttribute("status");
            let userType = this.getUserTypeElement(i).getAttribute("cutype");
            attendee.userType = (userType == "INDIVIDUAL" ? null : userType); // INDIVIDUAL is the default

            // Break the list of potentially many attendees back into individual names. This
            // is required in case the user entered comma-separated attendees in one field and
            // then clicked OK without switching to the next line.
            let parsedInput = MailServices.headerParser.makeFromDisplayAddress(inputField.value);
            let j = 0;
            let addAttendee = (aAddress) => {
                if (j > 0) {
                    attendee = attendee.clone();
                }
                attendee.id = cal.email.prependMailTo(aAddress.email);
                let commonName = null;
                if (aAddress.name.length > 0) {
                    // We remove any double quotes within CN due to bug 1209399.
                    let name = aAddress.name.replace(/(?:(?:[\\]")|(?:"))/g, "");
                    if (aAddress.email != name) {
                        commonName = name;
                    }
                }
                attendee.commonName = commonName;
                attendees.push(attendee);
                j++;
            };
            parsedInput.forEach(addAttendee);
        }
        return attendees;
    }

    /**
     * Returns an attendee node if there is an organizer else returns null.
     *
     * @returns {?calIAttendee}     Organizer of the event or null
     */
    get organizer() {
        for (let i = 1; true; i++) {
            let inputField = this.getInputElement(i);
            if (!inputField) {
                break;
            } else if (inputField.value == "") {
                continue;
            }

            // The inputfield already has a reference to the attendee
            // object, we just need to fill in the name.
            let attendee = inputField.attendee.clone();

            // attendee.role = this.getRoleElement(i).getAttribute("role");
            attendee.participationStatus = this.getStatusElement(i).getAttribute("status");
            // Organizers do not have a CUTYPE
            attendee.userType = null;

            // Break the list of potentially many attendees back into individual names.
            let parsedInput = MailServices.headerParser.makeFromDisplayAddress(inputField.value);
            if (parsedInput[0].email > 0) {
                attendee.id = cal.email.prependMailTo(parsedInput[0].email);
            }
            let commonName = null;
            if (parsedInput[0].name.length > 0) {
                let name = parsedInput[0].name.replace(/(?:(?:[\\]")|(?:"))/g, "");
                if (attendee.email != name) {
                    commonName = name;
                }
            }
            attendee.commonName = commonName;

            if (attendee.isOrganizer) {
                return attendee;
            }
        }

        return null;
    }

    /**
     * Gets document size of calendar-event-attendees-list.
     *
     * @returns {Number}        Document size
     */
    get documentSize() {
        return this.mRowHeight * this.mMaxAttendees;
    }

    /**
     * Returns the index of first row element that is visible in the view box. Scrolling will
     * change the first visible row.
     *
     * @returns {Number}        First visible row
     */
    get firstVisibleRow() {
        return this.getIndexOfFirstVisibleRow();
    }

    /**
     * Scrolls to the row with the index calculated in the method.
     *
     * @param {Number} val      Decimal number between 0 and 1
     * @returns {Number}        Decimal number between 0 and 1
     */
    set ratio(val) {
        let rowcount = this.getRowCount();
        this.scrollToIndex(Math.floor(rowcount * val));
        return val;
    }

    /**
     * Depending upon the original target of click event, toolip is updated or new row is appended
     * or nothing happens.
     *
     * @param {Object} event        Event object containing click event information
     */
    onClick(event) {
        if (event.button != 0) {
            return;
        }

        const cycle = (values, current) => {
            let nextIndex = (values.indexOf(current) + 1) % values.length;
            return values[nextIndex];
        };

        let target = event.originalTarget;
        if (target.classList.contains("role-icon")) {
            if (target.getAttribute("disabled") != "true") {
                const roleCycle = [
                    "REQ-PARTICIPANT", "OPT-PARTICIPANT",
                    "NON-PARTICIPANT", "CHAIR"
                ];

                let nextValue = cycle(roleCycle, target.getAttribute("role"));
                target.setAttribute("role", nextValue);
                this.updateTooltip(target);
            }
        } else if (target.classList.contains("status-icon")) {
            if (target.getAttribute("disabled") != "true") {
                const statusCycle = ["ACCEPTED", "DECLINED", "TENTATIVE"];

                let nextValue = cycle(statusCycle, target.getAttribute("status"));
                target.setAttribute("status", nextValue);
                this.updateTooltip(target);
            }
        } else if (target.classList.contains("usertype-icon")) {
            let row = target.closest("richlistitem");
            let inputField = row.querySelector(".textbox-addressingWidget");
            if (target.getAttribute("disabled") != "true" &&
                !inputField.attendee.isOrganizer) {
                const cutypeCycle = ["INDIVIDUAL", "GROUP", "RESOURCE", "ROOM"];

                let nextValue = cycle(cutypeCycle, target.getAttribute("cutype"));
                target.setAttribute("cutype", nextValue);
                this.updateTooltip(target);
            }
        } else if (this.mIsReadOnly || this.mIsInvitation || target == null || target.closest("richlistitem")) {
            // These are cases where we don't want to append a new row, keep
            // them here so we can put the rest in the else case.
        } else {
            let lastInput = this.getInputElement(this.mMaxAttendees);
            if (lastInput && lastInput.value) {
                this.appendNewRow(true);
            }
        }
    }

    /**
     * This trigger the continous update chain, which effectively calls this.onModify() on
     * predefined time intervals [each second].
     */
    init() {
        let callback = () => {
            setTimeout(callback, 1000);
            this.onModify();
        };
        callback();
    }

    /**
     * Appends a new row using an existing attendee structure.
     *
     * @param {calIAttendee} attendee           Attendee object
     * @param {Element} templateNode            Template node that need to be cloned
     * @param {Boolean} disableIfOrganizer      Flag that is truthy if attendee is organizer
     * @return {Boolean}                        Truthy flag showing that attendee is appended
     *                                          successfully
     */
    appendAttendee(attendee, templateNode, disableIfOrganizer) {
        // create a new listbox item and append it to our parent control.
        let newNode = templateNode.cloneNode(true);

        this.appendChild(newNode);

        let input = newNode.querySelector(".textbox-addressingWidget");
        let roleStatusIcon = newNode.querySelector(".status-icon");
        let userTypeIcon = newNode.querySelector(".usertype-icon");

        // We always clone the first row. The problem is that the first row
        // could be focused. When we clone that row, we end up with a cloned
        // XUL textbox that has a focused attribute set.  Therefore we think
        // we're focused and don't properly refocus.  The best solution to this
        // would be to clone a template row that didn't really have any presentation,
        // rather than using the real visible first row of the listbox.
        // For now we'll just put in a hack that ensures the focused attribute
        // is never copied when the node is cloned.
        if (input.getAttribute("focused") != "") {
            input.removeAttribute("focused");
        }

        // The template could have its fields disabled,
        // that's why we need to reset their status.
        input.removeAttribute("disabled");
        userTypeIcon.removeAttribute("disabled");
        roleStatusIcon.removeAttribute("disabled");

        if (this.mIsReadOnly || this.mIsInvitation) {
            input.setAttribute("disabled", "true");
            userTypeIcon.setAttribute("disabled", "true");
            roleStatusIcon.setAttribute("disabled", "true");
        }

        // Disable the input-field [name <email>] if this attendee
        // appears to be the organizer.
        if (disableIfOrganizer && attendee && attendee.isOrganizer) {
            input.setAttribute("disabled", "true");
        }

        this.mMaxAttendees++;

        if (!attendee) {
            attendee = this.createAttendee();
        }

        // Construct the display string from common name and/or email address.
        let commonName = attendee.commonName || "";
        let inputValue = cal.email.removeMailTo(attendee.id || "");
        if (commonName.length) {
            // Make the commonName appear in quotes if it contains a
            // character that could confuse the header parser
            if (commonName.search(/[,;<>@]/) != -1) {
                commonName = '"' + commonName + '"';
            }
            inputValue = inputValue.length ? commonName + " <" + inputValue + ">" : commonName;
        }

        // Trim spaces if any.
        inputValue = inputValue.trim();

        // Don't set value with null, otherwise autocomplete stops working,
        // but make sure attendee and dirty are set.
        if (inputValue.length) {
            input.setAttribute("value", inputValue);
            input.value = inputValue;
        }
        input.attendee = attendee;
        input.setAttribute("dirty", "true");

        if (attendee) {
            // Set up userType.
            setElementValue(userTypeIcon, attendee.userType || false, "cutype");
            this.updateTooltip(userTypeIcon);

            // Set up role/status icon.
            if (attendee.isOrganizer) {
                roleStatusIcon.setAttribute("class", "status-icon");
                setElementValue(roleStatusIcon, attendee.participationStatus || false, "status");
            } else {
                roleStatusIcon.setAttribute("class", "role-icon");
                setElementValue(roleStatusIcon, attendee.role || false, "role");
            }
            this.updateTooltip(roleStatusIcon);
        }

        return true;
    }

    /**
     * Appends a new row.
     *
     * @param {Boolean} setFocus        Flag that decides whether the focus has to be set on new node
     *                                  or not
     * @param {Element} insertAfter     Element after which row has to be appended
     * @returns {Node}                  Newly appended row
     */
    appendNewRow(setFocus, insertAfter) {
        let listitem1 = this.getListItem(1);
        let newNode = null;

        if (listitem1) {
            let newAttendee = this.createAttendee();
            let nextDummy = this.getNextDummyRow();
            newNode = listitem1.cloneNode(true);

            if (insertAfter) {
                this.insertBefore(newNode, insertAfter.nextSibling);
            } else if (nextDummy) {
                this.replaceChild(newNode, nextDummy);
            } else {
                this.appendChild(newNode);
            }

            let input = newNode.querySelector(".textbox-addressingWidget");
            let roleStatusIcon = newNode.querySelector(".status-icon");
            let userTypeIcon = newNode.querySelector(".usertype-icon");

            // The template could have its fields disabled, that's why we need to reset their
            // status.
            input.removeAttribute("disabled");
            roleStatusIcon.removeAttribute("disabled");
            userTypeIcon.removeAttribute("disabled");

            if (this.mIsReadOnly || this.mIsInvitation) {
                input.setAttribute("disabled", "true");
                roleStatusIcon.setAttribute("disabled", "true");
                userTypeIcon.setAttribute("disabled", "true");
            }

            this.mMaxAttendees++;

            input.value = null;
            input.removeAttribute("value");
            input.attendee = newAttendee;

            // Set role and participation status.
            roleStatusIcon.setAttribute("class", "role-icon");
            roleStatusIcon.setAttribute("role", "REQ-PARTICIPANT");
            userTypeIcon.setAttribute("cutype", "INDIVIDUAL");

            // Set tooltip for rolenames and usertype icon.
            this.updateTooltip(roleStatusIcon);
            this.updateTooltip(userTypeIcon);

            // We always clone the first row. The problem is that the first row could be focused.
            // When we clone that row, we end up with a cloned XUL textbox that has a focused
            // attribute set. Therefore we think we're focused and don't properly refocus.
            // The best solution to this would be to clone a template row that didn't really have
            // any presentation, rather than using the real visible first row of the listbox.
            // For now we'll just put in a hack that ensures the focused attribute is never copied
            // when the node is cloned.
            if (input.getAttribute("focused") != "") {
                input.removeAttribute("focused");
            }

            // focus on new input widget
            if (setFocus) {
                this.setFocus(newNode);
            }
        }
        return newNode;
    }

    /**
     * Resolves list by the value that is passed and return the list or null if not resolved.
     *
     * @param {String} value        Value against which enteries are checked
     * @returns {?Object}           Found list or null
     */
    _resolveListByName(value) {
        let entries = MailServices.headerParser.makeFromDisplayAddress(value);
        return entries.length ? this._findListInAddrBooks(entries[0].name) : null;
    }

    /**
     * Finds list in the address books.
     *
     * @param {String} entryName        Value against which dirName is checked
     * @returns {Object}                Found list or null
     */
    _findListInAddrBooks(entryname) {
        let allAddressBooks = MailServices.ab.directories;

        while (allAddressBooks.hasMoreElements()) {
            let abDir = null;
            try {
                abDir = allAddressBooks.getNext()
                    .QueryInterface(Ci.nsIAbDirectory);
            } catch (ex) {
                cal.WARN("[eventDialog] Error Encountered" + ex);
            }

            if (abDir != null && abDir.supportsMailingLists) {
                let childNodes = abDir.childNodes;
                while (childNodes.hasMoreElements()) {
                    let dir = null;
                    try {
                        dir = childNodes.getNext().QueryInterface(Ci.nsIAbDirectory);
                    } catch (ex) {
                        cal.WARN("[eventDialog] Error Encountered" + ex);
                    }

                    if (dir && dir.isMailList && (dir.dirName == entryname)) {
                        return dir;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Finds attendees in the address lists.
     *
     * @param {Object} mailingList              Mailing list having address lists
     * @param {calIAttendee[]} attendees        List of attendees
     * @param {String[]} allListsUri            URI of all lists
     * @returns {calIAttendee[]}                List entries found
     */
    _getListEntriesInt(mailingList, attendees, allListsUri) {
        let addressLists = mailingList.addressLists;
        for (let i = 0; i < addressLists.length; i++) {
            let abCard = addressLists.queryElementAt(i, Ci.nsIAbCard);
            let thisId = abCard.primaryEmail;
            if (abCard.displayName.length > 0) {
                let rCn = abCard.displayName;
                if (rCn.includes(",")) {
                    rCn = '"' + rCn + '"';
                }
                thisId = rCn + " <" + thisId + ">";
            }
            if (attendees.some(att => att == thisId)) {
                continue;
            }

            if (abCard.displayName.length > 0) {
                let list = this._findListInAddrBooks(abCard.displayName);
                if (list) {
                    if (allListsUri.some(uri => uri == list.URI)) {
                        continue;
                    }
                    allListsUri.push(list.URI);

                    this._getListEntriesInt(list, attendees, allListsUri);

                    continue;
                }
            }

            attendees.push(thisId);
        }

        return attendees;
    }

    /**
     * Finds enteries in a mailing list.
     *
     * @param {Object} mailingList      Mailing list having address lists
     * @returns {calIAttendee[]}        List entries found
     */
    _getListEntries(mailingList) {
        let attendees = [];
        let allListsUri = [];

        allListsUri.push(mailingList.URI);

        this._getListEntriesInt(mailingList, attendees, allListsUri);

        return attendees;
    }

    /**
     * Fills list item with the entry.
     *
     * @param {Element} listitem        Listitem into which attendee entry has to be added
     * @param {String} entry            Entry item
     */
    _fillListItemWithEntry(listitem, entry) {
        let newAttendee = this.createAttendee(entry);
        let input = listitem.querySelector(".textbox-addressingWidget");
        input.removeAttribute("disabled");

        input.attendee = newAttendee;
        input.value = entry;
        input.setAttribute("value", entry);
        input.setAttribute("dirty", "true");
        if (input.getAttribute("focused") != "") {
            input.removeAttribute("focused");
        }

        let roleStatusIcon = listitem.querySelector(".status-icon");
        roleStatusIcon.removeAttribute("disabled");
        roleStatusIcon.setAttribute("class", "role-icon");
        roleStatusIcon.setAttribute("role", newAttendee.role);

        let userTypeIcon = listitem.querySelector(".usertype-icon");
        userTypeIcon.removeAttribute("disabled");
        userTypeIcon.setAttribute("cutype", newAttendee.userType);
    }

    /**
     * Resolves list.
     *
     * @param {Element} input       Node using which list has to be resolved.
     */
    resolvePotentialList(input) {
        let fieldValue = input.value;
        if (input.id.length > 0 && fieldValue.length > 0) {
            let mailingList = this._resolveListByName(fieldValue);
            if (mailingList) {
                let entries = this._getListEntries(mailingList);
                if (entries.length > 0) {
                    let currentIndex = parseInt(input.id.substr(13), 10);
                    let template = this.querySelector(".addressingWidgetItem");
                    let currentNode = template.parentNode.childNodes[currentIndex];
                    this._fillListItemWithEntry(currentNode, entries[0], currentIndex);
                    entries.shift();
                    let nextNode = template.parentNode.childNodes[currentIndex + 1];
                    currentIndex++;
                    for (let entry of entries) {
                        currentNode = template.cloneNode(true);
                        template.parentNode.insertBefore(currentNode, nextNode);
                        this._fillListItemWithEntry(currentNode, entry, currentIndex);
                        currentIndex++;
                    }
                    this.mMaxAttendees += entries.length;
                    for (let i = currentIndex; i <= this.mMaxAttendees; i++) {
                        let row = template.parentNode.childNodes[i];
                        let textboxInput = row.querySelector(".textbox-addressingWidget");
                        textboxInput.setAttribute("dirty", "true");
                    }
                }
            }
        }
    }

    /**
     * Emits modify method with list having attendees data.
     */
    onModify() {
        let list = [];
        for (let i = 1; i <= this.mMaxAttendees; i++) {
            // Retrieve the string from the appropriate row.
            let input = this.getInputElement(i);
            if (input && input.value) {
                // Parse the string to break this down to individual names and addresses.
                let parsedInput = MailServices.headerParser.makeFromDisplayAddress(input.value);
                let email = cal.email.prependMailTo(parsedInput[0].email);

                let isdirty = false;
                if (input.hasAttribute("dirty")) {
                    isdirty = input.getAttribute("dirty");
                }
                input.removeAttribute("dirty");
                let entry = {
                    dirty: isdirty,
                    calid: email
                };
                list.push(entry);
            }
        }

        let event = document.createEvent("Events");
        event.initEvent("modify", true, false);
        event.details = list;
        this.dispatchEvent(event);
    }

    /**
     * Method setting the tooltip of attendee icons based on their role.
     *
     * @param {Element} targetIcon      target-icon node
     */
    updateTooltip(targetIcon) {
        if (targetIcon.classList.contains("role-icon")) {
            let role = targetIcon.getAttribute("role");
            // Set tooltip for rolenames.

            const roleMap = {
                "REQ-PARTICIPANT": "required",
                "OPT-PARTICIPANT": "optional",
                "NON-PARTICIPANT": "nonparticipant",
                "CHAIR": "chair"
            };

            let roleNameString = "event.attendee.role." + (role in roleMap ? roleMap[role] : "unknown");
            let tooltip = cal.l10n.getString("calendar-event-dialog-attendees",
                roleNameString,
                role in roleMap ? [] : [role]);
            targetIcon.setAttribute("tooltiptext", tooltip);
        } else if (targetIcon.classList.contains("usertype-icon")) {
            let cutype = targetIcon.getAttribute("cutype");
            const cutypeMap = {
                INDIVIDUAL: "individual",
                GROUP: "group",
                RESOURCE: "resource",
                ROOM: "room",
                // I've decided UNKNOWN will not be handled.
            };

            let cutypeString = "event.attendee.usertype." + (cutype in cutypeMap ? cutypeMap[cutype] : "unknown");
            let tooltip = cal.l10n.getString("calendar-event-dialog-attendees",
                cutypeString,
                cutype in cutypeMap ? [] : [cutype]);
            targetIcon.setAttribute("tooltiptext", tooltip);
        }
    }

    /**
     * Fits dummy rows in the attendee list.
     */
    fitDummyRows() {
        setTimeout(() => {
            this.calcContentHeight();
            this.createOrRemoveDummyRows();
        }, 0);
    }

    /**
     * Calculates attendee list content height.
     */
    calcContentHeight() {
        let items = this.getElementsByTagName("richlistitem");
        this.mContentHeight = 0;
        if (items.length > 0) {
            let i = 0;
            do {
                this.mRowHeight = items[i].getBoundingClientRect().height;
                ++i;
            } while (i < items.length && !this.mRowHeight);
            this.mContentHeight = this.mRowHeight * items.length;
        }
    }

    /**
     * Creates or removes dummy rows from the calendar-event-attendees-list.
     */
    createOrRemoveDummyRows() {
        let listboxHeight = this.getBoundingClientRect().height;

        // Remove rows to remove scrollbar.
        let kids = this.childNodes;
        for (let i = kids.length - 1; this.mContentHeight > listboxHeight && i >= 0; --i) {
            if (kids[i].hasAttribute("_isDummyRow")) {
                this.mContentHeight -= this.mRowHeight;
                kids[i].remove();
            }
        }

        // Add rows to fill space.
        if (this.mRowHeight) {
            while (this.mContentHeight + this.mRowHeight < listboxHeight) {
                this.createDummyItem();
                this.mContentHeight += this.mRowHeight;
            }
        }
    }

    /**
     * Creates dummy item.
     *
     * @returns {Node}       Dummy item
     */
    createDummyItem() {
        let titem = document.createElement("richlistitem");
        titem.setAttribute("_isDummyRow", "true");
        titem.setAttribute("class", "dummy-row");
        for (let i = this.mNumColumns; i > 0; i--) {
            let cell = document.createElement("hbox");
            cell.setAttribute("class", "addressingWidgetCell dummy-row-cell");
            titem.appendChild(cell);
        }
        this.appendChild(titem);
        return titem;
    }

    /**
     * Returns the next dummy row from the top.
     *
     * @return {?Node}       Next row from the top down
     */
    getNextDummyRow() {
        let kids = this.childNodes;
        for (let i = 0; i < kids.length; ++i) {
            if (kids[i].hasAttribute("_isDummyRow")) {
                return kids[i];
            }
        }
        return null;
    }

    /**
     * Returns richlistitem at row numer `row`.
     *
     * @returns {Element}       richlistitem
     */
    getListItem(row) {
        return this.getElementsByTagName("richlistitem")[row - 1];
    }

    /**
     * Returns textbox node in first row
     *
     * @returns {Object}        textbox node
     */
    getInputFromListitem(listItem) {
        return listItem.getElementsByTagName("textbox")[0];
    }

    /**
     * Returns richlistitem closest to node `element`.
     *
     * @param {Element} element     Element closest to which <xul-richlistitem> has to be found
     * @returns {Number}            Total number of rows in a list
     */
    getRowByInputElement(element) {
        let row = 0;
        element = element.closest("richlistitem");
        if (element) {
            while (element) {
                if (element.localName == "richlistitem") {
                    ++row;
                }
                element = element.previousSibling;
            }
        }
        return row;
    }

    /**
     * Returns textbox that contains the name of the attendee at row number `row`.
     *
     * @param {Element} row     Row element
     * @returns {Element}       Textbox element
     */
    getInputElement(row) {
        return this.getListItem(row).querySelector(".textbox-addressingWidget");
    }

    /**
     * Returns textbox that contains the name of the attendee at row number `row`.
     *
     * @param {Element} row     Row element
     * @returns {Element}       Textbox element
     */
    getRoleElement(row) {
        return this.getListItem(row).querySelector(".role-icon, .status-icon");
    }

    /**
     * Returns status element in the row `row`.
     *
     * @param {Element} row     Row element
     * @returns {Element}       Status element in the row
     */
    getStatusElement(row) {
        return this.getListItem(row).querySelector(".role-icon, .status-icon");
    }

    /**
     * Returns usertype-icon element in the row `row`.
     *
     * @param {Element} row     Row element
     * @returns {Element}       Usertype-icon element in the row
     */
    getUserTypeElement(row) {
        return this.getListItem(row).querySelector(".usertype-icon");
    }

    /**
     * Sets foucs on the textbox in the row `row`.
     *
     * @param {Element|Number} row      Row number or row
     */
    setFocus(row) {
        // See https://stackoverflow.com/questions/779379/why-is-settimeoutfn-0-sometimes-useful to
        // know why setTimeout is helpful here.
        setTimeout(() => {
            let node;
            if (typeof row == "number") {
                node = this.getListItem(row);
            } else {
                node = row;
            }

            this.ensureElementIsVisible(node);

            let input = node.querySelector(".textbox-addressingWidget");
            input.focus();
        }, 0);
    }

    /**
     * Creates attendee.
     *
     * @return {Node}       Newly created attendee
     */
    createAttendee() {
        let attendee = cal.createAttendee();
        attendee.id = "";
        attendee.rsvp = "TRUE";
        attendee.role = "REQ-PARTICIPANT";
        attendee.participationStatus = "NEEDS-ACTION";
        return attendee;
    }

    /**
     * If the element `element` has valid headerValue then a new attendee row is created and cursor
     * is moved to the next row, else just cursor is moved to the next row.
     *
     * @param {Element} element     Element upon which event occurred
     * @param {Boolean} noAdvance   Flag that decides whether arrowHit method has to be executed in
     *                              the end or not
     */
    returnHit(element, noAdvance) {
        const parseHeaderValue = (aMsgIAddressObject) => {
            if (aMsgIAddressObject.name.match(/[<>@,]/)) {
                // Special handling only needed for a name with a comma which are not already quoted.
                return (aMsgIAddressObject.name.match(/^".*"$/) ?
                    aMsgIAddressObject.name
                    : '"' + aMsgIAddressObject.name + '"'
                ) + " <" + aMsgIAddressObject.email + ">";
            }

            return aMsgIAddressObject.toString();
        };

        let arrowLength = 1;
        if (element.value.includes(",") || element.value.match(/^[^"].*[<>@,].*[^"] <.+@.+>$/)) {
            let strippedAddresses = element.value.replace(/.* >> /, "");
            let addresses = MailServices.headerParser.makeFromDisplayAddress(strippedAddresses);
            element.value = parseHeaderValue(addresses[0]);

            // The following code is needed to split attendees, if the user enters a comma
            // separated list of attendees without using autocomplete functionality.
            let insertAfterItem = this.getListItem(this.getRowByInputElement(element));
            for (let key in addresses) {
                if (key > 0) {
                    insertAfterItem = this.appendNewRow(false, insertAfterItem);
                    let textinput = this.getInputFromListitem(insertAfterItem);
                    textinput.value = parseHeaderValue(addresses[key]);
                }
            }
            arrowLength = addresses.length;
        }

        if (!noAdvance) {
            this.arrowHit(element, arrowLength);
        }
    }

    /**
     * Navigates up and down through the attendees row.
     *
     * @param {Element} element     Element upon which event occurred
     * @param {Number} direction    (-1 or 1) number representing left and right arrow key
     */
    arrowHit(element, direction) {
        let row = this.getRowByInputElement(element) + direction;
        if (row) {
            if (row > this.mMaxAttendees) {
                this.appendNewRow(true);
            } else {
                let input = this.getInputElement(row);
                if (input.hasAttribute("disabled")) {
                    return;
                }
                this.setFocus(row);
            }
            let event = document.createEvent("Events");
            event.initEvent("rowchange", true, false);
            event.details = row;
            this.dispatchEvent(event);
        }
    }

    /**
     * Deletes the attendee row of the element `element`.
     *
     * @param {Element} element     Element upon which event occurred
     */
    deleteHit(element) {
        // Don't delete the row if only the organizer is remaining.
        if (this.mMaxAttendees <= 1) {
            return;
        }

        let row = this.getRowByInputElement(element);
        this.deleteRow(row);
        if (row > 0) {
            row = row - 1;
        }
        this.setFocus(row);
        this.onModify();

        let event = document.createEvent("Events");
        event.initEvent("rowchange", true, false);
        event.details = row;
        this.dispatchEvent(event);
    }

    /**
     * Deletes row `row`.
     *
     * @param {Element} row     Row that has to be deleted
     */
    deleteRow(row) {
        this.removeRow(row);
    }

    /**
     * Removes row `row` and adds dummy row on its place.
     *
     * @param {Element} row      Row that has to be removed
     */
    removeRow(row) {
        this.getListItem(row).remove();
        this.fitDummyRows();
        this.mMaxAttendees--;
    }
}
customElements.define("calendar-event-attendees-list", MozCalendarEventAttendeesList);

/**
 * MozCalendarEventFreebusyRow is a widget that represents a row in freebusy-grid element.
 *
 * @extends {MozXULElement}
 */
class MozCalendarEventFreebusyRow extends MozXULElement {
    connectedCallback() {
        if (!this.hasChildNodes()) {
            this.containerNodeElem = document.createElement("scroll-container");
            this.containerNodeElem.setAttribute("flex", "1");
            this.hoursNodeElem = document.createElement("box");
            this.hoursNodeElem.setAttribute("equalsize", "always");
            this.containerNodeElem.appendChild(this.hoursNodeElem);
            this.appendChild(this.containerNodeElem);
        }

        this.state = null;
        this.Entries = null;
        this.offset = 0;
        this.mStartDate = null;
        this.mEndDate = null;
        this.range = 0;
        this.startHour = 0;
        this.endHour = 24;
        this.mForce24Hours = false;
        this.mZoomFactor = 100;
        this.initTimeRange();
        this.range = Number(document.getElementById("freebusy-grid").getAttribute("range"));
        this.onLoad();
    }

    /**
     * Gets node representing hours.
     *
     * @returns {Element}       Box element inside scroll-container
     */
    get hoursNode() {
        if (!this.hoursNodeElem) {
            this.hoursNodeElem = this.querySelector("scroll-container > box");
        }

        return this.hoursNodeElem;
    }

    /**
     * Gets the scroll container with the freebusy rows.
     *
     * @returns {Element}       Scroll container element
     */
    get containerNode() {
        if (!this.containerNodeElem) {
            this.containerNodeElem = this.querySelector("scroll-container");
        }

        return this.containerNodeElem;
    }

    /**
     * Getter for zoom factor of freebusy row.
     *
     * @returns {Number}        Zoom factor
     */
    get zoomFactor() {
        return this.mZoomFactor;
    }

    /**
     * Sets zoom factor of freebusy row.
     *
     * @param {Number} val      New zoom factor
     * @returns {Number}        New zoom factor
     */
    set zoomFactor(val) {
        this.mZoomFactor = val;
        removeChildren(this.hoursNode);
        this.onLoad();
        return val;
    }

    /**
     * Gets force24Hours property which sets time format to 24 hour format.
     *
     * @returns {Boolean}       force24Hours value
     */
    get force24Hours() {
        return this.mForce24Hours;
    }

    /**
     * Sets force24Hours to a new value. If true, forces the freebusy view to 24 hours and updates
     * the UI accordingly.
     *
     * @param {Boolean} val     New force24Hours value
     * @returns {Boolean}       New force24Hours value
     */
    set force24Hours(val) {
        this.mForce24Hours = val;
        this.initTimeRange();
        removeChildren(this.hoursNode);
        this.onLoad();
        return val;
    }


    /**
     * Returns start date of the event.
     *
     * @returns {calIDateTime}      Start date value
     */
    get startDate() {
        return this.mStartDate;
    }

    /**
     * Sets start date of the event and make it immutable.
     *
     * @param {calIDateTime} val        Start date value
     * @returns {?calIDateTime}         Start date value
     */
    set startDate(val) {
        if (val == null) {
            return null;
        }
        this.mStartDate = val.clone();
        this.mStartDate.isDate = false;
        this.mStartDate.makeImmutable();
        return val;
    }

    /**
     * Returns end date of the event.
     *
     * @returns {calIDateTime}      End date value
     */
    get endDate() {
        return this.mEndDate;
    }

    /**
     * Sets end date of the event and make it immutable.
     *
     * @param {?calIDateTime} val       End date value
     * @returns {calIDateTime}          End date value
     */
    set endDate(val) {
        if (val == null) {
            return null;
        }
        this.mEndDate = val.clone();
        this.mEndDate.isDate = false;
        this.mEndDate.makeImmutable();
        return val;
    }

    /**
     * Returns number of boxes that is needed to fill the gap between start hour and end hour.
     *
     * @returns {Number}        Number of boxes
     */
    get numHours() {
        let numHours = this.endHour - this.startHour;
        return Math.ceil(numHours * 100 / this.zoomFactor);
    }

    /**
     * Gets width of the content.
     *
     * @returns {Number}        Content width
     */
    get contentWidth() {
        // Difference between the x coordinate of first and second child of hours node
        const diffX = this.hoursNode.childNodes[1].getBoundingClientRect().x - this.hoursNode.childNodes[0].getBoundingClientRect().x;
        return diffX * this.numHours;
    }

    /**
     * Returns width of nearest listbox element.
     *
     * @returns {Number}        Nearest listbox width
     */
    get containerWidth() {
        return this.closest("listbox").getBoundingClientRect().width;
    }

    /**
     * Sets offset value and calls showState which maps entries to the attribute of xul elements.
     *
     * @returns {Number}        New offset value
     */
    set dayOffset(val) {
        this.offset = val * this.numHours;
        this.showState();
        return val;
    }

    /**
     * Gets document size.
     *
     * @returns {Number}        Document size
     */
    get documentSize() {
        return this.contentWidth * this.range;
    }

    /**
     * Scrolls the element to a particular x value.
     *
     * @param {Number} val      New x value
     * @returns {Number}        New x value
     */
    set scroll(val) {
        let timebarContainer = document.querySelector("#timebar scroll-container");
        let offset = timebarContainer.x;
        // Set the offset at the content node.
        this.containerNode.x = offset;
        return val;
    }

    /**
     * Setup some properties of the element.
     */
    onLoad() {
        let numHours = this.endHour - this.startHour;
        this.state = new Array(this.range * numHours);
        for (let i = 0; i < this.state.length; i++) {
            this.state[i] = Ci.calIFreeBusyInterval.UNKNOWN;
        }
        let step_in_minutes = Math.floor(60 * this.zoomFactor / 100);
        let formatter = Cc["@mozilla.org/calendar/datetime-formatter;1"]
                          .getService(Ci.calIDateTimeFormatter);
        let date = cal.dtz.jsDateToDateTime(new Date());
        date.hour = this.startHour;
        date.minute = 0;
        if (this.hoursNode.childNodes.length <= 0) {
            let template = document.createXULElement("text");
            template.className = "freebusy-grid";
            // TODO: hardcoded value
            let num_days = Math.max(2, 4 * this.zoomFactor / 100);
            let count = Math.ceil(
                (this.endHour - this.startHour) * 60 / step_in_minutes);
            let remain = count;
            for (let day = 1; day <= num_days; day++) {
                let first = true;
                while (remain--) {
                    let newNode = template.cloneNode(false);
                    let value = formatter.formatTime(date);
                    if (first) {
                        newNode.classList.add("first-in-day");
                        first = false;
                    }
                    newNode.setAttribute("value", value);
                    this.hoursNode.appendChild(newNode);
                    date.minute += step_in_minutes;
                    if (remain == 0) {
                        newNode.classList.add("last-in-day");
                    }
                }
                date.hour = this.startHour;
                date.day++;
                remain = count;
            }
        }
    }

    /**
     * Sets freebusy-row state according to param entries which is an array of requested freebusy
     * intervals. After the state has been updated we call showState() which will map the entries to
     * attributes on the xul elements.
     *
     * @param {?calIFreeBusyInterval[]} entries        List of freebusy entries
     */
    onFreeBusy(entries) {
        if (entries) {
            // Remember the free/busy array which is used to find a new time for an event. We store
            // this array only if the provider returned a valid array. In any other case
            // (temporarily clean the display) we keep the last know result.
            this.entries = entries;
            let kDefaultTimezone = cal.dtz.defaultTimezone;
            let start = this.startDate.clone();
            start.hour = 0;
            start.minute = 0;
            start.second = 0;
            start.timezone = kDefaultTimezone;
            let end = start.clone();
            end.day += this.range;
            end.timezone = kDefaultTimezone;
            // First of all set all state slots to 'free'
            for (let i = 0; i < this.state.length; i++) {
                this.state[i] = Ci.calIFreeBusyInterval.FREE;
            }
            // Iterate all incoming freebusy entries
            for (let entry of entries) {
                let rangeStart = entry.interval.start.getInTimezone(kDefaultTimezone);
                let rangeEnd = entry.interval.end.getInTimezone(kDefaultTimezone);
                if (rangeStart.compare(start) < 0) {
                    rangeStart = start.clone();
                }
                if (rangeEnd.compare(end) > 0) {
                    rangeEnd = end.clone();
                }
                let rangeDuration = rangeEnd.subtractDate(rangeStart);
                let rangeStartHour = rangeStart.hour;
                let rangeEndHour = rangeStartHour + (rangeDuration.inSeconds / 3600);
                if ((rangeStartHour < this.endHour) &&
                    (rangeEndHour >= this.startHour)) {
                    let dayingrid = start.clone();
                    dayingrid.year = rangeStart.year;
                    dayingrid.month = rangeStart.month;
                    dayingrid.day = rangeStart.day;
                    dayingrid.getInTimezone(kDefaultTimezone);
                    // Ok, this is an entry we're interested in. Find out
                    // which hours are actually occupied.
                    let offset = rangeStart.subtractDate(dayingrid);
                    // Calculate how many days we're offset from the
                    // start of the grid. Eliminate hours in case
                    // we encounter the daylight-saving hop.
                    let dayoffset = dayingrid.subtractDate(start);
                    dayoffset.hours = 0;
                    // Add both offsets to find the total offset.
                    // dayoffset -> offset in days from start of grid
                    // offset -> offset in hours from start of current day
                    offset.addDuration(dayoffset);
                    let duration = rangeEnd.subtractDate(rangeStart);
                    let start_in_minutes = Math.floor(offset.inSeconds / 60);
                    let end_in_minutes = Math.ceil((duration.inSeconds / 60) +
                        (offset.inSeconds / 60));
                    let minute2offset = (value, fNumHours, numHours, start_hour, zoomfactor) => {
                        // 'value' is some integer in the interval [0, range * 24 * 60].
                        // we need to map this offset into our array which
                        // holds elements for 'range' days with [start, end] hours each.
                        let minutes_per_day = 24 * 60;
                        let day = (value - (value % minutes_per_day)) / minutes_per_day;
                        let minute = Math.floor(value % minutes_per_day) - (start_hour * 60);
                        minute = Math.max(0, minute);
                        if (minute >= (numHours * 60)) {
                            minute = (numHours * 60) - 1;
                        }
                        // How to get from minutes to offset?
                        // 60 = 100%, 30 = 50%, 15 = 25%, etc.
                        let minutes_per_block = 60 * zoomfactor / 100;
                        let block = Math.floor(minute / minutes_per_block);
                        return Math.ceil(fNumHours) * day + block;
                    };
                    // Number of hours (fractional representation)
                    let calcNumHours = this.endHour - this.startHour;
                    let fNumHours = calcNumHours * 100 / this.zoomFactor;
                    let start_offset =
                        minute2offset(start_in_minutes,
                            fNumHours,
                            calcNumHours,
                            this.startHour,
                            this.zoomFactor);
                    let end_offset =
                        minute2offset(end_in_minutes - 1,
                            fNumHours,
                            calcNumHours,
                            this.startHour,
                            this.zoomFactor);
                    // Set all affected state slots
                    for (let i = start_offset; i <= end_offset; i++) {
                        this.state[i] = entry.freeBusyType;
                    }
                }
            }
        } else {
            // First of all set all state slots to 'unknown'
            for (let i = 0; i < this.state.length; i++) {
                this.state[i] = Ci.calIFreeBusyInterval.UNKNOWN;
            }
        }
        this.showState();
    }

    /**
     * Maps entries to the attributes of xul elements.
     */
    showState() {
        for (let i = 0; i < this.hoursNode.childNodes.length; i++) {
            let hour = this.hoursNode.childNodes[i];
            switch (this.state[i + this.offset]) {
                case Ci.calIFreeBusyInterval.FREE:
                    hour.setAttribute("state", "free");
                    break;
                case Ci.calIFreeBusyInterval.BUSY:
                    hour.setAttribute("state", "busy");
                    break;
                case Ci.calIFreeBusyInterval.BUSY_TENTATIVE:
                    hour.setAttribute("state", "busy_tentative");
                    break;
                case Ci.calIFreeBusyInterval.BUSY_UNAVAILABLE:
                    hour.setAttribute("state", "busy_unavailable");
                    break;
                default:
                    hour.removeAttribute("state");
            }
        }
    }

    /**
     * Returns new time for the next slot.
     *
     * @param {calIDateTime} startTime      Previous start time
     * @param {calIDateTime} endTime        Previous end time
     * @param {Boolean} allDay              Flag telling whether the event is all day or not
     * @returns {calIDateTime}              New time value
     */
    nextSlot(startTime, endTime, allDay) {
        let newTime = startTime.clone();
        let duration = endTime.subtractDate(startTime);
        let newEndTime = newTime.clone();
        newEndTime.addDuration(duration);
        let kDefaultTimezone = cal.dtz.defaultTimezone;
        if (this.entries) {
            for (let entry of this.entries) {
                let rangeStart =
                    entry.interval.start.getInTimezone(kDefaultTimezone);
                let rangeEnd =
                    entry.interval.end.getInTimezone(kDefaultTimezone);
                let isZeroLength = !newTime.compare(newEndTime);
                if ((isZeroLength &&
                    newTime.compare(rangeStart) >= 0 &&
                    newTime.compare(rangeEnd) < 0) ||
                    (!isZeroLength &&
                        newTime.compare(rangeEnd) < 0 &&
                        newEndTime.compare(rangeStart) > 0)) {
                    // Current range of event conflicts with another event.
                    // we need to find a new time for this event. A trivial approach
                    // is to set the new start-time of the event equal to the end-time
                    // of the conflict-range. All-day events need to be considered
                    // separately, in which case we skip to the next day.
                    newTime = rangeEnd.clone();
                    if (allDay) {
                        if (!((newTime.hour == 0) &&
                            (newTime.minute == 0) &&
                            (newTime.second == 0))) {
                            newTime.day++;
                            newTime.hour = 0;
                            newTime.minute = 0;
                            newTime.second = 0;
                        }
                    }
                    newEndTime = newTime.clone();
                    newEndTime.addDuration(duration);
                }
            }
        }
        return newTime;
    }

    /**
     * Updates endHour and startHour values of the freebusy row.
     */
    initTimeRange() {
        if (this.force24Hours) {
            this.startHour = 0;
            this.endHour = 24;
        } else {
            this.startHour = Services.prefs.getIntPref("calendar.view.daystarthour", 8);
            this.endHour = Services.prefs.getIntPref("calendar.view.dayendhour", 19);
        }
    }
}
customElements.define("calendar-event-freebusy-row", MozCalendarEventFreebusyRow);

/**
 * MozFreebusyDay is a widget showing time slots labels - dates and a number of times instances of a
 * particular day.
 *
 * @extends {MozXULElement}
 */
class MozCalendarEventFreebusyDay extends MozXULElement {
    connectedCallback() {
        if (!this.hasChildNodes()) {
            const wrapper = document.createElement("box");
            wrapper.setAttribute("orient", "vertical");

            this.text = document.createElement("text");
            this.text.classList.add("freebusy-timebar-title");
            this.text.style.fontWeight = "bold";

            this.box = document.createElement("box");
            this.box.setAttribute("equalsize", "always");

            wrapper.appendChild(this.text);
            wrapper.appendChild(this.box);
            this.appendChild(wrapper);
        }

        this.mDateFormatter = null;
        this.mStartDate = null;
        this.mEndDate = null;
        this.mStartHour = 0;
        this.mEndHour = 24;
        this.mForce24Hours = false;
        this.mZoomFactor = 100;
        this.initTimeRange();
    }

    /**
     * Returns zoom factor of the free busy day.
     *
     * @returns {Number}        Zoom factor
     */
    get zoomFactor() {
        return this.mZoomFactor;
    }

    /**
     * Sets the zoom factor for the free busy day.
     *
     * @param {Number} val      New zoom factor
     * @returns {Number}        New zoom factor
     */
    set zoomFactor(val) {
        this.mZoomFactor = val;
        removeChildren(this.box);
        return val;
    }

    /**
     * Gets force24Hours property which sets time format to 24 hour format.
     *
     * @returns {Boolean}       force24Hours value
     */
    get force24Hours() {
        return this.mForce24Hours;
    }

    /**
     * Sets force24Hours property to a new value. If true, forces the freebusy view to 24 hours and
     * updates the UI accordingly
     *
     * @param {Boolean} val     New force24Hours value
     * @returns {Boolean}       New force24Hours value
     */
    set force24Hours(val) {
        this.mForce24Hours = val;
        this.initTimeRange();

        removeChildren(this.box);
        return val;
    }

    /**
     * Returns start date of the free busy grid.
     *
     * @returns {calIDateTime}      The start date
     */
    get startDate() {
        return this.mStartDate;
    }

    /**
     * Sets start date of the free busy grid and make it immutable.
     *
     * @param {calIDateTime} val        The start date
     * @returns {calIDateTime}          The start date
     */
    set startDate(val) {
        if (val == null) {
            return null;
        }

        this.mStartDate = val.clone();
        this.mStartDate.minute = 0;
        this.mStartDate.second = 0;
        this.mStartDate.makeImmutable();
        return val;
    }

    /**
     * Getss end date of the free busy grid.
     *
     * @returns {calIDateTime}      The end date
     */
    get endDate() {
        return this.mEndDate;
    }

    /**
     * Sets end date of the free busy grid and make it immutable.
     *
     * @param {calIDateTime} val        The end date
     * @returns {calIDateTime}          The end date
     */
    set endDate(val) {
        if (val == null) {
            return null;
        }

        this.mEndDate = val.clone();
        this.mEndDate.makeImmutable();
        return val;
    }

    /**
     * Gets text element's height.
     *
     * @returns {Number}        Text element height
     */
    get dayHeight() {
        return this.text.getBoundingClientRect().height;
    }

    /**
     * Sets a new date for the freebusy-day element and update the UI accordingly.
     *
     * @param {calIDateTime} val        Date object to be modified
     * @returns {calIDateTime}          Modified date object
     */
    set date(val) {
        if (val == null) {
            return null;
        }

        let date = val.clone();
        date.hour = 0;
        date.minute = 0;
        date.isDate = false;

        if (!this.dateFormatter) {
            this.dateFormatter = Cc["@mozilla.org/calendar/datetime-formatter;1"]
                                   .getService(Ci.calIDateTimeFormatter);
        }

        // First set the formatted date string as title
        let dateValue = this.zoomFactor > 100 ? this.dateFormatter.formatDateShort(date)
                                              : this.dateFormatter.formatDateLong(date);
        this.text.setAttribute("value", dateValue);

        // Now create as many 'hour' elements as needed
        let step_in_minutes = Math.floor(60 * this.zoomFactor / 100);
        let hours = this.box;
        date.hour = this.startHour;
        if (hours.childNodes.length <= 0) {
            let template = document.createXULElement("text");
            template.className = "freebusy-timebar-hour";
            let count = Math.ceil((this.endHour - this.startHour) * 60 / step_in_minutes);
            let remain = count;
            let first = true;
            while (remain--) {
                let newNode = template.cloneNode(false);
                let value = this.dateFormatter.formatTime(date);
                if (first) {
                    newNode.classList.add("first-in-day");
                    first = false;
                }
                newNode.setAttribute("value", value);
                hours.appendChild(newNode);
                date.minute += step_in_minutes;

                if (remain == 0) {
                    newNode.classList.add("last-in-day");
                }
            }
        }

        return val;
    }

    /**
     * Updates endHour and startHour values of the free busy day.
     */
    initTimeRange() {
        if (this.force24Hours) {
            this.startHour = 0;
            this.endHour = 24;
        } else {
            this.startHour = Services.prefs.getIntPref("calendar.view.daystarthour", 8);
            this.endHour = Services.prefs.getIntPref("calendar.view.dayendhour", 19);
        }
    }
}
customElements.define("calendar-event-freebusy-day", MozCalendarEventFreebusyDay);
