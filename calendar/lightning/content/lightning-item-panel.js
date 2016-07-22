/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// XXX Need to determine which of these we really need here.
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

// gTabmail is null if we are in a dialog window and not in a tab.
var gTabmail = document.getElementById("tabmail") || null;

if (!gTabmail) {
    // In a dialog window the following menu item functions need to be
    // defined.  In a tab they are defined elsewhere.  To prevent errors in
    // the log they are defined here (before the onLoad function is called).
    /**
     * Update menu items that rely on focus.
     */
    window.goUpdateGlobalEditMenuItems = () => {
        goUpdateCommand("cmd_undo");
        goUpdateCommand("cmd_redo");
        goUpdateCommand("cmd_cut");
        goUpdateCommand("cmd_copy");
        goUpdateCommand("cmd_paste");
        goUpdateCommand("cmd_selectAll");
    }
    /**
     * Update menu items that rely on the current selection.
     */
    window.goUpdateSelectEditMenuItems = () => {
        goUpdateCommand("cmd_cut");
        goUpdateCommand("cmd_copy");
        goUpdateCommand("cmd_delete");
        goUpdateCommand("cmd_selectAll");
    }
    /**
     * Update menu items that relate to undo/redo.
     */
    window.goUpdateUndoEditMenuItems = () => {
        goUpdateCommand("cmd_undo");
        goUpdateCommand("cmd_redo");
    }
    /**
     * Update menu items that depend on clipboard contents.
     */
    window.goUpdatePasteMenuItems = () => {
        goUpdateCommand("cmd_paste");
    }
}

// Stores the ids of the iframes of currently open event/task tabs, used
// when window is closed to prompt for saving changes.
var gItemTabIds = [];
var gItemTabIdsCopy;

// gConfig is used when switching tabs to restore the state of
// toolbar, statusbar, and menubar for the current tab.
var gConfig = {
    privacy: null,
    hasPrivacy: null,
    calendarType: null,
    privacyValues: null,
    priority: null,
    hasPriority: null,
    status: null,
    showTimeAs: null,
    // whether cmd_attendees is enabled or disabled
    attendeesCommand: null,
    attachUrlCommand: null,
    timezonesEnabled: false
}

/**
 * Receive an asynchronous message from the iframe.
 *
 * @param {MessageEvent} aEvent  Contains the message being received
 */
function receiveMessage(aEvent) {
    if (aEvent.origin !== "chrome://lightning") {
        return;
    }
    switch (aEvent.data.command) {
        case "onLoad":
            onLoad();
            break;
        case "initializeItemMenu":
            initializeItemMenu(aEvent.data.label, aEvent.data.accessKey);
            break;
        case "disableLinkCommand":
            let linkCommand = document.getElementById("cmd_toggle_link");
            if (linkCommand) {
                setElementValue(linkCommand, "true", "disabled");
            }
            break;
        case "cancelDialog":
            document.documentElement.cancelDialog();
            break;
        case "closeWindowOrTab":
            closeWindowOrTab(aEvent.data.iframeId);
            break;
        case "showCmdStatusNone":
            document.getElementById("cmd_status_none").removeAttribute("hidden");
            break;
        case "updateTitle":
            updateTitle(aEvent.data.argument);
            break;
        case "updatePanelState":
            updateItemTabState(aEvent.data.argument);
            Object.assign(gConfig, aEvent.data.argument);
            break;
        case "enableAcceptCommand":
            enableAcceptCommand(aEvent.data.argument);
            break;
        case "replyToClosingWindowWithTabs":
            handleWindowClose(aEvent.data.response);
            break;
        case "removeDisableAndCollapseOnReadonly":
            removeDisableAndCollapseOnReadonly();
            break;
    }
}

window.addEventListener("message", receiveMessage, false);

/**
 * Send an asynchronous message to an iframe.  Additional properties of
 * aMessage are generally arguments that will be passed to the function
 * named in aMessage.command.  If aIframeId is omitted, the message will
 * be sent to the iframe of the current tab.
 *
 * @param {Object} aMessage          Contains the message being sent
 * @param {string} aMessage.command  The name of a function to call
 * @param {string} aIframeId         (optional) id of an iframe to send the message to
 */
function sendMessage(aMessage, aIframeId) {
    let iframeId;
    if (gTabmail) {
        if (aIframeId) {
            iframeId = aIframeId;
        } else {
            iframeId = gTabmail.currentTabInfo.iframe.id;
        }
    } else {
        iframeId = "lightning-item-panel-iframe";
    }
    let iframe = document.getElementById(iframeId);
    iframe.contentWindow.postMessage(aMessage, "*");
}

/**
 * When the user closes the window, this function handles prompting them
 * to save any unsaved changes for any open item tabs, before closing the
 * window, or not if 'cancel' was clicked.  Requires sending and receiving
 * async messages from the iframes of all open item tabs.
 *
 * @param {boolean} aResponse  The response from the tab's iframe
 */
function handleWindowClose(aResponse) {
    if (!aResponse) {
        // Cancel was clicked, just leave the window open. We're done.
        return;
    } else if (gItemTabIdsCopy.length > 0) {
        // There are more unsaved changes in tabs to prompt the user about.
        let nextId = gItemTabIdsCopy.shift();
        sendMessage({ command: "closingWindowWithTabs", id: nextId }, nextId);
    } else {
        // Close the window, there are no more unsaved changes in tabs.
        window.removeEventListener("close", windowCloseListener, false);
        window.close();
    }
}

/**
 * Listener function for window close.  We prevent the window from
 * closing, then for each open tab we prompt the user to save any
 * unsaved changes with handleWindowClose.
 *
 * @param {Object} aEvent  The window close event
 */
function windowCloseListener(aEvent) {
    aEvent.preventDefault();
    gItemTabIdsCopy = gItemTabIds.slice();
    handleWindowClose(true);
}

/**
 * Load handler for the outer parent context that contains the iframe.
 */
function onLoad() {
    gConfig.timezonesEnabled = getTimezoneCommandState();

    if (!gTabmail) {
        gTabmail = document.getElementById("tabmail") || null;
    }
    if (gTabmail) {
        // tab case
        // Add a listener to detect close events, prompt user about saving changes.
        window.addEventListener("close", windowCloseListener, false);
    } else {
        // window case
        // hide the ok and cancel dialog buttons
        document.documentElement.getButton("accept")
                .setAttribute("collapsed", "true");
        document.documentElement.getButton("cancel")
                .setAttribute("collapsed", "true");
        document.documentElement.getButton("cancel")
                .parentNode.setAttribute("collapsed", "true");

        // set the dialog-id for task vs event CSS selection, etc.
        if (!cal.isEvent(window.arguments[0].calendarEvent)) {
            setDialogId(document.documentElement, "calendar-task-dialog");
        }
    }
}

/**
 * Updates the UI.  Called when a user makes a change and when an
 * event/task tab is shown.  When a tab is shown aArg contains the gConfig
 * data for that event/task.  We pass the full tab state object to the
 * update functions and they just use the properties they need from it.
 *
 * @param {Object} aArg  Its properties hold data about the event/task
 */
function updateItemTabState(aArg) {
    const lookup = {
        privacy: updatePrivacy,
        priority: updatePriority,
        status: updateStatus,
        showTimeAs: updateShowTimeAs,
        attendeesCommand: updateAttendeesCommand,
        attachUrlCommand: updateAttachment,
        timezonesEnabled: updateTimezoneCommand
    };
    for (let key of Object.keys(aArg)) {
        if (lookup[key]) {
            lookup[key](aArg);
        }
    }
}

/**
 * When in a window, set Item-Menu label to Event or Task.
 *
 * @param {string} aLabel      The new name for the menu
 * @param {string} aAccessKey  The access key for the menu
 */
function initializeItemMenu (aLabel, aAccessKey) {
    let menuItem = document.getElementById("item-menu");
    menuItem.setAttribute("label", aLabel);
    menuItem.setAttribute("accesskey", aAccessKey);
}

/**
 * Handler for when dialog is accepted.
 */
function onAccept() {
    sendMessage({ command: "onAccept" });
    return false;
}

/**
 * Handler for when dialog is canceled.
 *
 * @param {string} aIframeId  The id of the iframe
 */
function onCancel(aIframeId) {
    sendMessage({ command: "onCancel", iframeId: aIframeId }, aIframeId);
    // We return false to prevent closing of a window until we
    // can ask the user about saving any unsaved changes.
    return false;
}

/**
 * Closes tab or window. Called after prompting to save any unsaved changes.
 *
 * @param {string} aIframeId  The id of the iframe
 */
function closeWindowOrTab(iframeId) {
    if (gTabmail) {
        if (iframeId) {
            // Find the tab associated with this iframeId, and close it.
            let myTabInfo = gTabmail.tabInfo.filter((x) => "iframe" in x && x.iframe.id == iframeId)[0];
            myTabInfo.allowTabClose = true;
            gTabmail.closeTab(myTabInfo);
        } else {
            gTabmail.currentTabInfo.allowTabClose = true;
            gTabmail.removeCurrentTab();
        }
    } else {
        window.close();
    }
}

/**
 * Handler for saving the event or task.
 *
 * @param {boolean} aIsClosing  Is the tab or window closing
 */
function onCommandSave(aIsClosing) {
    sendMessage({ command:"onCommandSave", isClosing: aIsClosing });
}

/**
 * Handler for deleting the event or task.
 */
function onCommandDeleteItem() {
    sendMessage({ command:"onCommandDeleteItem" });
}

/**
 * Update the title of the tab or window.
 *
 * @param {string} aNewTitle  The new title
 */
function updateTitle(aNewTitle) {
    if (gTabmail) {
        gTabmail.currentTabInfo.title = aNewTitle;
        gTabmail.setTabTitle(gTabmail.currentTabInfo);
    } else {
        document.title = aNewTitle;
    }
}

/**
 * Handler for edit attendees command.
 */
function editAttendees() {
    sendMessage({ command: "editAttendees" });
}

/**
 * Handler for rotate privacy command.
 */
function rotatePrivacy() {
    sendMessage({ command: "rotatePrivacy" });
}

/**
 * Sets the privacy of an item to the value specified by
 * the attribute "privacy" of the UI-element aTarget.
 * aEvent is used for the popup menu event-privacy-menupopup
 * in the Privacy toolbar button.
 *
 * @param aTarget  The calling UI-element
 * @param aEvent   The UI-element selection event
 */
function editPrivacy(aTarget, aEvent) {
    if (aEvent) {
        aEvent.stopPropagation();
    }
    sendMessage({
        command: "editPrivacy",
        value: aTarget.getAttribute("privacy")
    });
}

/**
 * Updates the UI according to the privacy setting and the selected
 * calendar. If the selected calendar does not support privacy or only
 * certain values, these are removed from the UI. This function should
 * be called any time that privacy setting is updated.
 *
 * @param {Object}    aArg                Contains privacy properties
 * @param {string}    aArg.privacy        The new privacy value
 * @param {boolean}   aArg.hasPrivacy     Whether privacy is supported
 * @param {string}    aArg.calendarType   The type of calendar
 * @param {string[]}  aArg.privacyValues  The possible privacy values
 */
function updatePrivacy(aArg) {
    if (aArg.hasPrivacy) {
        let numChilds;

        // Update privacy capabilities (toolbar)
        let menupopup = document.getElementById("event-privacy-menupopup");
        if (menupopup) {
            // Only update the toolbar if the button is actually there
            for (let node of menupopup.childNodes) {
                let currentProvider = node.getAttribute("provider");
                if (node.hasAttribute("privacy")) {
                    let currentPrivacyValue = node.getAttribute("privacy");
                    // Collapsed state

                    // Hide the toolbar if the value is unsupported or is for a
                    // specific provider and doesn't belong to the current provider.
                    if (!aArg.privacyValues.includes(currentPrivacyValue) ||
                        (currentProvider && currentProvider != aArg.calendarType)) {
                        node.setAttribute("collapsed", "true");
                    } else {
                        node.removeAttribute("collapsed");
                    }

                    // Checked state
                    if (aArg.privacy == currentPrivacyValue) {
                        node.setAttribute("checked", "true");
                    } else {
                        node.removeAttribute("checked");
                    }
                }
            }
        }

        // Update privacy capabilities (menu) but only if we are not in a tab.
        if (!gTabmail) {
            menupopup = document.getElementById("options-privacy-menupopup");
            for (let node of menupopup.childNodes) {
                let currentProvider = node.getAttribute("provider");
                if (node.hasAttribute("privacy")) {
                    let currentPrivacyValue = node.getAttribute("privacy");
                    // Collapsed state

                    // Hide the menu if the value is unsupported or is for a
                    // specific provider and doesn't belong to the current provider.
                    if (!aArg.privacyValues.includes(currentPrivacyValue) ||
                        (currentProvider && currentProvider != aArg.calendarType)) {
                        node.setAttribute("collapsed", "true");
                    } else {
                        node.removeAttribute("collapsed");
                    }

                    // Checked state
                    if (aArg.privacy == currentPrivacyValue) {
                        node.setAttribute("checked", "true");
                    } else {
                        node.removeAttribute("checked");
                    }
                }
            }
        }

        // Update privacy capabilities (statusbar)
        let privacyPanel = document.getElementById("status-privacy");
        let hasAnyPrivacyValue = false;
        for (let node of privacyPanel.childNodes) {
            let currentProvider = node.getAttribute("provider");
            if (node.hasAttribute("privacy")) {
                let currentPrivacyValue = node.getAttribute("privacy");

                // Hide the panel if the value is unsupported or is for a
                // specific provider and doesn't belong to the current provider,
                // or is not the items privacy value
                if (!aArg.privacyValues.includes(currentPrivacyValue) ||
                    (currentProvider && currentProvider != aArg.calendarType) ||
                    aArg.privacy != currentPrivacyValue) {
                    node.setAttribute("collapsed", "true");
                } else {
                    node.removeAttribute("collapsed");
                    hasAnyPrivacyValue = true;
                }
            }
        }

        // Don't show the status panel if no valid privacy value is selected
        if (!hasAnyPrivacyValue) {
            privacyPanel.setAttribute("collapsed", "true");
        } else {
            privacyPanel.removeAttribute("collapsed");
        }
    } else {
        // aArg.hasPrivacy is false
        setElementValue("button-privacy", "true", "disabled");
        setElementValue("status-privacy", "true", "collapsed");
        // in the tab case the menu item does not exist
        let privacyMenuItem = document.getElementById("options-privacy-menu");
        if (privacyMenuItem) {
            setElementValue("options-privacy-menu", "true", "disabled");
        }
    }
}

/**
 * Handler for rotate priority command.
 */
function rotatePriority() {
    sendMessage({ command: "rotatePriority" });
}

/**
 * Handler to change the priority.
 *
 * @param {nsIDOMNode} aTarget  Its value attribute contains the new priority
 */
function editPriority(aTarget) {
    sendMessage({
        command: "editPriority",
        value: parseInt(aTarget.getAttribute("value"))
    });
}

/**
 * Updates the dialog controls related to priority.
 *
 * @param {Object}  aArg              Contains priority properties
 * @param {string}  aArg.priority     The new priority value
 * @param {boolean} aArg.hasPriority  Whether priority is supported
 */
function updatePriority(aArg) {
    // Set up capabilities
    if (document.getElementById("button-priority")) {
        setElementValue("button-priority", !aArg.hasPriority && "true", "disabled");
    }
    if (!gTabmail && document.getElementById("options-priority-menu")) {
        setElementValue("options-priority-menu", !aArg.hasPriority && "true", "disabled");
    }
    setElementValue("status-priority", !aArg.hasPriority && "true", "collapsed");

    if (aArg.hasPriority) {
        let priorityLevel = "none";
        if (aArg.priority >= 1 && aArg.priority <= 4) {
            priorityLevel = "high";
        } else if (aArg.priority == 5) {
            priorityLevel = "normal";
        } else if (aArg.priority >= 6 && aArg.priority <= 9) {
            priorityLevel = "low";
        }

        let priorityNone = document.getElementById("cmd_priority_none");
        let priorityLow = document.getElementById("cmd_priority_low");
        let priorityNormal = document.getElementById("cmd_priority_normal");
        let priorityHigh = document.getElementById("cmd_priority_high");

        priorityNone.setAttribute("checked",
                                  priorityLevel == "none" ? "true" : "false");
        priorityLow.setAttribute("checked",
                                 priorityLevel == "low" ? "true" : "false");
        priorityNormal.setAttribute("checked",
                                    priorityLevel == "normal" ? "true" : "false");
        priorityHigh.setAttribute("checked",
                                  priorityLevel == "high" ? "true" : "false");

        // Status bar panel
        let priorityPanel = document.getElementById("status-priority");
        if (priorityLevel == "none") {
            // If the priority is none, don't show the status bar panel
            priorityPanel.setAttribute("collapsed", "true");
        } else {
            priorityPanel.removeAttribute("collapsed");
            let foundPriority = false;
            for (let node of priorityPanel.childNodes) {
                if (foundPriority) {
                    node.setAttribute("collapsed", "true");
                } else {
                    node.removeAttribute("collapsed");
                }
                if (node.getAttribute("value") == priorityLevel) {
                    foundPriority = true;
                }
            }
        }
    }
}

/**
 * Handler for rotate status command.
 */
function rotateStatus() {
    let noneCmd = document.getElementById("cmd_status_none");
    let isVisible = !noneCmd.hasAttribute("hidden");
    sendMessage({
        command: "rotateStatus",
        noneCommandIsVisible: isVisible
    });
}

/**
 * Handler to change the status from the dialog elements.
 *
 * @param {nsIDOMNode} aTarget  Its value attribute contains the new status
 */
function editStatus(aTarget) {
    sendMessage({
        command: "editStatus",
        value: aTarget.getAttribute("value")
    });
}

/**
 * Update the dialog controls related to status.
 *
 * @param {Object} aArg         Contains the new status value
 * @param {string} aArg.status  The new status value
 */
function updateStatus(aArg) {
    const statusLabels = ["status-status-tentative-label",
                          "status-status-confirmed-label",
                          "status-status-cancelled-label"];
    const commands = ["cmd_status_none",
                      "cmd_status_tentative",
                      "cmd_status_confirmed",
                      "cmd_status_cancelled"];
    let found = false;
    setBooleanAttribute("status-status", "collapsed", true);
    commands.forEach((aElement, aIndex, aArray) => {
        let node = document.getElementById(aElement);
        let matches = (node.getAttribute("value") == aArg.status);
        found = found || matches;

        node.setAttribute("checked", matches ? "true" : "false");

        if (aIndex > 0) {
            setBooleanAttribute(statusLabels[aIndex-1], "hidden", !matches);
            if (matches) {
                setBooleanAttribute("status-status", "collapsed", false);
            }
        }
    });
    if (!found) {
        // The current Status value is invalid. Change the status to
        // "not specified" and update the status again.
        sendMessage({ command: "editStatus", value: "NONE" });
    }
}

/**
 * Handler for rotate transparency command.
 */
function rotateShowTimeAs() {
    sendMessage({ command: "rotateShowTimeAs" });
}

/**
 * Handler to change the transparency from the dialog elements.
 *
 * @param {nsIDOMNode} aTarget  Its value attribute contains the new transparency
 */
function editShowTimeAs(aTarget) {
    sendMessage({
        command: "editShowTimeAs",
        value: aTarget.getAttribute("value")
    });
}

/**
 * Update the dialog controls related to transparency.
 *
 * @param {Object} aArg             Contains the new transparency value
 * @param {string} aArg.showTimeAs  The new transparency value
 */
function updateShowTimeAs(aArg) {
    let showAsBusy = document.getElementById("cmd_showtimeas_busy");
    let showAsFree = document.getElementById("cmd_showtimeas_free");

    showAsBusy.setAttribute("checked",
                            aArg.showTimeAs == "OPAQUE" ? "true" : "false");
    showAsFree.setAttribute("checked",
                            aArg.showTimeAs == "TRANSPARENT" ? "true" : "false");

    setBooleanAttribute("status-freebusy",
                        "collapsed",
                        aArg.showTimeAs != "OPAQUE" && aArg.showTimeAs != "TRANSPARENT");
    setBooleanAttribute("status-freebusy-free-label", "hidden", aArg.showTimeAs == "OPAQUE");
    setBooleanAttribute("status-freebusy-busy-label", "hidden", aArg.showTimeAs == "TRANSPARENT");
}

/**
 * Get the timezone button state.
 *
 * @return {boolean}  True is active/checked and false is inactive/unchecked
 */
function getTimezoneCommandState() {
    let cmdTimezone = document.getElementById("cmd_timezone");
    return cmdTimezone.getAttribute("checked") == "true";
}

/**
 * Set the timezone button state.  Used to keep the toolbar button in
 * sync when switching tabs.
 *
 * @param {Object}  aArg                   Contains timezones property
 * @param {boolean} aArg.timezonesEnabled  Are timezones enabled?
 */
function updateTimezoneCommand(aArg) {
    let cmdTimezone = document.getElementById("cmd_timezone");
    cmdTimezone.setAttribute("checked", aArg.timezonesEnabled);
    gConfig.timezonesEnabled = aArg.timezonesEnabled;
}

/**
 * Toggles the command that allows enabling the timezone links in the dialog.
 */
function toggleTimezoneLinks() {
    let cmdTimezone = document.getElementById("cmd_timezone");
    let currentState = getTimezoneCommandState();
    cmdTimezone.setAttribute("checked", currentState ? "false" : "true");
    gConfig.timezonesEnabled = !currentState;
    sendMessage({ command: "toggleTimezoneLinks", checked: !currentState });
}

/**
 * Toggles the visibility of the related link (rfc2445 URL property).
 */
function toggleLink() {
    let linkCommand = document.getElementById("cmd_toggle_link");
    let checked = linkCommand.getAttribute("checked") == "true";

    linkCommand.setAttribute("checked", checked ? "false" : "true");
    sendMessage({ command: "toggleLink", checked: !checked });
}

/**
 * Prompts the user to attach an url to this item.
 */
function attachURL() {
    sendMessage({ command: "attachURL" });
}

/**
 * Updates dialog controls related to item attachments.
 *
 * @param {Object}  aArg                   Container
 * @param {boolean} aArg.attachUrlCommand  Enable the attach url command?
 */
function updateAttachment(aArg) {
    setElementValue("cmd_attach_url", !aArg.attachUrlCommand && "true", "disabled");
}

/**
 * Updates attendees command enabled/disabled state.
 *
 * @param {Object}  aArg                   Container
 * @param {boolean} aArg.attendeesCommand  Enable the attendees command?
 */
function updateAttendeesCommand(aArg) {
    setElementValue("cmd_attendees", !aArg.attendeesCommand, "disabled");
}

/**
 * Enables/disables the commands cmd_accept and cmd_save related to the
 * save operation.
 *
 * @param {boolean} aEnable  Enable the commands?
 */
function enableAcceptCommand(aEnable) {
    setElementValue("cmd_accept", !aEnable, "disabled");
    setElementValue("cmd_save", !aEnable, "disabled");
}

/**
 * Enable and un-collapse all elements that are disable-on-readonly and
 * collapse-on-readonly.
 */
function removeDisableAndCollapseOnReadonly() {
    let enableElements = document.getElementsByAttribute("disable-on-readonly", "true");
    for (let element of enableElements) {
        element.removeAttribute("disabled");
    }
    let collapseElements = document.getElementsByAttribute("collapse-on-readonly", "true");
    for (let element of collapseElements) {
        element.removeAttribute("collapsed");
    }
}

/**
 * Handler to toggle toolbar visibility.
 *
 * @param {string} aToolbarId   The id of the toolbar node to toggle
 * @param {string} aMenuitemId  The corresponding menuitem in the view menu
 */
function onCommandViewToolbar(aToolbarId, aMenuItemId) {
    let toolbar = document.getElementById(aToolbarId);
    let menuItem = document.getElementById(aMenuItemId);

    if (!toolbar || !menuItem) {
        return;
    }

    let toolbarCollapsed = toolbar.collapsed;

    // toggle the checkbox
    menuItem.setAttribute("checked", toolbarCollapsed);

    // toggle visibility of the toolbar
    toolbar.collapsed = !toolbarCollapsed;

    document.persist(aToolbarId, "collapsed");
    document.persist(aMenuItemId, "checked");
}

/**
 * Called after the customize toolbar dialog has been closed by the
 * user. We need to restore the state of all buttons and commands of
 * all customizable toolbars.
 *
 * @param {boolean} aToolboxChanged  When true the toolbox has changed
 */
function dialogToolboxCustomizeDone(aToolboxChanged) {

    let menubar = document.getElementById("event-menubar");
    // XXX After we disable certain menu items in a tab (see below),
    // we need to re-enable them.
    if (menubar) {
        for (let i = 0; i < menubar.childNodes.length; ++i) {
            menubar.childNodes[i].removeAttribute("disabled");
        }
    }

    // make sure our toolbar buttons have the correct enabled state restored to them...
    document.commandDispatcher.updateCommands("itemCommands");

    // Enable the toolbar context menu items
    document.getElementById("cmd_customize").removeAttribute("disabled");

    // Update privacy items to make sure the toolbarbutton's menupopup is set
    // correctly
    updatePrivacy(gConfig);
}

/**
 * Handler to start the customize toolbar dialog for the event dialog's toolbar.
 */
function onCommandCustomize() {
    // install the callback that handles what needs to be
    // done after a toolbar has been customized.
    let toolboxId = "event-toolbox";

    let toolbox = document.getElementById(toolboxId);
    toolbox.customizeDone = dialogToolboxCustomizeDone;

    let menubar = document.getElementById("event-menubar");
    // XXX We need to disable certain menu items when in a tab.
    if (menubar) {
        for (let i = 0; i < menubar.childNodes.length; ++i) {
            menubar.childNodes[i].setAttribute("disabled", true);
        }
    }

    // Disable the toolbar context menu items
    document.getElementById("cmd_customize").setAttribute("disabled", "true");

    let wintype = document.documentElement.getAttribute("windowtype");
    wintype = wintype.replace(/:/g, "");

    window.openDialog("chrome://global/content/customizeToolbar.xul",
                      "CustomizeToolbar" + wintype,
                      "chrome,all,dependent",
                      document.getElementById(toolboxId), // toolbox dom node
                      false,                              // is mode toolbar yes/no?
                      null,                               // callback function
                      "dialog");                          // name of this mode
}
