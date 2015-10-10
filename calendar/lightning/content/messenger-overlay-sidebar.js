/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Promise.jsm");
Components.utils.import("resource://gre/modules/Task.jsm");
Components.utils.import("resource://gre/modules/AddonManager.jsm");
Components.utils.import("resource://calendar/modules/calAsyncUtils.jsm");

var gLastShownCalendarView = null;

var calendarTabMonitor = {
    monitorName: "lightning",

    // Unused, but needed functions
    onTabTitleChanged: function() {},
    onTabOpened: function() {},
    onTabClosing: function() {},
    onTabPersist: function() {},
    onTabRestored: function() {},

    onTabSwitched: function onTabSwitched(aNewTab, aOldTab) {
        // Unfortunately, tabmail doesn't provide a hideTab function on the tab
        // type definitions. To make sure the commands are correctly disabled,
        // we want to update calendar/task commands when switching away from
        // those tabs.
        if (aOldTab.mode.name == "calendar" ||
            aOldTab.mode.name == "task") {
            calendarController.updateCommands();
            calendarController2.updateCommands();
        }
    }
};

var calendarTabType = {
  name: "calendar",
  panelId: "calendarTabPanel",
  modes: {
    calendar: {
      type: "calendar",
      maxTabs: 1,
      openTab: function(aTab, aArgs) {
        aTab.title = aArgs["title"];
        if (!("background" in aArgs) || !aArgs["background"]) {
            // Only do calendar mode switching if the tab is opened in
            // foreground.
            ltnSwitch2Calendar();
        }
      },

      showTab: function(aTab) {
        ltnSwitch2Calendar();
      },
      closeTab: function(aTab) {
        if (gCurrentMode == "calendar") {
          // Only revert menu hacks if closing the active tab, otherwise we
          // would switch to mail mode even if in task mode and closing the
          // calendar tab.
          ltnSwitch2Mail();
        }
      },

      persistTab: function(aTab) {
        let tabmail = document.getElementById("tabmail");
        return {
            // Since we do strange tab switching logic in ltnSwitch2Calendar,
            // we should store the current tab state ourselves.
            background: (aTab != tabmail.currentTabInfo)
        };
      },

      restoreTab: function(aTabmail, aState) {
        aState.title = ltnGetString("lightning", "tabTitleCalendar");
        aTabmail.openTab('calendar', aState);
      },

      onTitleChanged: function(aTab) {
        aTab.title = ltnGetString("lightning", "tabTitleCalendar");
      },

      supportsCommand: (aCommand, aTab) => calendarController2.supportsCommand(aCommand),
      isCommandEnabled: (aCommand, aTab) => calendarController2.isCommandEnabled(aCommand),
      doCommand: (aCommand, aTab) => calendarController2.doCommand(aCommand),
      onEvent: (aEvent, aTab) => calendarController2.onEvent(aEvent)
    },

    tasks: {
      type: "tasks",
      maxTabs: 1,
      openTab: function(aTab, aArgs) {
        aTab.title = aArgs["title"];
        if (!("background" in aArgs) || !aArgs["background"]) {
            ltnSwitch2Task();
        }
      },
      showTab: function(aTab) {
        ltnSwitch2Task();
      },
      closeTab: function(aTab) {
        if (gCurrentMode == "task") {
          // Only revert menu hacks if closing the active tab, otherwise we
          // would switch to mail mode even if in calendar mode and closing the
          // tasks tab.
          ltnSwitch2Mail();
        }
      },

      persistTab: function(aTab) {
        let tabmail = document.getElementById("tabmail");
        return {
            // Since we do strange tab switching logic in ltnSwitch2Task,
            // we should store the current tab state ourselves.
            background: (aTab != tabmail.currentTabInfo)
        };
      },

      restoreTab: function(aTabmail, aState) {
        aState.title = ltnGetString("lightning", "tabTitleTasks");
        aTabmail.openTab('tasks', aState);
      },

      onTitleChanged: function(aTab) {
        aTab.title = ltnGetString("lightning", "tabTitleTasks");
      },

      supportsCommand: (aCommand, aTab) => calendarController2.supportsCommand(aCommand),
      isCommandEnabled: (aCommand, aTab) => calendarController2.isCommandEnabled(aCommand),
      doCommand: (aCommand, aTab) => calendarController2.doCommand(aCommand),
      onEvent: (aEvent, aTab) => calendarController2.onEvent(aEvent)
    }
  },

  /* because calendar does some direct menu manipulation, we need to change
   *  to the mail mode to clean up after those hacks.
   */
  saveTabState: function(aTab) {
    ltnSwitch2Mail();
  }
};

window.addEventListener("load", function(e) {
    let tabmail = document.getElementById('tabmail');
    tabmail.registerTabType(calendarTabType);
    tabmail.registerTabMonitor(calendarTabMonitor);
}, false);


function ltnOnLoad(event) {

    // nuke the onload, or we get called every time there's
    // any load that occurs
    window.removeEventListener("load", ltnOnLoad, false);

    // Check if the binary component was loaded
    checkCalendarBinaryComponent();

    document.getElementById("calendarDisplayDeck").
      addEventListener("select", LtnObserveDisplayDeckChange, true);

    // Take care of common initialization
    commonInitCalendar();

    // Add an unload function to the window so we don't leak any listeners
    window.addEventListener("unload", ltnFinish, false);

    // Set up invitations manager
    scheduleInvitationsUpdate(FIRST_DELAY_STARTUP);
    getCalendarManager().addObserver(gInvitationsCalendarManagerObserver);

    let filter = document.getElementById("task-tree-filtergroup");
    filter.value = filter.value || "all";
    document.getElementById("modeBroadcaster").setAttribute("mode", gCurrentMode);
    document.getElementById("modeBroadcaster").setAttribute("checked", "true");

    let mailContextPopup = document.getElementById("mailContext");
    if (mailContextPopup) {
      mailContextPopup.addEventListener("popupshowing",
                                        gCalSetupMailContext.popup, false);
    }

    // Setup customizeDone handlers for our toolbars
    let toolbox = document.getElementById("calendar-toolbox");
    toolbox.customizeDone = function(aEvent) {
        MailToolboxCustomizeDone(aEvent, "CustomizeCalendarToolbar");
    };
    toolbox = document.getElementById("task-toolbox");
    toolbox.customizeDone = function(aEvent) {
        MailToolboxCustomizeDone(aEvent, "CustomizeTaskToolbar");
    };

    ltnIntegrationCheck();

    Services.obs.notifyObservers(window, "lightning-startup-done", false);
}

/**
 * Displays the Lightning integration notification bar
 */
function ltnIntegrationNotification() {
    const kOptOut = "mail.calendar-integration.opt-out"; // default: false
    const kNotify = "calendar.integration.notify"; // default: true
    const kSupportUri = "https://support.mozilla.org/kb/thunderbird-calendar-integration";
    const kLightningGuuid = "{e2fda1a4-762b-4020-b5ad-a41df1933103}";

    // we fall back to messagepanebox for Seamonkey
    let notifyBox = document.getElementById("mail-notification-box") ||
                    document.getElementById("messagepanebox");

    let appBrand = cal.calGetString("brand", "brandShortName", null, "branding");
    let ltnBrand = ltnGetString("lightning", "brandShortName");
    let label = ltnGetString("lightning", "integrationLabel", [appBrand, ltnBrand]);

    // call backs for doing/undoing Lightning removal
    let cbRemoveLightning = function (aAddon) {
        aAddon.userDisabled = true;
    };
    let cbUndoRemoveLightning = function (aAddon) {
        aAddon.userDisabled = false;
    };

    // call backs for the undo opt-out bar
    let cbRestartNow = function(aNotificationBar, aButton) {
        Services.startup.quit(Components.interfaces.nsIAppStartup.eRestart |
                              Components.interfaces.nsIAppStartup.eForceQuit);
    };
    let cbUndoOptOut = function(aNotificationBar, aButton) {
        Preferences.set(kNotify, true);
        Preferences.set(kOptOut, false);
        AddonManager.getAddonByID(kLightningGuuid, cbUndoRemoveLightning);
        // display notification bar again
        ltnIntegrationNotification();
    };

    // call backs for the opt-out bar
    let cbLearnMore = function(aNotificationBar, aButton) {
        // In SeaMonkey the second parameter should be either null or an
        // event object with a non null target.ownerDocument.
        openUILink(kSupportUri, { button: 0,
                                  target: { ownerDocument: document } });
        return true;
    };
    let cbKeepIt = function(aNotificationBar, aButton) {
        Preferences.set(kNotify, false);
    };
    let cbOptOut = function(aNotificationBar, aButton) {
        Preferences.set(kNotify, false);
        Preferences.set(kOptOut, true);
        AddonManager.getAddonByID(kLightningGuuid, cbRemoveLightning);
        // let the user know that removal will be applied after restart
        let restartLabel = ltnGetString("lightning", "integrationRestartLabel",[ltnBrand, appBrand]);
        let button = [{
             label:     ltnGetString("lightning", "integrationUndoButton"),
             accessKey: ltnGetString("lightning", "integrationUndoAccessKey"),
             popup:     null,
             callback:  cbUndoOptOut
         }, {
             label:     ltnGetString("lightning", "integrationRestartButton"),
             accessKey: ltnGetString("lightning", "integrationRestartAccessKey"),
             popup:     null,
             callback:  cbRestartNow
         }];
         notifyBox.appendNotification(restartLabel,
                                      "restart-required",
                                      null,
                                      notifyBox.PRIORITY_INFO_MEDIUM,
                                      button);
    };

    let buttons = [{
         label:     ltnGetString("lightning", "integrationLearnMoreButton"),
         accessKey: ltnGetString("lightning", "integrationLearnMoreAccessKey"),
         popup:     null,
         callback:  cbLearnMore
    }, {
        label:     ltnGetString("lightning", "integrationOptOutButton"),
        accessKey: ltnGetString("lightning", "integrationOptOutAccessKey"),
        popup:     null,
        callback:  cbOptOut
    }, {
        label:     ltnGetString("lightning", "integrationKeepItButton"),
        accessKey: ltnGetString("lightning", "integrationKeepItAccessKey"),
        popup:     null,
        callback:  cbKeepIt
    }];

    // we use PRIORITY_INFO_MEDIUM to overrule notifications from specialTabs.js if any
    let notification = notifyBox.appendNotification(label,
                                                    "calendar-integration",
                                                    null,
                                                    notifyBox.PRIORITY_INFO_MEDIUM,
                                                    buttons);
    notification.persistence = 3;
}

/**
 * Checks whether to display the opt-out notification for Lightning integration
 */
function ltnIntegrationCheck() {
    const kOptOut = "mail.calendar-integration.opt-out"; // default: false
    const kNotify = "calendar.integration.notify"; // default: true
    // don't do anything if the opt-out pref doesn't exist or is enabled by the user or the user has
    // already decided to keep Lightning
    if (!Preferences.get(kOptOut, true) && Preferences.get(kNotify, false)) {
        // action is only needed, if hasn't used Lightning before, so lets check whether this looks
        // like a default calendar setup
        let cnt = new Object();
        let calMgr = cal.getCalendarManager();
        let cals = calMgr.getCalendars(cnt);
        let homeCalName = cal.calGetString("calendar", "homeCalendarName", null, "calendar");
        if (cnt.value == 1 &&
            calMgr.getCalendarPref_(cals[0], "type") == "storage" &&
            calMgr.getCalendarPref_(cals[0], "name") == homeCalName) {
            // this looks like a default setup, so let's see whether the calendar contains any items
            let pCal = cal.async.promisifyCalendar(cals[0]);
            // we look at all items at any time, but we can stop if the first item was found
            // if we've found no items, we call ltnIntegrationNotification to display the bar
            pCal.getItems(Components.interfaces.calICalendar.ITEM_FILTER_ALL_ITEMS, 1, null, null)
                .then(function(aItems) {if (!aItems.length) {ltnIntegrationNotification()}});
        }
    }
}

/* Called at midnight to tell us to redraw date-specific widgets.  Do NOT call
 * this for normal refresh, since it also calls scheduleMidnightRefresh.
 */
function refreshUIBits() {
    try {
        getMinimonth().refreshDisplay();

        // Refresh the current view and just allow the refresh for the others
        // views when will be displayed.
        let currView = currentView();
        currView.goToDay();
        ["day-view",
         "week-view",
         "multiweek-view",
         "month-view"].forEach(function(view) {
            if (view != currView.id) {
                document.getElementById(view).mToggleStatus = -1;
            }
        });

        if (!TodayPane.showsToday()) {
            TodayPane.setDay(now());
        }

        // update the unifinder
        refreshEventTree();

        // update today's date on todaypane button
        document.getElementById("calendar-status-todaypane-button").setUpTodayDate();

    } catch (exc) {
        ASSERT(false, exc);
    }

    // schedule our next update...
    scheduleMidnightUpdate(refreshUIBits);
}

/**
 * Switch the calendar view, and optionally switch to calendar mode.
 *
 * @param aType     The type of view to select.
 * @param aShow     If true, the mode will be switched to calendar if not
 *                    already there.
 */
function switchCalendarView(aType, aShow) {
    gLastShownCalendarView = aType;

    if (aShow && gCurrentMode != "calendar") {
        // This function in turn calls switchToView(), so return afterwards.
        ltnSwitch2Calendar();
        return;
    }

    // Sunbird/Lightning common view switching code
    switchToView(aType);
}

/**
 * This function has the sole responsibility to switch back to
 * mail mode (by calling ltnSwitch2Mail()) if we are getting
 * notifications from other panels (besides the calendar views)
 * but find out that we're not in mail mode. This situation can
 * for example happen if we're in calendar mode but the 'new mail'
 * slider gets clicked and wants to display the appropriate mail.
 * All necessary logic for switching between the different modes
 * should live inside of the corresponding functions:
 * - ltnSwitch2Mail()
 * - ltnSwitch2Calendar()
 * - ltnSwitch2Task()
 */
function LtnObserveDisplayDeckChange(event) {
    var deck = event.target;

    // Bug 309505: The 'select' event also fires when we change the selected
    // panel of calendar-view-box.  Workaround with this check.
    if (deck.id != "calendarDisplayDeck") {
        return;
    }

    var id = null;
    try { id = deck.selectedPanel.id } catch (e) { }

    // Switch back to mail mode in case we find that this
    // notification has been fired but we're still in calendar or task mode.
    // Specifically, switch back if we're *not* in mail mode but the notification
    // did *not* come from either the "calendar-view-box" or the "calendar-task-box".
    if (gCurrentMode != 'mail') {
        if (id != "calendar-view-box" && id != "calendar-task-box") {
            ltnSwitch2Mail();
        }
    }
}

function ltnFinish() {
    getCalendarManager().removeObserver(gInvitationsCalendarManagerObserver);

    // Remove listener for mailContext.
    let mailContextPopup = document.getElementById("mailContext");
    if (mailContextPopup)
      mailContextPopup.removeEventListener("popupshowing",
                                           gCalSetupMailContext.popup, false);

    // Common finish steps
    commonFinishCalendar();
}

// == invitations link
var FIRST_DELAY_STARTUP = 100;
var FIRST_DELAY_RESCHEDULE = 100;
var FIRST_DELAY_REGISTER = 10000;
var FIRST_DELAY_UNREGISTER = 0;

var gInvitationsOperationListener = {
    mCount: 0,

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
    onOperationComplete: function sBOL_onOperationComplete(aCalendar,
                                                           aStatus,
                                                           aOperationType,
                                                           aId,
                                                           aDetail) {
        let invitationsBox = document.getElementById("calendar-invitations-panel");
        if (Components.isSuccessCode(aStatus)) {
            let value = ltnGetString("lightning", "invitationsLink.label", [this.mCount]);
            document.getElementById("calendar-invitations-label").value = value;
            setElementValue(invitationsBox, this.mCount < 1 && "true", "hidden");
        } else {
            invitationsBox.setAttribute("hidden", "true");
        }
        this.mCount = 0;
    },

    onGetResult: function sBOL_onGetResult(aCalendar,
                                           aStatus,
                                           aItemType,
                                           aDetail,
                                           aCount,
                                           aItems) {
        if (Components.isSuccessCode(aStatus)) {
            this.mCount += aCount;
        }
    }
};

var gInvitationsCalendarManagerObserver = {
    mSideBar: this,

    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calICalendarManagerObserver]),

    onCalendarRegistered: function cMO_onCalendarRegistered(aCalendar) {
        this.mSideBar.rescheduleInvitationsUpdate(FIRST_DELAY_REGISTER);
    },

    onCalendarUnregistering: function cMO_onCalendarUnregistering(aCalendar) {
        this.mSideBar.rescheduleInvitationsUpdate(FIRST_DELAY_UNREGISTER);
    },

    onCalendarDeleting: function cMO_onCalendarDeleting(aCalendar) {
    }
};

function scheduleInvitationsUpdate(firstDelay) {
    gInvitationsOperationListener.mCount = 0;
    getInvitationsManager().scheduleInvitationsUpdate(firstDelay,
                                                      gInvitationsOperationListener);
}

function rescheduleInvitationsUpdate(firstDelay) {
    getInvitationsManager().cancelInvitationsUpdate();
    scheduleInvitationsUpdate(firstDelay);
}

function openInvitationsDialog() {
    getInvitationsManager().cancelInvitationsUpdate();
    gInvitationsOperationListener.mCount = 0;
    getInvitationsManager().openInvitationsDialog(
        gInvitationsOperationListener,
        function oiD_callback() {
            scheduleInvitationsUpdate(FIRST_DELAY_RESCHEDULE);
        });
}

/**
 * the current mode is set to a string defining the current
 * mode we're in. allowed values are:
 *  - 'mail'
 *  - 'calendar'
 *  - 'task'
 */
var gCurrentMode = 'mail';

/**
 * ltnSwitch2Mail() switches to the mail mode
 */

function ltnSwitch2Mail() {
  if (gCurrentMode != 'mail') {
    gCurrentMode = 'mail';
    document.getElementById("modeBroadcaster").setAttribute("mode", gCurrentMode);

    document.commandDispatcher.updateCommands('calendar_commands');
    window.setCursor("auto");
  }
}

/**
 * ltnSwitch2Calendar() switches to the calendar mode
 */

function ltnSwitch2Calendar() {
  if (gCurrentMode != 'calendar') {
    gCurrentMode = 'calendar';
    document.getElementById("modeBroadcaster").setAttribute("mode", gCurrentMode);

    // display the calendar panel on the display deck
    let deck = document.getElementById("calendarDisplayDeck");
    deck.selectedPanel = document.getElementById("calendar-view-box");

    // show the last displayed type of calendar view
    switchToView(gLastShownCalendarView);

    document.commandDispatcher.updateCommands('calendar_commands');
    window.setCursor("auto");

    // make sure the view is sized correctly
    onCalendarViewResize();
  }
}

/**
 * ltnSwitch2Task() switches to the task mode
 */

function ltnSwitch2Task() {
  if (gCurrentMode != 'task') {
    gCurrentMode = 'task';
    document.getElementById("modeBroadcaster").setAttribute("mode", gCurrentMode);

    // display the task panel on the display deck
    let deck = document.getElementById("calendarDisplayDeck");
    deck.selectedPanel = document.getElementById("calendar-task-box");

    document.commandDispatcher.updateCommands('calendar_commands');
    window.setCursor("auto");
  }
}

var gCalSetupMailContext = {
    popup: function gCalSetupMailContext_popup() {
        let hasSelection = (gFolderDisplay.selectedMessage != null);
        // Disable the convert menu altogether.
        setElementValue("mailContext-calendar-convert-menu",
                        !hasSelection && "true", "hidden");
    }
};

// Overwrite the InitMessageMenu function, since we never know in which order
// the popupshowing event will be processed. This function takes care of
// disabling the message menu when in calendar or task mode.
function calInitMessageMenu() {
    calInitMessageMenu.origFunc();

    document.getElementById("markMenu").disabled = (gCurrentMode != 'mail');
}
calInitMessageMenu.origFunc = InitMessageMenu;
InitMessageMenu = calInitMessageMenu;

window.addEventListener("load", ltnOnLoad, false);

/**
 * Make the toolbars' context menu dependent on the current mode.
 */
function onToolbarsPopupShowingWithMode(aEvent, aInsertPoint) {
    if (onViewToolbarsPopupShowing.length < 3) {
        // SeaMonkey
        onViewToolbarsPopupShowing(aEvent);
        return;
    }

    let toolbox = [];
    if (gCurrentMode != "mail") {
        toolbox.push("navigation-toolbox");
    }
    toolbox.push(gCurrentMode + "-toolbox");
    onViewToolbarsPopupShowing(aEvent, toolbox, aInsertPoint);
}

// Initialize the Calendar sidebar menu state
function InitViewCalendarPaneMenu() {
    let calSidebar = document.getElementById("ltnSidebar");

    setBooleanAttribute("ltnViewCalendarPane", "checked",
                        !calSidebar.getAttribute("collapsed"));

    if (document.getElementById("appmenu_ltnViewCalendarPane")) {
        setBooleanAttribute("appmenu_ltnViewCalendarPane", "checked",
                            !calSidebar.getAttribute("collapsed"));
    }
}

/**
 * Checks if Lightning's binary component was successfully loaded.
 */
function checkCalendarBinaryComponent() {
    // Don't even get started if we are running ical.js or the binary component
    // was successfully loaded.
    if ("@mozilla.org/calendar/datetime;1" in Components.classes ||
        Preferences.get("calendar.icaljs", false)) {
        return;
    }

    const THUNDERBIRD_GUID = "{3550f703-e582-4d05-9a08-453d09bdfdc6}";
    const SEAMONKEY_GUID = "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}";
    const LIGHTNING_GUID = "{e2fda1a4-762b-4020-b5ad-a41df1933103}";

    AddonManager.getAddonByID(LIGHTNING_GUID, (ext) => {
        if (!ext) {
            return;
        }

        let version;
        let appversion = Services.appinfo.version;
        let versionparts = appversion.split(".");
        let extbrand = ltnGetString("lightning", "brandShortName");

        switch (Services.appinfo.ID) {
            case THUNDERBIRD_GUID: // e.g. 31.4.0 -> 3.3
                version = ((parseInt(versionparts[0], 10) + 2) / 10).toFixed(1);
                break;
            case SEAMONKEY_GUID: // e.g. 2.28.4 -> 3.3
                version = ((parseInt(versionparts[1], 10) + 5) / 10).toFixed(1);
                break;
        }

        let text;
        if (version && version != ext.version) {
            let args = [extbrand, ext.version, version];
            text = ltnGetString("lightning", "binaryComponentKnown", args);
        } else {
            let brand = cal.calGetString("brand", "brandShortName", null, "branding");
            let args = [extbrand, brand, appversion, ext.version];
            text = ltnGetString("lightning", "binaryComponentUnknown", args);
        }

        let title = ltnGetString("lightning", "binaryComponentTitle", [extbrand]);
        openAddonsMgr("addons://detail/" + encodeURIComponent(LIGHTNING_GUID));
        Services.prompt.alert(window, title, text);
    });
}
