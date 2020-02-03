/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported promptDeleteCalendar, loadCalendarManager, unloadCalendarManager,
 *         calendarListTooltipShowing, calendarListSetupContextMenu,
 *         ensureCalendarVisible, toggleCalendarVisible, showAllCalendars,
 *         showOnlyCalendar, openCalendarSubscriptionsDialog,
 *         calendarOfflineManager
 */

/* import-globals-from calendar-migration.js */
/* import-globals-from calendar-command-controller.js */
/* import-globals-from calendar-ui-utils.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * Get this window's currently selected calendar.
 *
 * @return      The currently selected calendar.
 */
function getSelectedCalendar() {
  return cal.view.getCompositeCalendar(window).defaultCalendar;
}

/**
 * Deletes the passed calendar, prompting the user if he really wants to do
 * this. If there is only one calendar left, no calendar is removed and the user
 * is not prompted.
 *
 * @param aCalendar     The calendar to delete.
 */
function promptDeleteCalendar(aCalendar) {
  const nIPS = Ci.nsIPromptService;
  const cICM = Ci.calICalendarManager;

  let calMgr = cal.getCalendarManager();
  let calendars = calMgr.getCalendars();
  if (calendars.length <= 1) {
    // If this is the last calendar, don't delete it.
    return;
  }

  let modes = new Set(aCalendar.getProperty("capabilities.removeModes") || ["unsubscribe"]);
  let title = cal.l10n.getCalString("removeCalendarTitle");

  let textKey, b0text, b2text;
  let removeFlags = 0;
  let promptFlags =
    nIPS.BUTTON_POS_0 * nIPS.BUTTON_TITLE_IS_STRING + nIPS.BUTTON_POS_1 * nIPS.BUTTON_TITLE_CANCEL;

  if (modes.has("delete") && !modes.has("unsubscribe")) {
    textKey = "removeCalendarMessageDelete";
    promptFlags += nIPS.BUTTON_DELAY_ENABLE;
    b0text = cal.l10n.getCalString("removeCalendarButtonDelete");
  } else if (modes.has("delete")) {
    textKey = "removeCalendarMessageDeleteOrUnsubscribe";
    promptFlags += nIPS.BUTTON_POS_2 * nIPS.BUTTON_TITLE_IS_STRING;
    b0text = cal.l10n.getCalString("removeCalendarButtonUnsubscribe");
    b2text = cal.l10n.getCalString("removeCalendarButtonDelete");
  } else if (modes.has("unsubscribe")) {
    textKey = "removeCalendarMessageUnsubscribe";
    removeFlags |= cICM.REMOVE_NO_DELETE;
    b0text = cal.l10n.getCalString("removeCalendarButtonUnsubscribe");
  } else {
    return;
  }

  let text = cal.l10n.getCalString(textKey, [aCalendar.name]);
  let res = Services.prompt.confirmEx(
    window,
    title,
    text,
    promptFlags,
    b0text,
    null,
    b2text,
    null,
    {}
  );

  if (res != 1) {
    // Not canceled
    if (textKey == "removeCalendarMessageDeleteOrUnsubscribe" && res == 0) {
      // Both unsubscribing and deleting is possible, but unsubscribing was
      // requested. Make sure no delete is executed.
      removeFlags |= cICM.REMOVE_NO_DELETE;
    }

    calMgr.removeCalendar(aCalendar, removeFlags);
  }
}

/**
 * Called to initialize the calendar manager for a window.
 */
function loadCalendarManager() {
  let calendarList = document.getElementById("calendar-list");

  // Set up the composite calendar in the calendar list widget.
  let compositeCalendar = cal.view.getCompositeCalendar(window);

  // Initialize our composite observer
  compositeCalendar.addObserver(compositeObserver);

  // Create the home calendar if no calendar exists.
  let calendars = cal.getCalendarManager().getCalendars();
  if (calendars.length) {
    // migration code to make sure calendars, which do not support caching have cache enabled
    // required to further clean up on top of bug 1182264
    for (let calendar of calendars) {
      if (
        calendar.getProperty("cache.supported") === false &&
        calendar.getProperty("cache.enabled") === true
      ) {
        calendar.deleteProperty("cache.enabled");
      }
    }
  } else {
    initHomeCalendar();
  }

  let calendarManager = cal.getCalendarManager();

  for (let calendar of sortCalendarArray(cal.getCalendarManager().getCalendars())) {
    addCalendarItem(calendar);
  }

  function addCalendarItem(calendar) {
    let item = document.createXULElement("richlistitem");
    item.searchLabel = calendar.name;
    item.setAttribute("calendar-id", calendar.id);
    if (calendar.getProperty("disabled")) {
      item.setAttribute("calendar-disabled", "true");
    }
    if (!Components.isSuccessCode(calendar.getProperty("currentStatus"))) {
      item.setAttribute("calendar-readfailed", "true");
    }
    if (calendar.readOnly) {
      item.setAttribute("calendar-readonly", "true");
    }

    let checkbox = document.createXULElement("checkbox");
    checkbox.classList.add("calendar-displayed");
    checkbox.checked = calendar.getProperty("calendar-main-in-composite");
    if (calendar.getProperty("disabled")) {
      checkbox.setAttribute("disabled", "true");
    }
    item.appendChild(checkbox);

    let cssSafeId = cal.view.formatStringForCSSRule(calendar.id);
    let image = document.createXULElement("image");
    image.classList.add("calendar-color");
    item.appendChild(image);
    image.style.backgroundColor = `var(--calendar-${cssSafeId}-backcolor)`;

    let label = document.createXULElement("label");
    label.classList.add("calendar-name");
    label.value = calendar.name;
    item.appendChild(label);

    image = document.createXULElement("image");
    image.classList.add("calendar-readstatus");
    image.setAttribute("tooltip", "calendar-list-tooltip");
    item.appendChild(image);

    calendarList.appendChild(item);
    if (calendar.getProperty("calendar-main-default")) {
      calendarList.selectedItem = item;
    }
  }

  function saveSortOrder() {
    let order = [...calendarList.children].map(i => i.getAttribute("calendar-id"));
    Services.prefs.setStringPref("calendar.list.sortOrder", order.join(" "));
    try {
      Services.prefs.savePrefFile(null);
    } catch (ex) {
      cal.ERROR(ex);
    }
  }

  calendarList.addEventListener("click", event => {
    if (!event.target.matches("checkbox.calendar-displayed")) {
      return;
    }

    let item = event.target.closest("richlistitem");
    let calendarId = item.getAttribute("calendar-id");
    let calendar = calendarManager.getCalendarById(calendarId);

    if (event.target.checked) {
      compositeCalendar.addCalendar(calendar);
    } else {
      compositeCalendar.removeCalendar(calendar);
    }
    calendarList.focus();
  });
  calendarList.addEventListener("dblclick", event => {
    if (event.target.matches("checkbox.calendar-displayed")) {
      return;
    }

    let item = event.target.closest("richlistitem");
    if (!item) {
      // Click on an empty part of the richlistbox.
      cal.window.openCalendarWizard(window);
      return;
    }

    let calendarId = item.getAttribute("calendar-id");
    let calendar = calendarManager.getCalendarById(calendarId);
    cal.window.openCalendarProperties(window, calendar);
  });
  calendarList.addEventListener("dragstart", event => {
    let item = event.target.closest("richlistitem");
    if (!item) {
      return;
    }

    let calendarId = item.getAttribute("calendar-id");
    event.dataTransfer.setData("application/x-moz-calendarid", calendarId);
    event.dataTransfer.effectAllowed = "move";
  });
  calendarList.addEventListener("dragenter", event => {
    if (
      event.target == calendarList &&
      event.dataTransfer.types.includes("application/x-moz-calendarid")
    ) {
      event.dataTransfer.dropEffect = "move";
      event.preventDefault();
    }
  });
  calendarList.addEventListener("dragover", event => {
    event.preventDefault();

    let existing = calendarList.querySelector("[drop-on]");
    if (existing) {
      existing.removeAttribute("drop-on");
    }

    if (event.target == calendarList) {
      calendarList.lastElementChild.setAttribute("drop-on", "bottom");
      return;
    }

    let item = event.target.closest("richlistitem");
    if (item) {
      // If we're dragging/dropping in bottom half of attachmentitem,
      // adjust target to target.nextElementSibling (to show dropmarker above that).
      if ((event.screenY - item.screenY) / item.getBoundingClientRect().height >= 0.5) {
        item = item.nextElementSibling;
      }
      if (item) {
        item.setAttribute("drop-on", "top");
      } else {
        calendarList.lastElementChild.setAttribute("drop-on", "bottom");
      }
    }
  });
  calendarList.addEventListener("dragexit", event => {
    if (event.target != calendarList) {
      return;
    }

    let existing = calendarList.querySelector("[drop-on]");
    if (existing) {
      existing.removeAttribute("drop-on");
    }
  });
  calendarList.addEventListener("dragend", event => {
    let existing = calendarList.querySelector("[drop-on]");
    if (existing) {
      existing.removeAttribute("drop-on");
    }
  });
  calendarList.addEventListener("drop", event => {
    let existing = calendarList.querySelector("[drop-on]");
    let position = existing.getAttribute("drop-on");
    if (!existing) {
      return;
    }

    existing.removeAttribute("drop-on");

    let calendarId = event.dataTransfer.getData("application/x-moz-calendarid");
    if (calendarId == existing.getAttribute("calendar-id")) {
      return;
    }

    let item = calendarList.getElementsByAttribute("calendar-id", calendarId)[0];
    if (position == "bottom") {
      existing = null;
    }
    calendarList.insertBefore(item, existing);

    saveSortOrder();
  });
  calendarList.addEventListener("keypress", event => {
    let item = calendarList.selectedItem;
    let calendarId = item.getAttribute("calendar-id");
    let calendar = calendarManager.getCalendarById(calendarId);

    switch (event.key) {
      case "Delete":
        promptDeleteCalendar(calendar);
        break;
      case " ": {
        if (item.querySelector(".calendar-displayed").checked) {
          compositeCalendar.removeCalendar(calendar);
        } else {
          compositeCalendar.addCalendar(calendar);
        }
        break;
      }
    }
  });
  calendarList.addEventListener("select", event => {
    let item = calendarList.selectedItem;
    let calendarId = item.getAttribute("calendar-id");
    let calendar = calendarManager.getCalendarById(calendarId);

    compositeCalendar.defaultCalendar = calendar;
  });

  calendarList._calendarObserver = {
    QueryInterface: ChromeUtils.generateQI([Ci.calIObserver]),

    onStartBatch() {},
    onEndBatch() {},
    onLoad() {},
    onAddItem(item) {},
    onModifyItem(newItem, oldItem) {},
    onDeleteItem(deletedItem) {},
    onError(calendar, errNo, message) {},

    onPropertyChanged(calendar, name, value, oldValue) {
      let item = calendarList.getElementsByAttribute("calendar-id", calendar.id)[0];
      if (!item) {
        return;
      }

      switch (name) {
        case "disabled":
          setBooleanAttribute(item, "calendar-disabled", value);
          setBooleanAttribute(item.querySelector(".calendar-displayed"), "disabled", value);
          break;
        case "calendar-main-default":
          if (value) {
            calendarList.selectedItem = item;
          }
          break;
        case "calendar-main-in-composite":
          setBooleanAttribute(item.querySelector(".calendar-displayed"), "checked", value);
          break;
        case "name":
          item.searchLabel = calendar.name;
          item.querySelector(".calendar-name").value = value;
          break;
        case "currentStatus":
          setBooleanAttribute(item, "calendar-readfailed", !Components.isSuccessCode(value));
          break;
        case "readOnly":
          setBooleanAttribute(item, "calendar-readonly", value);
          break;
      }
    },

    onPropertyDeleting(calendar, name) {
      // Since the old value is not used directly in onPropertyChanged, but
      // should not be the same as the value, set it to a different value.
      this.onPropertyChanged(calendar, name, null, null);
    },
  };
  calendarManager.addCalendarObserver(calendarList._calendarObserver);

  calendarList._calendarManagerObserver = {
    QueryInterface: ChromeUtils.generateQI([Ci.calICalendarManagerObserver]),

    onCalendarRegistered(calendar) {
      let inComposite = calendar.getProperty("calendar-main-in-composite");
      if (inComposite === null) {
        compositeCalendar.addCalendar(calendar);
      }
      addCalendarItem(calendar);
      saveSortOrder();
    },
    onCalendarUnregistering(calendar) {
      compositeCalendar.removeCalendar(calendar);
      let item = calendarList.getElementsByAttribute("calendar-id", calendar.id)[0];
      item.remove();
      if (compositeCalendar.defaultCalendar.id == calendar.id) {
        compositeCalendar.defaultCalendar = compositeCalendar.getCalendars()[0];
      }
      saveSortOrder();
    },
    onCalendarDeleting(calendar) {},
  };
  calendarManager.addObserver(calendarList._calendarManagerObserver);
}

/**
 * Creates the initial "Home" calendar if no calendar exists.
 */
function initHomeCalendar() {
  let calMgr = cal.getCalendarManager();
  let composite = cal.view.getCompositeCalendar(window);
  let url = Services.io.newURI("moz-storage-calendar://");
  let homeCalendar = calMgr.createCalendar("storage", url);
  homeCalendar.name = cal.l10n.getCalString("homeCalendarName");
  calMgr.registerCalendar(homeCalendar);
  Services.prefs.setStringPref("calendar.list.sortOrder", homeCalendar.id);
  composite.addCalendar(homeCalendar);

  // Wrapping this in a try/catch block, as if any of the migration code
  // fails, the app may not load.
  if (Services.prefs.getBoolPref("calendar.migrator.enabled", true)) {
    try {
      gDataMigrator.checkAndMigrate();
    } catch (e) {
      Cu.reportError("Migrator error: " + e);
    }
  }

  return homeCalendar;
}

/**
 * Called to clean up the calendar manager for a window.
 */
function unloadCalendarManager() {
  let compositeCalendar = cal.view.getCompositeCalendar(window);
  compositeCalendar.setStatusObserver(null, null);
  compositeCalendar.removeObserver(compositeObserver);

  let calendarList = document.getElementById("calendar-list");
  let calendarManager = cal.getCalendarManager();
  calendarManager.removeCalendarObserver(calendarList._calendarObserver);
  calendarManager.removeObserver(calendarList._calendarManagerObserver);
}

/**
 * Handler function to call when the tooltip is showing on the calendar list.
 *
 * @param event     The DOM event provoked by the tooltip showing.
 */
function calendarListTooltipShowing(event) {
  let realTarget = document.elementFromPoint(event.clientX, event.clientY);
  let item = realTarget.closest("richlistitem");
  if (!item) {
    return false;
  }

  let calendarName = item.querySelector(".calendar-name").value;
  let tooltipText;
  if (item.hasAttribute("calendar-readfailed")) {
    tooltipText = cal.l10n.getCalString("tooltipCalendarDisabled", [calendarName]);
  } else if (item.hasAttribute("calendar-readonly")) {
    tooltipText = cal.l10n.getCalString("tooltipCalendarReadOnly", [calendarName]);
  }

  setElementValue("calendar-list-tooltip", tooltipText, "label");
  return !!tooltipText;
}

/**
 * A handler called to set up the context menu on the calendar list.
 *
 * @param event         The DOM event that caused the context menu to open.
 * @return              Returns true if the context menu should be shown.
 */
function calendarListSetupContextMenu(event) {
  let calendar;
  let composite = cal.view.getCompositeCalendar(window);

  if (document.popupNode.matches("checkbox.calendar-displayed")) {
    return;
  }

  let item = document.popupNode.closest("richlistitem");
  if (item) {
    let calendarId = item.getAttribute("calendar-id");
    calendar = cal.getCalendarManager().getCalendarById(calendarId);
  }

  document.getElementById("list-calendars-context-menu").contextCalendar = calendar;

  if (calendar) {
    let stringName = composite.getCalendarById(calendar.id) ? "hideCalendar" : "showCalendar";
    setElementValue(
      "list-calendars-context-togglevisible",
      cal.l10n.getCalString(stringName, [calendar.name]),
      "label"
    );
    let accessKey = document
      .getElementById("list-calendars-context-togglevisible")
      .getAttribute(composite.getCalendarById(calendar.id) ? "accesskeyhide" : "accesskeyshow");
    setElementValue("list-calendars-context-togglevisible", accessKey, "accesskey");
    setElementValue(
      "list-calendars-context-showonly",
      cal.l10n.getCalString("showOnlyCalendar", [calendar.name]),
      "label"
    );
    setupDeleteMenuitem("list-calendars-context-delete", calendar);
    for (let elem of event.target.querySelectorAll(".needs-calendar")) {
      elem.removeAttribute("collapsed");
    }
  } else {
    for (let elem of event.target.querySelectorAll(".needs-calendar")) {
      elem.setAttribute("collapsed", "true");
    }
  }

  // Only enable calendar search if there's actually the chance of finding something:
  let hasProviders = cal.getCalendarSearchService().getProviders().length < 1 && "true";
  setElementValue("list-calendars-context-find", hasProviders, "collapsed");
}

/**
 * Changes the "delete calendar" menuitem to have the right label based on the
 * removeModes. The menuitem must have the attributes "labelremove",
 * "labeldelete" and "labelunsubscribe".
 *
 * @param aDeleteId     The id of the menuitem to delete the calendar
 */
function setupDeleteMenuitem(aDeleteId, aCalendar) {
  let calendar = aCalendar === undefined ? getSelectedCalendar() : aCalendar;
  let modes = new Set(
    calendar ? calendar.getProperty("capabilities.removeModes") || ["unsubscribe"] : []
  );

  let type = "remove";
  if (modes.has("delete") && !modes.has("unsubscribe")) {
    type = "delete";
  } else if (modes.has("unsubscribe") && !modes.has("delete")) {
    type = "unsubscribe";
  }

  let deleteItem = document.getElementById(aDeleteId);
  setElementValue(deleteItem, deleteItem.getAttribute("label" + type), "label");
  setElementValue(deleteItem, deleteItem.getAttribute("accesskey" + type), "accesskey");
}

/**
 * Makes sure the passed calendar is visible to the user
 *
 * @param aCalendar   The calendar to make visible.
 */
function ensureCalendarVisible(aCalendar) {
  // We use the main window's calendar list to ensure that the calendar is visible.
  // If the main window has been closed this function may still be called,
  // like when an event/task window is still open and the user clicks 'save',
  // thus we have the extra checks.
  let calendarList = document.getElementById("calendar-list");
  if (calendarList) {
    let compositeCalendar = cal.view.getCompositeCalendar(window);
    compositeCalendar.addCalendar(aCalendar);
  }
}

/**
 * Hides the specified calendar if it is visible, or shows it if it is hidden.
 *
 * @param aCalendar   The calendar to show or hide
 */
function toggleCalendarVisible(aCalendar) {
  let composite = cal.view.getCompositeCalendar(window);
  if (composite.getCalendarById(aCalendar.id)) {
    composite.removeCalendar(aCalendar);
  } else {
    composite.addCalendar(aCalendar);
  }
}

/**
 * Shows all hidden calendars.
 */
function showAllCalendars() {
  let composite = cal.view.getCompositeCalendar(window);
  let cals = cal.getCalendarManager().getCalendars();

  composite.startBatch();
  for (let calendar of cals) {
    if (!composite.getCalendarById(calendar.id)) {
      composite.addCalendar(calendar);
    }
  }
  composite.endBatch();
}

/**
 * Shows only the specified calendar, and hides all others.
 *
 * @param aCalendar   The calendar to show as the only visible calendar
 */
function showOnlyCalendar(aCalendar) {
  let composite = cal.view.getCompositeCalendar(window);
  let cals = composite.getCalendars() || [];

  composite.startBatch();
  for (let calendar of cals) {
    if (calendar.id != aCalendar.id) {
      composite.removeCalendar(calendar);
    }
  }
  composite.addCalendar(aCalendar);
  composite.endBatch();
}

var compositeObserver = {
  QueryInterface: cal.generateQI([Ci.calIObserver, Ci.calICompositeObserver]),

  onStartBatch: function() {},
  onEndBatch: function() {},
  onAddItem: function() {},
  onModifyItem: function() {},
  onDeleteItem: function() {},
  onError: function() {},
  onPropertyChanged: function() {},
  onPropertyDeleting: function() {},

  onLoad: function() {
    calendarUpdateNewItemsCommand();
    document.commandDispatcher.updateCommands("calendar_commands");
  },

  onCalendarAdded: function(aCalendar) {
    // Update the calendar commands for number of remote calendars and for
    // more than one calendar
    document.commandDispatcher.updateCommands("calendar_commands");
  },

  onCalendarRemoved: function(aCalendar) {
    // Update commands to disallow deleting the last calendar and only
    // allowing reload remote calendars when there are remote calendars.
    document.commandDispatcher.updateCommands("calendar_commands");
  },

  onDefaultCalendarChanged: function(aNewCalendar) {
    // A new default calendar may mean that the new calendar has different
    // ACLs. Make sure the commands are updated.
    calendarUpdateNewItemsCommand();
    document.commandDispatcher.updateCommands("calendar_commands");
  },
};

/**
 * Opens the subscriptions dialog modally.
 */
function openCalendarSubscriptionsDialog() {
  // the dialog will reset this to auto when it is done loading
  window.setCursor("wait");

  // open the dialog modally
  window.openDialog(
    "chrome://calendar/content/calendar-subscriptions-dialog.xhtml",
    "_blank",
    "chrome,titlebar,modal,resizable"
  );
}

/**
 * Calendar Offline Manager
 */
var calendarOfflineManager = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),

  init: function() {
    if (this.initialized) {
      throw Cr.NS_ERROR_ALREADY_INITIALIZED;
    }
    Services.obs.addObserver(this, "network:offline-status-changed");

    this.updateOfflineUI(!this.isOnline());
    this.initialized = true;
  },

  uninit: function() {
    if (!this.initialized) {
      throw Cr.NS_ERROR_NOT_INITIALIZED;
    }
    Services.obs.removeObserver(this, "network:offline-status-changed");
    this.initialized = false;
  },

  isOnline: function() {
    return !Services.io.offline;
  },

  updateOfflineUI: function(aIsOffline) {
    // Refresh the current view
    currentView().goToDay(currentView().selectedDay);

    // Set up disabled locks for offline
    document.commandDispatcher.updateCommands("calendar_commands");
  },

  observe: function(aSubject, aTopic, aState) {
    if (aTopic == "network:offline-status-changed") {
      this.updateOfflineUI(aState == "offline");
    }
  },
};
