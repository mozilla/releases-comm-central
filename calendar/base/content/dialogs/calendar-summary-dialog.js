/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad, onAccept, onCancel, updatePartStat, browseDocument,
 *          sendMailToOrganizer
 */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calItipUtils.jsm");
Components.utils.import("resource://calendar/modules/calAlarmUtils.jsm");
Components.utils.import("resource://calendar/modules/calRecurrenceUtils.jsm");

/**
 * Sets up the summary dialog, setting all needed fields on the dialog from the
 * item received in the window arguments.
 */
function onLoad() {
    let args = window.arguments[0];
    let item = args.calendarEvent;
    item = item.clone(); // use an own copy of the passed item
    window.calendarItem = item;

    // the calling entity provides us with an object that is responsible
    // for recording details about the initiated modification. the 'finalize'-property
    // is our hook in order to receive a notification in case the operation needs
    // to be terminated prematurely. this function will be called if the calling
    // entity needs to immediately terminate the pending modification. in this
    // case we serialize the item and close the window.
    if (args.job) {
        // store the 'finalize'-functor in the provided job-object.
        args.job.finalize = () => {
            // store any pending modifications...
            this.onAccept();

            let calendarItem = window.calendarItem;

            // ...and close the window.
            window.close();

            return calendarItem;
        };
    }

    // set the dialog-id to enable the right window-icon to be loaded.
    if (cal.isEvent(item)) {
        setDialogId(document.documentElement, "calendar-event-summary-dialog");
    } else if (cal.isToDo(item)) {
        setDialogId(document.documentElement, "calendar-task-summary-dialog");
    }

    window.attendees = item.getAttendees({});

    let calendar = cal.wrapInstance(item.calendar, Components.interfaces.calISchedulingSupport);
    window.readOnly = !(isCalendarWritable(calendar) &&
                        (userCanModifyItem(item) ||
                         (calendar &&
                          item.calendar.isInvitation(item) &&
                          userCanRespondToInvitation(item))));
    if (!window.readOnly && calendar) {
        let attendee = calendar.getInvitedAttendee(item);
        if (attendee) {
            // if this is an unresponded invitation, preset our default alarm values:
            if (!item.getAlarms({}).length &&
                (attendee.participationStatus == "NEEDS-ACTION")) {
                cal.alarms.setDefaultValues(item);
            }

            window.attendee = attendee.clone();
            // Since we don't have API to update an attendee in place, remove
            // and add again. Also, this is needed if the attendee doesn't exist
            // (i.e REPLY on a mailing list)
            item.removeAttendee(attendee);
            item.addAttendee(window.attendee);

            // make partstat NEEDS-ACTION only available as a option to change to,
            // if the user hasn't ever made a decision prior to opening the dialog
            if (window.attendee.participationStatus == "NEEDS-ACTION" && cal.isEvent(item)) {
                document.getElementById("item-participation-needs-action").removeAttribute("hidden");
            }
        }
    }

    document.getElementById("item-title").value = item.title;

    document.getElementById("item-start-row").Item = item;
    document.getElementById("item-end-row").Item = item;

    updateInvitationStatus();

    // show reminder if this item is *not* readonly.
    // this case happens for example if this is an invitation.
    let argCalendar = window.arguments[0].calendarEvent.calendar;
    let supportsReminders =
        (argCalendar.getProperty("capabilities.alarms.oninvitations.supported") !== false);
    if (!window.readOnly && supportsReminders) {
        document.getElementById("reminder-row").removeAttribute("hidden");
        loadReminders(window.calendarItem.getAlarms({}));
        updateReminder();
    }

    updateRepeatDetails();
    updateAttendees();
    updateLink();

    let location = item.getProperty("LOCATION");
    if (location && location.length) {
        document.getElementById("location-row").removeAttribute("hidden");
        document.getElementById("item-location").value = location;
    }

    let categories = item.getCategories({});
    if (categories.length > 0) {
        document.getElementById("category-row").removeAttribute("hidden");
        document.getElementById("item-category").value = categories.join(", "); // TODO l10n-unfriendly
    }

    let organizer = item.organizer;
    if (organizer && organizer.id) {
        document.getElementById("organizer-row").removeAttribute("hidden");
        let cell = document.getElementsByClassName("item-organizer-cell")[0];
        let text = cell.getElementsByTagName("label")[0];
        let icon = cell.getElementsByTagName("img")[0];

        let role = organizer.role || "REQ-PARTICIPANT";
        let userType = organizer.userType || "INDIVIDUAL";
        let partstat = organizer.participationStatus || "NEEDS-ACTION";
        let orgName = (organizer.commonName && organizer.commonName.length)
                       ? organizer.commonName : organizer.toString();
        let userTypeString = cal.calGetString("calendar", "dialog.tooltip.attendeeUserType2." + userType,
                                              [organizer.toString()]);
        let roleString = cal.calGetString("calendar", "dialog.tooltip.attendeeRole2." + role,
                                          [userTypeString]);
        let partstatString = cal.calGetString("calendar", "dialog.tooltip.attendeePartStat2." + partstat,
                                             [orgName]);
        let tooltip = cal.calGetString("calendar", "dialog.tooltip.attendee.combined",
                                       [roleString, partstatString]);

        text.setAttribute("value", orgName);
        cell.setAttribute("tooltiptext", tooltip);
        icon.setAttribute("partstat", partstat);
        icon.setAttribute("usertype", userType);
        icon.setAttribute("role", role);
    }

    let status = item.getProperty("STATUS");
    if (status && status.length) {
        let statusRow = document.getElementById("status-row");
        for (let i = 0; i < statusRow.childNodes.length; i++) {
            if (statusRow.childNodes[i].getAttribute("status") == status) {
                statusRow.removeAttribute("hidden");
                if (status == "CANCELLED" && cal.isToDo(item)) {
                    // There are two labels for CANCELLED, the second one is for
                    // todo items. Increment the counter here.
                    i++;
                }
                statusRow.childNodes[i].removeAttribute("hidden");
                break;
            }
        }
    }

    if (item.hasProperty("DESCRIPTION")) {
        let description = item.getProperty("DESCRIPTION");
        if (description && description.length) {
            document.getElementById("item-description-box")
                .removeAttribute("hidden");
            let textbox = document.getElementById("item-description");
            textbox.value = description;
            textbox.inputField.readOnly = true;
        }
    }

    document.title = item.title;

    let attachments = item.getAttachments({});
    if (attachments.length) {
        // we only want to display uri type attachments and no ones received inline with the
        // invitation message (having a CID: prefix results in about:blank) here
        let attCounter = 0;
        attachments.forEach(aAttachment => {
            if (aAttachment.uri && aAttachment.uri.spec != "about:blank") {
                let attachment = document.getElementById("attachment-template").cloneNode(true);
                attachment.removeAttribute("id");
                attachment.removeAttribute("hidden");

                let label = attachment.getElementsByTagName("label")[0];
                label.setAttribute("value", aAttachment.uri.spec);
                label.setAttribute("hashid", aAttachment.hashId);

                let icon = attachment.getElementsByTagName("image")[0];
                let iconSrc = aAttachment.uri.spec.length ? aAttachment.uri.spec : "dummy.html";
                icon.setAttribute("src", "moz-icon://" + iconSrc);

                document.getElementById("item-attachment-cell").appendChild(attachment);
                attCounter++;
            }
        });
        if (attCounter > 0) {
            document.getElementById("attachments-row").removeAttribute("hidden");
        }
    }
    // If this item is read only we remove the 'cancel' button as users
    // can't modify anything, thus we go ahead with an 'ok' button only.
    if (window.readOnly) {
        document.documentElement.getButton("cancel").setAttribute("collapsed", "true");
    }

    window.focus();
    opener.setCursor("auto");
}

/**
 * Saves any changed information to the item.
 *
 * @return      Returns true if the dialog
 */
function onAccept() {
    dispose();
    if (window.readOnly) {
        return true;
    }
    let args = window.arguments[0];
    let oldItem = args.calendarEvent;
    let newItem = window.calendarItem;
    let calendar = newItem.calendar;
    saveReminder(newItem);
    args.onOk(newItem, calendar, oldItem);
    window.calendarItem = newItem;
    return true;
}

/**
 * Called when closing the dialog and any changes should be thrown away.
 */
function onCancel() {
    dispose();
    return true;
}

/**
 * Sets the dialog's invitation status dropdown to the value specified by the
 * user's invitation status.
 */
function updateInvitationStatus() {
    if (!window.readOnly) {
        if (window.attendee) {
            let invitationRow =
                document.getElementById("invitation-row");
            invitationRow.removeAttribute("hidden");
            let statusElement =
                document.getElementById("item-participation");
            statusElement.value = window.attendee.participationStatus;
        }
    }
}

/**
 * When the summary dialog is showing an invitation, this function updates the
 * user's invitation status from the value chosen in the dialog.
 */
function updatePartStat() {
    let statusElement = document.getElementById("item-participation");
    if (window.attendee) {
        let item = window.arguments[0];
        let aclEntry = item.calendar.aclEntry;
        if (aclEntry) {
            let userAddresses = aclEntry.getUserAddresses({});
            if (userAddresses.length > 0 &&
                !cal.attendeeMatchesAddresses(window.attendee, userAddresses)) {
                window.attendee.setProperty("SENT-BY", "mailto:" + userAddresses[0]);
            }
        }

        window.attendee.participationStatus = statusElement.value;
    }
}

/**
 * Updates the dialog w.r.t recurrence, i.e shows a text describing the item's
 * recurrence)
 */
function updateRepeatDetails() {
    let args = window.arguments[0];
    let item = args.calendarEvent;

    // step to the parent (in order to show the
    // recurrence info which is stored at the parent).
    item = item.parentItem;

    // retrieve a valid recurrence rule from the currently
    // set recurrence info. bail out if there's more
    // than a single rule or something other than a rule.
    let recurrenceInfo = item.recurrenceInfo;
    if (!recurrenceInfo) {
        return;
    }

    document.getElementById("repeat-row").removeAttribute("hidden");

    // First of all collapse the details text. If we fail to
    // create a details string, we simply don't show anything.
    // this could happen if the repeat rule is something exotic
    // we don't have any strings prepared for.
    let repeatDetails = document.getElementById("repeat-details");
    repeatDetails.setAttribute("collapsed", "true");

    // Try to create a descriptive string from the rule(s).
    let kDefaultTimezone = calendarDefaultTimezone();
    let startDate = item.startDate || item.entryDate;
    let endDate = item.endDate || item.dueDate;
    startDate = startDate ? startDate.getInTimezone(kDefaultTimezone) : null;
    endDate = endDate ? endDate.getInTimezone(kDefaultTimezone) : null;
    let detailsString = recurrenceRule2String(recurrenceInfo, startDate,
                                              endDate, startDate.isDate);

    if (!detailsString) {
        detailsString = cal.calGetString("calendar-event-dialog", "ruleTooComplexSummary");
    }

    // Now display the string...
    let lines = detailsString.split("\n");
    repeatDetails.removeAttribute("collapsed");
    while (repeatDetails.childNodes.length > lines.length) {
        repeatDetails.lastChild.remove();
    }
    let numChilds = repeatDetails.childNodes.length;
    for (let i = 0; i < lines.length; i++) {
        if (i >= numChilds) {
            let newNode = repeatDetails.firstChild
                                       .cloneNode(true);
            repeatDetails.appendChild(newNode);
        }
        repeatDetails.childNodes[i].value = lines[i];
        repeatDetails.childNodes[i].setAttribute("tooltiptext", detailsString);
    }
}

/**
 * Updates the attendee listbox, displaying all attendees invited to the
 * window's item.
 */
function updateAttendees() {
    if (window.attendees && window.attendees.length) {
        document.getElementById("item-attendees").removeAttribute("hidden");
        setupAttendees();
    }
}

/**
 * Updates the reminder, called when a reminder has been selected in the
 * menulist.
 */
function updateReminder() {
    commonUpdateReminder();
}

/**
 * Browse the item's attached URL.
 *
 * XXX This function is broken, should be fixed in bug 471967
 */
function browseDocument() {
    let args = window.arguments[0];
    let item = args.calendarEvent;
    let url = item.getProperty("URL");
    launchBrowser(url);
}

/**
 * Extracts the item's organizer and opens a compose window to send the
 * organizer an email.
 */
function sendMailToOrganizer() {
    let args = window.arguments[0];
    let item = args.calendarEvent;
    let organizer = item.organizer;
    let email = cal.getAttendeeEmail(organizer, true);
    let emailSubject = cal.calGetString("calendar-event-dialog", "emailSubjectReply", [item.title]);
    let identity = item.calendar.getProperty("imip.identity");
    sendMailTo(email, emailSubject, null, identity);
}

/**
 * Opens an attachment
 *
 * @param {AUTF8String}  aAttachmentId   The hashId of the attachment to open
 */
function openAttachment(aAttachmentId) {
    if (!aAttachmentId) {
        return;
    }
    let args = window.arguments[0];
    let item = args.calendarEvent;
    let attachments = item.getAttachments({})
                          .filter(aAttachment => aAttachment.hashId == aAttachmentId);
    if (attachments.length && attachments[0].uri && attachments[0].uri.spec != "about:blank") {
        let externalLoader = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                                       .getService(Components.interfaces.nsIExternalProtocolService);
        externalLoader.loadUrl(attachments[0].uri);
    }
}
