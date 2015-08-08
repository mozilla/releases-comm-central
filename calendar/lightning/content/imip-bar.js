/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calItipUtils.jsm");
Components.utils.import("resource://calendar/modules/calXMLUtils.jsm");
Components.utils.import("resource://calendar/modules/ltnInvitationUtils.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * This bar lives inside the message window.
 * Its lifetime is the lifetime of the main thunderbird message window.
 */
var ltnImipBar = {

    actionFunc: null,
    itipItem: null,
    foundItems: null,
    msgOverlay: null,

    /**
     * Thunderbird Message listener interface, hide the bar before we begin
     */
    onStartHeaders: function onImipStartHeaders() {
      ltnImipBar.resetBar();
    },

    /**
     * Thunderbird Message listener interface
     */
    onEndHeaders: function onImipEndHeaders() {

    },

    /**
     * Load Handler called to initialize the imip bar
     * NOTE: This function is called without a valid this-context!
     */
    load: function ltnImipOnLoad() {
        // Add a listener to gMessageListeners defined in msgHdrViewOverlay.js
        gMessageListeners.push(ltnImipBar);

        // We need to extend the HideMessageHeaderPane function to also hide the
        // message header pane. Otherwise, the imip bar will still be shown when
        // changing folders.
        ltnImipBar.tbHideMessageHeaderPane = HideMessageHeaderPane;
        HideMessageHeaderPane = function ltnHideMessageHeaderPane() {
            ltnImipBar.resetBar();
            ltnImipBar.tbHideMessageHeaderPane.apply(null, arguments);
        };

        // Set up our observers
        Services.obs.addObserver(ltnImipBar, "onItipItemCreation", false);
    },

    /**
     * Unload handler to clean up after the imip bar
     * NOTE: This function is called without a valid this-context!
     */
    unload: function ltnImipOnUnload() {
        removeEventListener("messagepane-loaded", ltnImipBar.load, true);
        removeEventListener("messagepane-unloaded", ltnImipBar.unload, true);

        ltnImipBar.resetBar();
        Services.obs.removeObserver(ltnImipBar, "onItipItemCreation");
    },

    observe: function ltnImipBar_observe(subject, topic, state) {
        if (topic == "onItipItemCreation") {
            let itipItem = null;
            let msgOverlay = null;
            try {
                if (!subject) {
                    let sinkProps = msgWindow.msgHeaderSink.properties;
                    // This property was set by lightningTextCalendarConverter.js
                    itipItem = sinkProps.getPropertyAsInterface("itipItem",
                                                                Components.interfaces.calIItipItem);
                    msgOverlay = sinkProps.getPropertyAsAUTF8String("msgOverlay");
                }
            } catch (e) {
                // This will throw on every message viewed that doesn't have the
                // itipItem property set on it. So we eat the errors and move on.

                // XXX TODO: Only swallow the errors we need to. Throw all others.
            }
            if (!itipItem || !msgOverlay || !gMessageDisplay.displayedMessage) {
                return;
            }

            let imipMethod = gMessageDisplay.displayedMessage.getStringProperty("imip_method");
            cal.itip.initItemFromMsgData(itipItem, imipMethod, gMessageDisplay.displayedMessage);

            let imipBar = document.getElementById("imip-bar");
            imipBar.setAttribute("collapsed", "false");
            imipBar.setAttribute("label",  cal.itip.getMethodText(itipItem.receivedMethod));

            ltnImipBar.msgOverlay = msgOverlay;

            cal.itip.processItipItem(itipItem, ltnImipBar.setupOptions);
        }
    },

    /**
     * Hide the imip bar and reset the itip item.
     */
    resetBar: function ltnResetImipBar() {
        document.getElementById("imip-bar").collapsed = true;
        ltnImipBar.resetButtons();

        // Clear our iMIP/iTIP stuff so it doesn't contain stale information.
        cal.itip.cleanupItipItem(ltnImipBar.itipItem);
        ltnImipBar.itipItem = null;
    },

    /**
     * Resets all buttons and its menuitems, all buttons are hidden thereafter
     */
    resetButtons: function ltnResetImipButtons() {
        let buttons = ltnImipBar.getButtons();
        buttons.forEach(hideElement);
        buttons.forEach(aButton => ltnImipBar.getMenuItems(aButton).forEach(showElement));
    },

    /**
     * Provides a list of all available buttons
     */
    getButtons: function ltnGetButtons() {
        let buttons = [];
        let nl = document.getElementById("imip-view-toolbar")
                         .getElementsByTagName("toolbarbutton");
        if (nl != null && nl.length > 0) {
            for (let button of nl) {
                buttons.push(button);
            }
        }
        return buttons;
    },

    /**
     * Provides a list of available menuitems of a button
     *
     * @param aButton        button node
     */
    getMenuItems: function ltnGetMenuItems(aButton) {
        let items = [];
        let mitems = aButton.getElementsByTagName("menuitem");
        if (mitems != null && mitems.length > 0) {
            for (let mitem of mitems) {
                items.push(mitem);
            }
        }
        return items;
    },

    /**
     * Checks and converts button types based on available menuitems of the buttons
     * to avoid dropdowns which are empty or only replicating the default button action
     * Should be called once the buttons are set up
     */
    conformButtonType: function ltnConformButtonType() {
        // check only needed on visible and not simple buttons
        let buttons = ltnImipBar.getButtons()
                                .filter(aElement => aElement.hasAttribute("type") && !aElement.hidden);
        // change button if appropriate
        for (let button of buttons) {
            let items = ltnImipBar.getMenuItems(button).filter(aItem => !aItem.hidden);
            if (button.type == "menu" && items.length == 0) {
                // hide non functional buttons
                button.hidden = true;
            } else if (button.type == "menu-button") {
                if (items.length == 0 ||
                    (items.length == 1 &&
                     button.hasAttribute("oncommand") &&
                     items[0].hasAttribute("oncommand") &&
                     button.getAttribute("oncommand")
                           .endsWith(items[0].getAttribute("oncommand")))) {
                   // convert to simple button
                   button.removeAttribute("type");
                }
            }
        }
    },

    /**
     * This is our callback function that is called each time the itip bar UI needs updating.
     * NOTE: This function is called without a valid this-context!
     *
     * @param itipItem      The iTIP item to set up for
     * @param rc            The status code from processing
     * @param actionFunc    The action function called for execution
     * @param foundItems    An array of items found while searching for the item
     *                      in subscribed calendars
     */
    setupOptions: function setupOptions(itipItem, rc, actionFunc, foundItems) {
        let imipBar =  document.getElementById("imip-bar");
        let data = cal.itip.getOptionsText(itipItem, rc, actionFunc, foundItems);

        if (Components.isSuccessCode(rc)) {
            ltnImipBar.itipItem = itipItem;
            ltnImipBar.actionFunc = actionFunc;
            ltnImipBar.foundItems = foundItems;
        }

        imipBar.setAttribute("label", data.label);
        // let's reset all buttons first
        ltnImipBar.resetButtons();
        // menu items are visible by default, let's hide what's not available
        data.hideMenuItems.forEach(aElementId => hideElement(document.getElementById(aElementId)));
        // buttons are hidden by default, let's make required buttons visible
        data.buttons.forEach(aElementId => showElement(document.getElementById(aElementId)));
        // adjust button style if necessary
        ltnImipBar.conformButtonType();
        if (Preferences.get('calendar.itip.displayInvitationChanges', false)) {
            // display event modifications if any
            ltnImipBar.displayModifications();
        } else if (msgWindow && ltnImipBar.msgOverlay) {
            msgWindow.displayHTMLInMessagePane('', ltnImipBar.msgOverlay, false);
        }
    },

    /**
     * Displays changes in case of invitation updates in invitation overlay
     */
    displayModifications: function () {
        if (!ltnImipBar.foundItems.length || !ltnImipBar.itipItem || !ltnImipBar.msgOverlay || !msgWindow) {
            return;
        }
        let oldOverlay = ltn.invitation.createInvitationOverlay(ltnImipBar.foundItems[0],
                                                                ltnImipBar.itipItem);
        let organizerId = ltnImipBar.itipItem.targetCalendar.getProperty("organizerId");
        let msgOverlay = ltn.invitation.compareInvitationOverlay(cal.xml.serializeDOM(oldOverlay),
                                                                 ltnImipBar.msgOverlay,
                                                                 organizerId);
        msgWindow.displayHTMLInMessagePane('', msgOverlay, false);
    },

    executeAction: function ltnExecAction(partStat, extendResponse) {

        function _execAction(aActionFunc, aItipItem, aWindow, aPartStat) {
            if (cal.itip.promptCalendar(aActionFunc.method, aItipItem, aWindow)) {
                // filter out fake partstats
                if (aPartStat.startsWith("X-")) {
                    partstat = "";
                }
                // hide the buttons now, to disable pressing them twice...
                if(aPartStat == partStat) {
                    ltnImipBar.resetButtons();
                }

                let opListener = {
                    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
                    onOperationComplete: function ltnItipActionListener_onOperationComplete(aCalendar,
                                                                                            aStatus,
                                                                                            aOperationType,
                                                                                            aId,
                                                                                            aDetail) {
                        // For now, we just state the status for the user something very simple
                        let imipBar = document.getElementById("imip-bar");
                        let label = cal.itip.getCompleteText(aStatus, aOperationType);
                        imipBar.setAttribute("label", label);

                        if (!Components.isSuccessCode(aStatus)) {
                            showError(label);
                        }
                    },
                    onGetResult: function ltnItipActionListener_onGetResult(aCalendar,
                                                                            aStatus,
                                                                            aItemType,
                                                                            aDetail,
                                                                            aCount,
                                                                            aItems) {
                    }
                };

                try {
                    aActionFunc(opListener, partStat);
                } catch (exc) {
                    Components.utils.reportError(exc);
                }
                return true;
            }
            return false;
        }

        if (partStat == null) {
            partStat = '';
        }
        if (partStat == "X-SHOWDETAILS") {
            let items = ltnImipBar.foundItems;
            if (items && items.length) {
                let item = items[0].isMutable ? items[0] : items[0].clone();
                modifyEventWithDialog(item);
            }
        } else {
            if (extendResponse) {
                // Open an extended response dialog to enable the user to add a comment, make a
                // counter proposal, delegate the event or interact in another way.
                // Instead of a dialog, this might be implemented as a separate container inside the
                // imip-overlay as proposed in bug 458578
                //
                // If implemented as a dialog, the OL compatibility decision should be incorporated
                // therein too and the itipItems's autoResponse set to auto subsequently
                // to prevent a second popup during imip transport processing.
            }
            let delmgr = Components.classes["@mozilla.org/calendar/deleted-items-manager;1"]
                                   .getService(Components.interfaces.calIDeletedItems);
            let items = ltnImipBar.itipItem.getItemList({});
            if (items && items.length) {
                let delTime = delmgr.getDeletedDate(items[0].id);
                let dialogText = ltnGetString("lightning", "confirmProcessInvitation");
                let dialogTitle = ltnGetString("lightning", "confirmProcessInvitationTitle");
                if (delTime && !Services.prompt.confirm(window, dialogTitle, dialogText)) {
                    return false;
                }
            }

            if (partStat == "X-SAVECOPY") {
                // we create and adopt copies of the respective events
                let items = ltnImipBar.itipItem.getItemList({}).map(cal.getPublishLikeItemCopy.bind(cal));
                if (items.length > 0) {
                    let newItipItem = cal.itip.getModifiedItipItem(ltnImipBar.itipItem,
                                                                   items,
                                                                   {receivedMethod: "PUBLISH",
                                                                    responseMethod: "PUBLISH"});
                    // control to avoid processing _execAction on later user changes on the item
                    let isFirstProcessing = true;
                    // setup callback and trigger re-processing
                    let storeCopy = function storeCopy(aItipItem, aRc, aActionFunc, aFoundItems) {
                        if (isFirstProcessing && aActionFunc && Components.isSuccessCode(aRc)) {
                            _execAction(aActionFunc, aItipItem, window, partStat);
                        }
                    }
                    cal.itip.processItipItem(newItipItem, storeCopy);
                    isFirstProcessing = false;
                }
                // we stop here to not process the original item
                return false;
            }
            return _execAction(ltnImipBar.actionFunc, ltnImipBar.itipItem, window, partStat);
        }
        return false;
    }
};

addEventListener("messagepane-loaded", ltnImipBar.load, true);
addEventListener("messagepane-unloaded", ltnImipBar.unload, true);
