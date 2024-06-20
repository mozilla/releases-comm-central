/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onEventDialogUnload, changeUndiscloseCheckboxStatus,
 *          categoryPopupHiding, categoryTextboxKeypress,
 *          toggleKeepDuration, dateTimeControls2State, onUpdateAllDay,
 *          openNewEvent, openNewTask, openNewMessage,
 *          deleteAllAttachments, copyAttachment, attachmentLinkKeyPress,
 *          attachmentDblClick, attachmentClick, notifyUser,
 *          removeNotification, chooseRecentTimezone, showTimezonePopup,
 *          attendeeDblClick, setAttendeeContext, removeAttendee,
 *          removeAllAttendees, sendMailToUndecidedAttendees, checkUntilDate,
 *          applyValues
 */

/* global MozElements */

/* import-globals-from ../../../../mail/components/compose/content/editor.js */
/* import-globals-from ../../../../mail/components/compose/content/editorUtilities.js */
/* import-globals-from ../calendar-ui-utils.js */
/* import-globals-from ../dialogs/calendar-dialog-utils.js */
/* globals gTimezonesEnabled */ // Set by calendar-item-panel.js.

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var {
  recurrenceRule2String,
  splitRecurrenceRules,
  checkRecurrenceRule,
  countOccurrences,
  hasUnsupported,
} = ChromeUtils.importESModule("resource:///modules/calendar/calRecurrenceUtils.sys.mjs");
var { PluralForm } = ChromeUtils.importESModule("resource:///modules/PluralForm.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAttachment: "resource:///modules/CalAttachment.sys.mjs",
  CalAttendee: "resource:///modules/CalAttendee.sys.mjs",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.sys.mjs",
});

window.addEventListener("load", onLoad);
window.addEventListener("unload", onEventDialogUnload);

var cloudFileAccounts;
try {
  ({ cloudFileAccounts } = ChromeUtils.importESModule(
    "resource:///modules/cloudFileAccounts.sys.mjs"
  ));
} catch (e) {
  // This will fail on Seamonkey, but that's ok since the pref for cloudfiles
  // is false, which means the UI will not be shown
}

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
var gLastAlarmSelection = 0;
var gConfig = {
  priority: 0,
  privacy: null,
  status: "NONE",
  showTimeAs: null,
  percentComplete: 0,
};
// The following variables are set by the load handler function of the
// parent context, so that they are already set before iframe content load:
//   - gTimezoneEnabled

ChromeUtils.defineLazyGetter(this, "gEventNotification", () => {
  return new MozElements.NotificationBox(element => {
    document.getElementById("event-dialog-notifications").append(element);
  });
});
ChromeUtils.defineLazyGetter(this, "l10n", () => new Localization(["calendar/calendar.ftl"], true));

var eventDialogRequestObserver = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe(aSubject, aTopic) {
    if (
      aTopic == "http-on-modify-request" &&
      aSubject instanceof Ci.nsIChannel &&
      aSubject.loadInfo &&
      aSubject.loadInfo.loadingDocument &&
      aSubject.loadInfo.loadingDocument ==
        document.getElementById("item-description").contentDocument
    ) {
      aSubject.cancel(Cr.NS_ERROR_ABORT);
    }
  },
};

var eventDialogQuitObserver = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe(aSubject, aTopic) {
    // Check whether or not we want to veto the quit request (unless another
    // observer already did.
    if (
      aTopic == "quit-application-requested" &&
      aSubject instanceof Ci.nsISupportsPRBool &&
      !aSubject.data
    ) {
      aSubject.data = !onCancel();
    }
  },
};

var eventDialogCalendarObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

  target: null,
  isObserving: false,

  onModifyItem(aNewItem, aOldItem) {
    if (
      this.isObserving &&
      "calendarItem" in window &&
      window.calendarItem &&
      window.calendarItem.id == aOldItem.id
    ) {
      let doUpdate = true;

      // The item has been modified outside the dialog. We only need to
      // prompt if there have been local changes also.
      if (isItemChanged()) {
        const promptTitle = this.l10n.formatValueSync("modify-conflict-prompt-title");
        const promptMessage = this.l10n.formatValueSync("modify-conflict-prompt-message");
        const promptButton1 = this.l10n.formatValueSync("modify-conflict-prompt-button1");
        const promptButton2 = this.l10n.formatValueSync("modify-conflict-prompt-button2");
        const flags =
          Ci.nsIPromptService.BUTTON_TITLE_IS_STRING * Ci.nsIPromptService.BUTTON_POS_0 +
          Ci.nsIPromptService.BUTTON_TITLE_IS_STRING * Ci.nsIPromptService.BUTTON_POS_1;

        const choice = Services.prompt.confirmEx(
          window,
          promptTitle,
          promptMessage,
          flags,
          promptButton1,
          promptButton2,
          null,
          null,
          {}
        );
        if (!choice) {
          doUpdate = false;
        }
      }

      let item = aNewItem;
      if (window.calendarItem.recurrenceId && aNewItem.recurrenceInfo) {
        item = aNewItem.recurrenceInfo.getOccurrenceFor(window.calendarItem.recurrenceId) || item;
      }
      window.calendarItem = item;

      if (doUpdate) {
        loadDialog(window.calendarItem);
      }
    }
  },

  onDeleteItem(aDeletedItem) {
    if (
      this.isObserving &&
      "calendarItem" in window &&
      window.calendarItem &&
      window.calendarItem.id == aDeletedItem.id
    ) {
      cancelItem();
    }
  },

  onStartBatch() {},
  onEndBatch() {},
  onLoad() {},
  onAddItem() {},
  onError() {},
  onPropertyChanged() {},
  onPropertyDeleting() {},

  observe(aCalendar) {
    // use the new calendar if one was passed, otherwise use the last one
    this.target = aCalendar || this.target;
    if (this.target) {
      this.cancel();
      this.target.addObserver(this);
      this.isObserving = true;
    }
  },

  cancel() {
    if (this.isObserving && this.target) {
      this.target.removeObserver(this);
      this.isObserving = false;
    }
  },
};

/**
 * Checks if the given calendar supports notifying attendees. The item is needed
 * since calendars may support notifications for only some types of items.
 *
 * @param {calICalendar} aCalendar - The calendar to check
 * @param {calIItemBase} aItem - The item to check support for
 */
function canNotifyAttendees(aCalendar, aItem) {
  try {
    const calendar = aCalendar.QueryInterface(Ci.calISchedulingSupport);
    return calendar.canNotify("REQUEST", aItem) && calendar.canNotify("CANCEL", aItem);
  } catch (exc) {
    return false;
  }
}

/**
 * Sends an asynchronous message to the parent context that contains the
 * iframe. Additional properties of aMessage are generally arguments
 * that will be passed to the function named in aMessage.command.
 *
 * @param {object} aMessage - The message to pass to the parent context
 * @param {string} aMessage.command - The name of a function to call
 */
function sendMessage(aMessage) {
  parent.postMessage(aMessage, "*");
}

/**
 * Receives asynchronous messages from the parent context that contains the iframe.
 *
 * @param {MessageEvent} aEvent - Contains the message being received
 */
function receiveMessage(aEvent) {
  const validOrigin = gTabmail ? "chrome://messenger" : "chrome://calendar";
  if (aEvent.origin !== validOrigin) {
    return;
  }
  switch (aEvent.data.command) {
    case "editAttendees":
      editAttendees();
      break;
    case "attachURL":
      attachURL();
      break;
    case "onCommandDeleteItem":
      onCommandDeleteItem();
      break;
    case "onCommandSave":
      onCommandSave(aEvent.data.isClosing);
      break;
    case "onAccept":
      onAccept();
      break;
    case "onCancel":
      onCancel(aEvent.data.iframeId);
      break;
    case "openNewEvent":
      openNewEvent();
      break;
    case "openNewTask":
      openNewTask();
      break;
    case "editConfigState": {
      Object.assign(gConfig, aEvent.data.argument);
      updateConfigState(aEvent.data.argument);
      break;
    }
    case "editToDoStatus": {
      const textbox = document.getElementById("percent-complete-textbox");
      textbox.value = aEvent.data.value;
      updateToDoStatus("percent-changed");
      break;
    }
    case "postponeTask":
      postponeTask(aEvent.data.value);
      break;
    case "toggleTimezoneLinks":
      gTimezonesEnabled = aEvent.data.checked; // eslint-disable-line
      updateDateTime();
      break;
    case "closingWindowWithTabs": {
      const response = onCancel(aEvent.data.id, true);
      sendMessage({
        command: "replyToClosingWindowWithTabs",
        response,
      });
      break;
    }
    case "attachFileByAccountKey":
      attachFileByAccountKey(aEvent.data.accountKey);
      break;
    case "triggerUpdateSaveControls":
      updateParentSaveControls();
      break;
  }
}

/**
 * Sets up the event dialog from the window arguments, also setting up all
 * dialog controls from the window's item.
 */
function onLoad() {
  window.addEventListener("message", receiveMessage);

  // first of all retrieve the array of
  // arguments this window has been called with.
  const args = window.arguments[0];

  intializeTabOrWindowVariables();

  // Needed so we can call switchToTab for the prompt about saving
  // unsaved changes, to show the tab that the prompt is for.
  if (gInTab) {
    gTabInfoObject = gTabmail.currentTabInfo;
  }

  // the most important attribute we expect from the
  // arguments is the item we'll edit in the dialog.
  const item = args.calendarEvent;

  // set the iframe's top level id for event vs task
  if (item.isTodo()) {
    setDialogId(document.documentElement, "calendar-task-dialog-inner");
  }

  document.getElementById("item-title").placeholder = cal.l10n.getString(
    "calendar-event-dialog",
    item.isEvent() ? "newEvent" : "newTask"
  );

  window.onAcceptCallback = args.onOk;
  window.mode = args.mode;

  // we store the item in the window to be able
  // to access this from any location. please note
  // that the item is either an occurrence [proxy]
  // or the stand-alone item [single occurrence item].
  window.calendarItem = item;
  // store the initial date value for datepickers in New Task dialog
  window.initialStartDateValue = args.initialStartDateValue;

  window.attendeeTabLabel = document.getElementById("event-grid-tab-attendees").label;
  window.attachmentTabLabel = document.getElementById("event-grid-tab-attachments").label;

  // Store the array of attendees on the window for later retrieval. Clone each
  // existing attendee to prevent modifying objects referenced elsewhere.
  const attendees = item.getAttendees() ?? [];
  window.attendees = attendees.map(attendee => attendee.clone());

  window.organizer = null;
  if (item.organizer) {
    window.organizer = item.organizer.clone();
  } else if (attendees.length > 0) {
    // Previous versions of calendar may not have set the organizer correctly.
    const organizerId = item.calendar.getProperty("organizerId");
    if (organizerId) {
      const organizer = new CalAttendee();
      organizer.id = cal.email.removeMailTo(organizerId);
      organizer.commonName = item.calendar.getProperty("organizerCN");
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
  if (item.isTodo()) {
    const initialDatesValue = cal.dtz.dateTimeToJsDate(args.initialStartDateValue);
    document.getElementById("completed-date-picker").value = initialDatesValue;
    document.getElementById("todo-entrydate").value = initialDatesValue;
    document.getElementById("todo-duedate").value = initialDatesValue;
  }
  loadDialog(window.calendarItem);

  if (args.counterProposal) {
    window.counterProposal = args.counterProposal;
    displayCounterProposal();
  }

  gMainWindow.setCursor("auto");

  document.getElementById("item-title").select();

  // This causes the app to ask if the window should be closed when the
  // application is closed.
  Services.obs.addObserver(eventDialogQuitObserver, "quit-application-requested");

  // This stops the editor from loading remote HTTP(S) content.
  Services.obs.addObserver(eventDialogRequestObserver, "http-on-modify-request");

  // Normally, Enter closes a <dialog>. We want this to rather on Ctrl+Enter.
  // Stopping event propagation doesn't seem to work, so just overwrite the
  // function that does this.
  if (!gInTab) {
    document.documentElement._hitEnter = function () {};
  }

  // set up our calendar event observer
  eventDialogCalendarObserver.observe(item.calendar);

  // Disable save and save close buttons and menuitems if the item
  // title is empty.
  updateTitle();

  cal.view.colorTracker.registerWindow(window);

  top.document.commandDispatcher.addCommandUpdater(
    document.getElementById("styleMenuItems"),
    "style",
    "*"
  );
  EditorSharedStartup();

  // We want to keep HTML output as simple as possible, so don't try to use divs
  // as separators. As a bonus, this avoids a bug in the editor which sometimes
  // causes the user to have to hit enter twice for it to take effect.
  const editor = GetCurrentEditor();
  editor.document.execCommand("defaultparagraphseparator", false, "br");

  onLoad.hasLoaded = true;
}
// Set a variable to allow or prevent actions before the dialog is done loading.
onLoad.hasLoaded = false;

function onEventDialogUnload() {
  Services.obs.removeObserver(eventDialogRequestObserver, "http-on-modify-request");
  Services.obs.removeObserver(eventDialogQuitObserver, "quit-application-requested");
  eventDialogCalendarObserver.cancel();
}

/**
 * Handler function to be called when the accept button is pressed.
 *
 * @returns Returns true if the window should be closed
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
 * @returns Returns true if the window should be closed.
 */
function onCommandCancel() {
  // Allow closing if the item has not changed and no warning dialog has to be showed.
  if (!isItemChanged() && !gWarning) {
    return true;
  }

  if (gInTab && gTabInfoObject) {
    // Switch to the tab that the prompt refers to.
    gTabmail.switchToTab(gTabInfoObject);
  }

  const promptTitle = this.l10n.formatValueSync(
    window.calendarItem.isEvent() ? "ask-save-title-event" : "ask-save-title-task"
  );
  const promptMessage = this.l10n.formatValueSync(
    window.calendarItem.isEvent() ? "ask-save-message-event" : "ask-save-message-task"
  );

  const flags =
    Ci.nsIPromptService.BUTTON_TITLE_SAVE * Ci.nsIPromptService.BUTTON_POS_0 +
    Ci.nsIPromptService.BUTTON_TITLE_CANCEL * Ci.nsIPromptService.BUTTON_POS_1 +
    Ci.nsIPromptService.BUTTON_TITLE_DONT_SAVE * Ci.nsIPromptService.BUTTON_POS_2;

  const choice = Services.prompt.confirmEx(
    null,
    promptTitle,
    promptMessage,
    flags,
    null,
    null,
    null,
    null,
    {}
  );
  switch (choice) {
    case 0: {
      // Save
      const itemTitle = document.getElementById("item-title");
      if (!itemTitle.value) {
        itemTitle.value = this.l10n.formatValueSync("event-untitled");
      }
      onCommandSave(true);
      return true;
    }
    case 2: // Don't save
      // Don't show any warning dialog when closing without saving.
      gWarning = false;
      return true;
    default:
      // Cancel
      return false;
  }
}

/**
 * Handler function to be called when the cancel button is pressed.
 * aPreventClose is true when closing the main window but leaving the tab open.
 *
 * @param  {string}  aIframeId      (optional) iframe id of the tab to be closed
 * @param  {boolean} aPreventClose  (optional) True means don't close, just ask about saving
 * @returns {boolean} True if the tab or window should be closed
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

    if (!gWarning && !aPreventClose) {
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
 * Get the currently selected calendar from the menulist of calendars.
 *
 * @returns The currently selected calendar.
 */
function getCurrentCalendar() {
  return document.getElementById("item-calendar").selectedItem.calendar;
}

/**
 * Sets up all dialog controls from the information of the passed item.
 *
 * @param aItem      The item to parse information out of.
 */
function loadDialog(aItem) {
  loadDateTime(aItem);

  document.getElementById("item-title").value = aItem.title;
  document.getElementById("item-location").value = aItem.getProperty("LOCATION");

  // add calendars to the calendar menulist
  const calendarList = document.getElementById("item-calendar");
  const indexToSelect = appendCalendarItems(
    aItem,
    calendarList,
    aItem.calendar || window.arguments[0].calendar
  );
  if (indexToSelect > -1) {
    calendarList.selectedIndex = indexToSelect;
  }

  // Categories
  loadCategories(aItem);

  // Attachment
  loadCloudProviders();

  const hasAttachments = capSupported("attachments");
  const attachments = aItem.getAttachments();
  if (hasAttachments && attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      addAttachment(attachment);
    }
  } else {
    updateAttachment();
  }

  // URL link
  const itemUrl = window.calendarItem.getProperty("URL")?.trim() || "";
  const showLink = showOrHideItemURL(itemUrl);
  updateItemURL(showLink, itemUrl);

  // Description
  const editorElement = document.getElementById("item-description");
  const editor = editorElement.getHTMLEditor(editorElement.contentWindow);

  const link = editorElement.contentDocument.createElement("link");
  link.rel = "stylesheet";
  link.href = "chrome://messenger/skin/shared/editorContent.css";
  editorElement.contentDocument.head.appendChild(link);

  try {
    const checker = editor.getInlineSpellChecker(true);
    checker.enableRealTimeSpell = Services.prefs.getBoolPref("mail.spellcheck.inline", true);
  } catch (ex) {
    // No dictionaries.
  }

  if (aItem.descriptionText) {
    const docFragment = cal.view.textToHtmlDocumentFragment(
      aItem.descriptionText,
      editorElement.contentDocument,
      aItem.descriptionHTML
    );
    editor.flags =
      editor.eEditorMailMask | editor.eEditorNoCSSMask | editor.eEditorAllowInteraction;
    editor.enableUndo(false);
    editor.forceCompositionEnd();
    editor.rootElement.replaceChildren(docFragment);
    // This reinitialises the editor after we replaced its contents.
    editor.insertText("");
    editor.enableUndo(true);
  }

  editor.resetModificationCount();

  if (aItem.isTodo()) {
    // Task completed date
    if (aItem.completedDate) {
      updateToDoStatus(aItem.status, cal.dtz.dateTimeToJsDate(aItem.completedDate));
    } else {
      updateToDoStatus(aItem.status);
    }

    // Task percent complete
    let percentCompleteInteger = 0;
    const percentCompleteProperty = aItem.getProperty("PERCENT-COMPLETE");
    if (percentCompleteProperty != null) {
      percentCompleteInteger = parseInt(percentCompleteProperty, 10);
    }
    if (percentCompleteInteger < 0) {
      percentCompleteInteger = 0;
    } else if (percentCompleteInteger > 100) {
      percentCompleteInteger = 100;
    }
    gConfig.percentComplete = percentCompleteInteger;
    document.getElementById("percent-complete-textbox").value = percentCompleteInteger;
  }

  // When in a window, set Item-Menu label to Event or Task
  if (!gInTab) {
    const isEvent = aItem.isEvent();

    const labelString = isEvent ? "itemMenuLabelEvent" : "itemMenuLabelTask";
    const label = cal.l10n.getString("calendar-event-dialog", labelString);

    const accessKeyString = isEvent ? "itemMenuAccesskeyEvent2" : "itemMenuAccesskeyTask2";
    const accessKey = cal.l10n.getString("calendar-event-dialog", accessKeyString);
    sendMessage({
      command: "initializeItemMenu",
      label,
      accessKey,
    });
  }

  // Repeat details
  const [repeatType, untilDate] = getRepeatTypeAndUntilDate(aItem);
  loadRepeat(repeatType, untilDate, aItem);

  // load reminders details
  const alarmsMenu = document.querySelector(".item-alarm");
  window.gLastAlarmSelection = loadReminders(aItem.getAlarms(), alarmsMenu, getCurrentCalendar());

  // Synchronize link-top-image with keep-duration-button status
  const keepAttribute =
    document.getElementById("keepduration-button").getAttribute("keep") == "true";
  document.getElementById("link-image-top").setAttribute("keep", keepAttribute);

  updateDateTime();

  updateCalendar();

  const notifyCheckbox = document.getElementById("notify-attendees-checkbox");
  const undiscloseCheckbox = document.getElementById("undisclose-attendees-checkbox");
  const disallowcounterCheckbox = document.getElementById("disallow-counter-checkbox");
  if (canNotifyAttendees(aItem.calendar, aItem)) {
    // visualize that the server will send out mail:
    notifyCheckbox.checked = true;
    // hide these controls as this a client only feature
    undiscloseCheckbox.disabled = true;
  } else {
    const itemProp = aItem.getProperty("X-MOZ-SEND-INVITATIONS");
    notifyCheckbox.checked =
      aItem.calendar.getProperty("imip.identity") &&
      (itemProp === null
        ? Services.prefs.getBoolPref("calendar.itip.notify", true)
        : itemProp == "TRUE");
    const undiscloseProp = aItem.getProperty("X-MOZ-SEND-INVITATIONS-UNDISCLOSED");
    undiscloseCheckbox.checked =
      undiscloseProp === null
        ? Services.prefs.getBoolPref("calendar.itip.separateInvitationPerAttendee")
        : undiscloseProp == "TRUE";
    // disable checkbox, if notifyCheckbox is not checked
    undiscloseCheckbox.disabled = !notifyCheckbox.checked;
  }
  // this may also be a server exposed calendar property from exchange servers - if so, this
  // probably should overrule the client-side config option
  const disallowCounterProp = aItem.getProperty("X-MICROSOFT-DISALLOW-COUNTER");
  disallowcounterCheckbox.checked = disallowCounterProp == "TRUE";
  // if we're in reschedule mode, it's pointless to enable the control
  disallowcounterCheckbox.disabled = !!window.counterProposal;

  updateAttendeeInterface();
  updateRepeat(true);
  updateReminder(true);

  // Status
  if (aItem.isEvent()) {
    gConfig.status = aItem.hasProperty("STATUS") ? aItem.getProperty("STATUS") : "NONE";
    if (gConfig.status == "NONE") {
      sendMessage({ command: "showCmdStatusNone" });
    }
    updateConfigState({ status: gConfig.status });
  } else {
    const itemStatus = aItem.getProperty("STATUS");
    const todoStatus = document.getElementById("todo-status");
    todoStatus.value = itemStatus;
    if (!todoStatus.selectedItem) {
      // No selected item means there was no <menuitem> that matches the
      // value given. Select the "NONE" item by default.
      todoStatus.value = "NONE";
    }
  }

  // Priority, Privacy, Transparency
  gConfig.priority = parseInt(aItem.priority, 10);
  gConfig.privacy = aItem.privacy;
  gConfig.showTimeAs = aItem.getProperty("TRANSP");

  // update in outer parent context
  updateConfigState(gConfig);

  if (aItem.getAttendees().length && !aItem.descriptionText) {
    const tabs = document.getElementById("event-grid-tabs");
    const attendeeTab = document.getElementById("event-grid-tab-attendees");
    tabs.selectedItem = attendeeTab;
  }
}

/**
 * Enables/disables undiscloseCheckbox on (un)checking notifyCheckbox
 */
function changeUndiscloseCheckboxStatus() {
  const notifyCheckbox = document.getElementById("notify-attendees-checkbox");
  const undiscloseCheckbox = document.getElementById("undisclose-attendees-checkbox");
  undiscloseCheckbox.disabled = !notifyCheckbox.checked;
  updateParentSaveControls();
}

/**
 * Loads the item's categories into the category panel
 *
 * @param aItem     The item to load into the category panel
 */
function loadCategories(aItem) {
  const itemCategories = aItem.getCategories();
  const categoryList = cal.category.fromPrefs();
  for (const cat of itemCategories) {
    if (!categoryList.includes(cat)) {
      categoryList.push(cat);
    }
  }
  cal.l10n.sortArrayByLocaleCollator(categoryList);

  // Make sure the maximum number of categories is applied to the listbox
  const calendar = getCurrentCalendar();
  const maxCount = calendar.getProperty("capabilities.categories.maxCount");

  const categoryPopup = document.getElementById("item-categories-popup");
  if (maxCount == 1) {
    const item = document.createXULElement("menuitem");
    item.setAttribute("class", "menuitem-iconic");
    document.l10n.setAttributes(item, "calendar-none");
    item.setAttribute("type", "radio");
    if (itemCategories.length === 0) {
      item.setAttribute("checked", "true");
    }
    categoryPopup.appendChild(item);
  }
  for (const cat of categoryList) {
    const item = document.createXULElement("menuitem");
    item.setAttribute("class", "menuitem-iconic calendar-category");
    item.setAttribute("label", cat);
    item.setAttribute("value", cat);
    item.setAttribute("type", maxCount === null || maxCount > 1 ? "checkbox" : "radio");
    if (itemCategories.includes(cat)) {
      item.setAttribute("checked", "true");
    }
    const cssSafeId = cal.view.formatStringForCSSRule(cat);
    item.style.setProperty("--item-color", `var(--category-${cssSafeId}-color)`);
    categoryPopup.appendChild(item);
  }

  updateCategoryMenulist();
}

/**
 * Updates the category menulist to show the correct label, depending on the
 * selected categories in the category panel
 */
function updateCategoryMenulist() {
  const categoryMenulist = document.getElementById("item-categories");
  const categoryPopup = document.getElementById("item-categories-popup");

  // Make sure the maximum number of categories is applied to the listbox
  const calendar = getCurrentCalendar();
  const maxCount = calendar.getProperty("capabilities.categories.maxCount");

  // Hide the categories listbox and label in case categories are not
  // supported
  document.getElementById("event-grid-category-row").toggleAttribute("hidden", maxCount === 0);

  let label;
  const categoryList = categoryPopup.querySelectorAll("menuitem.calendar-category[checked]");
  if (categoryList.length > 1) {
    label = this.l10n.formatValueSync("multiple-categories");
  } else if (categoryList.length == 1) {
    label = categoryList[0].getAttribute("label");
  } else {
    label = this.l10n.formatValueSync("no-categories");
  }
  categoryMenulist.setAttribute("label", label);

  const labelBox = categoryMenulist.shadowRoot.querySelector("#label-box");
  const labelLabel = labelBox.querySelector("#label");
  for (const box of labelBox.querySelectorAll("box")) {
    box.remove();
  }
  for (let i = 0; i < categoryList.length; i++) {
    const box = labelBox.insertBefore(document.createXULElement("box"), labelLabel);
    // Normal CSS selectors like :first-child don't work on shadow DOM items,
    // so we have to set up something they do work on.
    const parts = ["color"];
    if (i == 0) {
      parts.push("first");
    }
    if (i == categoryList.length - 1) {
      parts.push("last");
    }
    box.setAttribute("part", parts.join(" "));
    box.style.setProperty("--item-color", categoryList[i].style.getPropertyValue("--item-color"));
  }
}

/**
 * Updates the categories menulist label and decides if the popup should close
 *
 * @param aItem     The popuphiding event
 * @returns Whether the popup should close
 */
function categoryPopupHiding(event) {
  updateCategoryMenulist();
  const calendar = getCurrentCalendar();
  const maxCount = calendar.getProperty("capabilities.categories.maxCount");
  if (maxCount === null || maxCount > 1) {
    return event.target.localName != "menuitem";
  }
  return true;
}

/**
 * Prompts for a new category name, then adds it to the list
 */
function categoryTextboxKeypress(event) {
  let category = event.target.value;
  const categoryPopup = document.getElementById("item-categories-popup");
  switch (event.key) {
    case "Tab":
    case "ArrowDown":
    case "ArrowUp": {
      event.target.blur();
      event.preventDefault();

      const keyCode = event.key == "ArrowUp" ? KeyboardEvent.DOM_VK_UP : KeyboardEvent.DOM_VK_DOWN;
      categoryPopup.dispatchEvent(new KeyboardEvent("keydown", { keyCode }));
      categoryPopup.dispatchEvent(new KeyboardEvent("keyup", { keyCode }));
      return;
    }
    case "Escape":
      if (category) {
        event.target.value = "";
      } else {
        categoryPopup.hidePopup();
      }
      event.preventDefault();
      return;
    case "Enter":
      category = category.trim();
      if (category != "") {
        break;
      }
      return;
    default:
      return;
  }
  event.preventDefault();

  const categoryList = categoryPopup.querySelectorAll("menuitem.calendar-category");
  const categories = Array.from(categoryList, cat => cat.getAttribute("value"));

  let newIndex = categories.indexOf(category);
  if (newIndex > -1) {
    categoryList[newIndex].setAttribute("checked", true);
  } else {
    const localeCollator = new Intl.Collator();
    const compare = localeCollator.compare;
    newIndex = cal.data.binaryInsert(categories, category, compare, true);

    const calendar = getCurrentCalendar();
    const maxCount = calendar.getProperty("capabilities.categories.maxCount");

    const item = document.createXULElement("menuitem");
    item.setAttribute("class", "menuitem-iconic calendar-category");
    item.setAttribute("label", category);
    item.setAttribute("value", category);
    item.setAttribute("type", maxCount === null || maxCount > 1 ? "checkbox" : "radio");
    item.setAttribute("checked", true);
    categoryPopup.insertBefore(item, categoryList[newIndex]);
  }

  event.target.value = "";
  // By pushing this to the end of the event loop, the other checked items in the list
  // are cleared, where only one category is allowed.
  setTimeout(updateCategoryMenulist, 0);
}

/**
 * Saves the selected categories into the passed item
 *
 * @param aItem     The item to set the categories on
 */
function saveCategories(aItem) {
  const categoryPopup = document.getElementById("item-categories-popup");
  const categoryList = Array.from(
    categoryPopup.querySelectorAll("menuitem.calendar-category[checked]"),
    cat => cat.getAttribute("label")
  );
  aItem.setCategories(categoryList);
}

/**
 * Sets up all date related controls from the passed item
 *
 * @param item      The item to parse information out of.
 */
function loadDateTime(item) {
  const kDefaultTimezone = cal.dtz.defaultTimezone;
  if (item.isEvent()) {
    let startTime = item.startDate;
    let endTime = item.endDate;
    const duration = endTime.subtractDate(startTime);

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

  if (item.isTodo()) {
    let startTime = null;
    let endTime = null;
    let duration = null;

    const hasEntryDate = item.entryDate != null;
    if (hasEntryDate) {
      startTime = item.entryDate;
      gStartTimezone = startTime.timezone;
      startTime = startTime.getInTimezone(kDefaultTimezone);
    } else {
      gStartTimezone = kDefaultTimezone;
    }
    const hasDueDate = item.dueDate != null;
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
    document.getElementById("cmd_attendees").setAttribute("disabled", true);
    document.getElementById("keepduration-button").disabled = !(hasEntryDate && hasDueDate);
    sendMessage({
      command: "updateConfigState",
      argument: { attendeesCommand: false },
    });
    gStartTime = startTime;
    gEndTime = endTime;
    gItemDuration = duration;
  } else {
    sendMessage({
      command: "updateConfigState",
      argument: { attendeesCommand: true },
    });
  }
}

/**
 * Toggles the "keep" attribute every time the keepduration-button is pressed.
 */
function toggleKeepDuration() {
  const kdb = document.getElementById("keepduration-button");
  const keepAttribute = kdb.getAttribute("keep") == "true";
  // To make the "keep" attribute persistent, it mustn't be removed when in
  // false state (bug 15232).
  kdb.setAttribute("keep", keepAttribute ? "false" : "true");
  document.getElementById("link-image-top").setAttribute("keep", !keepAttribute);
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
  const keepAttribute =
    document.getElementById("keepduration-button").getAttribute("keep") == "true";
  const allDay = document.getElementById("event-all-day").checked;
  let startWidgetId;
  let endWidgetId;
  if (window.calendarItem.isEvent()) {
    startWidgetId = "event-starttime";
    endWidgetId = "event-endtime";
  } else {
    if (!document.getElementById("todo-has-entrydate").checked) {
      gItemDuration = null;
    }
    if (!document.getElementById("todo-has-duedate").checked) {
      gItemDuration = null;
    }
    startWidgetId = "todo-entrydate";
    endWidgetId = "todo-duedate";
  }

  const saveStartTime = gStartTime;
  const saveEndTime = gEndTime;
  const kDefaultTimezone = cal.dtz.defaultTimezone;

  if (gStartTime) {
    // jsDate is always in OS timezone, thus we create a calIDateTime
    // object from the jsDate representation then we convert the timezone
    // in order to keep gStartTime in default timezone.
    if (gTimezonesEnabled || allDay) {
      gStartTime = cal.dtz.jsDateToDateTime(
        document.getElementById(startWidgetId).value,
        gStartTimezone
      );
      gStartTime = gStartTime.getInTimezone(kDefaultTimezone);
    } else {
      gStartTime = cal.dtz.jsDateToDateTime(
        document.getElementById(startWidgetId).value,
        kDefaultTimezone
      );
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
        if (gStartTime && !cal.data.compareObjects(gStartTimezone, gEndTimezone)) {
          timezone = gStartTimezone;
        }
      }
      if (gTimezonesEnabled || allDay) {
        gEndTime = cal.dtz.jsDateToDateTime(document.getElementById(endWidgetId).value, timezone);
        gEndTime = gEndTime.getInTimezone(kDefaultTimezone);
      } else {
        gEndTime = cal.dtz.jsDateToDateTime(
          document.getElementById(endWidgetId).value,
          kDefaultTimezone
        );
      }
      gEndTime.isDate = allDay;
      if (keepAttribute && gItemDuration) {
        // Keepduration-button links the the Start to the End date. We
        // have to change the Start date in order to keep the duration.
        const fduration = gItemDuration.clone();
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
      stringWarning = this.l10n.formatValueSync("warning-end-before-start");
    }
  }

  let startChanged = false;
  if (gStartTime && saveStartTime) {
    startChanged = gStartTime.compare(saveStartTime) != 0;
  }
  // Preset the date in the until-datepicker's minimonth to the new start
  // date if it has changed.
  if (startChanged) {
    const startDate = cal.dtz.dateTimeToJsDate(gStartTime.getInTimezone(cal.dtz.floating));
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
      // Update the until-date-picker. In case of "custom" rule, the
      // recurrence string is going to be changed by updateDateTime() below.
      if (
        !document.getElementById("repeat-untilDate").hidden &&
        document.getElementById("repeat-details").hidden
      ) {
        document.getElementById("repeat-until-datepicker").value = cal.dtz.dateTimeToJsDate(
          gUntilDate.getInTimezone(cal.dtz.floating)
        );
      }

      warning = true;
      stringWarning = this.l10n.formatValueSync("warning-until-date-before-start");
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
    const callback = function () {
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
  updateDateCheckboxes("todo-entrydate", "todo-has-entrydate", {
    isValid() {
      return gStartTime != null;
    },
    setDateTime(date) {
      gStartTime = date;
    },
  });
}

/**
 * Updates the due date checkboxes.
 */
function updateDueDate() {
  updateDateCheckboxes("todo-duedate", "todo-has-duedate", {
    isValid() {
      return gEndTime != null;
    },
    setDateTime(date) {
      gEndTime = date;
    },
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

  if (!window.calendarItem.isTodo()) {
    return;
  }

  // force something to get set if there was nothing there before
  aDatePickerId.value = document.getElementById(aDatePickerId).value;

  // first of all disable the datetime picker if we don't have a date
  const hasDate = document.getElementById(aCheckboxId).checked;
  aDatePickerId.disabled = !hasDate;

  // create a new datetime object if date is now checked for the first time
  if (hasDate && !aDateTime.isValid()) {
    const date = cal.dtz.jsDateToDateTime(
      document.getElementById(aDatePickerId).value,
      cal.dtz.defaultTimezone
    );
    aDateTime.setDateTime(date);
  } else if (!hasDate && aDateTime.isValid()) {
    aDateTime.setDateTime(null);
  }

  // calculate the duration if possible
  const hasEntryDate = document.getElementById("todo-has-entrydate").checked;
  const hasDueDate = document.getElementById("todo-has-duedate").checked;
  if (hasEntryDate && hasDueDate) {
    const start = cal.dtz.jsDateToDateTime(document.getElementById("todo-entrydate").value);
    const end = cal.dtz.jsDateToDateTime(document.getElementById("todo-duedate").value);
    gItemDuration = end.subtractDate(start);
  } else {
    gItemDuration = null;
  }
  document.getElementById("keepduration-button").disabled = !(hasEntryDate && hasDueDate);
  updateDateTime();
  updateTimezone();
}

/**
 * Get the item's recurrence information for displaying in dialog controls.
 *
 * @param {object} aItem - The calendar item
 * @returns {string[]} An array of two strings: [repeatType, untilDate]
 */
function getRepeatTypeAndUntilDate() {
  const recurrenceInfo = window.recurrenceInfo;
  let repeatType = "none";
  let untilDate = "forever";

  /**
   * Updates the until date (locally and globally).
   *
   * @param aRule  The recurrence rule
   */
  const updateUntilDate = aRule => {
    if (!aRule.isByCount) {
      if (aRule.isFinite) {
        gUntilDate = aRule.untilDate.clone().getInTimezone(cal.dtz.defaultTimezone);
        untilDate = cal.dtz.dateTimeToJsDate(gUntilDate.getInTimezone(cal.dtz.floating));
      } else {
        gUntilDate = null;
      }
    }
  };

  if (recurrenceInfo) {
    repeatType = "custom";
    const ritems = recurrenceInfo.getRecurrenceItems();
    const rules = [];
    const exceptions = [];
    for (const ritem of ritems) {
      if (ritem.isNegative) {
        exceptions.push(ritem);
      } else {
        rules.push(ritem);
      }
    }
    if (rules.length == 1) {
      const rule = cal.wrapInstance(rules[0], Ci.calIRecurrenceRule);
      if (rule) {
        switch (rule.type) {
          case "DAILY": {
            const byparts = [
              "BYSECOND",
              "BYMINUTE",
              "BYHOUR",
              "BYMONTHDAY",
              "BYYEARDAY",
              "BYWEEKNO",
              "BYMONTH",
              "BYSETPOS",
            ];
            if (!checkRecurrenceRule(rule, byparts)) {
              const ruleComp = rule.getComponent("BYDAY");
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
          }
          case "WEEKLY": {
            const byparts = [
              "BYSECOND",
              "BYMINUTE",
              "BYDAY",
              "BYHOUR",
              "BYMONTHDAY",
              "BYYEARDAY",
              "BYWEEKNO",
              "BYMONTH",
              "BYSETPOS",
            ];
            if (!checkRecurrenceRule(rule, byparts)) {
              const weekType = ["weekly", "bi.weekly"];
              if (
                (rule.interval == 1 || rule.interval == 2) &&
                (!rule.isFinite || !rule.isByCount)
              ) {
                repeatType = weekType[rule.interval - 1];
                updateUntilDate(rule);
              }
            }
            break;
          }
          case "MONTHLY": {
            const byparts = [
              "BYSECOND",
              "BYMINUTE",
              "BYDAY",
              "BYHOUR",
              "BYMONTHDAY",
              "BYYEARDAY",
              "BYWEEKNO",
              "BYMONTH",
              "BYSETPOS",
            ];
            if (!checkRecurrenceRule(rule, byparts)) {
              if (rule.interval == 1 && (!rule.isFinite || !rule.isByCount)) {
                repeatType = "monthly";
                updateUntilDate(rule);
              }
            }
            break;
          }
          case "YEARLY": {
            const byparts = [
              "BYSECOND",
              "BYMINUTE",
              "BYDAY",
              "BYHOUR",
              "BYMONTHDAY",
              "BYYEARDAY",
              "BYWEEKNO",
              "BYMONTH",
              "BYSETPOS",
            ];
            if (!checkRecurrenceRule(rule, byparts)) {
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
  }
  return [repeatType, untilDate];
}

/**
 * Updates the XUL UI with the repeat type and the until date.
 *
 * @param {string} aRepeatType - The type of repeat
 * @param {string} aUntilDate - The until date
 * @param {object} aItem - The calendar item
 */
function loadRepeat(aRepeatType, aUntilDate, aItem) {
  document.getElementById("item-repeat").value = aRepeatType;
  const repeatMenu = document.getElementById("item-repeat");
  gLastRepeatSelection = repeatMenu.selectedIndex;

  if (aItem.parentItem != aItem) {
    document.getElementById("item-repeat").setAttribute("disabled", "true");
    document.getElementById("repeat-until-datepicker").setAttribute("disabled", "true");
  }
  // Show the repeat-until-datepicker and set its date
  document.getElementById("repeat-untilDate").hidden = false;
  document.getElementById("repeat-details").hidden = true;
  document.getElementById("repeat-until-datepicker").value = aUntilDate;
}

/**
 * Update reminder related elements on the dialog.
 *
 * @param aSuppressDialogs     If true, controls are updated without prompting
 *                               for changes with the custom dialog
 */
function updateReminder(aSuppressDialogs) {
  window.gLastAlarmSelection = commonUpdateReminder(
    document.querySelector(".item-alarm"),
    window.calendarItem,
    window.gLastAlarmSelection,
    getCurrentCalendar(),
    document.querySelector(".reminder-details"),
    window.gStartTimezone || window.gEndTimezone,
    aSuppressDialogs
  );
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

  cal.item.setItemProperty(item, "title", document.getElementById("item-title").value);
  cal.item.setItemProperty(item, "LOCATION", document.getElementById("item-location").value);

  saveDateTime(item);

  if (item.isTodo()) {
    let percentCompleteInteger = 0;
    if (document.getElementById("percent-complete-textbox").value != "") {
      percentCompleteInteger = parseInt(
        document.getElementById("percent-complete-textbox").value,
        10
      );
    }
    if (percentCompleteInteger < 0) {
      percentCompleteInteger = 0;
    } else if (percentCompleteInteger > 100) {
      percentCompleteInteger = 100;
    }
    cal.item.setItemProperty(item, "PERCENT-COMPLETE", percentCompleteInteger);
  }

  // Categories
  saveCategories(item);

  // Attachment
  // We want the attachments to be up to date, remove all first.
  item.removeAllAttachments();

  // Now add back the new ones
  for (const hashId in gAttachMap) {
    const att = gAttachMap[hashId];
    item.addAttachment(att);
  }

  // Description
  const editorElement = document.getElementById("item-description");
  const editor = editorElement.getHTMLEditor(editorElement.contentWindow);
  if (editor.documentModified) {
    // Get editor output as HTML. We request raw output to avoid any
    // pretty-printing which may cause issues with Google Calendar (see comments
    // in calViewUtils.fixGoogleCalendarDescription() for more information).
    const mode =
      Ci.nsIDocumentEncoder.OutputRaw |
      Ci.nsIDocumentEncoder.OutputDropInvisibleBreak |
      Ci.nsIDocumentEncoder.OutputBodyOnly;

    const editorOutput = editor.outputToString("text/html", mode);

    // The editor gives us output wrapped in a body tag. We don't really want
    // that, so strip it. (Yes, it's a regex with HTML, but a _very_ specific
    // one.) We use the `s` flag to match across newlines in case there's a
    // <pre/> tag, in which case <br/> will not be inserted.
    item.descriptionHTML = editorOutput.replace(/^<body>(.+)<\/body>$/s, "$1");
  }

  // Event Status
  if (item.isEvent()) {
    if (gConfig.status && gConfig.status != "NONE") {
      item.setProperty("STATUS", gConfig.status);
    } else {
      item.deleteProperty("STATUS");
    }
  } else {
    const status = document.getElementById("todo-status").value;
    if (status != "COMPLETED") {
      item.completedDate = null;
    }
    cal.item.setItemProperty(item, "STATUS", status == "NONE" ? null : status);
  }

  // set the "PRIORITY" property if a valid priority has been
  // specified (any integer value except *null*) OR the item
  // already specifies a priority. in any other case we don't
  // need this property and can safely delete it. we need this special
  // handling since the WCAP provider always includes the priority
  // with value *null* and we don't detect changes to this item if
  // we delete this property.
  if (capSupported("priority") && (gConfig.priority || item.hasProperty("PRIORITY"))) {
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
  cal.item.setItemProperty(item, "CLASS", gConfig.privacy, "privacy");

  if (item.status == "COMPLETED" && item.isTodo()) {
    const elementValue = document.getElementById("completed-date-picker").value;
    item.completedDate = cal.dtz.jsDateToDateTime(elementValue);
  }

  saveReminder(item, getCurrentCalendar(), document.querySelector(".item-alarm"));
}

/**
 * Save date and time related values from the dialog to the passed item.
 *
 * @param item    The item to save to.
 */
function saveDateTime(item) {
  // Changes to the start date don't have to change the until date.
  untilDateCompensation(item);

  if (item.isEvent()) {
    let startTime = gStartTime.getInTimezone(gStartTimezone);
    let endTime = gEndTime.getInTimezone(gEndTimezone);
    const isAllDay = document.getElementById("event-all-day").checked;
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
    cal.item.setItemProperty(item, "startDate", startTime);
    cal.item.setItemProperty(item, "endDate", endTime);
  }
  if (item.isTodo()) {
    const startTime = gStartTime && gStartTime.getInTimezone(gStartTimezone);
    const endTime = gEndTime && gEndTime.getInTimezone(gEndTimezone);
    cal.item.setItemProperty(item, "entryDate", startTime);
    cal.item.setItemProperty(item, "dueDate", endTime);
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
  const startDate = aItem[cal.dtz.startDateProp(aItem)];

  if (aItem.recurrenceInfo) {
    const rrules = splitRecurrenceRules(aItem.recurrenceInfo);
    const rule = rrules[0][0];
    if (!rule.isByCount && rule.isFinite && startDate) {
      const compensation = startDate.subtractDate(gStartTime);
      if (compensation != "PT0S") {
        const untilDate = rule.untilDate.clone();
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
  if (window.calendarItem.isEvent()) {
    strName = window.mode == "new" ? "new-event-dialog" : "edit-event-dialog";
  } else if (window.calendarItem.isTodo()) {
    strName = window.mode == "new" ? "new-task-dialog" : "edit-task-dialog";
  } else {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }
  sendMessage({
    command: "updateTitle",
    prefix: this.l10n.formatValueSync(strName),
    title: document.getElementById("item-title").value,
  });
}

/**
 * Update the disabled status of the accept button. The button is enabled if all
 * parts of the dialog have options selected that make sense.
 * constraining factors like
 */
function updateAccept() {
  let enableAccept = true;
  const kDefaultTimezone = cal.dtz.defaultTimezone;
  let startDate;
  let endDate;
  const isEvent = window.calendarItem.isEvent();

  // don't allow for end dates to be before start dates
  if (isEvent) {
    startDate = cal.dtz.jsDateToDateTime(document.getElementById("event-starttime").value);
    endDate = cal.dtz.jsDateToDateTime(document.getElementById("event-endtime").value);
  } else {
    startDate = document.getElementById("todo-has-entrydate").checked
      ? cal.dtz.jsDateToDateTime(document.getElementById("todo-entrydate").value)
      : null;
    endDate = document.getElementById("todo-has-duedate").checked
      ? cal.dtz.jsDateToDateTime(document.getElementById("todo-duedate").value)
      : null;
  }

  if (startDate && endDate) {
    if (gTimezonesEnabled) {
      const startTimezone = gStartTimezone;
      let endTimezone = gEndTimezone;
      if (endTimezone.isUTC) {
        if (!cal.data.compareObjects(gStartTimezone, gEndTimezone)) {
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
    if (isEvent && document.getElementById("event-all-day").checked) {
      // jsDateToDateTime returns the values in UTC. Depending on the
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
  if (!window.calendarItem.isEvent()) {
    return;
  }
  const allDay = document.getElementById("event-all-day").checked;
  const kDefaultTimezone = cal.dtz.defaultTimezone;

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
      const tempStartTime = gStartTime.clone();
      const tempEndTime = gEndTime.clone();
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
      gStartTime.hour = cal.dtz.getDefaultStartDate(window.initialStartDateValue).hour;
      gEndTime.hour = gStartTime.hour;
      gEndTime.minute += Services.prefs.getIntPref("calendar.event.defaultlength", 60);
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
  gStartTimezone = allDay ? cal.dtz.floating : gOldStartTimezone;
  gEndTimezone = allDay ? cal.dtz.floating : gOldEndTimezone;
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

  if (!window.calendarItem.isEvent()) {
    return;
  }

  const allDay = document.getElementById("event-all-day").checked;
  if (allDay) {
    document.getElementById("event-starttime").setAttribute("timepickerdisabled", true);
    document.getElementById("event-endtime").setAttribute("timepickerdisabled", true);
  } else {
    document.getElementById("event-starttime").removeAttribute("timepickerdisabled");
    document.getElementById("event-endtime").removeAttribute("timepickerdisabled");
  }

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
  const item = window.calendarItem;
  const args = window.arguments[0];
  args.onNewEvent(item.calendar);
}

/**
 * Use the window arguments to cause the opener to create a new event on the
 * item's calendar
 */
function openNewTask() {
  const item = window.calendarItem;
  const args = window.arguments[0];
  args.onNewTodo(item.calendar);
}

/**
 * Update the transparency status of this dialog, depending on if the event
 * is all-day or not.
 *
 * @param allDay    If true, the event is all-day
 */
function setShowTimeAs(allDay) {
  gConfig.showTimeAs = cal.item.getEventDefaultTransparency(allDay);
  updateConfigState({ showTimeAs: gConfig.showTimeAs });
}

function editAttendees() {
  const savedWindow = window;
  const calendar = getCurrentCalendar();

  const callback = function (attendees, organizer, startTime, endTime) {
    savedWindow.attendees = attendees;
    savedWindow.organizer = organizer;

    // if a participant was added or removed we switch to the attendee
    // tab, so the user can see the change directly
    const tabs = document.getElementById("event-grid-tabs");
    const attendeeTab = document.getElementById("event-grid-tab-attendees");
    tabs.selectedItem = attendeeTab;

    const duration = endTime.subtractDate(startTime);
    startTime = startTime.clone();
    endTime = endTime.clone();
    const kDefaultTimezone = cal.dtz.defaultTimezone;
    gStartTimezone = startTime.timezone;
    gEndTimezone = endTime.timezone;
    gStartTime = startTime.getInTimezone(kDefaultTimezone);
    gEndTime = endTime.getInTimezone(kDefaultTimezone);
    gItemDuration = duration;
    updateAttendeeInterface();
    updateDateTime();
    updateAllDay();

    if (isAllDay != gStartTime.isDate) {
      setShowTimeAs(gStartTime.isDate);
    }
  };

  const startTime = gStartTime.getInTimezone(gStartTimezone);
  const endTime = gEndTime.getInTimezone(gEndTimezone);

  const isAllDay = document.getElementById("event-all-day").checked;
  if (isAllDay) {
    startTime.isDate = true;
    endTime.isDate = true;
    endTime.day += 1;
  } else {
    startTime.isDate = false;
    endTime.isDate = false;
  }
  const args = {};
  args.startTime = startTime;
  args.endTime = endTime;
  args.displayTimezone = gTimezonesEnabled;
  args.attendees = window.attendees;
  args.organizer = window.organizer && window.organizer.clone();
  args.calendar = calendar;
  args.item = window.calendarItem;
  args.onOk = callback;

  // open the dialog modally
  openDialog(
    "chrome://calendar/content/calendar-event-dialog-attendees.xhtml",
    "_blank",
    "chrome,titlebar,modal,resizable",
    args
  );
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
 * @param {object} aArg - Container
 * @param {string} aArg.privacy - (optional) The new privacy value
 * @param {short} aArg.priority - (optional) The new priority value
 * @param {string} aArg.status - (optional) The new status value
 * @param {string} aArg.showTimeAs - (optional) The new transparency value
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
      privacyValues: capValues("privacy", ["PUBLIC", "CONFIDENTIAL", "PRIVATE"]),
    });
  }

  // For tasks, do not include showTimeAs
  if (aArg.hasOwnProperty("showTimeAs") && window.calendarItem.isTodo()) {
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
  const cloudFileEnabled = Services.prefs.getBoolPref("mail.cloud_files.enabled", false);
  const cmd = document.getElementById("cmd_attach_cloud");
  const message = {
    command: "setElementAttribute",
    argument: { id: "cmd_attach_cloud", attribute: "hidden", value: null },
  };

  if (!cloudFileEnabled) {
    // If cloud file support is disabled, just hide the attach item
    cmd.hidden = true;
    message.argument.value = true;
    sendMessage(message);
    return;
  }

  const isHidden = cloudFileAccounts.configuredAccounts.length == 0;
  cmd.hidden = isHidden;
  message.argument.value = isHidden;
  sendMessage(message);

  const itemObjects = [];

  for (const cloudProvider of cloudFileAccounts.configuredAccounts) {
    // Create a serializable object to pass in a message outside the iframe
    const itemObject = {};
    itemObject.displayName = cloudFileAccounts.getDisplayName(cloudProvider);
    itemObject.label = cal.l10n.getString("calendar-event-dialog", "attachViaFilelink", [
      itemObject.displayName,
    ]);
    itemObject.cloudProviderAccountKey = cloudProvider.accountKey;
    if (cloudProvider.iconURL) {
      itemObject.class = "menuitem-iconic";
      itemObject.image = cloudProvider.iconURL;
    }

    itemObjects.push(itemObject);

    // Create a menu item from the serializable object
    const item = document.createXULElement("menuitem");
    item.setAttribute("label", itemObject.label);
    item.setAttribute("observes", "cmd_attach_cloud");
    item.setAttribute(
      "oncommand",
      "attachFile(event.target.cloudProvider); event.stopPropagation();"
    );

    if (itemObject.class) {
      item.setAttribute("class", itemObject.class);
      item.setAttribute("image", itemObject.image);
    }

    // Add the menu item to places inside the iframe where we advertise cloud providers
    const attachmentPopup = document.getElementById("attachment-popup");
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
    const result = { value: "http://" };
    const confirm = Services.prompt.prompt(
      window,
      cal.l10n.getString("calendar-event-dialog", "specifyLinkLocation"),
      cal.l10n.getString("calendar-event-dialog", "enterLinkLocation"),
      result,
      null,
      { value: 0 }
    );

    if (confirm) {
      try {
        // If something bogus was entered, Services.io.newURI may fail.
        const attachment = new CalAttachment();
        attachment.uri = Services.io.newURI(result.value);
        addAttachment(attachment);
        // we switch to the attachment tab if it is not already displayed
        // to allow the user to see the attachment was added
        const tabs = document.getElementById("event-grid-tabs");
        const attachTab = document.getElementById("event-grid-tab-attachments");
        tabs.selectedItem = attachTab;
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
 * @param {string} aAccountKey - The accountKey for a cloud provider
 */
function attachFileByAccountKey(aAccountKey) {
  for (const cloudProvider of cloudFileAccounts.configuredAccounts) {
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
    cal.ERROR(
      "[calendar-event-dialog] Could not attach file without cloud provider" + cal.STACK(10)
    );
  }

  const filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  filePicker.init(
    window.browsingContext,
    cal.l10n.getString("calendar-event-dialog", "selectAFile"),
    Ci.nsIFilePicker.modeOpenMultiple
  );

  // Check for the last directory
  const lastDir = lastDirectory();
  if (lastDir) {
    filePicker.displayDirectory = lastDir;
  }

  filePicker.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK || !filePicker.files) {
      return;
    }

    // Create the attachment
    for (const file of filePicker.files) {
      const fileHandler = Services.io
        .getProtocolHandler("file")
        .QueryInterface(Ci.nsIFileProtocolHandler);
      const uriSpec = fileHandler.getURLSpecFromActualFile(file);

      if (!(uriSpec in gAttachMap)) {
        // If the attachment hasn't been added, then set the last display
        // directory.
        lastDirectory(uriSpec);

        // ... and add the attachment.
        const attachment = new CalAttachment();
        if (cloudProvider) {
          attachment.uri = Services.io.newURI(uriSpec);
        } else {
          // TODO read file into attachment
        }
        addAttachment(attachment, cloudProvider);
      }
    }
  });
}

/**
 * Helper function to remember the last directory chosen when attaching files.
 *
 * @param aFileUri    (optional) If passed, the last directory will be set and
 *                                 returned. If null, the last chosen directory
 *                                 will be returned.
 * @returns The last directory that was set with this function.
 */
function lastDirectory(aFileUri) {
  if (aFileUri) {
    // Act similar to a setter, save the passed uri.
    const uri = Services.io.newURI(aFileUri);
    const file = uri.QueryInterface(Ci.nsIFileURL).file;
    lastDirectory.mValue = file.parent.QueryInterface(Ci.nsIFile);
  }

  // In any case, return the value
  return lastDirectory.mValue === undefined ? null : lastDirectory.mValue;
}

/**
 * Turns an url into a string that can be used in UI.
 * - For a file:// url, shows the filename.
 * - For a http:// url, removes protocol and trailing slash
 *
 * @param aUri    The uri to parse.
 * @returns A string that can be used in UI.
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
 * @param attachment        A calIAttachment to upload.
 * @param cloudFileAccount  The cloud file account used for uploading.
 * @param listItem          The listitem in attachment-link listbox to update.
 */
function uploadCloudAttachment(attachment, cloudFileAccount, listItem) {
  const file = attachment.uri.QueryInterface(Ci.nsIFileURL).file;
  const image = listItem.querySelector("img");
  listItem.attachCloudFileAccount = cloudFileAccount;
  image.setAttribute("src", "chrome://global/skin/icons/loading.png");
  // WebExtension APIs do not support calendar tabs.
  cloudFileAccount.uploadFile(null, file, attachment.name).then(
    upload => {
      delete gAttachMap[attachment.hashId];
      attachment.uri = Services.io.newURI(upload.url);
      attachment.setParameter("FILENAME", file.leafName);
      attachment.setParameter("X-SERVICE-ICONURL", upload.serviceIcon);
      listItem.setAttribute("label", file.leafName);
      gAttachMap[attachment.hashId] = attachment;
      image.setAttribute("src", upload.serviceIcon);
      listItem.attachCloudFileUpload = upload;
      updateAttachment();
    },
    statusCode => {
      cal.ERROR(
        "[calendar-event-dialog] Uploading cloud attachment failed. Status code: " +
          statusCode.result
      );

      // Uploading failed. First of all, show an error icon. Also,
      // delete it from the attach map now, this will make sure it is
      // not serialized if the user saves.
      image.setAttribute("src", "chrome://messenger/skin/icons/error.png");
      delete gAttachMap[attachment.hashId];

      // Keep the item for a while so the user can see something failed.
      // When we have a nice notification bar, we can show more info
      // about the failure.
      setTimeout(() => {
        listItem.remove();
        updateAttachment();
      }, 5000);
    }
  );
}

/**
 * Adds the given attachment to dialog controls.
 *
 * @param attachment    The calIAttachment object to add
 * @param cloudFileAccount (optional) If set, the given cloud file account will be used.
 */
function addAttachment(attachment, cloudFileAccount) {
  if (!attachment || !attachment.hashId || attachment.hashId in gAttachMap) {
    return;
  }

  // We currently only support uri attachments
  if (attachment.uri) {
    const documentLink = document.getElementById("attachment-link");
    const listItem = document.createXULElement("richlistitem");
    const image = document.createElement("img");
    image.setAttribute("alt", "");
    image.width = "24";
    image.height = "24";
    // Allow the moz-icon src to be invalid.
    image.classList.add("invisible-on-broken");
    listItem.appendChild(image);
    const label = document.createXULElement("label");
    label.setAttribute("value", makePrettyName(attachment.uri));
    label.setAttribute("crop", "end");
    listItem.appendChild(label);
    listItem.setAttribute("tooltiptext", attachment.uri.spec);
    if (cloudFileAccount) {
      if (attachment.uri.schemeIs("file")) {
        // Its still a local url, needs to be uploaded
        image.setAttribute("src", "chrome://messenger/skin/icons/connecting.png");
        uploadCloudAttachment(attachment, cloudFileAccount, listItem);
      } else {
        const cloudFileIconURL = attachment.getParameter("X-SERVICE-ICONURL");
        image.setAttribute("src", cloudFileIconURL);
        const leafName = attachment.getParameter("FILENAME");
        if (leafName) {
          listItem.setAttribute("label", leafName);
        }
      }
    } else if (attachment.uri.schemeIs("file")) {
      image.setAttribute("src", "moz-icon://" + attachment.uri.spec);
    } else {
      const leafName = attachment.getParameter("FILENAME");
      const cloudFileIconURL = attachment.getParameter("X-SERVICE-ICONURL");
      const cloudFileEnabled = Services.prefs.getBoolPref("mail.cloud_files.enabled", false);

      if (leafName) {
        // TODO security issues?
        listItem.setAttribute("label", leafName);
      }
      if (cloudFileIconURL && cloudFileEnabled) {
        image.setAttribute("src", cloudFileIconURL);
      } else {
        let iconSrc = attachment.uri.spec.length ? attachment.uri.spec : "dummy.html";
        if (attachment.formatType) {
          iconSrc = "goat?contentType=" + attachment.formatType;
        } else {
          // let's try to auto-detect
          const parts = iconSrc.substr(attachment.uri.scheme.length + 2).split("/");
          if (parts.length) {
            iconSrc = parts[parts.length - 1];
          }
        }
        image.setAttribute("src", "moz-icon://" + iconSrc);
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
  const documentLink = document.getElementById("attachment-link");
  const item = documentLink.selectedItem;
  delete gAttachMap[item.attachment.hashId];

  if (item.attachCloudFileAccount && item.attachCloudFileUpload) {
    try {
      // WebExtension APIs do not support calendar tabs.
      item.attachCloudFileAccount
        .deleteFile(null, item.attachCloudFileUpload.id)
        .catch(statusCode => {
          // TODO With a notification bar, we could actually show this error.
          cal.ERROR(
            "[calendar-event-dialog] Deleting cloud attachment " +
              "failed, file will remain on server. " +
              " Status code: " +
              statusCode
          );
        });
    } catch (e) {
      cal.ERROR(
        "[calendar-event-dialog] Deleting cloud attachment " +
          "failed, file will remain on server. " +
          "Exception: " +
          e
      );
    }
  }
  item.remove();

  updateAttachment();
}

/**
 * Removes all attachments from the dialog controls.
 */
function deleteAllAttachments() {
  const documentLink = document.getElementById("attachment-link");
  const itemCount = documentLink.getRowCount();
  let canRemove = itemCount < 2;

  if (itemCount > 1) {
    const removeText = PluralForm.get(
      itemCount,
      cal.l10n.getString("calendar-event-dialog", "removeAttachmentsText")
    );
    const removeTitle = cal.l10n.getString("calendar-event-dialog", "removeCalendarsTitle");
    canRemove = Services.prompt.confirm(
      window,
      removeTitle,
      removeText.replace("#1", itemCount),
      {}
    );
  }

  if (canRemove) {
    while (documentLink.lastChild) {
      documentLink.lastChild.attachment = null;
      documentLink.lastChild.remove();
    }
    gAttachMap = {};
  }
  updateAttachment();
}

/**
 * Opens the selected attachment using the external protocol service.
 *
 * @see nsIExternalProtocolService
 */
function openAttachment() {
  // Only one file has to be selected and we don't handle base64 files at all
  const documentLink = document.getElementById("attachment-link");
  if (documentLink.selectedItem) {
    const attURI = documentLink.selectedItem.attachment.uri;
    const externalLoader = Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(
      Ci.nsIExternalProtocolService
    );
    // TODO There should be a nicer dialog
    externalLoader.loadURI(attURI);
  }
}

/**
 * Copies the link location of the first selected attachment to the clipboard
 */
function copyAttachment() {
  const documentLink = document.getElementById("attachment-link");
  if (documentLink.selectedItem) {
    const attURI = documentLink.selectedItem.attachment.uri.spec;
    const clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
    clipboard.copyString(attURI);
  }
}

/**
 * Handler function to handle pressing keys in the attachment listbox.
 *
 * @param aEvent     The DOM event caused by the key press.
 */
function attachmentLinkKeyPress(aEvent) {
  switch (aEvent.key) {
    case "Backspace":
    case "Delete":
      deleteAttachment();
      break;
    case "Enter":
      openAttachment();
      aEvent.preventDefault();
      break;
  }
}

/**
 * Handler function to take care of double clicking on an attachment
 *
 * @param aEvent     The DOM event caused by the clicking.
 */
function attachmentDblClick(aEvent) {
  let item = aEvent.target;
  while (item && item.localName != "richlistbox" && item.localName != "richlistitem") {
    item = item.parentNode;
  }

  // left double click on a list item
  if (item.localName == "richlistitem" && aEvent.button == 0) {
    openAttachment();
  }
}

/**
 * Handler function to take care of right clicking on an attachment or the attachment list
 *
 * @param aEvent     The DOM event caused by the clicking.
 */
function attachmentClick(aEvent) {
  let item = aEvent.target.triggerNode;
  while (item && item.localName != "richlistbox" && item.localName != "richlistitem") {
    item = item.parentNode;
  }

  for (const node of aEvent.target.children) {
    if (item.localName == "richlistitem" || node.id == "attachment-popup-attachPage") {
      node.removeAttribute("hidden");
    } else {
      node.setAttribute("hidden", "true");
    }
  }
}

/**
 * Helper function to show a notification in the event-dialog's notificationbox
 *
 * @param aMessage     the message text to show
 * @param aValue       string identifying the notification
 * @param aPriority    (optional) the priority of the warning (info, critical), default is 'warn'
 * @param aImage       (optional) URL of image to appear on the notification
 * @param aButtonset   (optional) array of button descriptions to appear on the notification
 * @param aCallback    (optional) a function to handle events from the notificationbox
 */
async function notifyUser(aMessage, aValue, aPriority, aImage, aButtonset, aCallback) {
  // only append, if the notification does not already exist
  if (gEventNotification.getNotificationWithValue(aValue) == null) {
    const prioMap = {
      info: gEventNotification.PRIORITY_INFO_MEDIUM,
      critical: gEventNotification.PRIORITY_CRITICAL_MEDIUM,
    };
    const prio = prioMap[aPriority] || gEventNotification.PRIORITY_WARNING_MEDIUM;
    await gEventNotification.appendNotification(
      aValue,
      {
        label: aMessage,
        image: aImage,
        priority: prio,
        eventCallback: aCallback,
      },
      aButtonset
    );
  }
}

/**
 * Remove a notification from the notifiactionBox
 *
 * @param {string} aValue - string identifying the notification to remove
 */
function removeNotification(aValue) {
  const notification = gEventNotification.getNotificationWithValue(aValue);
  if (notification) {
    gEventNotification.removeNotification(notification);
  }
}

/**
 * Update the dialog controls related to the item's calendar.
 */
function updateCalendar() {
  let item = window.calendarItem;
  const calendar = getCurrentCalendar();

  const cssSafeId = cal.view.formatStringForCSSRule(calendar.id);
  document
    .getElementById("item-calendar")
    .style.setProperty("--item-color", `var(--calendar-${cssSafeId}-backcolor)`);

  gIsReadOnly = calendar.readOnly;

  if (!gPreviousCalendarId) {
    gPreviousCalendarId = item.calendar.id;
  }

  // We might have to change the organizer, let's see
  const calendarOrgId = calendar.getProperty("organizerId");
  if (window.organizer && calendarOrgId && calendar.id != gPreviousCalendarId) {
    window.organizer.id = calendarOrgId;
    window.organizer.commonName = calendar.getProperty("organizerCN");
    gPreviousCalendarId = calendar.id;
    updateAttendeeInterface();
  }

  if (!canNotifyAttendees(calendar, item) && calendar.getProperty("imip.identity")) {
    document.getElementById("notify-attendees-checkbox").removeAttribute("disabled");
    document.getElementById("undisclose-attendees-checkbox").removeAttribute("disabled");
  } else {
    document.getElementById("notify-attendees-checkbox").setAttribute("disabled", "true");
    document.getElementById("undisclose-attendees-checkbox").setAttribute("disabled", "true");
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
    const disableElements = document.getElementsByAttribute("disable-on-readonly", "true");
    for (const element of disableElements) {
      if (element.namespaceURI == "http://www.w3.org/1999/xhtml") {
        element.setAttribute("disabled", "disabled");
      } else {
        element.setAttribute("disabled", "true");
      }

      // we mark link-labels with the hyperlink attribute, since we need
      // to remove their class in case they get disabled. TODO: it would
      // be better to create a small binding for those link-labels
      // instead of adding those special stuff.
      if (element.hasAttribute("hyperlink")) {
        element.removeAttribute("class");
        element.removeAttribute("onclick");
      }
    }

    const collapseElements = document.getElementsByAttribute("collapse-on-readonly", "true");
    for (const element of collapseElements) {
      element.setAttribute("collapsed", "true");
    }
  } else {
    sendMessage({ command: "removeDisableAndCollapseOnReadonly" });

    const enableElements = document.getElementsByAttribute("disable-on-readonly", "true");
    for (const element of enableElements) {
      element.removeAttribute("disabled");
      if (element.hasAttribute("hyperlink")) {
        element.classList.add("text-link");
      }
    }

    const collapseElements = document.getElementsByAttribute("collapse-on-readonly", "true");
    for (const element of collapseElements) {
      element.removeAttribute("collapsed");
    }

    if (item.isTodo()) {
      // Task completed date
      if (item.completedDate) {
        updateToDoStatus(item.status, cal.dtz.dateTimeToJsDate(item.completedDate));
      } else {
        updateToDoStatus(item.status);
      }
    }

    // disable repeat menupopup if this is an occurrence
    item = window.calendarItem;
    if (item.parentItem != item) {
      document.getElementById("item-repeat").setAttribute("disabled", "true");
      document.getElementById("repeat-until-datepicker").setAttribute("disabled", "true");
      const repeatDetails = document.getElementById("repeat-details");
      const numChilds = repeatDetails.children.length;
      for (let i = 0; i < numChilds; i++) {
        const node = repeatDetails.children[i];
        node.setAttribute("disabled", "true");
        node.removeAttribute("class");
        node.removeAttribute("onclick");
      }
    }

    // If the item is a proxy occurrence/instance, a few things aren't
    // valid.
    if (item.parentItem != item) {
      document.getElementById("item-calendar").setAttribute("disabled", "true");

      // don't allow to revoke the entrydate of recurring todo's.
      disableElementWithLock("todo-has-entrydate", "permanent-lock");
    }

    // update datetime pickers, disable checkboxes if dates are required by
    // recurrence or reminders.
    updateRepeat(true);
    updateReminder(true);
    updateAllDay();
  }

  // Make sure capabilities are reflected correctly
  updateCapabilities();
}

/**
 * Opens the recurrence dialog modally to allow the user to edit the recurrence
 * rules.
 */
function editRepeat() {
  const args = {};
  args.calendarEvent = window.calendarItem;
  args.recurrenceInfo = window.recurrenceInfo;
  args.startTime = gStartTime;
  args.endTime = gEndTime;

  const savedWindow = window;
  args.onOk = function (recurrenceInfo) {
    savedWindow.recurrenceInfo = recurrenceInfo;
  };

  window.setCursor("wait");

  // open the dialog modally
  openDialog(
    "chrome://calendar/content/calendar-event-dialog-recurrence.xhtml",
    "_blank",
    "chrome,titlebar,modal,resizable,centerscreen",
    args
  );
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
    if (item.isTodo()) {
      // automatically check 'has entrydate' if needed.
      if (!document.getElementById("todo-has-entrydate").checked) {
        document.getElementById("todo-has-entrydate").checked = true;

        // make sure gStartTime is properly initialized
        updateEntryDate();
      }

      // disable the checkbox to indicate that we need
      // the entry-date. the 'disabled' state will be
      // revoked if the user turns off the repeat pattern.
      disableElementWithLock("todo-has-entrydate", "repeat-lock");
    }
  }

  const repeatMenu = document.getElementById("item-repeat");
  const repeatValue = repeatMenu.selectedItem.getAttribute("value");
  const repeatUntilDate = document.getElementById("repeat-untilDate");
  const repeatDetails = document.getElementById("repeat-details");

  if (repeatValue == "none") {
    repeatUntilDate.hidden = true;
    repeatDetails.hidden = true;
    window.recurrenceInfo = null;
    const item = window.calendarItem;
    if (item.isTodo()) {
      enableElementWithLock("todo-has-entrydate", "repeat-lock");
    }
  } else if (repeatValue == "custom") {
    // the user selected custom repeat pattern. we now need to bring
    // up the appropriate dialog in order to let the user specify the
    // new rule. First of all, retrieve the item we want to specify
    // the custom repeat pattern for.
    const item = window.calendarItem;

    setUpEntrydateForTask(item);

    // retrieve the current recurrence info, we need this
    // to find out whether or not the user really created
    // a new repeat pattern.
    const recurrenceInfo = window.recurrenceInfo;

    // now bring up the recurrence dialog.
    // don't pop up the dialog if aSuppressDialogs was specified or if
    // called during initialization of the dialog.
    if (!aSuppressDialogs && repeatMenu.hasAttribute("last-value")) {
      editRepeat();
    }

    // Assign gUntilDate on the first run or when returning from the
    // edit recurrence dialog.
    if (window.recurrenceInfo) {
      const rrules = splitRecurrenceRules(window.recurrenceInfo);
      const rule = rrules[0][0];
      gUntilDate = null;
      if (!rule.isByCount && rule.isFinite && rule.untilDate) {
        gUntilDate = rule.untilDate.clone().getInTimezone(cal.dtz.defaultTimezone);
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
      if (item.isTodo()) {
        if (!window.recurrenceInfo) {
          enableElementWithLock("todo-has-entrydate", "repeat-lock");
        }
      }
    } else {
      repeatUntilDate.hidden = true;
      repeatDetails.hidden = false;
      // From the Edit Recurrence dialog, the rules "every day" and
      // "every weekday" don't need the recurrence details text when they
      // have only the until date. The getRepeatTypeAndUntilDate()
      // function verifies whether this is the case.
      const [repeatType, untilDate] = getRepeatTypeAndUntilDate(item);
      loadRepeat(repeatType, untilDate, window.calendarItem);
    }
  } else {
    const item = window.calendarItem;
    let recurrenceInfo = window.recurrenceInfo || item.recurrenceInfo;
    const proposedUntilDate = (gStartTime || window.initialStartDateValue).clone();

    if (recurrenceInfo) {
      recurrenceInfo = recurrenceInfo.clone();
      const rrules = splitRecurrenceRules(recurrenceInfo);
      const rule = rrules[0][0];

      // If the previous rule was "custom" we have to recover the until
      // date, or the last occurrence's date in order to set the
      // repeat-until-datepicker with the same date.
      if (aItemRepeatCall && repeatUntilDate.hidden && !repeatDetails.hidden) {
        let repeatDate;
        if (!rule.isByCount || !rule.isFinite) {
          if (rule.isFinite) {
            repeatDate = rule.untilDate.getInTimezone(cal.dtz.floating);
            repeatDate = cal.dtz.dateTimeToJsDate(repeatDate);
          } else {
            repeatDate = "forever";
          }
        } else {
          // Try to recover the last occurrence in 10(?) years.
          const endDate = gStartTime.clone();
          endDate.year += 10;
          let lastOccurrenceDate = null;
          const dates = recurrenceInfo.getOccurrenceDates(gStartTime, endDate, 0);
          if (dates) {
            lastOccurrenceDate = dates[dates.length - 1];
          }
          repeatDate = (lastOccurrenceDate || proposedUntilDate).getInTimezone(cal.dtz.floating);
          repeatDate = cal.dtz.dateTimeToJsDate(repeatDate);
        }
        document.getElementById("repeat-until-datepicker").value = repeatDate;
      }
      if (rrules[0].length > 0) {
        recurrenceInfo.deleteRecurrenceItem(rule);
      }
    } else {
      // New event proposes "forever" as default until date.
      recurrenceInfo = new CalRecurrenceInfo(item);
      document.getElementById("repeat-until-datepicker").value = "forever";
    }

    repeatUntilDate.hidden = false;
    repeatDetails.hidden = true;

    const recRule = cal.createRecurrenceRule();
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
        recRule.setComponent("BYDAY", [2, 3, 4, 5, 6]);
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

    if (item.isTodo()) {
      if (!document.getElementById("todo-has-entrydate").checked) {
        document.getElementById("todo-has-entrydate").checked = true;
      }
      disableElementWithLock("todo-has-entrydate", "repeat-lock");
    }

    // Preset the until-datepicker's minimonth to the start date.
    const startDate = cal.dtz.dateTimeToJsDate(gStartTime.getInTimezone(cal.dtz.floating));
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
    const recurrenceInfo = window.recurrenceInfo;
    if (!recurrenceInfo) {
      return;
    }
    const rrules = splitRecurrenceRules(recurrenceInfo);
    recRule = rrules[0][0];
  }
  const defaultTimezone = cal.dtz.defaultTimezone;
  let repeatUntilDate = null;

  const itemRepeat = document.getElementById("item-repeat").selectedItem.value;
  if (itemRepeat == "none") {
    return;
  } else if (itemRepeat == "custom") {
    repeatUntilDate = gUntilDate;
  } else {
    const untilDatepickerDate = document.getElementById("repeat-until-datepicker").value;
    if (untilDatepickerDate != "forever") {
      repeatUntilDate = cal.dtz.jsDateToDateTime(untilDatepickerDate, defaultTimezone);
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
    // Rule that recurs forever or with a "count" number of recurrences.
    gUntilDate = null;
  }
}

/**
 * Updates the UI controls related to a task's completion status.
 *
 * @param {string} aStatus - The item's completion status or a string
 *                               that allows to identify a change in the
 *                               percent-complete's textbox.
 * @param {Date} aCompletedDate - The item's completed date (as a JSDate).
 */
function updateToDoStatus(aStatus, aCompletedDate = null) {
  // RFC2445 doesn't support completedDates without the todo's status
  // being "COMPLETED", however twiddling the status menulist shouldn't
  // destroy that information at this point (in case you change status
  // back to COMPLETED). When we go to store this VTODO as .ics the
  // date will get lost.

  // remember the original values
  let oldPercentComplete = parseInt(document.getElementById("percent-complete-textbox").value, 10);
  const oldCompletedDate = document.getElementById("completed-date-picker").value;

  // If the percent completed has changed to 100 or from 100 to another
  // value, the status must change.
  if (aStatus == "percent-changed") {
    const selectedIndex = document.getElementById("todo-status").selectedIndex;
    const menuItemCompleted = selectedIndex == 3;
    const menuItemNotSpecified = selectedIndex == 0;
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
      document.getElementById("percent-complete-textbox").setAttribute("disabled", "true");
      document.getElementById("percent-complete-label").setAttribute("disabled", "true");
      break;
    case "CANCELLED":
      document.getElementById("todo-status").selectedIndex = 4;
      document.getElementById("percent-complete-textbox").setAttribute("disabled", "true");
      document.getElementById("percent-complete-label").setAttribute("disabled", "true");
      break;
    case "COMPLETED":
      document.getElementById("todo-status").selectedIndex = 3;
      document.getElementById("percent-complete-textbox").removeAttribute("disabled");
      document.getElementById("percent-complete-label").removeAttribute("disabled");
      // if there is no aCompletedDate, set it to the previous value
      if (!aCompletedDate) {
        aCompletedDate = oldCompletedDate;
      }
      break;
    case "IN-PROCESS":
      document.getElementById("todo-status").selectedIndex = 2;
      document.getElementById("completed-date-picker").setAttribute("disabled", "true");
      document.getElementById("percent-complete-textbox").removeAttribute("disabled");
      document.getElementById("percent-complete-label").removeAttribute("disabled");
      break;
    case "NEEDS-ACTION":
      document.getElementById("todo-status").selectedIndex = 1;
      document.getElementById("percent-complete-textbox").removeAttribute("disabled");
      document.getElementById("percent-complete-label").removeAttribute("disabled");
      break;
  }

  let newPercentComplete;
  if ((aStatus == "IN-PROCESS" || aStatus == "NEEDS-ACTION") && oldPercentComplete == 100) {
    newPercentComplete = 0;
    document.getElementById("completed-date-picker").value = oldCompletedDate;
    document.getElementById("completed-date-picker").setAttribute("disabled", "true");
  } else if (aStatus == "COMPLETED") {
    newPercentComplete = 100;
    document.getElementById("completed-date-picker").value = aCompletedDate;
    document.getElementById("completed-date-picker").removeAttribute("disabled");
  } else {
    newPercentComplete = oldPercentComplete;
    document.getElementById("completed-date-picker").value = oldCompletedDate;
    document.getElementById("completed-date-picker").setAttribute("disabled", "true");
  }

  gConfig.percentComplete = newPercentComplete;
  document.getElementById("percent-complete-textbox").value = newPercentComplete;
  if (gInTab) {
    sendMessage({
      command: "updateConfigState",
      argument: { percentComplete: newPercentComplete },
    });
  }
}

/**
 * Saves all dialog controls back to the item.
 *
 * @returns a copy of the original item with changes made.
 */
function saveItem() {
  // we need to clone the item in order to apply the changes.
  // it is important to not apply the changes to the original item
  // (even if it happens to be mutable) in order to guarantee
  // that providers see a proper oldItem/newItem pair in case
  // they rely on this fact (e.g. WCAP does).
  const originalItem = window.calendarItem;
  const item = originalItem.clone();

  // override item's recurrenceInfo *before* serializing date/time-objects.
  if (!item.recurrenceId) {
    item.recurrenceInfo = window.recurrenceInfo;
  }

  // serialize the item
  saveDialog(item);

  item.organizer = window.organizer;

  item.removeAllAttendees();
  if (window.attendees && window.attendees.length > 0) {
    for (const attendee of window.attendees) {
      item.addAttendee(attendee);
    }

    const notifyCheckbox = document.getElementById("notify-attendees-checkbox");
    if (notifyCheckbox.disabled) {
      item.deleteProperty("X-MOZ-SEND-INVITATIONS");
    } else {
      item.setProperty("X-MOZ-SEND-INVITATIONS", notifyCheckbox.checked ? "TRUE" : "FALSE");
    }
    const undiscloseCheckbox = document.getElementById("undisclose-attendees-checkbox");
    if (undiscloseCheckbox.disabled) {
      item.deleteProperty("X-MOZ-SEND-INVITATIONS-UNDISCLOSED");
    } else {
      item.setProperty(
        "X-MOZ-SEND-INVITATIONS-UNDISCLOSED",
        undiscloseCheckbox.checked ? "TRUE" : "FALSE"
      );
    }
    const disallowcounterCheckbox = document.getElementById("disallow-counter-checkbox");
    const xProp = window.calendarItem.getProperty("X-MICROSOFT-DISALLOW-COUNTER");
    // we want to leave an existing x-prop in case the checkbox is disabled as we need to
    // roundtrip x-props that are not exclusively under our control
    if (!disallowcounterCheckbox.disabled) {
      // we only set the prop if we need to
      if (disallowcounterCheckbox.checked) {
        item.setProperty("X-MICROSOFT-DISALLOW-COUNTER", "TRUE");
      } else if (xProp) {
        item.setProperty("X-MICROSOFT-DISALLOW-COUNTER", "FALSE");
      }
    }
  }

  // We check if the organizerID is different from our
  // calendar-user-address-set. The organzerID is the owner of the calendar.
  // If it's different, that is because someone is acting on behalf of
  // the organizer.
  if (item.organizer && item.calendar.aclEntry) {
    const userAddresses = item.calendar.aclEntry.getUserAddresses();
    if (
      userAddresses.length > 0 &&
      !cal.email.attendeeMatchesAddresses(item.organizer, userAddresses)
    ) {
      const organizer = item.organizer.clone();
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

  const originalItem = window.calendarItem;
  const item = saveItem();
  const calendar = getCurrentCalendar();
  adaptScheduleAgent(item);

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
  const listener = {
    onTransactionComplete(aItem) {
      const aId = aItem.id;
      const aCalendar = aItem.calendar;
      // Check if the current window has a calendarItem first, because in case of undo
      // window refers to the main window and we would get a 'calendarItem is undefined' warning.
      if (!aIsClosing && "calendarItem" in window) {
        // If we changed the calendar of the item, onOperationComplete will be called multiple
        // times. We need to make sure we're receiving the update on the right calendar.
        if (
          (!window.calendarItem.id || aId == window.calendarItem.id) &&
          aCalendar.id == window.calendarItem.calendar.id
        ) {
          if (window.calendarItem.recurrenceId) {
            // TODO This workaround needs to be removed in bug 396182
            // We are editing an occurrence. Make sure that the returned
            // item is the same occurrence, not its parent item.
            const occ = aItem.recurrenceInfo.getOccurrenceFor(window.calendarItem.recurrenceId);
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
      // this triggers the update of the imipbar in case this is a rescheduling case
      if (window.counterProposal && window.counterProposal.onReschedule) {
        window.counterProposal.onReschedule();
      }
    },
    onGetResult() {},
  };
  const resp = document.getElementById("notify-attendees-checkbox").checked
    ? Ci.calIItipItem.AUTO
    : Ci.calIItipItem.NONE;
  const extResponse = { responseMode: resp };
  window.onAcceptCallback(item, calendar, originalItem, listener, extResponse);
}

/**
 * This function is called when the user chooses to delete an Item
 * from the Event/Task dialog
 *
 */
function onCommandDeleteItem() {
  // only ask for confirmation, if the User changed anything on a new item or we modify an existing item
  if (isItemChanged() || window.mode != "new") {
    if (!cal.window.promptDeleteItems(window.calendarItem, true)) {
      return;
    }
  }

  if (window.mode == "new") {
    cancelItem();
  } else {
    const deleteListener = {
      // when deletion of item is complete, close the dialog
      onTransactionComplete(item) {
        // Check if the current window has a calendarItem first, because in case of undo
        // window refers to the main window and we would get a 'calendarItem is undefined' warning.
        if ("calendarItem" in window) {
          if (item.id == window.calendarItem.id) {
            cancelItem();
          } else {
            eventDialogCalendarObserver.observe(window.calendarItem.calendar);
          }
        }
      },
    };

    eventDialogCalendarObserver.cancel();
    if (window.calendarItem.parentItem.recurrenceInfo && window.calendarItem.recurrenceId) {
      // if this is a single occurrence of a recurring item
      if (countOccurrences(window.calendarItem) == 1) {
        // this is the last occurrence, hence we delete the parent item
        // to not leave a parent item without children in the calendar
        gMainWindow.doTransaction(
          "delete",
          window.calendarItem.parentItem,
          window.calendarItem.calendar,
          null,
          deleteListener
        );
      } else {
        // we just need to remove the occurrence
        const newItem = window.calendarItem.parentItem.clone();
        newItem.recurrenceInfo.removeOccurrenceAt(window.calendarItem.recurrenceId);
        gMainWindow.doTransaction(
          "modify",
          newItem,
          newItem.calendar,
          window.calendarItem.parentItem,
          deleteListener
        );
      }
    } else {
      gMainWindow.doTransaction(
        "delete",
        window.calendarItem,
        window.calendarItem.calendar,
        null,
        deleteListener
      );
    }
  }
}

/**
 * Postpone the task's start date/time and due date/time. ISO 8601
 * format: "PT1H", "P1D", and "P1W" are 1 hour, 1 day, and 1 week. (We
 * use this format intentionally instead of a calIDuration object because
 * those objects cannot be serialized for message passing with iframes.)
 *
 * @param {string} aDuration - A duration in ISO 8601 format
 */
function postponeTask(aDuration) {
  const duration = cal.createDuration(aDuration);
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
  editTimezone(
    "timezone-starttime",
    gStartTime.getInTimezone(gStartTimezone),
    editStartTimezone.complete
  );
}
editStartTimezone.complete = function (datetime) {
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
  editTimezone("timezone-endtime", gEndTime.getInTimezone(gEndTimezone), editEndTimezone.complete);
}
editEndTimezone.complete = function (datetime) {
  gEndTimezone = datetime.timezone;
  updateDateTime();
};

/**
 * Called to choose a recent timezone from the timezone popup.
 *
 * @param event     The event with a target that holds the timezone id value.
 */
function chooseRecentTimezone(event) {
  const tzid = event.target.value;
  const timezonePopup = document.getElementById("timezone-popup");

  if (tzid != "custom") {
    const zone = cal.timezoneService.getTimezone(tzid);
    const datetime = timezonePopup.dateTime.getInTimezone(zone);
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

  const timezonePopup = document.getElementById("timezone-popup");
  const timezoneDefaultItem = document.getElementById("timezone-popup-defaulttz");
  const timezoneSeparator = document.getElementById("timezone-popup-menuseparator");
  const defaultTimezone = cal.dtz.defaultTimezone;
  const recentTimezones = cal.dtz.getRecentTimezones(true);

  // Set up the right editTimezone function, so the custom item can use it.
  timezonePopup.editTimezone = editFunc;
  timezonePopup.dateTime = dateTime;

  // Set up the default timezone item
  timezoneDefaultItem.value = defaultTimezone.tzid;
  timezoneDefaultItem.label = defaultTimezone.displayName;

  // Clear out any old recent timezones
  while (timezoneDefaultItem.nextElementSibling != timezoneSeparator) {
    timezoneDefaultItem.nextElementSibling.remove();
  }

  // Fill in the new recent timezones
  for (const timezone of recentTimezones) {
    const menuItem = document.createXULElement("menuitem");
    menuItem.setAttribute("value", timezone.tzid);
    menuItem.setAttribute("label", timezone.displayName);
    timezonePopup.insertBefore(menuItem, timezoneDefaultItem.nextElementSibling);
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
  if (document.getElementById(aElementId).hasAttribute("disabled")) {
    return;
  }

  // prepare the arguments that will be passed to the dialog
  const args = {};
  args.time = aDateTime;
  args.calendar = getCurrentCalendar();
  args.onOk = function (datetime) {
    cal.dtz.saveRecentTimezone(datetime.timezone.tzid);
    return aCallback(datetime);
  };

  // open the dialog modally
  openDialog(
    "chrome://calendar/content/calendar-event-dialog-timezone.xhtml",
    "_blank",
    "chrome,titlebar,modal,resizable,centerscreen",
    args
  );
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

  const item = window.calendarItem;
  // Convert to default timezone if the timezone option
  // is *not* checked, otherwise keep the specific timezone
  // and display the labels in order to modify the timezone.
  if (gTimezonesEnabled) {
    if (item.isEvent()) {
      const startTime = gStartTime.getInTimezone(gStartTimezone);
      let endTime = gEndTime.getInTimezone(gEndTimezone);

      document.getElementById("event-all-day").checked = startTime.isDate;

      // In the case where the timezones are different but
      // the timezone of the endtime is "UTC", we convert
      // the endtime into the timezone of the starttime.
      if (startTime && endTime) {
        if (!cal.data.compareObjects(startTime.timezone, endTime.timezone)) {
          if (endTime.timezone.isUTC) {
            endTime = endTime.getInTimezone(startTime.timezone);
          }
        }
      }

      // before feeding the date/time value into the control we need
      // to set the timezone to 'floating' in order to avoid the
      // automatic conversion back into the OS timezone.
      startTime.timezone = cal.dtz.floating;
      endTime.timezone = cal.dtz.floating;

      document.getElementById("event-starttime").value = cal.dtz.dateTimeToJsDate(startTime);
      document.getElementById("event-endtime").value = cal.dtz.dateTimeToJsDate(endTime);
    }

    if (item.isTodo()) {
      let startTime = gStartTime && gStartTime.getInTimezone(gStartTimezone);
      let endTime = gEndTime && gEndTime.getInTimezone(gEndTimezone);
      const hasEntryDate = startTime != null;
      const hasDueDate = endTime != null;

      if (hasEntryDate && hasDueDate) {
        document.getElementById("todo-has-entrydate").checked = hasEntryDate;
        startTime.timezone = cal.dtz.floating;
        document.getElementById("todo-entrydate").value = cal.dtz.dateTimeToJsDate(startTime);

        document.getElementById("todo-has-duedate").checked = hasDueDate;
        endTime.timezone = cal.dtz.floating;
        document.getElementById("todo-duedate").value = cal.dtz.dateTimeToJsDate(endTime);
      } else if (hasEntryDate) {
        document.getElementById("todo-has-entrydate").checked = hasEntryDate;
        startTime.timezone = cal.dtz.floating;
        document.getElementById("todo-entrydate").value = cal.dtz.dateTimeToJsDate(startTime);

        startTime.timezone = cal.dtz.floating;
        document.getElementById("todo-duedate").value = cal.dtz.dateTimeToJsDate(startTime);
      } else if (hasDueDate) {
        endTime.timezone = cal.dtz.floating;
        document.getElementById("todo-entrydate").value = cal.dtz.dateTimeToJsDate(endTime);

        document.getElementById("todo-has-duedate").checked = hasDueDate;
        endTime.timezone = cal.dtz.floating;
        document.getElementById("todo-duedate").value = cal.dtz.dateTimeToJsDate(endTime);
      } else {
        startTime = window.initialStartDateValue;
        startTime.timezone = cal.dtz.floating;
        endTime = startTime.clone();

        document.getElementById("todo-entrydate").value = cal.dtz.dateTimeToJsDate(startTime);
        document.getElementById("todo-duedate").value = cal.dtz.dateTimeToJsDate(endTime);
      }
    }
  } else {
    const kDefaultTimezone = cal.dtz.defaultTimezone;

    if (item.isEvent()) {
      const startTime = gStartTime.getInTimezone(kDefaultTimezone);
      const endTime = gEndTime.getInTimezone(kDefaultTimezone);
      document.getElementById("event-all-day").checked = startTime.isDate;

      // before feeding the date/time value into the control we need
      // to set the timezone to 'floating' in order to avoid the
      // automatic conversion back into the OS timezone.
      startTime.timezone = cal.dtz.floating;
      endTime.timezone = cal.dtz.floating;
      document.getElementById("event-starttime").value = cal.dtz.dateTimeToJsDate(startTime);
      document.getElementById("event-endtime").value = cal.dtz.dateTimeToJsDate(endTime);
    }

    if (item.isTodo()) {
      let startTime = gStartTime && gStartTime.getInTimezone(kDefaultTimezone);
      let endTime = gEndTime && gEndTime.getInTimezone(kDefaultTimezone);
      const hasEntryDate = startTime != null;
      const hasDueDate = endTime != null;

      if (hasEntryDate && hasDueDate) {
        document.getElementById("todo-has-entrydate").checked = hasEntryDate;
        startTime.timezone = cal.dtz.floating;
        document.getElementById("todo-entrydate").value = cal.dtz.dateTimeToJsDate(startTime);

        document.getElementById("todo-has-duedate").checked = hasDueDate;
        endTime.timezone = cal.dtz.floating;
        document.getElementById("todo-duedate").value = cal.dtz.dateTimeToJsDate(endTime);
      } else if (hasEntryDate) {
        document.getElementById("todo-has-entrydate").checked = hasEntryDate;
        startTime.timezone = cal.dtz.floating;
        document.getElementById("todo-entrydate").value = cal.dtz.dateTimeToJsDate(startTime);

        startTime.timezone = cal.dtz.floating;
        document.getElementById("todo-duedate").value = cal.dtz.dateTimeToJsDate(startTime);
      } else if (hasDueDate) {
        endTime.timezone = cal.dtz.floating;
        document.getElementById("todo-entrydate").value = cal.dtz.dateTimeToJsDate(endTime);

        document.getElementById("todo-has-duedate").checked = hasDueDate;
        endTime.timezone = cal.dtz.floating;
        document.getElementById("todo-duedate").value = cal.dtz.dateTimeToJsDate(endTime);
      } else {
        startTime = window.initialStartDateValue;
        startTime.timezone = cal.dtz.floating;
        endTime = startTime.clone();

        document.getElementById("todo-entrydate").value = cal.dtz.dateTimeToJsDate(startTime);
        document.getElementById("todo-duedate").value = cal.dtz.dateTimeToJsDate(endTime);
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
    const element = document.getElementById(aId);
    if (!element) {
      return;
    }

    if (aTimezone) {
      element.removeAttribute("collapsed");
      element.value = aTimezone.displayName || aTimezone.tzid;
      if (!aDateTime || !aDateTime.isValid || gIsReadOnly || aDateTime.isDate) {
        if (element.hasAttribute("class")) {
          element.setAttribute("class-on-enabled", element.getAttribute("class"));
          element.removeAttribute("class");
        }
        if (element.hasAttribute("onclick")) {
          element.setAttribute("onclick-on-enabled", element.getAttribute("onclick"));
          element.removeAttribute("onclick");
        }
        element.setAttribute("disabled", "true");
      } else {
        if (element.hasAttribute("class-on-enabled")) {
          element.setAttribute("class", element.getAttribute("class-on-enabled"));
          element.removeAttribute("class-on-enabled");
        }
        if (element.hasAttribute("onclick-on-enabled")) {
          element.setAttribute("onclick", element.getAttribute("onclick-on-enabled"));
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
    updateTimezoneElement(gStartTimezone, "timezone-starttime", gStartTime);
    updateTimezoneElement(gEndTimezone, "timezone-endtime", gEndTime);
  } else {
    document.getElementById("timezone-starttime").setAttribute("collapsed", "true");
    document.getElementById("timezone-endtime").setAttribute("collapsed", "true");
  }
}

/**
 * Updates dialog controls related to item attachments
 */
function updateAttachment() {
  const hasAttachments = capSupported("attachments");
  document.getElementById("cmd_attach_url").setAttribute("disabled", !hasAttachments);

  // update the attachment tab label to make the number of (uri) attachments visible
  // even if another tab is displayed
  const attachments = Object.values(gAttachMap).filter(aAtt => aAtt.uri);
  const attachmentTab = document.getElementById("event-grid-tab-attachments");
  if (attachments.length) {
    attachmentTab.label = cal.l10n.getString("calendar-event-dialog", "attachmentsTabLabel", [
      attachments.length,
    ]);
  } else {
    attachmentTab.label = window.attachmentTabLabel;
  }

  sendMessage({
    command: "updateConfigState",
    argument: { attachUrlCommand: hasAttachments },
  });
}

/**
 * Returns whether to show or hide the related link on the dialog
 * (rfc2445 URL property).
 *
 * @param {string} aUrl - The url in question.
 * @returns {boolean} true for show and false for hide
 */
function showOrHideItemURL(url) {
  if (!url) {
    return false;
  }
  let handler;
  let uri;
  try {
    uri = Services.io.newURI(url);
    handler = Services.io.getProtocolHandler(uri.scheme);
  } catch (e) {
    // No protocol handler for the given protocol, or invalid uri
    // hideOrShow(false);
    return false;
  }
  // Only show if its either an internal protocol handler, or its external
  // and there is an external app for the scheme
  handler = cal.wrapInstance(handler, Ci.nsIExternalProtocolHandler);
  return !handler || handler.externalAppExistsForScheme(uri.scheme);
}

/**
 * Updates the related link on the dialog (rfc2445 URL property).
 *
 * @param {boolean} aShow - Show the link (true) or not (false)
 * @param {string} aUrl - The url
 */
function updateItemURL(aShow, aUrl) {
  // Hide or show the link
  document.getElementById("event-grid-link-separator").toggleAttribute("hidden", !aShow);
  document.getElementById("event-grid-link-row").toggleAttribute("hidden", !aShow);

  // Set the url for the link
  if (aShow && aUrl.length) {
    setTimeout(() => {
      // HACK the url-link doesn't crop when setting the value in onLoad
      const label = document.getElementById("url-link");
      label.setAttribute("value", aUrl);
      label.setAttribute("href", aUrl);
    }, 0);
  }
}

/**
 * This function updates dialog controls related to attendees.
 */
function updateAttendeeInterface() {
  // sending email invitations currently only supported for events
  const attendeeTab = document.getElementById("event-grid-tab-attendees");
  const attendeePanel = document.getElementById("event-grid-tabpanel-attendees");
  const notifyOptions = document.getElementById("notify-options");
  if (window.calendarItem.isEvent()) {
    attendeeTab.removeAttribute("collapsed");
    attendeePanel.removeAttribute("collapsed");
    notifyOptions.removeAttribute("collapsed");

    const organizerRow = document.getElementById("item-organizer-row");
    if (window.organizer && window.organizer.id) {
      const existingLabel = organizerRow.querySelector(":scope > .attendee-label");
      if (existingLabel) {
        organizerRow.removeChild(existingLabel);
      }
      organizerRow.appendChild(
        cal.invitation.createAttendeeLabel(document, window.organizer, window.attendees)
      );
      organizerRow.hidden = false;
    } else {
      organizerRow.hidden = true;
    }

    const attendeeContainer = document.querySelector(".item-attendees-list-container");
    if (attendeeContainer.firstChild) {
      attendeeContainer.firstChild.remove();
    }
    attendeeContainer.appendChild(cal.invitation.createAttendeesList(document, window.attendees));
    for (const label of attendeeContainer.querySelectorAll(".attendee-label")) {
      label.addEventListener("dblclick", attendeeDblClick);
      label.setAttribute("tabindex", "0");
    }

    // update the attendee tab label to make the number of attendees
    // visible even if another tab is displayed
    if (window.attendees.length) {
      attendeeTab.label = cal.l10n.getString("calendar-event-dialog", "attendeesTabLabel", [
        window.attendees.length,
      ]);
    } else {
      attendeeTab.label = window.attendeeTabLabel;
    }
  } else {
    attendeeTab.setAttribute("collapsed", "true");
    attendeePanel.setAttribute("collapsed", "true");
  }
  updateParentSaveControls();
}

/**
 * Update the save controls in parent context depending on the whether attendees
 * exist for this event and notifying is enabled
 */
function updateParentSaveControls() {
  const mode =
    window.calendarItem.isEvent() &&
    window.organizer &&
    window.organizer.id &&
    window.attendees &&
    window.attendees.length > 0 &&
    document.getElementById("notify-attendees-checkbox").checked;

  sendMessage({
    command: "updateSaveControls",
    argument: { sendNotSave: mode },
  });
}

/**
 * This function updates dialog controls related to recurrence, in this case the
 * text describing the recurrence rule.
 */
function updateRepeatDetails() {
  // Don't try to show the details text for
  // anything but a custom recurrence rule.
  const recurrenceInfo = window.recurrenceInfo;
  const itemRepeat = document.getElementById("item-repeat");
  const repeatDetails = document.getElementById("repeat-details");
  if (itemRepeat.value == "custom" && recurrenceInfo && !hasUnsupported(recurrenceInfo)) {
    const item = window.calendarItem;
    document.getElementById("repeat-untilDate").hidden = true;
    // Try to create a descriptive string from the rule(s).
    const kDefaultTimezone = cal.dtz.defaultTimezone;
    const event = item.isEvent();

    let startDate = document.getElementById(event ? "event-starttime" : "todo-entrydate").value;
    let endDate = document.getElementById(event ? "event-endtime" : "todo-duedate").value;
    startDate = cal.dtz.jsDateToDateTime(startDate, kDefaultTimezone);
    endDate = cal.dtz.jsDateToDateTime(endDate, kDefaultTimezone);

    const allDay = document.getElementById("event-all-day").checked;
    let detailsString = recurrenceRule2String(recurrenceInfo, startDate, endDate, allDay);

    if (!detailsString) {
      detailsString = cal.l10n.getString("calendar-event-dialog", "ruleTooComplex");
    }
    repeatDetails.hidden = false;

    // Now display the string.
    const lines = detailsString.split("\n");
    while (repeatDetails.children.length > lines.length) {
      repeatDetails.lastChild.remove();
    }
    const numChilds = repeatDetails.children.length;
    for (let i = 0; i < lines.length; i++) {
      if (i >= numChilds) {
        const newNode = repeatDetails.children[0].cloneNode(true);
        repeatDetails.appendChild(newNode);
      }
      repeatDetails.children[i].value = lines[i];
      repeatDetails.children[i].setAttribute("tooltiptext", detailsString);
    }
  } else {
    repeatDetails.hidden = true;
  }
}

/**
 * This function does not strictly check if the given attendee has the status
 * TENTATIVE, but also if he hasn't responded.
 *
 * @param aAttendee     The attendee to check.
 * @returns True, if the attendee hasn't responded.
 */
function isAttendeeUndecided(aAttendee) {
  return (
    aAttendee.participationStatus != "ACCEPTED" &&
    aAttendee.participationStatus != "DECLINED" &&
    aAttendee.participationStatus != "DELEGATED"
  );
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
}

/**
 * Event handler to set up the attendee-popup. This builds the popup menuitems.
 *
 * @param aEvent         The popupshowing event
 */
function setAttendeeContext(aEvent) {
  if (window.attendees.length == 0) {
    // we just need the option to open the attendee dialog in this case
    const popup = document.getElementById("attendee-popup");
    const invite = document.getElementById("attendee-popup-invite-menuitem");
    for (const node of popup.children) {
      if (node == invite) {
        node.removeAttribute("hidden");
      } else {
        node.setAttribute("hidden", "true");
      }
    }
  } else {
    if (window.attendees.length > 1) {
      const removeall = document.getElementById("attendee-popup-removeallattendees-menuitem");
      removeall.removeAttribute("hidden");
    }
    document.getElementById("attendee-popup-sendemail-menuitem").removeAttribute("hidden");
    document.getElementById("attendee-popup-sendtentativeemail-menuitem").removeAttribute("hidden");
    document.getElementById("attendee-popup-first-separator").removeAttribute("hidden");

    // setup attendee specific menu items if appropriate otherwise hide respective menu items
    const mailto = document.getElementById("attendee-popup-emailattendee-menuitem");
    const remove = document.getElementById("attendee-popup-removeattendee-menuitem");
    const secondSeparator = document.getElementById("attendee-popup-second-separator");
    const attId =
      aEvent.target.getAttribute("attendeeid") ||
      aEvent.target.parentNode.getAttribute("attendeeid");
    const attendee = window.attendees.find(aAtt => aAtt.id == attId);
    if (attendee) {
      mailto.removeAttribute("hidden");
      remove.removeAttribute("hidden");
      secondSeparator.removeAttribute("hidden");

      mailto.setAttribute("label", attendee.toString());
      mailto.attendee = attendee;
      remove.attendee = attendee;
    } else {
      mailto.setAttribute("hidden", "true");
      remove.setAttribute("hidden", "true");
      secondSeparator.setAttribute("hidden", "true");
    }

    if (window.attendees.some(isAttendeeUndecided)) {
      document.getElementById("cmd_email_undecided").removeAttribute("disabled");
    } else {
      document.getElementById("cmd_email_undecided").setAttribute("disabled", "true");
    }
  }
}

/**
 * Removes the selected attendee from the window
 *
 * @param aAttendee
 */
function removeAttendee(aAttendee) {
  if (aAttendee) {
    window.attendees = window.attendees.filter(aAtt => aAtt != aAttendee);
    updateAttendeeInterface();
  }
}

/**
 * Removes all attendees from the window
 */
function removeAllAttendees() {
  window.attendees = [];
  window.organizer = null;
  updateAttendeeInterface();
}

/**
 * Send Email to all attendees that haven't responded or are tentative.
 *
 * @param aAttendees    The attendees to check.
 */
function sendMailToUndecidedAttendees(aAttendees) {
  const targetAttendees = aAttendees.filter(isAttendeeUndecided);
  sendMailToAttendees(targetAttendees);
}

/**
 * Send Email to all given attendees.
 *
 * @param aAttendees    The attendees to send mail to.
 */
function sendMailToAttendees(aAttendees) {
  const toList = cal.email.createRecipientList(aAttendees);
  const item = saveItem();
  const emailSubject = cal.l10n.getString("calendar-event-dialog", "emailSubjectReply", [
    item.title,
  ]);
  const identity = window.calendarItem.calendar.getProperty("imip.identity");
  cal.email.sendTo(toList, emailSubject, null, identity);
}

/**
 * Make sure all fields that may have calendar specific capabilities are updated
 */
function updateCapabilities() {
  updateAttachment();
  updateConfigState({
    priority: gConfig.priority,
    privacy: gConfig.privacy,
  });
  updateReminderDetails(
    document.querySelector(".reminder-details"),
    document.querySelector(".item-alarm"),
    getCurrentCalendar()
  );
  updateCategoryMenulist();
}

/**
 * find out if the User already changed values in the Dialog
 *
 * @return:    true if the values in the Dialog have changed. False otherwise.
 */
function isItemChanged() {
  const newItem = saveItem();
  const oldItem = window.calendarItem;

  if (newItem.calendar.id == oldItem.calendar.id && cal.item.compareContent(newItem, oldItem)) {
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
  const calendar = getCurrentCalendar();
  return calendar.getProperty("capabilities." + aCap + ".supported") !== false;
}

/**
 * Return the values for a certain capability.
 *
 * @param aCap      The capability from "capabilities.<aCap>.values"
 * @returns The values for this capability
 */
function capValues(aCap, aDefault) {
  const calendar = getCurrentCalendar();
  const vals = calendar.getProperty("capabilities." + aCap + ".values");
  return vals === null ? aDefault : vals;
}

/**
 * Checks the until date just entered in the datepicker in order to avoid
 * setting a date earlier than the start date.
 * Restores the previous correct date; sets the warning flag to prevent closing
 * the dialog when the user enters a wrong until date.
 */
function checkUntilDate() {
  const repeatUntilDate = document.getElementById("repeat-until-datepicker").value;
  if (repeatUntilDate == "forever") {
    updateRepeat();
    // "forever" is never earlier than another date.
    return;
  }

  // Check whether the date is valid. Set the correct time just in this case.
  const untilDate = cal.dtz.jsDateToDateTime(repeatUntilDate, gStartTime.timezone);
  const startDate = gStartTime.clone();
  startDate.isDate = true;
  if (untilDate.compare(startDate) < 0) {
    // Invalid date: restore the previous date. Since we are checking an
    // until date, a null value for gUntilDate means repeat "forever".
    document.getElementById("repeat-until-datepicker").value = gUntilDate
      ? cal.dtz.dateTimeToJsDate(gUntilDate.getInTimezone(cal.dtz.floating))
      : "forever";
    gWarning = true;
    const callback = function () {
      // Disable the "Save" and "Save and Close" commands as long as the
      // warning dialog is showed.
      enableAcceptCommand(false);

      Services.prompt.alert(
        null,
        document.title,
        this.l10n.formatValueSync("warning-until-date-before-start")
      );
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

/**
 * Displays a counterproposal if any
 */
function displayCounterProposal() {
  if (
    !window.counterProposal ||
    !window.counterProposal.attendee ||
    !window.counterProposal.proposal
  ) {
    return;
  }

  const propLabels = document.getElementById("counter-proposal-property-labels");
  const propValues = document.getElementById("counter-proposal-property-values");
  let idCounter = 0;
  let comment;

  for (const proposal of window.counterProposal.proposal) {
    if (proposal.property == "COMMENT") {
      if (proposal.proposed && !proposal.original) {
        comment = proposal.proposed;
      }
    } else {
      const label = lookupCounterLabel(proposal);
      const value = formatCounterValue(proposal);
      if (label && value) {
        // setup label node
        const propLabel = propLabels.firstElementChild.cloneNode(false);
        propLabel.id = propLabel.id + "-" + idCounter;
        propLabel.control = propLabel.control + "-" + idCounter;
        propLabel.removeAttribute("collapsed");
        propLabel.value = label;
        // setup value node
        const propValue = propValues.firstElementChild.cloneNode(false);
        propValue.id = propLabel.control;
        propValue.removeAttribute("collapsed");
        propValue.value = value;
        // append nodes
        propLabels.appendChild(propLabel);
        propValues.appendChild(propValue);
        idCounter++;
      }
    }
  }

  const attendeeId =
    window.counterProposal.attendee.CN ||
    cal.email.removeMailTo(window.counterProposal.attendee.id || "");
  let partStat = window.counterProposal.attendee.participationStatus;
  if (partStat == "DECLINED") {
    partStat = "counterSummaryDeclined";
  } else if (partStat == "TENTATIVE") {
    partStat = "counterSummaryTentative";
  } else if (partStat == "ACCEPTED") {
    partStat = "counterSummaryAccepted";
  } else if (partStat == "DELEGATED") {
    partStat = "counterSummaryDelegated";
  } else if (partStat == "NEEDS-ACTION") {
    partStat = "counterSummaryNeedsAction";
  } else {
    cal.LOG("Unexpected partstat " + partStat + " detected.");
    // we simply reset partStat not display the summary text of the counter box
    // to avoid the window of death
    partStat = null;
  }

  if (idCounter > 0) {
    if (partStat && attendeeId.length) {
      document.getElementById("counter-proposal-summary").value = cal.l10n.getString(
        "calendar-event-dialog",
        partStat,
        [attendeeId]
      );
      document.getElementById("counter-proposal-summary").removeAttribute("collapsed");
    }
    if (comment) {
      document.getElementById("counter-proposal-comment").value = comment;
      document.getElementById("counter-proposal-box").removeAttribute("collapsed");
    }
    document.getElementById("counter-proposal-box").removeAttribute("collapsed");

    if (window.counterProposal.oldVersion) {
      // this is a counterproposal to a previous version of the event - we should notify the
      // user accordingly
      notifyUser(
        "counterProposalOnPreviousVersion",
        cal.l10n.getString("calendar-event-dialog", "counterOnPreviousVersionNotification"),
        "warn"
      );
    }
    if (window.calendarItem.getProperty("X-MICROSOFT-DISALLOW-COUNTER") == "TRUE") {
      // this is a counterproposal although the user disallowed countering when sending the
      // invitation, so we notify the user accordingly
      notifyUser(
        "counterProposalOnCounteringDisallowed",
        cal.l10n.getString("calendar-event-dialog", "counterOnCounterDisallowedNotification"),
        "warn"
      );
    }
  }
}

/**
 * Get the property label to display for a counterproposal based on the respective label used in
 * the dialog
 *
 * @param   {JSObject}     aProperty  The property to check for a label
 * @returns {string | null} The label to display or null if no such label
 */
function lookupCounterLabel(aProperty) {
  const nodeIds = getPropertyMap();
  const labels =
    nodeIds.has(aProperty.property) &&
    document.getElementsByAttribute("control", nodeIds.get(aProperty.property));
  let labelValue;
  if (labels && labels.length) {
    // as label control assignment should be unique, we can just take the first result
    labelValue = labels[0].value;
  } else {
    cal.LOG(
      "Unsupported property " +
        aProperty.property +
        " detected when setting up counter " +
        "box labels."
    );
  }
  return labelValue;
}

/**
 * Get the property value to display for a counterproposal as currently supported
 *
 * @param   {JSObject}     aProperty  The property to check for a label
 * @returns {string | null} The value to display or null if the property is not supported
 */
function formatCounterValue(aProperty) {
  const dateProps = ["DTSTART", "DTEND"];
  const stringProps = ["SUMMARY", "LOCATION"];

  let val;
  if (dateProps.includes(aProperty.property)) {
    const localTime = aProperty.proposed.getInTimezone(cal.dtz.defaultTimezone);
    val = cal.dtz.formatter.formatDateTime(localTime);
    if (gTimezonesEnabled) {
      const tzone = localTime.timezone.displayName || localTime.timezone.tzid;
      val += " " + tzone;
    }
  } else if (stringProps.includes(aProperty.property)) {
    val = aProperty.proposed;
  } else {
    cal.LOG(
      "Unsupported property " + aProperty.property + " detected when setting up counter box values."
    );
  }
  return val;
}

/**
 * Get a map of property names and labels of currently supported properties
 *
 * @returns {Map}
 */
function getPropertyMap() {
  const map = new Map();
  map.set("SUMMARY", "item-title");
  map.set("LOCATION", "item-location");
  map.set("DTSTART", "event-starttime");
  map.set("DTEND", "event-endtime");
  return map;
}

/**
 * Applies the proposal or original data to the respective dialog fields
 *
 * @param {string} aType Either 'proposed' or 'original'
 */
function applyValues(aType) {
  if (!window.counterProposal || (aType != "proposed" && aType != "original")) {
    return;
  }
  const originalBtn = document.getElementById("counter-original-btn");
  if (originalBtn.disabled) {
    // The button is disabled when opening the dialog/tab, which makes it more obvious to the
    // user that he/she needs to apply the proposal values prior to saving & sending.
    // Once that happened, we leave both options to the user without toggling the button states
    // to avoid needing to listen to manual changes to do that correctly
    originalBtn.removeAttribute("disabled");
  }
  const nodeIds = getPropertyMap();
  window.counterProposal.proposal.forEach(aProperty => {
    if (aProperty.property != "COMMENT") {
      const valueNode =
        nodeIds.has(aProperty.property) && document.getElementById(nodeIds.get(aProperty.property));
      if (valueNode) {
        if (["DTSTART", "DTEND"].includes(aProperty.property)) {
          valueNode.value = cal.dtz.dateTimeToJsDate(aProperty[aType]);
        } else {
          valueNode.value = aProperty[aType];
        }
      }
    }
  });
}

/**
 * Opens the context menu for the editor element.
 *
 * Since its content is, well, content, its contextmenu event is
 * eaten by the context menu actor before the element's default
 * context menu processing. Since we know that the editor runs
 * in the parent process, we can just listen directly to the event.
 */
function openEditorContextMenu(event) {
  const popup = document.getElementById("editorContext");
  popup.openPopupAtScreen(event.screenX, event.screenY, true, event);
  event.preventDefault();
}

// Thunderbird's dialog is mail-centric, but we just want a lightweight prompt.
function insertLink() {
  const href = { value: "" };
  const editor = GetCurrentEditor();
  const existingLink = editor.getSelectedElement("href");
  if (existingLink) {
    editor.selectElement(existingLink);
    href.value = existingLink.getAttribute("href");
  }
  const text = GetSelectionAsText().trim() || href.value || GetString("EmptyHREFError");
  const title = GetString("Link");
  if (Services.prompt.prompt(window, title, text, href, null, {})) {
    if (!href.value) {
      // Remove the link
      EditorRemoveTextProperty("href", "");
    } else if (editor.selection.isCollapsed) {
      // Insert a link with its href as the text
      const link = editor.createElementWithDefaults("a");
      link.setAttribute("href", href.value);
      link.textContent = href.value;
      editor.insertElementAtSelection(link, false);
    } else {
      // Change the href of the selection
      const link = editor.createElementWithDefaults("a");
      link.setAttribute("href", href.value);
      editor.insertLinkAroundSelection(link);
    }
  }
}
