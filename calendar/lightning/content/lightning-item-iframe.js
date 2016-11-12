/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onEventDialogUnload, changeUndiscloseCheckboxStatus,
 *          toggleKeepDuration, dateTimeControls2State, onUpdateAllDay,
 *          openNewEvent, openNewTask, openNewMessage, openNewCardDialog,
 *          deleteAllAttachments, copyAttachment, attachmentLinkKeyPress,
 *          attachmentDblClick, attachmentClick, notifyUser,
 *          removeNotification, chooseRecentTimezone, showTimezonePopup,
 *          attendeeDblClick, attendeeClick, removeAttendee,
 *          removeAllAttendees, sendMailToUndecidedAttendees, checkUntilDate
 */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://calendar/modules/calRecurrenceUtils.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/PluralForm.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

try {
    Components.utils.import("resource:///modules/cloudFileAccounts.js");
} catch (e) {
    // This will fail on Seamonkey, but thats ok since the pref for cloudfiles
    // is false, which means the UI will not be shown
}

// Flag for using new item UI code (HTML/React.js).
const gNewItemUI = Preferences.get("calendar.item.useNewItemUI", false);

// the following variables are constructed if the jsContext this file
// belongs to gets constructed. all those variables are meant to be accessed
// from within this file only.
var gStartTime = null;
var gEndTime = null;
var gItemDuration = null;
var gStartTimezone = null;
var gEndTimezone = null;
var gUntilDate = null;
var gIsReadOnly = false;
var gAttachMap = {};
var gConfirmCancel = true;
var gLastRepeatSelection = 0;
var gIgnoreUpdate = false;
var gWarning = false;
var gPreviousCalendarId = null;
var gTabInfoObject;
var gConfig = {
    priority: 0,
    privacy: null,
    status: "NONE",
    showTimeAs: null,
    percentComplete: 0
};
// The following variables are set by the load handler function of the
// parent context, so that they are already set before iframe content load:
//   - gTimezoneEnabled
//   - gShowLink

var eventDialogQuitObserver = {
    observe: function(aSubject, aTopic, aData) {
        // Check whether or not we want to veto the quit request (unless another
        // observer already did.
        if (aTopic == "quit-application-requested" &&
            (aSubject instanceof Components.interfaces.nsISupportsPRBool) &&
            !aSubject.data) {
            aSubject.data = !onCancel();
        }
    }
};

var eventDialogCalendarObserver = {
    target: null,
    isObserving: false,

    onModifyItem: function(aNewItem, aOldItem) {
        if (this.isObserving && "calendarItem" in window &&
            window.calendarItem && window.calendarItem.id == aOldItem.id) {
            let doUpdate = true;

            // The item has been modified outside the dialog. We only need to
            // prompt if there have been local changes also.
            if (isItemChanged()) {
                let promptService = Components.interfaces.nsIPromptService;
                let promptTitle = calGetString("calendar", "modifyConflictPromptTitle");
                let promptMessage = calGetString("calendar", "modifyConflictPromptMessage");
                let promptButton1 = calGetString("calendar", "modifyConflictPromptButton1");
                let promptButton2 = calGetString("calendar", "modifyConflictPromptButton2");
                let flags = promptService.BUTTON_TITLE_IS_STRING *
                            promptService.BUTTON_POS_0 +
                            promptService.BUTTON_TITLE_IS_STRING *
                            promptService.BUTTON_POS_1;

                let choice = Services.prompt.confirmEx(window, promptTitle, promptMessage, flags,
                                                       promptButton1, promptButton2, null, null, {});
                if (!choice) {
                    doUpdate = false;
                }
            }

            let item = aNewItem;
            if (window.calendarItem.recurrenceId && aNewItem.recurrenceInfo) {
                item = aNewItem.recurrenceInfo
                               .getOccurrenceFor(window.calendarItem.recurrenceId) || item;
            }
            window.calendarItem = item;

            if (doUpdate) {
                loadDialog(window.calendarItem);
            }
        }
    },

    onDeleteItem: function(aDeletedItem) {
        if (this.isObserving && "calendarItem" in window &&
            window.calendarItem && window.calendarItem.id == aDeletedItem.id) {
            cancelItem();
        }
    },

    onStartBatch: function() {},
    onEndBatch: function() {},
    onLoad: function() {},
    onAddItem: function() {},
    onError: function() {},
    onPropertyChanged: function() {},
    onPropertyDeleting: function() {},

    observe: function(aCalendar) {
        // use the new calendar if one was passed, otherwise use the last one
        this.target = aCalendar || this.target;
        if (this.target) {
            this.cancel();
            this.target.addObserver(this);
            this.isObserving = true;
        }
    },

    cancel: function() {
        if (this.isObserving && this.target) {
            this.target.removeObserver(this);
            this.isObserving = false;
        }
    }
};

/**
 * Checks if the given calendar supports notifying attendees. The item is needed
 * since calendars may support notifications for only some types of items.
 *
 * @param {calICalendar} aCalendar  The calendar to check
 * @param {calIItemBase} aItem      The item to check support for
 */
function canNotifyAttendees(aCalendar, aItem) {
    try {
        let calendar = aCalendar.QueryInterface(Components.interfaces.calISchedulingSupport);
        return (calendar.canNotify("REQUEST", aItem) && calendar.canNotify("CANCEL", aItem));
    } catch (exc) {
        return false;
    }
}

/**
 * Sends an asynchronous message to the parent context that contains the
 * iframe. Additional properties of aMessage are generally arguments
 * that will be passed to the function named in aMessage.command.
 *
 * @param {Object} aMessage           The message to pass to the parent context
 * @param {string} aMessage.command   The name of a function to call
 */
function sendMessage(aMessage) {
    parent.postMessage(aMessage, "*");
}

/**
 * Receives asynchronous messages from the parent context that contains the iframe.
 *
 * @param {MessageEvent} aEvent  Contains the message being received
 */
function receiveMessage(aEvent) {
    let validOrigin = gTabmail ? "chrome://messenger" : "chrome://calendar";
    if (aEvent.origin !== validOrigin) {
        return;
    }
    switch (aEvent.data.command) {
        case "editAttendees": editAttendees(); break;
        case "attachURL": attachURL(); break;
        case "onCommandDeleteItem": onCommandDeleteItem(); break;
        case "onCommandSave": onCommandSave(aEvent.data.isClosing); break;
        case "onAccept": onAccept(); break;
        case "onCancel": onCancel(aEvent.data.iframeId); break;
        case "editConfigState": {
            Object.assign(gConfig, aEvent.data.argument);
            updateConfigState(aEvent.data.argument);
            if (gNewItemUI) {
                gTopComponent.importState(aEvent.data.argument);
            }
            break;
        }
        case "editToDoStatus": {
            let textbox = document.getElementById("percent-complete-textbox");
            setElementValue(textbox, aEvent.data.value);
            updateToDoStatus("percent-changed");
            break;
        }
        case "postponeTask":
            postponeTask(aEvent.data.value);
            break;
        case "toggleTimezoneLinks":
            gTimezonesEnabled = aEvent.data.checked;
            updateDateTime();
            /*
            // Not implemented in react-code.js yet
            if (gNewItemUI) {
                gTopComponent.importState({ timezonesEnabled: aEvent.data.checked });
            }
            */
            break;
        case "toggleLink": {
            let newUrl = window.calendarItem.getProperty("URL") || "";
            let newShow = showOrHideItemURL(aEvent.data.checked, newUrl);
            // Disable command if there is no url
            if (!newUrl.length) {
                sendMessage({ command: "disableLinkCommand" });
            }
            if (gNewItemUI) {
                gTopComponent.importState({
                    url: newUrl,
                    showUrl: newShow
                });
            } else {
                updateItemURL(newShow, newUrl);
            }
            break;
        }
        case "closingWindowWithTabs": {
            let response = onCancel(aEvent.data.id, true);
            sendMessage({
                command: "replyToClosingWindowWithTabs",
                response: response
            });
            break;
        }
        case "attachFileByAccountKey":
            attachFileByAccountKey(aEvent.data.accountKey);
            break;
    }
}

/**
 * Sets up the event dialog from the window arguments, also setting up all
 * dialog controls from the window's item.
 */
function onLoad() {
    window.addEventListener("message", receiveMessage, false);

    // first of all retrieve the array of
    // arguments this window has been called with.
    let args = window.arguments[0];

    intializeTabOrWindowVariables();

    // Needed so we can call switchToTab for the prompt about saving
    // unsaved changes, to show the tab that the prompt is for.
    if (gInTab) {
        gTabInfoObject = gTabmail.currentTabInfo;
    }

    // The calling entity provides us with an object that is responsible
    // for recording details about the initiated modification. the 'finalize'
    // property is our hook in order to receive a notification in case the
    // operation needs to be terminated prematurely. This function will be
    // called if the calling entity needs to immediately terminate the pending
    // modification. In this case we serialize the item and close the window.
    if (args.job) {
        // keep the iframe id so we can close the right tab...
        let iframeId = window.frameElement.id;

        // store the 'finalize'-functor in the provided job-object.
        args.job.finalize = () => {
            // store any pending modifications...
            this.onAccept();

            let item = window.calendarItem;

            // ...and close the window.
            sendMessage({ command: "closeWindowOrTab", iframeId: iframeId });

            return item;
        };
    }

    window.fbWrapper = args.fbWrapper;

    // the most important attribute we expect from the
    // arguments is the item we'll edit in the dialog.
    let item = args.calendarEvent;

    // set the iframe's top level id for event vs task
    if (!cal.isEvent(item)) {
        setDialogId(document.documentElement, "calendar-task-dialog-inner");
    }

    // new items should have a non-empty title.
    if (item.isMutable && (!item.title || item.title.length <= 0)) {
        item.title = cal.calGetString("calendar-event-dialog",
                                      isEvent(item) ? "newEvent" : "newTask");
    }

    window.onAcceptCallback = args.onOk;
    window.mode = args.mode;

    // we store the item in the window to be able
    // to access this from any location. please note
    // that the item is either an occurrence [proxy]
    // or the stand-alone item [single occurrence item].
    window.calendarItem = item;
    // store the initial date value for datepickers in New Task dialog
    window.initialStartDateValue = args.initialStartDateValue;

    // we store the array of attendees in the window.
    // clone each existing attendee since we still suffer
    // from the 'lost x-properties'-bug.
    window.attendees = [];
    let attendees = item.getAttendees({});
    if (attendees && attendees.length) {
        for (let attendee of attendees) {
            window.attendees.push(attendee.clone());
        }
    }

    window.organizer = null;
    if (item.organizer) {
        window.organizer = item.organizer.clone();
    } else if (item.getAttendees({}).length > 0) {
        // previous versions of calendar may have filled ORGANIZER correctly on overridden instances:
        let orgId = item.calendar.getProperty("organizerId");
        if (orgId) {
            let organizer = cal.createAttendee();
            organizer.id = orgId;
            organizer.commonName = item.calendar.getProperty("organizerCN");
            organizer.role = "REQ-PARTICIPANT";
            organizer.participationStatus = "ACCEPTED";
            organizer.isOrganizer = true;
            window.organizer = organizer;
        }
    }

    // we store the recurrence info in the window so it
    // can be accessed from any location. since the recurrence
    // info is a property of the parent item we need to check
    // whether or not this item is a proxy or a parent.
    let parentItem = item;
    if (parentItem.parentItem != parentItem) {
        parentItem = parentItem.parentItem;
    }

    window.recurrenceInfo = null;
    if (parentItem.recurrenceInfo) {
        window.recurrenceInfo = parentItem.recurrenceInfo.clone();
    }

    // Set initial values for datepickers in New Tasks dialog
    if (isToDo(item)) {
        let initialDatesValue = cal.dateTimeToJsDate(args.initialStartDateValue);
        if (!gNewItemUI) {
            setElementValue("completed-date-picker", initialDatesValue);
            setElementValue("todo-entrydate", initialDatesValue);
            setElementValue("todo-duedate", initialDatesValue);
        }
    }
    loadDialog(window.calendarItem);

    gMainWindow.setCursor("auto");

    if (typeof ToolbarIconColor !== "undefined") {
        ToolbarIconColor.init();
    }

    if (!gNewItemUI) {
        document.getElementById("item-title").focus();
        document.getElementById("item-title").select();
    }

    // This causes the app to ask if the window should be closed when the
    // application is closed.
    Services.obs.addObserver(eventDialogQuitObserver,
                             "quit-application-requested", false);

    // Normally, Enter closes a <dialog>. We want this to rather on Ctrl+Enter.
    // Stopping event propagation doesn't seem to work, so just overwrite the
    // function that does this.
    if (!gInTab) {
        document.documentElement._hitEnter = function() {};
    }

    // set up our calendar event observer
    eventDialogCalendarObserver.observe(item.calendar);

    onLoad.hasLoaded = true;
}
// Set a variable to allow or prevent actions before the dialog is done loading.
onLoad.hasLoaded = false;

function onEventDialogUnload() {
    if (typeof ToolbarIconColor !== "undefined") {
        ToolbarIconColor.uninit();
    }
    Services.obs.removeObserver(eventDialogQuitObserver,
                                "quit-application-requested");
    eventDialogCalendarObserver.cancel();
}

/**
 * Handler function to be called when the accept button is pressed.
 *
 * @return      Returns true if the window should be closed
 */
function onAccept() {
    dispose();
    onCommandSave(true);
    if (!gWarning) {
        sendMessage({ command: "closeWindowOrTab" });
    }
    return !gWarning;
}

/**
 * Asks the user if the item should be saved and does so if requested. If the
 * user cancels, the window should stay open.
 *
 * XXX Could possibly be consolidated into onCancel()
 *
 * @return    Returns true if the window should be closed.
 */
function onCommandCancel() {
    if (gNewItemUI) {
        // saving is not supported yet for gNewItemUI, return true to
        // allow the tab to close
        console.log("Saving changes is not yet supported with the HTML " +
                    "UI for editing events and tasks.");
        return true;
    }

    // Allow closing if the item has not changed and no warning dialog has to be showed.
    if (!isItemChanged() && !gWarning) {
        return true;
    }

    if (gInTab && gTabInfoObject) {
        // Switch to the tab that the prompt refers to.
        gTabmail.switchToTab(gTabInfoObject);
    }

    let promptService = Components.interfaces.nsIPromptService;

    let promptTitle = cal.calGetString("calendar",
                                       isEvent(window.calendarItem)
                                          ? "askSaveTitleEvent"
                                          : "askSaveTitleTask");
    let promptMessage = cal.calGetString("calendar",
                                         isEvent(window.calendarItem)
                                            ? "askSaveMessageEvent"
                                            : "askSaveMessageTask");

    let flags = promptService.BUTTON_TITLE_SAVE *
                promptService.BUTTON_POS_0 +
                promptService.BUTTON_TITLE_CANCEL *
                promptService.BUTTON_POS_1 +
                promptService.BUTTON_TITLE_DONT_SAVE *
                promptService.BUTTON_POS_2;

    let choice = Services.prompt.confirmEx(null,
                                           promptTitle,
                                           promptMessage,
                                           flags,
                                           null,
                                           null,
                                           null,
                                           null,
                                           {});
    switch (choice) {
        case 0: // Save
            onCommandSave(true);
            return true;
        case 2: // Don't save
            // Don't show any warning dialog when closing without saving.
            gWarning = false;
            return true;
        default: // Cancel
            return false;
    }
}

/**
 * Handler function to be called when the cancel button is pressed.
 * aPreventClose is true when closing the main window but leaving the tab open.
 *
 * @param  {string}  aIframeId      (optional) iframe id of the tab to be closed
 * @param  {boolean} aPreventClose  (optional) True means don't close, just ask about saving
 * @return {boolean}                True if the tab or window should be closed
 */
function onCancel(aIframeId, aPreventClose) {
    // The datepickers need to remove the focus in order to trigger the
    // validation of the values just edited, with the keyboard, but not yet
    // confirmed (i.e. not followed by a click, a tab or enter keys pressure).
    document.documentElement.focus();

    if (!gConfirmCancel || (gConfirmCancel && onCommandCancel())) {
        dispose();
        // Don't allow closing the dialog when the user inputs a wrong
        // date then closes the dialog and answers with "Save" in
        // the "Save Event" dialog.  Don't allow closing the dialog if
        // the main window is being closed but the tabs in it are not.

        if (!gWarning && aPreventClose != true) {
            sendMessage({ command: "closeWindowOrTab", iframeId: aIframeId });
        }
        return !gWarning;
    }
    return false;
}

/**
 * Cancels (closes) either the window or the tab, for example when the
 * item is being deleted.
 */
function cancelItem() {
    gConfirmCancel = false;
    if (gInTab) {
        onCancel();
    } else {
        sendMessage({ command: "cancelDialog" });
    }
}

/**
 * Sets up all dialog controls from the information of the passed item.
 *
 * @param aItem      The item to parse information out of.
 */
function loadDialog(aItem) {
    loadDateTime(aItem);

    let itemProps;
    if (gNewItemUI) {
        // Properties for initializing the React component/UI.
        itemProps = {
            initialTitle: aItem.title,
            initialLocation: aItem.getProperty("LOCATION"),
            initialStartTimezone: gStartTimezone,
            initialEndTimezone: gEndTimezone,
            initialStartTime: gStartTime,
            initialEndTime: gEndTime
        };
    } else {
        setElementValue("item-title", aItem.title);
        setElementValue("item-location", aItem.getProperty("LOCATION"));
    }

    // add calendars to the calendar menulist
    if (gNewItemUI) {
        let calendarToUse = aItem.calendar || window.arguments[0].calendar;
        let unfilteredList = sortCalendarArray(cal.getCalendarManager().getCalendars({}));

        // filter out calendars that should not be included
        let calendarList = unfilteredList.filter((calendar) =>
           (calendar.id == calendarToUse.id ||
            (calendar &&
             isCalendarWritable(calendar) &&
             (userCanAddItemsToCalendar(calendar) ||
              (calendar == aItem.calendar && userCanModifyItem(aItem))) &&
             isItemSupported(aItem, calendar))));

        itemProps.calendarList = calendarList.map(calendar => [calendar.id, calendar.name]);

        if (calendarToUse && calendarToUse.id) {
            let index = itemProps.calendarList.findIndex(
                calendar => (calendar[0] == calendarToUse.id));
            if (index != -1) {
                itemProps.initialCalendarId = calendarToUse.id;
            }
        }
    } else {
        let calendarList = document.getElementById("item-calendar");
        removeChildren(calendarList);
        let indexToSelect = appendCalendarItems(aItem, calendarList, aItem.calendar || window.arguments[0].calendar);
        if (indexToSelect > -1) {
            calendarList.selectedIndex = indexToSelect;
        }
    }

    // Categories
    if (gNewItemUI) {
        // XXX more to do here with localization, see loadCategories.
        itemProps.initialCategoriesList = cal.sortArrayByLocaleCollator(getPrefCategoriesArray());
        itemProps.initialCategories = aItem.getCategories({});

        // just to demo capsules component
        itemProps.initialCategories = ["Some", "Demo", "Categories"];
    } else {
        loadCategories(aItem);
    }

    // Attachment
    if (!gNewItemUI) {
        loadCloudProviders();
    }
    let hasAttachments = capSupported("attachments");
    let attachments = aItem.getAttachments({});
    if (gNewItemUI) {
        itemProps.initialAttachments = {};
    }
    if (hasAttachments && attachments && attachments.length > 0) {
        for (let attachment of attachments) {
            if (gNewItemUI) {
                if (attachment &&
                    attachment.hashId &&
                    !(attachment.hashId in gAttachMap) &&
                    // We currently only support uri attachments.
                    attachment.uri) {
                    itemProps.initialAttachments[attachment.hashId] = attachment;

                    // XXX eventually we probably need to call addAttachment(attachment)
                    // here, until this works we just call updateAttachment()
                    updateAttachment();
                }
            } else {
                addAttachment(attachment);
            }
        }
    } else {
        updateAttachment();
    }

    // URL link
    // Currently we always show the link for the tab case (if the link
    // exists), since there is no menu item or toolbar item to show/hide it.
    let showLink = gInTab ? true : gShowLink;
    let itemUrl = window.calendarItem.getProperty("URL") || "";
    showLink = showOrHideItemURL(showLink, itemUrl);

    // Disable link command if there is no url
    if (!itemUrl.length) {
        sendMessage({ command: "disableLinkCommand" });
    }
    if (gNewItemUI) {
        itemProps.initialUrl = itemUrl;
        itemProps.initialShowUrl = showLink;
    } else {
        updateItemURL(showLink, itemUrl);
    }

    // Description
    if (gNewItemUI) {
        itemProps.initialDescription = aItem.getProperty("DESCRIPTION");
    } else {
        setElementValue("item-description", aItem.getProperty("DESCRIPTION"));
    }

    // Task completed date
    if (!gNewItemUI) {
        if (aItem.completedDate) {
            updateToDoStatus(aItem.status, cal.dateTimeToJsDate(aItem.completedDate));
        } else {
            updateToDoStatus(aItem.status);
        }
    }

    // Task percent complete
    if (isToDo(aItem)) {
        let percentCompleteInteger = 0;
        let percentCompleteProperty = aItem.getProperty("PERCENT-COMPLETE");
        if (percentCompleteProperty != null) {
            percentCompleteInteger = parseInt(percentCompleteProperty, 10);
        }
        if (percentCompleteInteger < 0) {
            percentCompleteInteger = 0;
        } else if (percentCompleteInteger > 100) {
            percentCompleteInteger = 100;
        }
        gConfig.percentComplete = percentCompleteInteger;
        if (gNewItemUI) {
            itemProps.initialPercentComplete = percentCompleteInteger;
        } else {
            setElementValue("percent-complete-textbox", percentCompleteInteger);
        }
    }

    // When in a window, set Item-Menu label to Event or Task
    if (!gInTab) {
        let isEvent = cal.isEvent(aItem);

        let labelString = isEvent ? "itemMenuLabelEvent" : "itemMenuLabelTask";
        let label = cal.calGetString("calendar-event-dialog", labelString);

        let accessKeyString = isEvent ? "itemMenuAccesskeyEvent2" : "itemMenuAccesskeyTask2";
        let accessKey = cal.calGetString("calendar-event-dialog", accessKeyString);
        sendMessage({
            command: "initializeItemMenu",
            label: label,
            accessKey: accessKey
        });
    }

    // Repeat details
    let [repeatType, untilDate] = getRepeatTypeAndUntilDate(aItem);
    if (gNewItemUI) {
        itemProps.initialRepeat = repeatType;
        itemProps.initialRepeatUntilDate = untilDate;
        // XXX more to do, see loadRepeat
    } else {
        loadRepeat(repeatType, untilDate, aItem);
    }

    if (!gNewItemUI) {
        // load reminders details
        loadReminders(aItem.getAlarms({}));

        // Synchronize link-top-image with keep-duration-button status
        let keepAttribute = document.getElementById("keepduration-button").getAttribute("keep") == "true";
        setBooleanAttribute("link-image-top", "keep", keepAttribute);

        updateDateTime();

        updateCalendar();

        // figure out what the title of the dialog should be and set it
        // tabs already have their title set
        if (!gInTab) {
            updateTitle();
        }

        let notifyCheckbox = document.getElementById("notify-attendees-checkbox");
        let undiscloseCheckbox = document.getElementById("undisclose-attendees-checkbox");
        if (canNotifyAttendees(aItem.calendar, aItem)) {
            // visualize that the server will send out mail:
            notifyCheckbox.checked = true;
            // hide undisclosure control as this a client only feature
            undiscloseCheckbox.disabled = true;
        } else {
            let itemProp = aItem.getProperty("X-MOZ-SEND-INVITATIONS");
            notifyCheckbox.checked = (aItem.calendar.getProperty("imip.identity") &&
                                      ((itemProp === null)
                                       ? Preferences.get("calendar.itip.notify", true)
                                       : (itemProp == "TRUE")));
            let undiscloseProp = aItem.getProperty("X-MOZ-SEND-INVITATIONS-UNDISCLOSED");
            undiscloseCheckbox.checked = (undiscloseProp === null)
                                         ? false // default value as most common within organizations
                                         : (undiscloseProp == "TRUE");
            // disable checkbox, if notifyCheckbox is not checked
            undiscloseCheckbox.disabled = (notifyCheckbox.checked == false);
        }

        updateAttendees();
        updateRepeat(true);
        updateReminder(true);
    }

    // Status
    if (cal.isEvent(aItem)) {
        gConfig.status = aItem.hasProperty("STATUS") ?
            aItem.getProperty("STATUS") : "NONE";
        if (gConfig.status == "NONE") {
            sendMessage({ command: "showCmdStatusNone" });
        }
        updateConfigState({ status: gConfig.status });
        if (gNewItemUI) {
            itemProps.initialStatus = gConfig.status;
        }
    } else {
        let itemStatus = aItem.getProperty("STATUS");
        if (gNewItemUI) {
            // Not implemented yet in react-code.js
            // itemProps.initialTodoStatus = itemStatus;
        } else {
            let todoStatus = document.getElementById("todo-status");
            setElementValue(todoStatus, itemStatus);
            if (!todoStatus.selectedItem) {
                // No selected item means there was no <menuitem> that matches the
                // value given. Select the "NONE" item by default.
                setElementValue(todoStatus, "NONE");
            }
        }
    }

    // Priority, Privacy, Transparency
    gConfig.priority = parseInt(aItem.priority, 10);
    gConfig.privacy = aItem.privacy;
    gConfig.showTimeAs = aItem.getProperty("TRANSP");

    // update in outer parent context
    updateConfigState(gConfig);

    // update in iframe (gNewItemUI only)
    if (gNewItemUI) {
        itemProps.initialPriority = gConfig.priority;
        itemProps.supportsPriority = capSupported("priority");

        itemProps.initialPrivacy = gConfig.privacy || "NONE";
        // XXX need to update the privacy options depending on calendar support for them
        itemProps.supportsPrivacy = capSupported("privacy");

        itemProps.initialShowTimeAs = gConfig.showTimeAs;
    }

    // render the UI for gNewItemUI
    if (gNewItemUI) {
        gTopComponent = ReactDOM.render(
            React.createElement(TopComponent, itemProps),
            document.getElementById("container")
        );
    }
}

/**
 * Enables/disables undiscloseCheckbox on (un)checking notifyCheckbox
 */
function changeUndiscloseCheckboxStatus() {
    let notifyCheckbox = document.getElementById("notify-attendees-checkbox");
    let undiscloseCheckbox = document.getElementById("undisclose-attendees-checkbox");
    undiscloseCheckbox.disabled = (!notifyCheckbox.checked);
}

/**
 * Loads the item's categories into the category panel
 *
 * @param aItem     The item to load into the category panel
 */
function loadCategories(aItem) {
    let categoryPanel = document.getElementById("item-categories-panel");
    categoryPanel.loadItem(aItem);
    updateCategoryMenulist();
}

/**
 * Updates the category menulist to show the correct label, depending on the
 * selected categories in the category panel
 */
function updateCategoryMenulist() {
    let categoryMenulist = document.getElementById("item-categories");
    let categoryPanel = document.getElementById("item-categories-panel");

    // Make sure the maximum number of categories is applied to the listbox
    let calendar = getCurrentCalendar();
    let maxCount = calendar.getProperty("capabilities.categories.maxCount");
    categoryPanel.maxCount = (maxCount === null ? -1 : maxCount);

    // Hide the categories listbox and label in case categories are not
    // supported
    setBooleanAttribute("item-categories", "hidden", (maxCount === 0));
    setBooleanAttribute("item-categories-label", "hidden", (maxCount === 0));
    setBooleanAttribute("item-calendar-label", "hidden", (maxCount === 0));
    setBooleanAttribute("item-calendar-aux-label", "hidden", (maxCount !== 0));

    let label;
    let categoryList = categoryPanel.categories;
    if (categoryList.length > 1) {
        label = cal.calGetString("calendar", "multipleCategories");
    } else if (categoryList.length == 1) {
        label = categoryList[0];
    } else {
        label = cal.calGetString("calendar", "None");
    }
    categoryMenulist.setAttribute("label", label);
}

/**
 * Saves the selected categories into the passed item
 *
 * @param aItem     The item to set the categories on
 */
function saveCategories(aItem) {
    let categoryPanel = document.getElementById("item-categories-panel");
    let categoryList = categoryPanel.categories;
    aItem.setCategories(categoryList.length, categoryList);
}

/**
 * Sets up all date related controls from the passed item
 *
 * @param item      The item to parse information out of.
 */
function loadDateTime(item) {
    let kDefaultTimezone = calendarDefaultTimezone();
    if (isEvent(item)) {
        let startTime = item.startDate;
        let endTime = item.endDate;
        let duration = endTime.subtractDate(startTime);

        // Check if an all-day event has been passed in (to adapt endDate).
        if (startTime.isDate) {
            startTime = startTime.clone();
            endTime = endTime.clone();

            endTime.day--;
            duration.days--;
        }

        // store the start/end-times as calIDateTime-objects
        // converted to the default timezone. store the timezones
        // separately.
        gStartTimezone = startTime.timezone;
        gEndTimezone = endTime.timezone;
        gStartTime = startTime.getInTimezone(kDefaultTimezone);
        gEndTime = endTime.getInTimezone(kDefaultTimezone);
        gItemDuration = duration;
    }

    if (isToDo(item)) {
        let startTime = null;
        let endTime = null;
        let duration = null;

        let hasEntryDate = (item.entryDate != null);
        if (hasEntryDate) {
            startTime = item.entryDate;
            gStartTimezone = startTime.timezone;
            startTime = startTime.getInTimezone(kDefaultTimezone);
        } else {
            gStartTimezone = kDefaultTimezone;
        }
        let hasDueDate = (item.dueDate != null);
        if (hasDueDate) {
            endTime = item.dueDate;
            gEndTimezone = endTime.timezone;
            endTime = endTime.getInTimezone(kDefaultTimezone);
        } else {
            gEndTimezone = kDefaultTimezone;
        }
        if (hasEntryDate && hasDueDate) {
            duration = endTime.subtractDate(startTime);
        }
        if (!gNewItemUI) {
            setElementValue("cmd_attendees", true, "disabled");
            setBooleanAttribute("keepduration-button", "disabled", !(hasEntryDate && hasDueDate));
        }
        sendMessage({
            command: "updateConfigState",
            argument: { attendeesCommand: false }
        });
        gStartTime = startTime;
        gEndTime = endTime;
        gItemDuration = duration;
    } else {
        sendMessage({
            command: "updateConfigState",
            argument: { attendeesCommand: true }
        });
    }
}

/**
 * Toggles the "keep" attribute every time the keepduration-button is pressed.
 */
function toggleKeepDuration() {
    let kdb = document.getElementById("keepduration-button");
    let keepAttribute = kdb.getAttribute("keep") == "true";
    // To make the "keep" attribute persistent, it mustn't be removed when in
    // false state (bug 15232).
    kdb.setAttribute("keep", keepAttribute ? "false" : "true");
    setBooleanAttribute("link-image-top", "keep", !keepAttribute);
}

/**
 * Handler function to be used when the Start time or End time of the event have
 * changed.
 * When changing the Start date, the End date changes automatically so the
 * event/task's duration stays the same. Instead the End date is not linked
 * to the Start date unless the the keepDurationButton has the "keep" attribute
 * set to true. In this case modifying the End date changes the Start date in
 * order to keep the same duration.
 *
 * @param aStartDatepicker     If true the Start or Entry datepicker has changed,
 *                             otherwise the End or Due datepicker has changed.
 */
function dateTimeControls2State(aStartDatepicker) {
    if (gIgnoreUpdate) {
        return;
    }
    let keepAttribute = document.getElementById("keepduration-button")
                                .getAttribute("keep") == "true";
    let allDay = getElementValue("event-all-day", "checked");
    let startWidgetId;
    let endWidgetId;
    if (isEvent(window.calendarItem)) {
        startWidgetId = "event-starttime";
        endWidgetId = "event-endtime";
    } else {
        if (!getElementValue("todo-has-entrydate", "checked")) {
            gItemDuration = null;
        }
        if (!getElementValue("todo-has-duedate", "checked")) {
            gItemDuration = null;
        }
        startWidgetId = "todo-entrydate";
        endWidgetId = "todo-duedate";
    }

    let saveStartTime = gStartTime;
    let saveEndTime = gEndTime;
    let kDefaultTimezone = calendarDefaultTimezone();

    if (gStartTime) {
        // jsDate is always in OS timezone, thus we create a calIDateTime
        // object from the jsDate representation then we convert the timezone
        // in order to keep gStartTime in default timezone.
        if (gTimezonesEnabled || allDay) {
            gStartTime = cal.jsDateToDateTime(getElementValue(startWidgetId), gStartTimezone);
            gStartTime = gStartTime.getInTimezone(kDefaultTimezone);
        } else {
            gStartTime = cal.jsDateToDateTime(getElementValue(startWidgetId), kDefaultTimezone);
        }
        gStartTime.isDate = allDay;
    }
    if (gEndTime) {
        if (aStartDatepicker) {
            // Change the End date in order to keep the duration.
            gEndTime = gStartTime.clone();
            if (gItemDuration) {
                gEndTime.addDuration(gItemDuration);
            }
        } else {
            let timezone = gEndTimezone;
            if (timezone.isUTC) {
                if (gStartTime && !compareObjects(gStartTimezone, gEndTimezone)) {
                    timezone = gStartTimezone;
                }
            }
            if (gTimezonesEnabled || allDay) {
                gEndTime = cal.jsDateToDateTime(getElementValue(endWidgetId), timezone);
                gEndTime = gEndTime.getInTimezone(kDefaultTimezone);
            } else {
                gEndTime = cal.jsDateToDateTime(getElementValue(endWidgetId), kDefaultTimezone);
            }
            gEndTime.isDate = allDay;
            if (keepAttribute && gItemDuration) {
                // Keepduration-button links the the Start to the End date. We
                // have to change the Start date in order to keep the duration.
                let fduration = gItemDuration.clone();
                fduration.isNegative = true;
                gStartTime = gEndTime.clone();
                gStartTime.addDuration(fduration);
            }
        }
    }

    if (allDay) {
        gStartTime.isDate = true;
        gEndTime.isDate = true;
        gItemDuration = gEndTime.subtractDate(gStartTime);
    }

    // calculate the new duration of start/end-time.
    // don't allow for negative durations.
    let warning = false;
    let stringWarning = "";
    if (!aStartDatepicker && gStartTime && gEndTime) {
        if (gEndTime.compare(gStartTime) >= 0) {
            gItemDuration = gEndTime.subtractDate(gStartTime);
        } else {
            gStartTime = saveStartTime;
            gEndTime = saveEndTime;
            warning = true;
            stringWarning = cal.calGetString("calendar", "warningEndBeforeStart");
        }
    }

    let startChanged = false;
    if (gStartTime && saveStartTime) {
        startChanged = gStartTime.compare(saveStartTime) != 0;
    }
    // Preset the date in the until-datepicker's minimonth to the new start
    // date if it has changed.
    if (startChanged) {
        let startDate = cal.dateTimeToJsDate(gStartTime.getInTimezone(cal.floating()));
        document.getElementById("repeat-until-datepicker").extraDate = startDate;
    }

    // Sort out and verify the until date if the start date has changed.
    if (gUntilDate && startChanged) {
        // Make the time part of the until date equal to the time of start date.
        updateUntildateRecRule();

        // Don't allow for until date earlier than the start date.
        if (gUntilDate.compare(gStartTime) < 0) {
            // We have to restore valid dates. Since the user has intentionally
            // changed the start date, it looks reasonable to restore a valid
            // until date equal to the start date.
            gUntilDate = gStartTime.clone();
            // Update the rule.
            let rrules = splitRecurrenceRules(window.recurrenceInfo);
            recRule = rrules[0][0];
            recRule.untilDate = gUntilDate.clone();
            // Update the until-date-picker. In case of "custom" rule, the
            // recurrence string is going to be changed by updateDateTime() below.
            let notCustomRule = document.getElementById("repeat-deck").selectedIndex == 0;
            if (notCustomRule) {
                setElementValue("repeat-until-datepicker",
                                cal.dateTimeToJsDate(gUntilDate.getInTimezone(cal.floating())));
            }

            warning = true;
            stringWarning = cal.calGetString("calendar", "warningUntilDateBeforeStart");
        }
    }

    updateDateTime();
    updateTimezone();
    updateAccept();

    if (warning) {
        // Disable the "Save" and "Save and Close" commands as long as the
        // warning dialog is showed.
        enableAcceptCommand(false);
        gWarning = true;
        let callback = function() {
            Services.prompt.alert(null, document.title, stringWarning);
            gWarning = false;
            updateAccept();
        };
        setTimeout(callback, 1);
    }
}

/**
 * Updates the entry date checkboxes, used for example when choosing an alarm:
 * the entry date needs to be checked in that case.
 */
function updateEntryDate() {
    updateDateCheckboxes(
        "todo-entrydate",
        "todo-has-entrydate",
        {
            isValid: function() {
                return gStartTime != null;
            },
            setDateTime: function(date) {
                gStartTime = date;
            }
        });
}

/**
 * Updates the due date checkboxes.
 */
function updateDueDate() {
    updateDateCheckboxes(
        "todo-duedate",
        "todo-has-duedate",
        {
            isValid: function() {
                return gEndTime != null;
            },
            setDateTime: function(date) {
                gEndTime = date;
            }
        });
}

/**
 * Common function used by updateEntryDate and updateDueDate to set up the
 * checkboxes correctly.
 *
 * @param aDatePickerId     The XUL id of the datepicker to update.
 * @param aCheckboxId       The XUL id of the corresponding checkbox.
 * @param aDateTime         An object implementing the isValid and setDateTime
 *                            methods. XXX explain.
 */
function updateDateCheckboxes(aDatePickerId, aCheckboxId, aDateTime) {
    if (gIgnoreUpdate) {
        return;
    }

    if (!isToDo(window.calendarItem)) {
        return;
    }

    // force something to get set if there was nothing there before
    setElementValue(aDatePickerId, getElementValue(aDatePickerId));

    // first of all disable the datetime picker if we don't have a date
    let hasDate = getElementValue(aCheckboxId, "checked");
    setElementValue(aDatePickerId, !hasDate, "disabled");

    // create a new datetime object if date is now checked for the first time
    if (hasDate && !aDateTime.isValid()) {
        let date = cal.jsDateToDateTime(getElementValue(aDatePickerId), cal.calendarDefaultTimezone());
        aDateTime.setDateTime(date);
    } else if (!hasDate && aDateTime.isValid()) {
        aDateTime.setDateTime(null);
    }

    // calculate the duration if possible
    let hasEntryDate = getElementValue("todo-has-entrydate", "checked");
    let hasDueDate = getElementValue("todo-has-duedate", "checked");
    if (hasEntryDate && hasDueDate) {
        let start = cal.jsDateToDateTime(getElementValue("todo-entrydate"));
        let end = cal.jsDateToDateTime(getElementValue("todo-duedate"));
        gItemDuration = end.subtractDate(start);
    } else {
        gItemDuration = null;
    }
    setBooleanAttribute("keepduration-button", "disabled", !(hasEntryDate && hasDueDate));
    updateDateTime();
    updateTimezone();
}

/**
 * Get the item's recurrence information for displaying in dialog controls.
 *
 * @param {Object} aItem  The calendar item
 * @return {string[]}     An array of two strings: [repeatType, untilDate]
 */
function getRepeatTypeAndUntilDate(aItem) {
    let recurrenceInfo = window.recurrenceInfo;
    let repeatType = "none";
    let untilDate = "Forever";

    /**
     * Updates the until date (locally and globally).
     *
     * @param aRule  The recurrence rule
     */
    let updateUntilDate = (aRule) => {
        if (!aRule.isByCount) {
            if (aRule.isFinite) {
                gUntilDate = aRule.untilDate.clone().getInTimezone(cal.calendarDefaultTimezone());
                untilDate = cal.dateTimeToJsDate(gUntilDate.getInTimezone(cal.floating()));
            } else {
                gUntilDate = null;
            }
        }
    };

    if (recurrenceInfo) {
        repeatType = "custom";
        let ritems = recurrenceInfo.getRecurrenceItems({});
        let rules = [];
        let exceptions = [];
        for (let ritem of ritems) {
            if (ritem.isNegative) {
                exceptions.push(ritem);
            } else {
                rules.push(ritem);
            }
        }
        if (rules.length == 1) {
            let rule = cal.wrapInstance(rules[0], Components.interfaces.calIRecurrenceRule);
            if (rule) {
                switch (rule.type) {
                    case "DAILY":
                        if (!checkRecurrenceRule(rule, ["BYSECOND",
                                                        "BYMINUTE",
                                                        "BYHOUR",
                                                        "BYMONTHDAY",
                                                        "BYYEARDAY",
                                                        "BYWEEKNO",
                                                        "BYMONTH",
                                                        "BYSETPOS"])) {
                            let ruleComp = rule.getComponent("BYDAY", {});
                            if (rule.interval == 1) {
                                if (ruleComp.length > 0) {
                                    if (ruleComp.length == 5) {
                                        let found = false;
                                        for (let i = 0; i < 5; i++) {
                                            if (ruleComp[i] != i + 2) {
                                                found = true;
                                                break;
                                            }
                                        }
                                        if (!found && (!rule.isFinite || !rule.isByCount)) {
                                            repeatType = "every.weekday";
                                            updateUntilDate(rule);
                                        }
                                    }
                                } else if (!rule.isFinite || !rule.isByCount) {
                                    repeatType = "daily";
                                    updateUntilDate(rule);
                                }
                            }
                        }
                        break;
                    case "WEEKLY":
                        if (!checkRecurrenceRule(rule, ["BYSECOND",
                                                        "BYMINUTE",
                                                        "BYDAY",
                                                        "BYHOUR",
                                                        "BYMONTHDAY",
                                                        "BYYEARDAY",
                                                        "BYWEEKNO",
                                                        "BYMONTH",
                                                        "BYSETPOS"])) {
                            let weekType=["weekly", "bi.weekly"];
                            if ((rule.interval == 1 || rule.interval == 2) &&
                                (!rule.isFinite || !rule.isByCount)) {
                                repeatType = weekType[rule.interval - 1];
                                updateUntilDate(rule);
                            }
                        }
                        break;
                    case "MONTHLY":
                        if (!checkRecurrenceRule(rule, ["BYSECOND",
                                                        "BYMINUTE",
                                                        "BYDAY",
                                                        "BYHOUR",
                                                        "BYMONTHDAY",
                                                        "BYYEARDAY",
                                                        "BYWEEKNO",
                                                        "BYMONTH",
                                                        "BYSETPOS"])) {
                            if (rule.interval == 1 && (!rule.isFinite || !rule.isByCount)) {
                                repeatType = "monthly";
                                updateUntilDate(rule);
                            }
                        }
                        break;
                    case "YEARLY":
                        if (!checkRecurrenceRule(rule, ["BYSECOND",
                                                        "BYMINUTE",
                                                        "BYDAY",
                                                        "BYHOUR",
                                                        "BYMONTHDAY",
                                                        "BYYEARDAY",
                                                        "BYWEEKNO",
                                                        "BYMONTH",
                                                        "BYSETPOS"])) {
                            if (rule.interval == 1 && (!rule.isFinite || !rule.isByCount)) {
                                repeatType = "yearly";
                                updateUntilDate(rule);
                            }
                        }
                        break;
                }
            }
        }
    }
    return [repeatType, untilDate];
}

/**
 * Updates the XUL UI with the repeat type and the until date.
 *
 * XXX For gNewItemUI we need to handle gLastRepeatSelection and
 * disabling the element as we do in this function.
 *
 * @param {string} aRepeatType  The type of repeat
 * @param {string} aUntilDate   The until date
 * @param {Object} aItem        The calendar item
 */
function loadRepeat(aRepeatType, aUntilDate, aItem) {
    setElementValue("item-repeat", aRepeatType);
    let repeatMenu = document.getElementById("item-repeat");
    gLastRepeatSelection = repeatMenu.selectedIndex;

    if (aItem.parentItem != aItem) {
        disableElement("item-repeat");
        disableElement("repeat-until-datepicker");
    }
    // Show the repeat-until-datepicker and set its date
    document.getElementById("repeat-deck").selectedIndex = 0;
    setElementValue("repeat-until-datepicker", aUntilDate);
}

/**
 * Update reminder related elements on the dialog.
 *
 * @param aSuppressDialogs     If true, controls are updated without prompting
 *                               for changes with the custom dialog
 */
function updateReminder(aSuppressDialogs) {
    commonUpdateReminder(aSuppressDialogs);
    updateAccept();
}

/**
 * Saves all values the user chose on the dialog to the passed item
 *
 * @param item    The item to save to.
 */
function saveDialog(item) {
    // Calendar
    item.calendar = getCurrentCalendar();

    setItemProperty(item, "title", getElementValue("item-title"));
    setItemProperty(item, "LOCATION", getElementValue("item-location"));

    saveDateTime(item);

    if (isToDo(item)) {
        let percentCompleteInteger = 0;
        if (getElementValue("percent-complete-textbox") != "") {
            percentCompleteInteger =
                parseInt(getElementValue("percent-complete-textbox"), 10);
        }
        if (percentCompleteInteger < 0) {
            percentCompleteInteger = 0;
        } else if (percentCompleteInteger > 100) {
            percentCompleteInteger = 100;
        }
        setItemProperty(item, "PERCENT-COMPLETE", percentCompleteInteger);
    }

    // Categories
    saveCategories(item);

    // Attachment
    // We want the attachments to be up to date, remove all first.
    item.removeAllAttachments();

    // Now add back the new ones
    for (let hashId in gAttachMap) {
        let att = gAttachMap[hashId];
        item.addAttachment(att);
    }

    // Description
    setItemProperty(item, "DESCRIPTION", getElementValue("item-description"));

    // Event Status
    if (isEvent(item)) {
        if (gConfig.status && gConfig.status != "NONE") {
            item.setProperty("STATUS", gConfig.status);
        } else {
            item.deleteProperty("STATUS");
        }
    } else {
        let status = getElementValue("todo-status");
        if (status != "COMPLETED") {
            item.completedDate = null;
        }
        setItemProperty(item, "STATUS", status == "NONE" ? null : status);
    }

    // set the "PRIORITY" property if a valid priority has been
    // specified (any integer value except *null*) OR the item
    // already specifies a priority. in any other case we don't
    // need this property and can safely delete it. we need this special
    // handling since the WCAP provider always includes the priority
    // with value *null* and we don't detect changes to this item if
    // we delete this property.
    if (capSupported("priority") &&
        (gConfig.priority || item.hasProperty("PRIORITY"))) {
        item.setProperty("PRIORITY", gConfig.priority);
    } else {
        item.deleteProperty("PRIORITY");
    }

    // Transparency
    if (gConfig.showTimeAs) {
        item.setProperty("TRANSP", gConfig.showTimeAs);
    } else {
        item.deleteProperty("TRANSP");
    }

    // Privacy
    setItemProperty(item, "CLASS", gConfig.privacy, "privacy");

    if (item.status == "COMPLETED" && isToDo(item)) {
        let elementValue = getElementValue("completed-date-picker");
        item.completedDate = cal.jsDateToDateTime(elementValue);
    }

    saveReminder(item);
}

/**
 * Save date and time related values from the dialog to the passed item.
 *
 * @param item    The item to save to.
 */
function saveDateTime(item) {
    // Changes to the start date don't have to change the until date.
    untilDateCompensation(item);

    if (isEvent(item)) {
        let startTime = gStartTime.getInTimezone(gStartTimezone);
        let endTime = gEndTime.getInTimezone(gEndTimezone);
        let isAllDay = getElementValue("event-all-day", "checked");
        if (isAllDay) {
            startTime = startTime.clone();
            endTime = endTime.clone();
            startTime.isDate = true;
            endTime.isDate = true;
            endTime.day += 1;
        } else {
            startTime = startTime.clone();
            startTime.isDate = false;
            endTime = endTime.clone();
            endTime.isDate = false;
        }
        setItemProperty(item, "startDate", startTime);
        setItemProperty(item, "endDate", endTime);
    }
    if (isToDo(item)) {
        let startTime = gStartTime && gStartTime.getInTimezone(gStartTimezone);
        let endTime = gEndTime && gEndTime.getInTimezone(gEndTimezone);
        setItemProperty(item, "entryDate", startTime);
        setItemProperty(item, "dueDate", endTime);
    }
}

/**
 * Changes the until date in the rule in order to compensate the automatic
 * correction caused by the function onStartDateChange() when saving the
 * item.
 * It allows to keep the until date set in the dialog irrespective of the
 * changes that the user has done to the start date.
 */
function untilDateCompensation(aItem) {
    // The current start date in the item is always the date that we get
    // when opening the dialog or after the last save.
    let startDate = aItem[calGetStartDateProp(aItem)];

    if (aItem.recurrenceInfo) {
        let rrules = splitRecurrenceRules(aItem.recurrenceInfo);
        let rule = rrules[0][0];
        if (!rule.isByCount && rule.isFinite && startDate) {
            let compensation = startDate.subtractDate(gStartTime);
            if (compensation != "PT0S") {
                let untilDate = rule.untilDate.clone();
                untilDate.addDuration(compensation);
                rule.untilDate = untilDate;
            }
        }
    }
}

/**
 * Updates the dialog title based on item type and if the item is new or to be
 * modified.
 */
function updateTitle() {
    let strName;
    if (cal.isEvent(window.calendarItem)) {
        strName = (window.mode == "new" ? "newEventDialog" : "editEventDialog");
    } else if (cal.isToDo(window.calendarItem)) {
        strName = (window.mode == "new" ? "newTaskDialog" : "editTaskDialog");
    } else {
        throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    }
    let newTitle = cal.calGetString("calendar", strName) + ": " +
                      getElementValue("item-title");
    sendMessage({ command: "updateTitle", argument: newTitle });
}

/**
 * Update the disabled status of the accept button. The button is enabled if all
 * parts of the dialog have options selected that make sense.
 * constraining factors like
 */
function updateAccept() {
    let enableAccept = true;
    let kDefaultTimezone = calendarDefaultTimezone();
    let startDate;
    let endDate;
    let isEvent = cal.isEvent(window.calendarItem);

    // don't allow for end dates to be before start dates
    if (isEvent) {
        startDate = cal.jsDateToDateTime(getElementValue("event-starttime"));
        endDate = cal.jsDateToDateTime(getElementValue("event-endtime"));
    } else {
        startDate = getElementValue("todo-has-entrydate", "checked") ?
            cal.jsDateToDateTime(getElementValue("todo-entrydate")) : null;
        endDate = getElementValue("todo-has-duedate", "checked") ?
            cal.jsDateToDateTime(getElementValue("todo-duedate")) : null;
    }

    if (startDate && endDate) {
        if (gTimezonesEnabled) {
            let startTimezone = gStartTimezone;
            let endTimezone = gEndTimezone;
            if (endTimezone.isUTC) {
                if (!compareObjects(gStartTimezone, gEndTimezone)) {
                    endTimezone = gStartTimezone;
                }
            }

            startDate = startDate.getInTimezone(kDefaultTimezone);
            endDate = endDate.getInTimezone(kDefaultTimezone);

            startDate.timezone = startTimezone;
            endDate.timezone = endTimezone;
        }

        startDate = startDate.getInTimezone(kDefaultTimezone);
        endDate = endDate.getInTimezone(kDefaultTimezone);

        // For all-day events we are not interested in times and compare only
        // dates.
        if (isEvent && getElementValue("event-all-day", "checked")) {
            // jsDateToDateTime returnes the values in UTC. Depending on the
            // local timezone and the values selected in datetimepicker the date
            // in UTC might be shifted to the previous or next day.
            // For example: The user (with local timezone GMT+05) selected
            // Feb 10 2006 00:00:00. The corresponding value in UTC is
            // Feb 09 2006 19:00:00. If we now set isDate to true we end up with
            // a date of Feb 09 2006 instead of Feb 10 2006 resulting in errors
            // during the following comparison.
            // Calling getInTimezone() ensures that we use the same dates as
            // displayed to the user in datetimepicker for comparison.
            startDate.isDate = true;
            endDate.isDate = true;
        }
    }

    if (endDate && startDate && endDate.compare(startDate) == -1) {
        enableAccept = false;
    }

    enableAcceptCommand(enableAccept);

    return enableAccept;
}

/**
 * Enables/disables the commands cmd_accept and cmd_save related to the
 * save operation.
 *
 * @param aEnable           true: enables the command
 */
function enableAcceptCommand(aEnable) {
    sendMessage({ command: "enableAcceptCommand", argument: aEnable });
}

// Global variables used to restore start and end date-time when changing the
// "all day" status in the onUpdateAllday() function.
var gOldStartTime = null;
var gOldEndTime = null;
var gOldStartTimezone = null;
var gOldEndTimezone = null;

/**
 * Handler function to update controls and state in consequence of the "all
 * day" checkbox being clicked.
 */
function onUpdateAllDay() {
    if (!isEvent(window.calendarItem)) {
        return;
    }
    let allDay = getElementValue("event-all-day", "checked");
    let kDefaultTimezone = calendarDefaultTimezone();

    if (allDay) {
        // Store date-times and related timezones so we can restore
        // if the user unchecks the "all day" checkbox.
        gOldStartTime = gStartTime.clone();
        gOldEndTime = gEndTime.clone();
        gOldStartTimezone = gStartTimezone;
        gOldEndTimezone = gEndTimezone;
        // When events that end at 0:00 become all-day events, we need to
        // subtract a day from the end date because the real end is midnight.
        if (gEndTime.hour == 0 && gEndTime.minute == 0) {
            let tempStartTime = gStartTime.clone();
            let tempEndTime = gEndTime.clone();
            tempStartTime.isDate = true;
            tempEndTime.isDate = true;
            tempStartTime.day++;
            if (tempEndTime.compare(tempStartTime) >= 0) {
                gEndTime.day--;
            }
        }
    } else {
        gStartTime.isDate = false;
        gEndTime.isDate = false;
        if (!gOldStartTime && !gOldEndTime) {
            // The checkbox has been unchecked for the first time, the event
            // was an "All day" type, so we have to set default values.
            gStartTime.hour = getDefaultStartDate(window.initialStartDateValue).hour;
            gEndTime.hour = gStartTime.hour;
            gEndTime.minute += Preferences.get("calendar.event.defaultlength", 60);
            gOldStartTimezone = kDefaultTimezone;
            gOldEndTimezone = kDefaultTimezone;
        } else {
            // Restore date-times previously stored.
            gStartTime.hour = gOldStartTime.hour;
            gStartTime.minute = gOldStartTime.minute;
            gEndTime.hour = gOldEndTime.hour;
            gEndTime.minute = gOldEndTime.minute;
            // When we restore 0:00 as end time, we need to add one day to
            // the end date in order to include the last day until midnight.
            if (gEndTime.hour == 0 && gEndTime.minute == 0) {
                gEndTime.day++;
            }
        }
    }
    gStartTimezone = (allDay ? cal.floating() : gOldStartTimezone);
    gEndTimezone = (allDay ? cal.floating() : gOldEndTimezone);
    setShowTimeAs(allDay);

    updateAllDay();
}

/**
 * This function sets the enabled/disabled state of the following controls:
 * - 'event-starttime'
 * - 'event-endtime'
 * - 'timezone-starttime'
 * - 'timezone-endtime'
 * the state depends on whether or not the event is configured as 'all-day' or not.
 */
function updateAllDay() {
    if (gIgnoreUpdate) {
        return;
    }

    if (!isEvent(window.calendarItem)) {
        return;
    }

    let allDay = getElementValue("event-all-day", "checked");
    setElementValue("event-starttime", allDay, "timepickerdisabled");
    setElementValue("event-endtime", allDay, "timepickerdisabled");

    gStartTime.isDate = allDay;
    gEndTime.isDate = allDay;
    gItemDuration = gEndTime.subtractDate(gStartTime);

    updateDateTime();
    updateUntildateRecRule();
    updateRepeatDetails();
    updateAccept();
}

/**
 * Use the window arguments to cause the opener to create a new event on the
 * item's calendar
 */
function openNewEvent() {
    let item = window.calendarItem;
    let args = window.arguments[0];
    args.onNewEvent(item.calendar);
}

/**
 * Use the window arguments to cause the opener to create a new event on the
 * item's calendar
 */
function openNewTask() {
    let item = window.calendarItem;
    let args = window.arguments[0];
    args.onNewTodo(item.calendar);
}

/**
 * Open a new Thunderbird compose window.
 */
function openNewMessage() {
    MailServices.compose.OpenComposeWindow(null,
                                           null,
                                           null,
                                           Components.interfaces.nsIMsgCompType.New,
                                           Components.interfaces.nsIMsgCompFormat.Default,
                                           null,
                                           null);
}

/**
 * Open a new addressbook window
 */
function openNewCardDialog() {
    window.openDialog(
        "chrome://messenger/content/addressbook/abNewCardDialog.xul",
        "",
        "chrome,modal,resizable=no,centerscreen");
}

/**
 * Update the transparency status of this dialog, depending on if the event
 * is all-day or not.
 *
 * @param allDay    If true, the event is all-day
 */
function setShowTimeAs(allDay) {
    gConfig.showTimeAs = cal.getEventDefaultTransparency(allDay);
    updateConfigState({ showTimeAs: gConfig.showTimeAs });
}

function editAttendees() {
    let savedWindow = window;
    let calendar = getCurrentCalendar();

    let callback = function(attendees, organizer, startTime, endTime) {
        savedWindow.attendees = attendees;
        if (organizer) {
            // In case we didn't have an organizer object before we
            // added attendees to our event we take the one created
            // by the 'invite attendee'-dialog.
            if (savedWindow.organizer) {
                // The other case is that we already had an organizer object
                // before we went throught the 'invite attendee'-dialog. In that
                // case make sure we don't carry over attributes that have been
                // set to their default values by the dialog but don't actually
                // exist in the original organizer object.
                if (!savedWindow.organizer.id) {
                    organizer.id = null;
                }
                if (!savedWindow.organizer.role) {
                    organizer.role = null;
                }
                if (!savedWindow.organizer.participationStatus) {
                    organizer.participationStatus = null;
                }
                if (!savedWindow.organizer.commonName) {
                    organizer.commonName = null;
                }
            }
            savedWindow.organizer = organizer;
        }
        let duration = endTime.subtractDate(startTime);
        startTime = startTime.clone();
        endTime = endTime.clone();
        let kDefaultTimezone = calendarDefaultTimezone();
        gStartTimezone = startTime.timezone;
        gEndTimezone = endTime.timezone;
        gStartTime = startTime.getInTimezone(kDefaultTimezone);
        gEndTime = endTime.getInTimezone(kDefaultTimezone);
        gItemDuration = duration;
        updateAttendees();
        updateDateTime();
        updateAllDay();

        if (isAllDay != gStartTime.isDate) {
            setShowTimeAs(gStartTime.isDate);
        }
    };

    let startTime = gStartTime.getInTimezone(gStartTimezone);
    let endTime = gEndTime.getInTimezone(gEndTimezone);

    let isAllDay = getElementValue("event-all-day", "checked");
    if (isAllDay) {
        startTime.isDate = true;
        endTime.isDate = true;
        endTime.day += 1;
    } else {
        startTime.isDate = false;
        endTime.isDate = false;
    }
    let args = {};
    args.startTime = startTime;
    args.endTime = endTime;
    args.displayTimezone = gTimezonesEnabled;
    args.attendees = window.attendees;
    args.organizer = window.organizer && window.organizer.clone();
    args.calendar = calendar;
    args.item = window.calendarItem;
    args.onOk = callback;
    args.fbWrapper = window.fbWrapper;

    // open the dialog modally
    openDialog(
        "chrome://calendar/content/calendar-event-dialog-attendees.xul",
        "_blank",
        "chrome,titlebar,modal,resizable",
        args);
}

/**
 * Updates the UI outside of the iframe (toolbar, menu, statusbar, etc.)
 * for changes in priority, privacy, status, showTimeAs/transparency,
 * and/or other properties. This function should be called any time that
 * gConfig.privacy, gConfig.priority, etc. are updated.
 *
 * Privacy and priority updates depend on the selected calendar. If the
 * selected calendar does not support them, or only supports certain
 * values, these are removed from the UI.
 *
 * @param {Object} aArg             Container
 * @param {string} aArg.privacy     (optional) The new privacy value
 * @param {short} aArg.priority     (optional) The new priority value
 * @param {string} aArg.status      (optional) The new status value
 * @param {string} aArg.showTimeAs  (optional) The new transparency value
 */
function updateConfigState(aArg) {
    // We include additional info for priority and privacy.
    if (aArg.hasOwnProperty("priority")) {
        aArg.hasPriority = capSupported("priority");
    }
    if (aArg.hasOwnProperty("privacy")) {
        Object.assign(aArg, {
            hasPrivacy: capSupported("privacy"),
            calendarType: getCurrentCalendar().type,
            privacyValues: capValues("privacy",
                            ["PUBLIC", "CONFIDENTIAL", "PRIVATE"])
        });
    }

    // For tasks, do not include showTimeAs
    if (aArg.hasOwnProperty("showTimeAs") && cal.isToDo(window.calendarItem)) {
        delete aArg.showTimeAs;
        if (Object.keys(aArg).length == 0) {
            return;
        }
    }

    sendMessage({ command: "updateConfigState", argument: aArg });
}

/**
 * Add menu items to the UI for attaching files using cloud providers.
 */
function loadCloudProviders() {
    let cloudFileEnabled = Preferences.get("mail.cloud_files.enabled", false);
    let cmd = document.getElementById("cmd_attach_cloud");
    let message = {
        command: "setElementAttribute",
        argument: { id: "cmd_attach_cloud", attribute: "hidden", value: null }
    };

    if (!cloudFileEnabled) {
        // If cloud file support is disabled, just hide the attach item
        cmd.hidden = true;
        message.argument.value = true;
        sendMessage(message);
        return;
    }

    let isHidden = cloudFileAccounts.accounts.length == 0;
    cmd.hidden = isHidden;
    message.argument.value = isHidden;
    sendMessage(message);

    let itemObjects = [];

    for (let cloudProvider of cloudFileAccounts.accounts) {
        // Create a serializable object to pass in a message outside the iframe
        let itemObject = {};
        itemObject.displayName = cloudFileAccounts.getDisplayName(cloudProvider);
        itemObject.label = cal.calGetString("calendar-event-dialog", "attachViaFilelink", [itemObject.displayName]);
        itemObject.cloudProviderAccountKey = cloudProvider.accountKey;
        if (cloudProvider.iconClass) {
            itemObject.class = "menuitem-iconic";
            itemObject.image = cloudProvider.iconClass;
        }

        itemObjects.push(itemObject);

        // Create a menu item from the serializable object
        let item = createXULElement("menuitem");
        item.setAttribute("label", itemObject.label);
        item.setAttribute("observes", "cmd_attach_cloud");
        item.setAttribute("oncommand", "attachFile(event.target.cloudProvider); event.stopPropagation();");

        if (itemObject.class) {
            item.setAttribute("class", itemObject.class);
            item.setAttribute("image", itemObject.image);
        }

        // Add the menu item to places inside the iframe where we advertise cloud providers
        let attachmentPopup = document.getElementById("attachment-popup");
        attachmentPopup.appendChild(item).cloudProvider = cloudProvider;
    }

    // Add the items to places outside the iframe where we advertise cloud providers
    sendMessage({ command: "loadCloudProviders", items: itemObjects });
}

/**
 * Prompts the user to attach an url to this item.
 */
function attachURL() {
    if (Services.prompt) {
        // ghost in an example...
        let result = { value: "http://" };
        if (Services.prompt.prompt(window,
                                   calGetString("calendar-event-dialog",
                                                "specifyLinkLocation"),
                                   calGetString("calendar-event-dialog",
                                                "enterLinkLocation"),
                                   result,
                                   null,
                                   { value: 0 })) {
            try {
                // If something bogus was entered, makeURL may fail.
                let attachment = createAttachment();
                attachment.uri = makeURL(result.value);
                addAttachment(attachment);
            } catch (e) {
                // TODO We might want to show a warning instead of just not
                // adding the file
            }
        }
    }
}

/**
 * Attach a file using a cloud provider, identified by its accountKey.
 *
 * @param {string} aAccountKey  The accountKey for a cloud provider
 */
function attachFileByAccountKey(aAccountKey) {
    for (let cloudProvider of cloudFileAccounts.accounts) {
        if (aAccountKey == cloudProvider.accountKey) {
            attachFile(cloudProvider);
            return;
        }
    }
}

/**
 * Attach a file to the item. Not passing a cloud provider is currently unsupported.
 *
 * @param cloudProvider     If set, the cloud provider will be used for attaching
 */
function attachFile(cloudProvider) {
    if (!cloudProvider) {
        cal.ERROR("[calendar-event-dialog] Could not attach file without cloud provider" + cal.STACK(10));
    }

    let files;
    try {
        const nsIFilePicker = Components.interfaces.nsIFilePicker;
        let filePicker = Components.classes["@mozilla.org/filepicker;1"]
                                   .createInstance(nsIFilePicker);
        filePicker.init(window,
                        calGetString("calendar-event-dialog", "selectAFile"),
                        nsIFilePicker.modeOpenMultiple);

        // Check for the last directory
        let lastDir = lastDirectory();
        if (lastDir) {
            filePicker.displayDirectory = lastDir;
        }

        // Get the attachment
        if (filePicker.show() == nsIFilePicker.returnOK) {
            files = filePicker.files;
        }
    } catch (ex) {
        dump("failed to get attachments: " +ex+ "\n");
    }

    // Check if something has to be done
    if (!files || !files.hasMoreElements()) {
        return;
    }

    // Create the attachment
    while (files.hasMoreElements()) {
        let file = files.getNext().QueryInterface(Components.interfaces.nsILocalFile);

        let fileHandler = Services.io.getProtocolHandler("file")
                                     .QueryInterface(Components.interfaces.nsIFileProtocolHandler);
        let uriSpec = fileHandler.getURLSpecFromFile(file);

        if (!(uriSpec in gAttachMap)) {
            // If the attachment hasn't been added, then set the last display
            // directory.
            lastDirectory(uriSpec);

            // ... and add the attachment.
            let attachment = cal.createAttachment();
            if (cloudProvider) {
                attachment.uri = makeURL(uriSpec);
            } else {
                // TODO read file into attachment
            }
            addAttachment(attachment, cloudProvider);
        }
    }
}

/**
 * Helper function to remember the last directory chosen when attaching files.
 *
 * @param aFileUri    (optional) If passed, the last directory will be set and
 *                                 returned. If null, the last chosen directory
 *                                 will be returned.
 * @return            The last directory that was set with this function.
 */
function lastDirectory(aFileUri) {
    if (aFileUri) {
        // Act similar to a setter, save the passed uri.
        let uri = makeURL(aFileUri);
        let file = uri.QueryInterface(Components.interfaces.nsIFileURL).file;
        lastDirectory.mValue = file.parent.QueryInterface(Components.interfaces.nsILocalFile);
    }

    // In any case, return the value
    return (lastDirectory.mValue === undefined ? null : lastDirectory.mValue);
}

/**
 * Turns an url into a string that can be used in UI.
 * - For a file:// url, shows the filename.
 * - For a http:// url, removes protocol and trailing slash
 *
 * @param aUri    The uri to parse.
 * @return        A string that can be used in UI.
 */
function makePrettyName(aUri) {
    let name = aUri.spec;

    if (aUri.schemeIs("file")) {
        name = aUri.spec.split("/").pop();
    } else if (aUri.schemeIs("http")) {
        name = aUri.spec.replace(/\/$/, "").replace(/^http:\/\//, "");
    }
    return name;
}

/**
 * Asynchronously uploads the given attachment to the cloud provider, updating
 * the passed listItem as things progress.
 *
 * @param attachment        A calIAttachment to upload
 * @param cloudProvider     The clould provider to upload to
 * @param listItem          The listitem in attachment-link listbox to update.
 */
function uploadCloudAttachment(attachment, cloudProvider, listItem) {
    let file = attachment.uri.QueryInterface(Components.interfaces.nsIFileURL).file;
    listItem.attachLocalFile = file;
    listItem.attachCloudProvider = cloudProvider;
    cloudProvider.uploadFile(file, {
        onStartRequest: function() {
            listItem.setAttribute("image", "chrome://global/skin/icons/loading.png");
        },

        onStopRequest: function(aRequest, aContext, aStatusCode) {
            if (Components.isSuccessCode(aStatusCode)) {
                delete gAttachMap[attachment.hashId];
                attachment.uri = makeURL(cloudProvider.urlForFile(file));
                attachment.setParameter("FILENAME", file.leafName);
                attachment.setParameter("PROVIDER", cloudProvider.type);
                listItem.setAttribute("label", file.leafName);
                gAttachMap[attachment.hashId] = attachment;
                listItem.setAttribute("image", cloudProvider.iconClass);
                updateAttachment();
            } else {
                cal.ERROR("[calendar-event-dialog] Uploading cloud attachment " +
                          "failed. Status code: " + aStatusCode);

                // Uploading failed. First of all, show an error icon. Also,
                // delete it from the attach map now, this will make sure it is
                // not serialized if the user saves.
                listItem.setAttribute("image", "chrome://messenger/skin/icons/error.png");
                delete gAttachMap[attachment.hashId];

                // Keep the item for a while so the user can see something failed.
                // When we have a nice notification bar, we can show more info
                // about the failure.
                setTimeout(() => {
                    listItem.remove();
                    updateAttachment();
                }, 5000);
            }
        }
    });
}

/**
 * Adds the given attachment to dialog controls.
 *
 * @param attachment    The calIAttachment object to add
 * @param cloudProvider (optional) If set, the given cloud provider will be used.
 */
function addAttachment(attachment, cloudProvider) {
    if (!attachment ||
        !attachment.hashId ||
        attachment.hashId in gAttachMap) {
        return;
    }

    // We currently only support uri attachments
    if (attachment.uri) {
        let documentLink = document.getElementById("attachment-link");
        let listItem = createXULElement("listitem");

        // Set listitem attributes
        listItem.setAttribute("label", makePrettyName(attachment.uri));
        listItem.setAttribute("crop", "end");
        listItem.setAttribute("class", "listitem-iconic");
        listItem.setAttribute("tooltiptext", attachment.uri.spec);
        if (cloudProvider) {
            if (attachment.uri.schemeIs("file")) {
                // Its still a local url, needs to be uploaded
                listItem.setAttribute("image", "chrome://messenger/skin/icons/connecting.png");
                uploadCloudAttachment(attachment, cloudProvider, listItem);
            } else {
                let leafName = attachment.getParameter("FILENAME");
                listItem.setAttribute("image", cloudProvider.iconClass);
                if (leafName) {
                    listItem.setAttribute("label", leafName);
                }
            }
        } else if (attachment.uri.schemeIs("file")) {
            listItem.setAttribute("image", "moz-icon://" + attachment.uri);
        } else {
            let leafName = attachment.getParameter("FILENAME");
            let providerType = attachment.getParameter("PROVIDER");
            let cloudFileEnabled = Preferences.get("mail.cloud_files.enabled", false);

            if (leafName) {
                // TODO security issues?
                listItem.setAttribute("label", leafName);
            }
            if (providerType && cloudFileEnabled) {
                let provider = cloudFileAccounts.getProviderForType(providerType);
                listItem.setAttribute("image", provider.iconClass);
            } else {
                listItem.setAttribute("image", "moz-icon://dummy.html");
            }
        }

        // Now that everything is set up, add it to the attachment box.
        documentLink.appendChild(listItem);

        // full attachment object is stored here
        listItem.attachment = attachment;

        // Update the number of rows and save our attachment globally
        documentLink.rows = documentLink.getRowCount();
    }

    gAttachMap[attachment.hashId] = attachment;
    updateAttachment();
}

/**
 * Removes the currently selected attachment from the dialog controls.
 *
 * XXX This could use a dialog maybe?
 */
function deleteAttachment() {
    let documentLink = document.getElementById("attachment-link");
    let item = documentLink.selectedItem;
    delete gAttachMap[item.attachment.hashId];
    documentLink.removeItemAt(documentLink.selectedIndex);

    if (item.attachLocalFile && item.attachCloudProvider) {
        try {
            item.attachCloudProvider.deleteFile(item.attachLocalFile, {
                onStartRequest: function() {},
                onStopRequest: function(aRequest, aContext, aStatusCode) {
                    if (!Components.isSuccessCode(aStatusCode)) {
                        // TODO With a notification bar, we could actually show this error.
                        cal.ERROR("[calendar-event-dialog] Deleting cloud attachment " +
                                  "failed, file will remain on server. " +
                                  " Status code: " + aStatusCode);
                    }
                }
            });
        } catch (e) {
            cal.ERROR("[calendar-event-dialog] Deleting cloud attachment " +
                      "failed, file will remain on server. " +
                      "Exception: " + e);
        }
    }

    updateAttachment();
}

/**
 * Removes all attachments from the dialog controls.
 */
function deleteAllAttachments() {
    let documentLink = document.getElementById("attachment-link");
    let itemCount = documentLink.getRowCount();
    let canRemove = (itemCount < 2);

    if (itemCount > 1) {
        let removeText = PluralForm.get(itemCount, cal.calGetString("calendar-event-dialog", "removeAttachmentsText"));
        let removeTitle = cal.calGetString("calendar-event-dialog", "removeCalendarsTitle");
        canRemove = Services.prompt.confirm(window, removeTitle, removeText.replace("#1", itemCount), {});
    }

    if (canRemove) {
        let child;
        while (documentLink.hasChildNodes()) {
            child = documentLink.lastChild;
            child.attachment = null;
            child.remove();
        }
        gAttachMap = {};
    }
    updateAttachment();
}

/**
 * Opens the selected attachment using the external protocol service.
 * @see nsIExternalProtocolService
 */
function openAttachment() {
    // Only one file has to be selected and we don't handle base64 files at all
    let documentLink = document.getElementById("attachment-link");
    if (documentLink.selectedItems.length == 1) {
        let attURI = documentLink.getSelectedItem(0).attachment.uri;
        let externalLoader = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                                       .getService(Components.interfaces.nsIExternalProtocolService);
        // TODO There should be a nicer dialog
        externalLoader.loadUrl(attURI);
    }
}

/**
 * Copies the link location of the first selected attachment to the clipboard
 */
function copyAttachment() {
    let documentLink = document.getElementById("attachment-link");
    let attURI = documentLink.getSelectedItem(0).attachment.uri.spec;
    let clipboard = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                              .getService(Components.interfaces.nsIClipboardHelper);
    clipboard.copyString(attURI);
}

/**
 * Handler function to handle pressing keys in the attachment listbox.
 *
 * @param aEvent     The DOM event caused by the key press.
 */
function attachmentLinkKeyPress(aEvent) {
    const kKE = Components.interfaces.nsIDOMKeyEvent;
    switch (aEvent.keyCode) {
        case kKE.DOM_VK_BACK_SPACE:
        case kKE.DOM_VK_DELETE:
            deleteAttachment();
            break;
        case kKE.DOM_VK_RETURN:
            openAttachment();
            break;
    }
}

/**
 * Handler function to take care of double clicking on an attachment
 *
 * @param aEvent     The DOM event caused by the clicking.
 */
function attachmentDblClick(aEvent) {
    // left double click on a list item
    if (aEvent.originalTarget.localName == "listitem" && aEvent.button == 0) {
        openAttachment();
    }
}

/**
 * Handler function to take care of right clicking on an attachment or the attachment list
 *
 * @param aEvent     The DOM event caused by the clicking.
 */
function attachmentClick(aEvent) {
    // we take only care about right clicks
    if (aEvent.button != 2) {
        return;
    }
    let attachmentPopup = document.getElementById("attachment-popup");
    for (let node of attachmentPopup.childNodes) {
        if (aEvent.originalTarget.localName == "listitem" ||
            node.id == "attachment-popup-attachPage") {
            showElement(node);
        } else {
            hideElement(node);
        }
    }
}

/**
 * Helper function to show a notification in the event-dialog's notificationBox
 *
 * @param aMessage     the message text to show
 * @param aValue       string identifying the notification
 * @param aPriority    (optional) the priority of the warning (info, critical), default is 'warn'
 * @param aImage       (optional) URL of image to appear on the notification
 * @param aButtonset   (optional) array of button descriptions to appear on the notification
 * @param aCallback    (optional) a function to handle events from the notificationBox
 */
function notifyUser(aMessage, aValue, aPriority, aImage, aButtonset, aCallback) {
    let notificationBox = document.getElementById("event-dialog-notifications");
    // only append, if the notification does not already exist
    if (notificationBox.getNotificationWithValue(aValue) == null) {
        const prioMap = {
            info: notificationBox.PRIORITY_INFO_MEDIUM,
            critical: notificationBox.PRIORITY_CRITICAL_MEDIUM
        };
        let priority = prioMap[aPriority] || notificationBox.PRIORITY_WARNING_MEDIUM;
        notificationBox.appendNotification(aMessage,
                                           aValue,
                                           aImage,
                                           priority,
                                           aButtonset,
                                           aCallback);
    }
}

/**
 * Remove a notification from the notifiactionBox
 *
 * @param aValue      string identifying the notification to remove
 */
function removeNotification(aValue) {
    let notificationBox = document.getElementById("event-dialog-notifications");
    let notification = notificationBox.getNotificationWithValue(aValue);
    if (notification != null) {
        notificationBox.removeNotification(notification);
    }
}

/**
 * Update the dialog controls related to the item's calendar.
 */
function updateCalendar() {
    let item = window.calendarItem;
    let calendar = getCurrentCalendar();

    gIsReadOnly = calendar.readOnly;

    if (!gPreviousCalendarId) {
        gPreviousCalendarId = item.calendar.id;
    }

    // We might have to change the organizer, let's see
    let calendarOrgId = calendar.getProperty("organizerId");
    if (window.organizer && calendarOrgId &&
        calendar.id != gPreviousCalendarId) {
        window.organizer.id = calendarOrgId;
        window.organizer.commonName = calendar.getProperty("organizerCN");
        gPreviousCalendarId = calendar.id;
    }

    if (!canNotifyAttendees(calendar, item) && calendar.getProperty("imip.identity")) {
        enableElement("notify-attendees-checkbox");
        enableElement("undisclose-attendees-checkbox");
    } else {
        disableElement("notify-attendees-checkbox");
        disableElement("undisclose-attendees-checkbox");
    }

    // update the accept button
    updateAccept();

    // TODO: the code above decided about whether or not the item is readonly.
    // below we enable/disable all controls based on this decision.
    // unfortunately some controls need to be disabled based on some other
    // criteria. this is why we enable all controls in case the item is *not*
    // readonly and run through all those updateXXX() functions to disable
    // them again based on the specific logic build into those function. is this
    // really a good idea?
    if (gIsReadOnly) {
        let disableElements = document.getElementsByAttribute("disable-on-readonly", "true");
        for (let element of disableElements) {
            element.setAttribute("disabled", "true");

            // we mark link-labels with the hyperlink attribute, since we need
            // to remove their class in case they get disabled. TODO: it would
            // be better to create a small binding for those link-labels
            // instead of adding those special stuff.
            if (element.hasAttribute("hyperlink")) {
                element.removeAttribute("class");
                element.removeAttribute("onclick");
            }
        }

        let collapseElements = document.getElementsByAttribute("collapse-on-readonly", "true");
        for (let element of collapseElements) {
            element.setAttribute("collapsed", "true");
        }
    } else {
        sendMessage({ command: "removeDisableAndCollapseOnReadonly" });

        let enableElements = document.getElementsByAttribute("disable-on-readonly", "true");
        for (let element of enableElements) {
            element.removeAttribute("disabled");
            if (element.hasAttribute("hyperlink")) {
                element.setAttribute("class", "text-link");
            }
        }

        let collapseElements = document.getElementsByAttribute("collapse-on-readonly", "true");
        for (let element of collapseElements) {
            element.removeAttribute("collapsed");
        }

        // Task completed date
        if (item.completedDate) {
            updateToDoStatus(item.status, cal.dateTimeToJsDate(item.completedDate));
        } else {
            updateToDoStatus(item.status);
        }

        // disable repeat menupopup if this is an occurrence
        item = window.calendarItem;
        if (item.parentItem != item) {
            disableElement("item-repeat");
            disableElement("repeat-until-datepicker");
            let repeatDetails = document.getElementById("repeat-details");
            let numChilds = repeatDetails.childNodes.length;
            for (let i = 0; i < numChilds; i++) {
                let node = repeatDetails.childNodes[i];
                node.setAttribute("disabled", "true");
                node.removeAttribute("class");
                node.removeAttribute("onclick");
            }
        }

        // If the item is a proxy occurrence/instance, a few things aren't
        // valid.
        if (item.parentItem != item) {
            disableElement("item-calendar");

            // don't allow to revoke the entrydate of recurring todo's.
            disableElementWithLock("todo-has-entrydate", "permanent-lock");
        }

        // update datetime pickers, disable checkboxes if dates are required by
        // recurrence or reminders.
        updateRepeat(true);
        updateReminder(true);
        updateAllDay();
    }

    // Make sure capabilties are reflected correctly
    updateCapabilities();
}

/**
 * Opens the recurrence dialog modally to allow the user to edit the recurrence
 * rules.
 */
function editRepeat() {
    let args = {};
    args.calendarEvent = window.calendarItem;
    args.recurrenceInfo = window.recurrenceInfo;
    args.startTime = gStartTime;
    args.endTime = gEndTime;

    let savedWindow = window;
    args.onOk = function(recurrenceInfo) {
        savedWindow.recurrenceInfo = recurrenceInfo;
    };

    window.setCursor("wait");

    // open the dialog modally
    openDialog(
        "chrome://calendar/content/calendar-event-dialog-recurrence.xul",
        "_blank",
        "chrome,titlebar,modal,resizable",
        args);
}

/**
 * This function is responsible for propagating UI state to controls
 * depending on the repeat setting of an item. This functionality is used
 * after the dialog has been loaded as well as if the repeat pattern has
 * been changed.
 *
 * @param aSuppressDialogs     If true, controls are updated without prompting
 *                               for changes with the recurrence dialog
 * @param aItemRepeatCall      True when the function is being called from
 *                               the item-repeat menu list. It allows to detect
 *                               a change from the "custom" option.
 */
function updateRepeat(aSuppressDialogs, aItemRepeatCall) {
    function setUpEntrydateForTask(item) {
        // if this item is a task, we need to make sure that it has
        // an entry-date, otherwise we can't create a recurrence.
        if (isToDo(item)) {
            // automatically check 'has entrydate' if needed.
            if (!getElementValue("todo-has-entrydate", "checked")) {
                setElementValue("todo-has-entrydate", "true", "checked");

                // make sure gStartTime is properly initialized
                updateEntryDate();
            }

            // disable the checkbox to indicate that we need
            // the entry-date. the 'disabled' state will be
            // revoked if the user turns off the repeat pattern.
            disableElementWithLock("todo-has-entrydate", "repeat-lock");
        }
    }

    let repeatMenu = document.getElementById("item-repeat");
    let repeatValue = repeatMenu.selectedItem.getAttribute("value");
    let repeatDeck = document.getElementById("repeat-deck");

    if (repeatValue == "none") {
        repeatDeck.selectedIndex = -1;
        window.recurrenceInfo = null;
        let item = window.calendarItem;
        if (isToDo(item)) {
            enableElementWithLock("todo-has-entrydate", "repeat-lock");
        }
    } else if (repeatValue == "custom") {
        let lastRepeatDeck = repeatDeck.selectedIndex;
        repeatDeck.selectedIndex = 1;
        // the user selected custom repeat pattern. we now need to bring
        // up the appropriate dialog in order to let the user specify the
        // new rule. First of all, retrieve the item we want to specify
        // the custom repeat pattern for.
        let item = window.calendarItem;

        setUpEntrydateForTask(item);

        // retrieve the current recurrence info, we need this
        // to find out whether or not the user really created
        // a new repeat pattern.
        let recurrenceInfo = window.recurrenceInfo;

        // now bring up the recurrence dialog.
        // don't pop up the dialog if aSuppressDialogs was specified or if
        // called during initialization of the dialog.
        if (!aSuppressDialogs && repeatMenu.hasAttribute("last-value")) {
            editRepeat();
        }

        // Assign gUntilDate on the first run or when returning from the
        // edit recurrence dialog.
        if (window.recurrenceInfo) {
            let rrules = splitRecurrenceRules(window.recurrenceInfo);
            let rule = rrules[0][0];
            gUntilDate = null;
            if (!rule.isByCount && rule.isFinite) {
                gUntilDate = rule.untilDate.clone().getInTimezone(calendarDefaultTimezone());
            }
        }

        // we need to address two separate cases here.
        // 1)- We need to revoke the selection of the repeat
        //     drop down list in case the user didn't specify
        //     a new repeat pattern (i.e. canceled the dialog);
        //   - re-enable the 'has entrydate' option in case
        //     we didn't end up with a recurrence rule.
        // 2)  Check whether the new recurrence rule needs the
        //     recurrence details text or it can be displayed
        //     only with the repeat-until-datepicker.
        if (recurrenceInfo == window.recurrenceInfo) {
            repeatMenu.selectedIndex = gLastRepeatSelection;
            repeatDeck.selectedIndex = lastRepeatDeck;
            if (isToDo(item)) {
                if (!window.recurrenceInfo) {
                    enableElementWithLock("todo-has-entrydate", "repeat-lock");
                }
            }
        } else {
            // From the Edit Recurrence dialog, the rules "every day" and
            // "every weekday" don't need the recurrence details text when they
            // have only the until date. The getRepeatTypeAndUntilDate()
            // function verifies whether this is the case.
            let [repeatType, untilDate] = getRepeatTypeAndUntilDate(item);
            if (gNewItemUI) {
                gTopComponent.importState({
                    repeat: repeatType,
                    repeatUntilDate: untilDate
                });
                // XXX more to do, see loadRepeat
            } else {
                loadRepeat(repeatType, untilDate, window.calendarItem);
            }
        }
    } else {
        let item = window.calendarItem;
        let recurrenceInfo = window.recurrenceInfo || item.recurrenceInfo;
        let proposedUntilDate = (gStartTime || window.initialStartDateValue).clone();

        if (recurrenceInfo) {
            recurrenceInfo = recurrenceInfo.clone();
            let rrules = splitRecurrenceRules(recurrenceInfo);
            let rule = rrules[0][0];

            // If the previous rule was "custom" we have to recover the until
            // date, or the last occurrence's date in order to set the
            // repeat-until-datepicker with the same date.
            if (aItemRepeatCall && repeatDeck.selectedIndex == 1) {
                if (!rule.isByCount || !rule.isFinite) {
                    setElementValue("repeat-until-datepicker",
                                    rule.isByCount ? "forever"
                                                   : cal.dateTimeToJsDate(rule.untilDate.getInTimezone(cal.floating())));
                } else {
                    // Try to recover the last occurrence in 10(?) years.
                    let endDate = gStartTime.clone();
                    endDate.year += 10;
                    let lastOccurrenceDate = null;
                    let dates = recurrenceInfo.getOccurrenceDates(gStartTime, endDate, 0, {});
                    if (dates) {
                        lastOccurrenceDate = dates[dates.length - 1];
                    }
                    let repeatDate = cal.dateTimeToJsDate((lastOccurrenceDate || proposedUntilDate).getInTimezone(cal.floating()));
                    setElementValue("repeat-until-datepicker", repeatDate);
                }
            }
            if (rrules[0].length > 0) {
                recurrenceInfo.deleteRecurrenceItem(rule);
            }
        } else {
            // New event proposes "forever" as default until date.
            recurrenceInfo = createRecurrenceInfo(item);
            setElementValue("repeat-until-datepicker", "forever");
        }

        repeatDeck.selectedIndex = 0;

        let recRule = createRecurrenceRule();
        recRule.interval = 1;
        switch (repeatValue) {
            case "daily":
                recRule.type = "DAILY";
                break;
            case "weekly":
                recRule.type = "WEEKLY";
                break;
            case "every.weekday":
                recRule.type = "DAILY";
                recRule.setComponent("BYDAY", 5, [2, 3, 4, 5, 6]);
                break;
            case "bi.weekly":
                recRule.type = "WEEKLY";
                recRule.interval = 2;
                break;
            case "monthly":
                recRule.type = "MONTHLY";
                break;
            case "yearly":
                recRule.type = "YEARLY";
                break;
        }

        setUpEntrydateForTask(item);
        updateUntildateRecRule(recRule);

        recurrenceInfo.insertRecurrenceItemAt(recRule, 0);
        window.recurrenceInfo = recurrenceInfo;

        if (isToDo(item)) {
            if (!getElementValue("todo-has-entrydate", "checked")) {
                setElementValue("todo-has-entrydate", "true", "checked");
            }
            disableElementWithLock("todo-has-entrydate", "repeat-lock");
        }

        // Preset the until-datepicker's minimonth to the start date.
        let startDate = cal.dateTimeToJsDate(gStartTime.getInTimezone(cal.floating()));
        document.getElementById("repeat-until-datepicker").extraDate = startDate;
    }

    gLastRepeatSelection = repeatMenu.selectedIndex;
    repeatMenu.setAttribute("last-value", repeatValue);

    updateRepeatDetails();
    updateEntryDate();
    updateDueDate();
    updateAccept();
}

/**
 * Update the until date in the recurrence rule in order to set
 * the same time of the start date.
 *
 * @param recRule           (optional) The recurrence rule
 */
function updateUntildateRecRule(recRule) {
    if (!recRule) {
        let recurrenceInfo = window.recurrenceInfo;
        if (!recurrenceInfo) {
            return;
        }
        let rrules = splitRecurrenceRules(recurrenceInfo);
        recRule = rrules[0][0];
    }
    let defaultTimezone = cal.calendarDefaultTimezone();
    let repeatUntilDate = null;

    let itemRepeat = document.getElementById("item-repeat").selectedItem.value;
    if (itemRepeat == "none") {
        return;
    } else if (itemRepeat == "custom") {
        repeatUntilDate = gUntilDate;
    } else {
        let untilDatepickerDate = getElementValue("repeat-until-datepicker");
        if (untilDatepickerDate != "forever") {
            repeatUntilDate = cal.jsDateToDateTime(untilDatepickerDate, defaultTimezone);
        }
    }

    if (repeatUntilDate) {
        if (onLoad.hasLoaded) {
            repeatUntilDate.isDate = gStartTime.isDate; // Enforce same value type as DTSTART
            if (!gStartTime.isDate) {
                repeatUntilDate.hour = gStartTime.hour;
                repeatUntilDate.minute = gStartTime.minute;
                repeatUntilDate.second = gStartTime.second;
            }
        }
        recRule.untilDate = repeatUntilDate.clone();
        gUntilDate = repeatUntilDate.clone().getInTimezone(defaultTimezone);
    } else {
        // Rule that recurs forever.
        recRule.count = -1;
        gUntilDate = null;
    }
}

/**
 * Updates the UI controls related to a task's completion status.
 *
 * @param {string} aStatus       The item's completion status or a string
 *                               that allows to identify a change in the
 *                               percent-complete's textbox.
 * @param {Date} aCompletedDate  The item's completed date (as a JSDate).
 */
function updateToDoStatus(aStatus, aCompletedDate=null) {
    // RFC2445 doesn't support completedDates without the todo's status
    // being "COMPLETED", however twiddling the status menulist shouldn't
    // destroy that information at this point (in case you change status
    // back to COMPLETED). When we go to store this VTODO as .ics the
    // date will get lost.

    // remember the original values
    let oldPercentComplete = parseInt(getElementValue("percent-complete-textbox"), 10);
    let oldCompletedDate = getElementValue("completed-date-picker");

    // If the percent completed has changed to 100 or from 100 to another
    // value, the status must change.
    if (aStatus == "percent-changed") {
        let selectedIndex = document.getElementById("todo-status").selectedIndex;
        let menuItemCompleted = selectedIndex == 3;
        let menuItemNotSpecified = selectedIndex == 0;
        if (oldPercentComplete == 100) {
            aStatus = "COMPLETED";
        } else if (menuItemCompleted || menuItemNotSpecified) {
            aStatus = "IN-PROCESS";
        }
    }

    switch (aStatus) {
        case null:
        case "":
        case "NONE":
            oldPercentComplete = 0;
            document.getElementById("todo-status").selectedIndex = 0;
            disableElement("percent-complete-textbox");
            disableElement("percent-complete-label");
            break;
        case "CANCELLED":
            document.getElementById("todo-status").selectedIndex = 4;
            disableElement("percent-complete-textbox");
            disableElement("percent-complete-label");
            break;
        case "COMPLETED":
            document.getElementById("todo-status").selectedIndex = 3;
            enableElement("percent-complete-textbox");
            enableElement("percent-complete-label");
            // if there is no aCompletedDate, set it to the previous value
            if (!aCompletedDate) {
                aCompletedDate = oldCompletedDate;
            }
            break;
        case "IN-PROCESS":
            document.getElementById("todo-status").selectedIndex = 2;
            disableElement("completed-date-picker");
            enableElement("percent-complete-textbox");
            enableElement("percent-complete-label");
            break;
        case "NEEDS-ACTION":
            document.getElementById("todo-status").selectedIndex = 1;
            enableElement("percent-complete-textbox");
            enableElement("percent-complete-label");
            break;
    }

    let newPercentComplete;
    if ((aStatus == "IN-PROCESS" || aStatus == "NEEDS-ACTION") &&
        oldPercentComplete == 100) {
        newPercentComplete = 0;
        setElementValue("completed-date-picker", oldCompletedDate);
        disableElement("completed-date-picker");
    } else if (aStatus == "COMPLETED") {
        newPercentComplete = 100;
        setElementValue("completed-date-picker", aCompletedDate);
        enableElement("completed-date-picker");
    } else {
        newPercentComplete = oldPercentComplete;
        setElementValue("completed-date-picker", oldCompletedDate);
        disableElement("completed-date-picker");
    }

    gConfig.percentComplete = newPercentComplete;
    setElementValue("percent-complete-textbox", newPercentComplete);
    if (gInTab) {
        sendMessage({
            command: "updateConfigState",
            argument: { percentComplete: newPercentComplete }
        });
    }
}

/**
 * Saves all dialog controls back to the item.
 *
 * @return      a copy of the original item with changes made.
 */
function saveItem() {
    // we need to clone the item in order to apply the changes.
    // it is important to not apply the changes to the original item
    // (even if it happens to be mutable) in order to guarantee
    // that providers see a proper oldItem/newItem pair in case
    // they rely on this fact (e.g. WCAP does).
    let originalItem = window.calendarItem;
    let item = originalItem.clone();

    // override item's recurrenceInfo *before* serializing date/time-objects.
    if (!item.recurrenceId) {
        item.recurrenceInfo = window.recurrenceInfo;
    }

    // serialize the item
    saveDialog(item);

    item.organizer = window.organizer;

    item.removeAllAttendees();
    if (window.attendees && (window.attendees.length > 0)) {
        for (let attendee of window.attendees) {
            item.addAttendee(attendee);
        }

        let notifyCheckbox = document.getElementById("notify-attendees-checkbox");
        if (notifyCheckbox.disabled) {
            item.deleteProperty("X-MOZ-SEND-INVITATIONS");
        } else {
            item.setProperty("X-MOZ-SEND-INVITATIONS", notifyCheckbox.checked ? "TRUE" : "FALSE");
        }
        let undiscloseCheckbox = document.getElementById("undisclose-attendees-checkbox");
        if (undiscloseCheckbox.disabled) {
            item.deleteProperty("X-MOZ-SEND-INVITATIONS-UNDISCLOSED");
        } else {
            item.setProperty("X-MOZ-SEND-INVITATIONS-UNDISCLOSED", undiscloseCheckbox.checked ? "TRUE" : "FALSE");
        }
    }

    // We check if the organizerID is different from our
    // calendar-user-address-set. The organzerID is the owner of the calendar.
    // If it's different, that is because someone is acting on behalf of
    // the organizer.
    if (item.organizer && item.calendar.aclEntry) {
        let userAddresses = item.calendar.aclEntry.getUserAddresses({});
        if (userAddresses.length > 0 &&
            !cal.attendeeMatchesAddresses(item.organizer, userAddresses)) {
            let organizer = item.organizer.clone();
            organizer.setProperty("SENT-BY", "mailto:" + userAddresses[0]);
            item.organizer = organizer;
        }
    }
    return item;
}

/**
 * Action to take when the user chooses to save. This can happen either by
 * saving directly or the user selecting to save after being prompted when
 * closing the dialog.
 *
 * This function also takes care of notifying this dialog's caller that the item
 * is saved.
 *
 * @param aIsClosing            If true, the save action originates from the
 *                                save prompt just before the window is closing.
 */
function onCommandSave(aIsClosing) {
    // The datepickers need to remove the focus in order to trigger the
    // validation of the values just edited, with the keyboard, but not yet
    // confirmed (i.e. not followed by a click, a tab or enter keys pressure).
    document.documentElement.focus();

    // Don't save if a warning dialog about a wrong input date must be showed.
    if (gWarning) {
        return;
    }

    eventDialogCalendarObserver.cancel();

    let originalItem = window.calendarItem;
    let item = saveItem();
    let calendar = getCurrentCalendar();

    item.makeImmutable();
    // Set the item for now, the callback below will set the full item when the
    // call succeeded
    window.calendarItem = item;

    // When the call is complete, we need to set the new item, so that the
    // dialog is up to date.

    // XXX Do we want to disable the dialog or at least the save button until
    // the call is complete? This might help when the user tries to save twice
    // before the call is complete. In that case, we do need a progress bar and
    // the ability to cancel the operation though.
    let listener = {
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
        onOperationComplete: function(aCalendar, aStatus, aOpType, aId, aItem) {
            // Check if the current window has a calendarItem first, because in case of undo
            // window refers to the main window and we would get a 'calendarItem is undefined' warning.
            if ("calendarItem" in window) {
                // If we changed the calendar of the item, onOperationComplete will be called multiple
                // times. We need to make sure we're receiving the update on the right calendar.
                if ((!window.calendarItem.id ||aId == window.calendarItem.id) &&
                    (aCalendar.id == window.calendarItem.calendar.id) &&
                    Components.isSuccessCode(aStatus)) {
                    if (window.calendarItem.recurrenceId) {
                        // TODO This workaround needs to be removed in bug 396182
                        // We are editing an occurrence. Make sure that the returned
                        // item is the same occurrence, not its parent item.
                        let occ = aItem.recurrenceInfo
                                       .getOccurrenceFor(window.calendarItem.recurrenceId);
                        window.calendarItem = occ;
                    } else {
                        // We are editing the parent item, no workarounds needed
                        window.calendarItem = aItem;
                    }

                    // We now have an item, so we must change to an edit.
                    window.mode = "modify";
                    updateTitle();
                    eventDialogCalendarObserver.observe(window.calendarItem.calendar);
                }
            }
        },
        onGetResult: function() {}
    };

    // Let the caller decide how to handle the modified/added item. Only pass
    // the above item if we are not closing, otherwise the listener will be
    // missing its window afterwards.
    window.onAcceptCallback(item, calendar, originalItem, !aIsClosing && listener);
}

/**
 * This function is called when the user chooses to delete an Item
 * from the Event/Task dialog
 *
 */
function onCommandDeleteItem() {
    // only ask for confirmation, if the User changed anything on a new item or we modify an existing item
    if (isItemChanged() || window.mode != "new") {
        let promptTitle = "";
        let promptMessage = "";

        if (cal.isEvent(window.calendarItem)) {
            promptTitle = calGetString("calendar", "deleteEventLabel");
            promptMessage = calGetString("calendar", "deleteEventMessage");
        } else if (cal.isToDo(window.calendarItem)) {
            promptTitle = calGetString("calendar", "deleteTaskLabel");
            promptMessage = calGetString("calendar", "deleteTaskMessage");
        }

        let answerDelete = Services.prompt.confirm(
                                    null,
                                    promptTitle,
                                    promptMessage);
        if (!answerDelete) {
            return;
        }
    }

    if (window.mode == "new") {
        cancelItem();
    } else {
        let deleteListener = {
            // when deletion of item is complete, close the dialog
            onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
                // Check if the current window has a calendarItem first, because in case of undo
                // window refers to the main window and we would get a 'calendarItem is undefined' warning.
                if ("calendarItem" in window) {
                    if (aId == window.calendarItem.id && Components.isSuccessCode(aStatus)) {
                        cancelItem();
                    } else {
                        eventDialogCalendarObserver.observe(window.calendarItem.calendar);
                    }
                }
            }
        };

        eventDialogCalendarObserver.cancel();
        if (window.calendarItem.parentItem.recurrenceInfo && window.calendarItem.recurrenceId) {
            // if this is a single occurrence of a recurring item
            let newItem = window.calendarItem.parentItem.clone();
            newItem.recurrenceInfo.removeOccurrenceAt(window.calendarItem.recurrenceId);

            gMainWindow.doTransaction("modify", newItem, newItem.calendar,
                                      window.calendarItem.parentItem, deleteListener);
        } else {
            gMainWindow.doTransaction("delete", window.calendarItem, window.calendarItem.calendar,
                                      null, deleteListener);
        }
    }
}

/**
 * Postpone the task's start date/time and due date/time. ISO 8601
 * format: "PT1H", "P1D", and "P1W" are 1 hour, 1 day, and 1 week. (We
 * use this format intentionally instead of a calIDuration object because
 * those objects cannot be serialized for message passing with iframes.)
 *
 * @param {string} aDuration  A duration in ISO 8601 format
 */
function postponeTask(aDuration) {
    let duration = cal.createDuration(aDuration);
    if (gStartTime != null) {
        gStartTime.addDuration(duration);
    }
    if (gEndTime != null) {
        gEndTime.addDuration(duration);
    }
    updateDateTime();
}

/**
 * Prompts the user to change the start timezone.
 */
function editStartTimezone() {
    editTimezone("timezone-starttime",
                 gStartTime.getInTimezone(gStartTimezone),
                 editStartTimezone.complete);
}
editStartTimezone.complete = function(datetime) {
    let equalTimezones = false;
    if (gStartTimezone && gEndTimezone) {
        if (gStartTimezone == gEndTimezone) {
            equalTimezones = true;
        }
    }
    gStartTimezone = datetime.timezone;
    if (equalTimezones) {
        gEndTimezone = datetime.timezone;
    }
    updateDateTime();
};

/**
 * Prompts the user to change the end timezone.
 */
function editEndTimezone() {
    editTimezone("timezone-endtime",
                 gEndTime.getInTimezone(gEndTimezone),
                 editEndTimezone.complete);
}
editEndTimezone.complete = function(datetime) {
    gEndTimezone = datetime.timezone;
    updateDateTime();
};

/**
 * Called to choose a recent timezone from the timezone popup.
 *
 * @param event     The event with a target that holds the timezone id value.
 */
function chooseRecentTimezone(event) {
    let tzid = event.target.value;
    let timezonePopup = document.getElementById("timezone-popup");
    let tzProvider = getCurrentCalendar().getProperty("timezones.provider") ||
                     cal.getTimezoneService();

    if (tzid != "custom") {
        let zone = tzProvider.getTimezone(tzid);
        let datetime = timezonePopup.dateTime.getInTimezone(zone);
        timezonePopup.editTimezone.complete(datetime);
    }
}

/**
 * Opens the timezone popup on the node the event target points at.
 *
 * @param event     The event causing the popup to open
 * @param dateTime  The datetime for which the timezone should be modified
 * @param editFunc  The function to be called when the custom menuitem is clicked.
 */
function showTimezonePopup(event, dateTime, editFunc) {
    // Don't do anything for right/middle-clicks. Also, don't show the popup if
    // the opening node is disabled.
    if (event.button != 0 || event.target.disabled) {
        return;
    }

    let timezonePopup = document.getElementById("timezone-popup");
    let timezoneDefaultItem = document.getElementById("timezone-popup-defaulttz");
    let timezoneSeparator = document.getElementById("timezone-popup-menuseparator");
    let defaultTimezone = cal.calendarDefaultTimezone();
    let recentTimezones = cal.getRecentTimezones(true);

    // Set up the right editTimezone function, so the custom item can use it.
    timezonePopup.editTimezone = editFunc;
    timezonePopup.dateTime = dateTime;

    // Set up the default timezone item
    timezoneDefaultItem.value = defaultTimezone.tzid;
    timezoneDefaultItem.label = defaultTimezone.displayName;

    // Clear out any old recent timezones
    while (timezoneDefaultItem.nextSibling != timezoneSeparator) {
        timezoneDefaultItem.nextSibling.remove();
    }

    // Fill in the new recent timezones
    for (let timezone of recentTimezones) {
        let menuItem = createXULElement("menuitem");
        menuItem.setAttribute("value", timezone.tzid);
        menuItem.setAttribute("label", timezone.displayName);
        timezonePopup.insertBefore(menuItem, timezoneDefaultItem.nextSibling);
    }

    // Show the popup
    timezonePopup.openPopup(event.target, "after_start", 0, 0, true);
}

/**
 * Common function of edit(Start|End)Timezone() to prompt the user for a
 * timezone change.
 *
 * @param aElementId        The XUL element id of the timezone label.
 * @param aDateTime         The Date/Time of the time to change zone on.
 * @param aCallback         What to do when the user has chosen a zone.
 */
function editTimezone(aElementId, aDateTime, aCallback) {
    if (document.getElementById(aElementId)
        .hasAttribute("disabled")) {
        return;
    }

    // prepare the arguments that will be passed to the dialog
    let args = {};
    args.time = aDateTime;
    args.calendar = getCurrentCalendar();
    args.onOk = function(datetime) {
        cal.saveRecentTimezone(datetime.timezone.tzid);
        return aCallback(datetime);
    };

    // open the dialog modally
    openDialog(
        "chrome://calendar/content/calendar-event-dialog-timezone.xul",
        "_blank",
        "chrome,titlebar,modal,resizable",
        args);
}

/**
 * This function initializes the following controls:
 * - 'event-starttime'
 * - 'event-endtime'
 * - 'event-all-day'
 * - 'todo-has-entrydate'
 * - 'todo-entrydate'
 * - 'todo-has-duedate'
 * - 'todo-duedate'
 * The date/time-objects are either displayed in their respective
 * timezone or in the default timezone. This decision is based
 * on whether or not 'cmd_timezone' is checked.
 * the necessary information is taken from the following variables:
 * - 'gStartTime'
 * - 'gEndTime'
 * - 'window.calendarItem' (used to decide about event/task)
 */
function updateDateTime() {
    gIgnoreUpdate = true;

    let item = window.calendarItem;
    // Convert to default timezone if the timezone option
    // is *not* checked, otherwise keep the specific timezone
    // and display the labels in order to modify the timezone.
    if (gTimezonesEnabled) {
        if (isEvent(item)) {
            let startTime = gStartTime.getInTimezone(gStartTimezone);
            let endTime = gEndTime.getInTimezone(gEndTimezone);

            setElementValue("event-all-day", startTime.isDate, "checked");

            // In the case where the timezones are different but
            // the timezone of the endtime is "UTC", we convert
            // the endtime into the timezone of the starttime.
            if (startTime && endTime) {
                if (!compareObjects(startTime.timezone, endTime.timezone)) {
                    if (endTime.timezone.isUTC) {
                        endTime = endTime.getInTimezone(startTime.timezone);
                    }
                }
            }

            // before feeding the date/time value into the control we need
            // to set the timezone to 'floating' in order to avoid the
            // automatic conversion back into the OS timezone.
            startTime.timezone = floating();
            endTime.timezone = floating();

            setElementValue("event-starttime", cal.dateTimeToJsDate(startTime));
            setElementValue("event-endtime", cal.dateTimeToJsDate(endTime));
        }

        if (isToDo(item)) {
            let startTime = gStartTime && gStartTime.getInTimezone(gStartTimezone);
            let endTime = gEndTime && gEndTime.getInTimezone(gEndTimezone);
            let hasEntryDate = (startTime != null);
            let hasDueDate = (endTime != null);

            if (hasEntryDate && hasDueDate) {
                setElementValue("todo-has-entrydate", hasEntryDate, "checked");
                startTime.timezone = floating();
                setElementValue("todo-entrydate", cal.dateTimeToJsDate(startTime));

                setElementValue("todo-has-duedate", hasDueDate, "checked");
                endTime.timezone = floating();
                setElementValue("todo-duedate", cal.dateTimeToJsDate(endTime));
            } else if (hasEntryDate) {
                setElementValue("todo-has-entrydate", hasEntryDate, "checked");
                startTime.timezone = floating();
                setElementValue("todo-entrydate", cal.dateTimeToJsDate(startTime));

                startTime.timezone = floating();
                setElementValue("todo-duedate", cal.dateTimeToJsDate(startTime));
            } else if (hasDueDate) {
                endTime.timezone = floating();
                setElementValue("todo-entrydate", cal.dateTimeToJsDate(endTime));

                setElementValue("todo-has-duedate", hasDueDate, "checked");
                endTime.timezone = floating();
                setElementValue("todo-duedate", cal.dateTimeToJsDate(endTime));
            } else {
                startTime = window.initialStartDateValue;
                startTime.timezone = floating();
                endTime = startTime.clone();

                setElementValue("todo-entrydate", cal.dateTimeToJsDate(startTime));
                setElementValue("todo-duedate", cal.dateTimeToJsDate(endTime));
            }
        }
    } else {
        let kDefaultTimezone = calendarDefaultTimezone();

        if (isEvent(item)) {
            let startTime = gStartTime.getInTimezone(kDefaultTimezone);
            let endTime = gEndTime.getInTimezone(kDefaultTimezone);
            setElementValue("event-all-day", startTime.isDate, "checked");

            // before feeding the date/time value into the control we need
            // to set the timezone to 'floating' in order to avoid the
            // automatic conversion back into the OS timezone.
            startTime.timezone = floating();
            endTime.timezone = floating();
            setElementValue("event-starttime", cal.dateTimeToJsDate(startTime));
            setElementValue("event-endtime", cal.dateTimeToJsDate(endTime));
        }

        if (isToDo(item)) {
            let startTime = gStartTime &&
                            gStartTime.getInTimezone(kDefaultTimezone);
            let endTime = gEndTime && gEndTime.getInTimezone(kDefaultTimezone);
            let hasEntryDate = (startTime != null);
            let hasDueDate = (endTime != null);

            if (hasEntryDate && hasDueDate) {
                setElementValue("todo-has-entrydate", hasEntryDate, "checked");
                startTime.timezone = floating();
                setElementValue("todo-entrydate", cal.dateTimeToJsDate(startTime));

                setElementValue("todo-has-duedate", hasDueDate, "checked");
                endTime.timezone = floating();
                setElementValue("todo-duedate", cal.dateTimeToJsDate(endTime));
            } else if (hasEntryDate) {
                setElementValue("todo-has-entrydate", hasEntryDate, "checked");
                startTime.timezone = floating();
                setElementValue("todo-entrydate", cal.dateTimeToJsDate(startTime));

                startTime.timezone = floating();
                setElementValue("todo-duedate", cal.dateTimeToJsDate(startTime));
            } else if (hasDueDate) {
                endTime.timezone = floating();
                setElementValue("todo-entrydate", cal.dateTimeToJsDate(endTime));

                setElementValue("todo-has-duedate", hasDueDate, "checked");
                endTime.timezone = floating();
                setElementValue("todo-duedate", cal.dateTimeToJsDate(endTime));
            } else {
                startTime = window.initialStartDateValue;
                startTime.timezone = floating();
                endTime = startTime.clone();

                setElementValue("todo-entrydate", cal.dateTimeToJsDate(startTime));
                setElementValue("todo-duedate", cal.dateTimeToJsDate(endTime));
            }
        }
    }

    updateTimezone();
    updateAllDay();
    updateRepeatDetails();

    gIgnoreUpdate = false;
}

/**
 * This function initializes the following controls:
 * - 'timezone-starttime'
 * - 'timezone-endtime'
 * the timezone-links show the corrosponding names of the
 * start/end times. If 'cmd_timezone' is not checked
 * the links will be collapsed.
 */
function updateTimezone() {
    function updateTimezoneElement(aTimezone, aId, aDateTime) {
        let element = document.getElementById(aId);
        if (!element) {
            return;
        }

        if (aTimezone) {
            element.removeAttribute("collapsed");
            element.value = aTimezone.displayName || aTimezone.tzid;
            if (!aDateTime || !aDateTime.isValid || gIsReadOnly || aDateTime.isDate) {
                if (element.hasAttribute("class")) {
                    element.setAttribute("class-on-enabled",
                                         element.getAttribute("class"));
                    element.removeAttribute("class");
                }
                if (element.hasAttribute("onclick")) {
                    element.setAttribute("onclick-on-enabled",
                                         element.getAttribute("onclick"));
                    element.removeAttribute("onclick");
                }
                element.setAttribute("disabled", "true");
            } else {
                if (element.hasAttribute("class-on-enabled")) {
                    element.setAttribute("class",
                                         element.getAttribute("class-on-enabled"));
                    element.removeAttribute("class-on-enabled");
                }
                if (element.hasAttribute("onclick-on-enabled")) {
                    element.setAttribute("onclick",
                                         element.getAttribute("onclick-on-enabled"));
                    element.removeAttribute("onclick-on-enabled");
                }
                element.removeAttribute("disabled");
            }
        } else {
            element.setAttribute("collapsed", "true");
        }
    }

    // convert to default timezone if the timezone option
    // is *not* checked, otherwise keep the specific timezone
    // and display the labels in order to modify the timezone.
    if (gTimezonesEnabled) {
        updateTimezoneElement(gStartTimezone,
                              "timezone-starttime",
                              gStartTime);
        updateTimezoneElement(gEndTimezone,
                              "timezone-endtime",
                              gEndTime);
    } else {
        document.getElementById("timezone-starttime")
                .setAttribute("collapsed", "true");
        document.getElementById("timezone-endtime")
                .setAttribute("collapsed", "true");
    }
}

/**
 * Updates dialog controls related to item attachments
 */
function updateAttachment() {
    let hasAttachments = capSupported("attachments");
    if (!gNewItemUI) {
        setElementValue("cmd_attach_url", !hasAttachments && "true", "disabled");
    }
    sendMessage({
        command: "updateConfigState",
        argument: { attachUrlCommand: hasAttachments }
    });
}

/**
 * Returns whether to show or hide the related link on the dialog
 * (rfc2445 URL property).  The aShow argument passed in may be overridden
 * for various reasons.
 *
 * @param {boolean} aShow  Show the link (true) or not (false)
 * @param {string} aUrl    The url in question
 * @return {boolean}       Returns true for show and false for hide
 */
function showOrHideItemURL(aShow, aUrl) {
    if (aShow && aUrl.length) {
        let handler;
        let uri;
        try {
            uri = makeURL(aUrl);
            handler = Services.io.getProtocolHandler(uri.scheme);
        } catch (e) {
            // No protocol handler for the given protocol, or invalid uri
            // hideOrShow(false);
            return false;
        }
        // Only show if its either an internal protcol handler, or its external
        // and there is an external app for the scheme
        handler = cal.wrapInstance(handler, Components.interfaces.nsIExternalProtocolHandler);
        return !handler || handler.externalAppExistsForScheme(uri.scheme);
    } else {
        // Hide if there is no url, or the menuitem was chosen so that the url
        // should be hidden.
        return false;
    }
}

/**
 * Updates the related link on the dialog (rfc2445 URL property).
 *
 * @param {boolean} aShow  Show the link (true) or not (false)
 * @param {string} aUrl    The url
 */
function updateItemURL(aShow, aUrl) {
    // Hide or show the link
    setElementValue("event-grid-link-row", !aShow && "true", "hidden");
    // The separator is not there in the summary dialog
    let separator = document.getElementById("event-grid-link-separator");
    if (separator) {
        setElementValue("event-grid-link-separator", !aShow && "true", "hidden");
    }

    // Set the url for the link
    if (aShow && aUrl.length) {
        setTimeout(() => {
            // HACK the url-link doesn't crop when setting the value in onLoad
            setElementValue("url-link", aUrl);
            setElementValue("url-link", aUrl, "href");
        }, 0);
    }
}


/**
 * This function updates dialog controls related to attendees.
 */
function updateAttendees() {
    // sending email invitations currently only supported for events
    let attendeeTab = document.getElementById("event-grid-tab-attendees");
    let attendeePanel = document.getElementById("event-grid-tabpanel-attendees");
    if (isEvent(window.calendarItem)) {
        attendeeTab.removeAttribute("collapsed");
        attendeePanel.removeAttribute("collapsed");

        if (window.organizer && window.organizer.id) {
            document.getElementById("item-organizer-row").removeAttribute("collapsed");
            let cell = document.querySelector(".item-organizer-cell");
            let icon = cell.querySelector("img:nth-of-type(1)");
            let text = cell.querySelector("label:nth-of-type(1)");

            let role = organizer.role || "REQ-PARTICIPANT";
            let userType = organizer.userType || "INDIVIDUAL";
            let partStat = organizer.participationStatus || "NEEDS-ACTION";

            let orgName = (organizer.commonName && organizer.commonName.length)
                          ? organizer.commonName : organizer.toString();
            let userTypeString = cal.calGetString("calendar", "dialog.tooltip.attendeeUserType2." + userType,
                                            [organizer.toString()]);
            let roleString = cal.calGetString("calendar", "dialog.tooltip.attendeeRole2." + role,
                                              [userTypeString]);
            let partStatString = cal.calGetString("calendar", "dialog.tooltip.attendeePartStat2." + partStat,
                                            [orgName]);
            let tooltip = cal.calGetString("calendar", "dialog.tooltip.attendee.combined",
                                           [roleString, partStatString]);

            text.setAttribute("value", orgName);
            cell.setAttribute("tooltiptext", tooltip);
            icon.setAttribute("partstat", partStat);
            icon.setAttribute("usertype", userType);
            icon.setAttribute("role", role);
        } else {
            setBooleanAttribute("item-organizer-row", "collapsed", true);
        }
        setupAttendees();
    } else {
        attendeeTab.setAttribute("collapsed", "true");
        attendeePanel.setAttribute("collapsed", "true");
    }
}

/**
 * This function updates dialog controls related to recurrence, in this case the
 * text describing the recurrence rule.
 */
function updateRepeatDetails() {
    // Don't try to show the details text for
    // anything but a custom recurrence rule.
    let recurrenceInfo = window.recurrenceInfo;
    let itemRepeat = document.getElementById("item-repeat");
    if (itemRepeat.value == "custom" && recurrenceInfo) {
        let item = window.calendarItem;
        document.getElementById("repeat-deck").selectedIndex = 1;
        // First of all collapse the details text. If we fail to
        // create a details string, we simply don't show anything.
        // this could happen if the repeat rule is something exotic
        // we don't have any strings prepared for.
        let repeatDetails = document.getElementById("repeat-details");
        repeatDetails.setAttribute("collapsed", "true");

        // Try to create a descriptive string from the rule(s).
        let kDefaultTimezone = calendarDefaultTimezone();
        let event = cal.isEvent(item);

        let startDate = getElementValue(event ? "event-starttime" : "todo-entrydate");
        let endDate = getElementValue(event ? "event-endtime" : "todo-duedate");
        startDate = cal.jsDateToDateTime(startDate, kDefaultTimezone);
        endDate = cal.jsDateToDateTime(endDate, kDefaultTimezone);

        let allDay = getElementValue("event-all-day", "checked");
        let detailsString = recurrenceRule2String(recurrenceInfo, startDate,
                                                  endDate, allDay);

        if (!detailsString) {
            detailsString = cal.calGetString("calendar-event-dialog", "ruleTooComplex");
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
                let newNode = repeatDetails.childNodes[0]
                                           .cloneNode(true);
                repeatDetails.appendChild(newNode);
            }
            repeatDetails.childNodes[i].value = lines[i];
            repeatDetails.childNodes[i].setAttribute("tooltiptext",
                                                     detailsString);
        }
    } else {
        let repeatDetails = document.getElementById("repeat-details");
        repeatDetails.setAttribute("collapsed", "true");
    }
}

/**
 * This function does not strictly check if the given attendee has the status
 * TENTATIVE, but also if he hasn't responded.
 *
 * @param aAttendee     The attendee to check.
 * @return              True, if the attendee hasn't responded.
 */
function isAttendeeUndecided(aAttendee) {
    return aAttendee.participationStatus != "ACCEPTED" &&
           aAttendee.participationStatus != "DECLINED" &&
           aAttendee.participationStatus != "DELEGATED";
}

/**
 * Event handler for dblclick on attendee items.
 *
 * @param aEvent         The popupshowing event
 */
function attendeeDblClick(aEvent) {
    // left mouse button
    if (aEvent.button == 0) {
        editAttendees();
    }
    return;
}

/**
 * Event handler to set up the attendee-popup. This builds the popup menuitems.
 *
 * @param aEvent         The popupshowing event
 */
function attendeeClick(aEvent) {
    // we need to handle right clicks only to display the context menu
    if (aEvent.button != 2) {
        return;
    }

    if (window.attendees.length == 0) {
        // we just need the option to open the attendee dialog in this case
        let popup = document.getElementById("attendee-popup");
        let invite = document.getElementById("attendee-popup-invite-menuitem");
        for (let node of popup.childNodes) {
            if (node == invite) {
                showElement(node);
            } else {
                hideElement(node);
            }
        }
    } else {
        if (window.attendees.length > 1) {
            let removeall = document.getElementById("attendee-popup-removeallattendees-menuitem");
            showElement(removeall);
        }
        let sendEmail = document.getElementById("attendee-popup-sendemail-menuitem");
        let sendTentativeEmail = document.getElementById("attendee-popup-sendtentativeemail-menuitem");
        let firstSeparator = document.getElementById("attendee-popup-first-separator");
        [sendEmail, sendTentativeEmail, firstSeparator].forEach(showElement);

        // setup attendee specific menu items if appropriate otherwise hide respective menu items
        let mailto = document.getElementById("attendee-popup-emailattendee-menuitem");
        let remove = document.getElementById("attendee-popup-removeattendee-menuitem");
        let secondSeparator = document.getElementById("attendee-popup-second-separator");
        let attId = aEvent.target.parentNode.getAttribute("attendeeid");
        let attendee = window.attendees.find(aAtt => aAtt.id == attId);
        if (attendee) {
            [mailto, remove, secondSeparator].forEach(showElement);
            mailto.setAttribute("label", attendee.toString());
            mailto.attendee = attendee;
            remove.attendee = attendee;
        } else {
            [mailto, remove, secondSeparator].forEach(hideElement);
        }

        if (window.attendees.some(isAttendeeUndecided)) {
            document.getElementById("cmd_email_undecided")
                    .removeAttribute("disabled");
        } else {
            document.getElementById("cmd_email_undecided")
                    .setAttribute("disabled", "true");
        }
    }
}

/**
 * Removes the selected attendee from the window
 * @param aAttendee
 */
function removeAttendee(aAttendee) {
    if (aAttendee) {
        window.attendees = window.attendees.filter(aAtt => aAtt != aAttendee);
        updateAttendees();
    }
}

/**
 * Removes all attendees from the window
 */
function removeAllAttendees() {
    window.attendees = [];
    window.organizer = null;
    updateAttendees();
}

/**
 * Send Email to all attendees that haven't responded or are tentative.
 *
 * @param aAttendees    The attendees to check.
 */
function sendMailToUndecidedAttendees(aAttendees) {
    let targetAttendees = attendees.filter(isAttendeeUndecided);
    sendMailToAttendees(targetAttendees);
}

/**
 * Send Email to all given attendees.
 *
 * @param aAttendees    The attendees to send mail to.
 */
function sendMailToAttendees(aAttendees) {
    let toList = cal.getRecipientList(aAttendees);
    let item = saveItem();
    let emailSubject = cal.calGetString("calendar-event-dialog", "emailSubjectReply", [item.title]);
    let identity = window.calendarItem.calendar.getProperty("imip.identity");
    sendMailTo(toList, emailSubject, null, identity);
}

/**
 * Make sure all fields that may have calendar specific capabilities are updated
 */
function updateCapabilities() {
    updateAttachment();
    updateConfigState({
        priority: gConfig.priority,
        privacy: gConfig.privacy
    });
    updateReminderDetails();
    updateCategoryMenulist();
}

/**
 * find out if the User already changed values in the Dialog
 *
 * @return:    true if the values in the Dialog have changed. False otherwise.
 */
function isItemChanged() {
    let newItem = saveItem();
    let oldItem = window.calendarItem.clone();

    // we need to guide the description text through the text-field since
    // newlines are getting converted which would indicate changes to the
    // text.
    setElementValue("item-description", oldItem.getProperty("DESCRIPTION"));
    setItemProperty(oldItem,
                    "DESCRIPTION",
                    getElementValue("item-description"));
    setElementValue("item-description", newItem.getProperty("DESCRIPTION"));

    if ((newItem.calendar.id == oldItem.calendar.id) &&
        compareItemContent(newItem, oldItem)) {
        return false;
    }
    return true;
}

/**
 * Test if a specific capability is supported
 *
 * @param aCap      The capability from "capabilities.<aCap>.supported"
 */
function capSupported(aCap) {
    let calendar = getCurrentCalendar();
    return calendar.getProperty("capabilities." + aCap + ".supported") !== false;
}

/**
 * Return the values for a certain capability.
 *
 * @param aCap      The capability from "capabilities.<aCap>.values"
 * @return          The values for this capability
 */
function capValues(aCap, aDefault) {
    let calendar = getCurrentCalendar();
    let vals = calendar.getProperty("capabilities." + aCap + ".values");
    return (vals === null ? aDefault : vals);
}

 /**
 * Checks the until date just entered in the datepicker in order to avoid
 * setting a date earlier than the start date.
 * Restores the previous correct date; sets the warning flag to prevent closing
 * the dialog when the user enters a wrong until date.
 */
function checkUntilDate() {
    let repeatUntilDate = getElementValue("repeat-until-datepicker");
    if (repeatUntilDate == "forever") {
        updateRepeat();
        // "forever" is never earlier than another date.
        return;
    }

    // Check whether the date is valid. Set the correct time just in this case.
    let untilDate = cal.jsDateToDateTime(repeatUntilDate, gStartTime.timezone);
    let startDate = gStartTime.clone();
    startDate.isDate = true;
    if (untilDate.compare(startDate) < 0) {
        // Invalid date: restore the previous date. Since we are checking an
        // until date, a null value for gUntilDate means repeat "forever".
        setElementValue("repeat-until-datepicker",
                        gUntilDate ? cal.dateTimeToJsDate(gUntilDate.getInTimezone(cal.floating()))
                                   : "forever");
        gWarning = true;
        let callback = function() {
            // Disable the "Save" and "Save and Close" commands as long as the
            // warning dialog is showed.
            enableAcceptCommand(false);

            Services.prompt.alert(
                null,
                document.title,
                cal.calGetString("calendar", "warningUntilDateBeforeStart"));
            enableAcceptCommand(true);
            gWarning = false;
        };
        setTimeout(callback, 1);
    } else {
        // Valid date: set the time equal to start date time.
        gUntilDate = untilDate;
        updateUntildateRecRule();
    }
}
