/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals sortCalendarArray, gDataMigrator, calendarUpdateNewItemsCommand, currentView */

/* exported promptDeleteCalendar, loadCalendarManager, unloadCalendarManager,
 *   calendarListTooltipShowing, calendarListSetupContextMenu,
 *   ensureCalendarVisible, toggleCalendarVisible, showAllCalendars,
 *   showOnlyCalendar, calendarOfflineManager, openLocalCalendar,
 */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

/**
 * Get this window's currently selected calendar.
 *
 * @returns The currently selected calendar.
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
  const calendars = cal.manager.getCalendars();
  if (calendars.length <= 1) {
    // If this is the last calendar, don't delete it.
    return;
  }

  const modes = new Set(aCalendar.getProperty("capabilities.removeModes") || ["unsubscribe"]);
  const title = cal.l10n.getCalString("removeCalendarTitle");

  let textKey, b0text, b2text;
  let removeFlags = 0;
  let promptFlags =
    Ci.nsIPromptService.BUTTON_POS_0 * Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
    Ci.nsIPromptService.BUTTON_POS_1 * Ci.nsIPromptService.BUTTON_TITLE_CANCEL;

  if (modes.has("delete") && !modes.has("unsubscribe")) {
    textKey = "removeCalendarMessageDelete";
    promptFlags += Ci.nsIPromptService.BUTTON_DELAY_ENABLE;
    b0text = cal.l10n.getCalString("removeCalendarButtonDelete");
  } else if (modes.has("delete")) {
    textKey = "removeCalendarMessageDeleteOrUnsubscribe";
    promptFlags += Ci.nsIPromptService.BUTTON_POS_2 * Ci.nsIPromptService.BUTTON_TITLE_IS_STRING;
    b0text = cal.l10n.getCalString("removeCalendarButtonUnsubscribe");
    b2text = cal.l10n.getCalString("removeCalendarButtonDelete");
  } else if (modes.has("unsubscribe")) {
    textKey = "removeCalendarMessageUnsubscribe";
    removeFlags |= Ci.calICalendarManager.REMOVE_NO_DELETE;
    b0text = cal.l10n.getCalString("removeCalendarButtonUnsubscribe");
  } else {
    return;
  }

  const text = cal.l10n.getCalString(textKey, [aCalendar.name]);
  const res = Services.prompt.confirmEx(
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
      removeFlags |= Ci.calICalendarManager.REMOVE_NO_DELETE;
    }

    cal.manager.removeCalendar(aCalendar, removeFlags);
  }
}

/**
 * Call to refresh the status image of a calendar item when the
 * calendar-readfailed or calendar-readonly attributes are added or removed.
 *
 * @param {MozRichlistitem} item - The calendar item to update.
 */
function updateCalendarStatusIndicators(item) {
  const calendarName = item.querySelector(".calendar-name").textContent;
  const image = item.querySelector("img.calendar-readstatus");
  if (item.hasAttribute("calendar-readfailed")) {
    image.setAttribute("src", "chrome://messenger/skin/icons/new/compact/warning.svg");
    const tooltip = cal.l10n.getCalString("tooltipCalendarDisabled", [calendarName]);
    image.setAttribute("title", tooltip);
  } else if (item.hasAttribute("calendar-readonly")) {
    image.setAttribute("src", "chrome://messenger/skin/icons/new/compact/lock.svg");
    const tooltip = cal.l10n.getCalString("tooltipCalendarReadOnly", [calendarName]);
    image.setAttribute("title", tooltip);
  } else {
    image.removeAttribute("src");
    image.removeAttribute("title");
  }
}

/**
 * Called to initialize the calendar manager for a window.
 */
async function loadCalendarManager() {
  const calendarList = document.getElementById("calendar-list");

  // Set up the composite calendar in the calendar list widget.
  const compositeCalendar = cal.view.getCompositeCalendar(window);

  // Initialize our composite observer
  compositeCalendar.addObserver(compositeObserver);

  // Create the home calendar if no calendar exists.
  const calendars = cal.manager.getCalendars();
  if (calendars.length) {
    // migration code to make sure calendars, which do not support caching have cache enabled
    // required to further clean up on top of bug 1182264
    for (const calendar of calendars) {
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

  for (const calendar of sortCalendarArray(cal.manager.getCalendars())) {
    addCalendarItem(calendar);
  }

  function addCalendarItem(calendar) {
    const item = document
      .getElementById("calendar-list-item")
      .content.firstElementChild.cloneNode(true);
    const forceDisabled = calendar.getProperty("force-disabled");
    item.id = `calendar-listitem-${calendar.id}`;
    item.searchLabel = calendar.name;
    item.setAttribute("aria-label", calendar.name);
    item.setAttribute("calendar-id", calendar.id);
    item.toggleAttribute("calendar-disabled", calendar.getProperty("disabled"));
    item.toggleAttribute(
      "calendar-readfailed",
      !Components.isSuccessCode(calendar.getProperty("currentStatus")) || forceDisabled
    );
    item.toggleAttribute("calendar-readonly", calendar.readOnly);
    item.toggleAttribute("calendar-muted", calendar.getProperty("suppressAlarms"));
    document.l10n.setAttributes(
      item.querySelector(".calendar-mute-status"),
      "calendar-no-reminders-tooltip",
      { calendarName: calendar.name }
    );
    document.l10n.setAttributes(
      item.querySelector(".calendar-more-button"),
      "calendar-list-item-context-button",
      { calendarName: calendar.name }
    );

    const cssSafeId = cal.view.formatStringForCSSRule(calendar.id);
    const colorMarker = item.querySelector(".calendar-color");
    if (calendar.getProperty("disabled")) {
      colorMarker.style.backgroundColor = "transparent";
      colorMarker.style.border = `2px solid var(--calendar-${cssSafeId}-backcolor)`;
    } else {
      colorMarker.style.backgroundColor = `var(--calendar-${cssSafeId}-backcolor)`;
    }

    const label = item.querySelector(".calendar-name");
    label.textContent = calendar.name;

    updateCalendarStatusIndicators(item);

    const enable = item.querySelector(".calendar-enable-button");
    document.l10n.setAttributes(enable, "calendar-enable-button");

    enable.hidden = forceDisabled || !calendar.getProperty("disabled");

    const displayedCheckbox = item.querySelector(".calendar-displayed");
    displayedCheckbox.checked = calendar.getProperty("calendar-main-in-composite");
    displayedCheckbox.hidden = calendar.getProperty("disabled");
    const stringName = cal.view.getCompositeCalendar(window).getCalendarById(calendar.id)
      ? "hideCalendar"
      : "showCalendar";
    displayedCheckbox.setAttribute("title", cal.l10n.getCalString(stringName, [calendar.name]));

    calendarList.appendChild(item);
    if (calendar.getProperty("calendar-main-default")) {
      // The list needs to handle the addition of the row before we can select it.
      setTimeout(() => {
        calendarList.selectedIndex = calendarList.rows.indexOf(item);
      });
    }
  }

  function saveSortOrder() {
    const order = [...calendarList.children].map(i => i.getAttribute("calendar-id"));
    Services.prefs.setStringPref("calendar.list.sortOrder", order.join(" "));
    try {
      Services.prefs.savePrefFile(null);
    } catch (ex) {
      cal.ERROR(ex);
    }
  }

  calendarList.addEventListener("click", event => {
    if (event.target.matches(".calendar-enable-button")) {
      const calendar = cal.manager.getCalendarById(
        event.target.closest("li").getAttribute("calendar-id")
      );
      calendar.setProperty("disabled", false);
      calendarList.focus();
      return;
    }

    if (!event.target.matches(".calendar-displayed")) {
      return;
    }

    const item = event.target.closest("li");
    const calendarId = item.getAttribute("calendar-id");
    const calendar = cal.manager.getCalendarById(calendarId);

    if (event.target.checked) {
      compositeCalendar.addCalendar(calendar);
    } else {
      compositeCalendar.removeCalendar(calendar);
    }

    const stringName = event.target.checked ? "hideCalendar" : "showCalendar";
    event.target.setAttribute("title", cal.l10n.getCalString(stringName, [calendar.name]));

    calendarList.focus();
  });
  calendarList.addEventListener("dblclick", event => {
    if (
      event.target.matches(".calendar-displayed") ||
      event.target.matches(".calendar-enable-button")
    ) {
      return;
    }

    const item = event.target.closest("li");
    if (!item) {
      // Click on an empty part of the richlistbox.
      cal.window.openCalendarWizard(window);
      return;
    }

    const calendarId = item.getAttribute("calendar-id");
    const calendar = cal.manager.getCalendarById(calendarId);
    cal.window.openCalendarProperties(window, { calendar });
  });
  calendarList.addEventListener("ordered", event => {
    saveSortOrder();
    calendarList.selectedIndex = calendarList.rows.indexOf(event.detail);
  });
  calendarList.addEventListener("keypress", event => {
    const item = calendarList.rows[calendarList.selectedIndex];
    const calendarId = item.getAttribute("calendar-id");
    const calendar = cal.manager.getCalendarById(calendarId);

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
        const stringName = item.querySelector(".calendar-displayed").checked
          ? "hideCalendar"
          : "showCalendar";
        item
          .querySelector(".calendar-displayed")
          .setAttribute("title", cal.l10n.getCalString(stringName, [calendar.name]));
        break;
      }
    }
  });
  calendarList.addEventListener("select", event => {
    const item = calendarList.rows[calendarList.selectedIndex];
    const calendarId = item.getAttribute("calendar-id");
    const calendar = cal.manager.getCalendarById(calendarId);

    compositeCalendar.defaultCalendar = calendar;
  });

  calendarList._calendarObserver = {
    QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

    onStartBatch() {},
    onEndBatch() {},
    onLoad() {},
    onAddItem(item) {},
    onModifyItem(newItem, oldItem) {},
    onDeleteItem(deletedItem) {},
    onError(calendar, errNo, message) {},

    onPropertyChanged(calendar, name, value, oldValue) {
      const item = calendarList.getElementsByAttribute("calendar-id", calendar.id)[0];
      if (!item) {
        return;
      }

      switch (name) {
        case "disabled": {
          item.toggleAttribute("calendar-disabled", value);
          item.querySelector(".calendar-displayed").hidden = value;
          // Update the "ENABLE" button.
          const enableButton = item.querySelector(".calendar-enable-button");
          enableButton.hidden = !value;
          // Update the color preview.
          const cssSafeId = cal.view.formatStringForCSSRule(calendar.id);
          const colorMarker = item.querySelector(".calendar-color");
          colorMarker.style.backgroundColor = value
            ? "transparent"
            : `var(--calendar-${cssSafeId}-backcolor)`;
          colorMarker.style.border = value
            ? `2px solid var(--calendar-${cssSafeId}-backcolor)`
            : "none";
          break;
        }
        case "calendar-main-default":
          if (value) {
            calendarList.selectedIndex = calendarList.rows.indexOf(item);
          }
          break;
        case "calendar-main-in-composite":
          item.querySelector(".calendar-displayed").checked = value;
          break;
        case "name":
          item.searchLabel = calendar.name;
          item.querySelector(".calendar-name").textContent = value;
          break;
        case "currentStatus":
        case "force-disabled":
          item.toggleAttribute(
            "calendar-readfailed",
            name == "currentStatus" ? !Components.isSuccessCode(value) : value
          );
          updateCalendarStatusIndicators(item);
          break;
        case "readOnly":
          item.toggleAttribute("calendar-readonly", value);
          updateCalendarStatusIndicators(item);
          break;
        case "suppressAlarms":
          item.toggleAttribute("calendar-muted", value);
          break;
      }
    },

    onPropertyDeleting(calendar, name) {
      // Since the old value is not used directly in onPropertyChanged, but
      // should not be the same as the value, set it to a different value.
      this.onPropertyChanged(calendar, name, null, null);
    },
  };
  cal.manager.addCalendarObserver(calendarList._calendarObserver);

  calendarList._calendarManagerObserver = {
    QueryInterface: ChromeUtils.generateQI(["calICalendarManagerObserver"]),

    onCalendarRegistered(calendar) {
      addCalendarItem(calendar);
      saveSortOrder();
    },
    onCalendarUnregistering(calendar) {
      const item = calendarList.getElementsByAttribute("calendar-id", calendar.id)[0];
      item.remove();
      saveSortOrder();
    },
    onCalendarDeleting(calendar) {},
  };
  cal.manager.addObserver(calendarList._calendarManagerObserver);
}

/**
 * Creates the initial "Home" calendar if no calendar exists.
 */
function initHomeCalendar() {
  const composite = cal.view.getCompositeCalendar(window);
  const url = Services.io.newURI("moz-storage-calendar://");
  const homeCalendar = cal.manager.createCalendar("storage", url);
  homeCalendar.name = cal.l10n.getCalString("homeCalendarName");
  homeCalendar.setProperty("disabled", true);

  cal.manager.registerCalendar(homeCalendar);
  Services.prefs.setStringPref("calendar.list.sortOrder", homeCalendar.id);
  composite.addCalendar(homeCalendar);

  // Wrapping this in a try/catch block, as if any of the migration code
  // fails, the app may not load.
  if (Services.prefs.getBoolPref("calendar.migrator.enabled", true)) {
    try {
      gDataMigrator.checkAndMigrate();
    } catch (e) {
      console.error("Migrator error: " + e);
    }
  }

  return homeCalendar;
}

/**
 * Called to clean up the calendar manager for a window.
 */
function unloadCalendarManager() {
  const compositeCalendar = cal.view.getCompositeCalendar(window);
  compositeCalendar.setStatusObserver(null, null);
  compositeCalendar.removeObserver(compositeObserver);

  const calendarList = document.getElementById("calendar-list");
  cal.manager.removeCalendarObserver(calendarList._calendarObserver);
  cal.manager.removeObserver(calendarList._calendarManagerObserver);
}

/**
 * A handler called to set up the context menu on the calendar list.
 *
 * @param {Event} event - The click DOMEvent.
 */

function calendarListSetupContextMenu(event) {
  let calendar;
  const composite = cal.view.getCompositeCalendar(window);

  if (event.target.matches(".calendar-displayed")) {
    return;
  }

  const item = event.target.closest("li");
  if (item) {
    const calendarList = document.getElementById("calendar-list");
    calendarList.selectedIndex = calendarList.rows.indexOf(item);
    const calendarId = item.getAttribute("calendar-id");
    calendar = cal.manager.getCalendarById(calendarId);
  }

  document.getElementById("list-calendars-context-menu").contextCalendar = calendar;

  for (const elem of document.querySelectorAll("#list-calendars-context-menu .needs-calendar")) {
    elem.hidden = !calendar;
  }
  if (calendar) {
    const stringName = composite.getCalendarById(calendar.id) ? "hideCalendar" : "showCalendar";
    document.getElementById("list-calendars-context-togglevisible").label = cal.l10n.getCalString(
      stringName,
      [calendar.name]
    );
    const accessKey = document
      .getElementById("list-calendars-context-togglevisible")
      .getAttribute(composite.getCalendarById(calendar.id) ? "accesskeyhide" : "accesskeyshow");
    document.getElementById("list-calendars-context-togglevisible").accessKey = accessKey;
    document.getElementById("list-calendars-context-showonly").label = cal.l10n.getCalString(
      "showOnlyCalendar",
      [calendar.name]
    );
    setupDeleteMenuitem("list-calendars-context-delete", calendar);
    document.getElementById("list-calendar-context-reload").hidden = !calendar.canRefresh;
    document.getElementById("list-calendars-context-reload-menuseparator").hidden =
      !calendar.canRefresh;
  }
}

/**
 * Trigger the opening of the calendar list item context menu.
 *
 * @param {Event} event - The click DOMEvent.
 */
function openCalendarListItemContext(event) {
  calendarListSetupContextMenu(event);
  const popUpCalListMenu = document.getElementById("list-calendars-context-menu");
  if (event.type == "contextmenu" && event.button == 2) {
    // This is a right-click. Open where it happened.
    popUpCalListMenu.openPopupAtScreen(event.screenX, event.screenY, true);
    return;
  }
  popUpCalListMenu.openPopup(event.target, "after_start", 0, 0, true);
}

/**
 * Changes the "delete calendar" menuitem to have the right label based on the
 * removeModes. The menuitem must have the attributes "labelremove",
 * "labeldelete" and "labelunsubscribe".
 *
 * @param aDeleteId     The id of the menuitem to delete the calendar
 */
function setupDeleteMenuitem(aDeleteId, aCalendar) {
  const calendar = aCalendar === undefined ? getSelectedCalendar() : aCalendar;
  const modes = new Set(
    calendar ? calendar.getProperty("capabilities.removeModes") || ["unsubscribe"] : []
  );

  let type = "remove";
  if (modes.has("delete") && !modes.has("unsubscribe")) {
    type = "delete";
  } else if (modes.has("unsubscribe") && !modes.has("delete")) {
    type = "unsubscribe";
  }

  const deleteItem = document.getElementById(aDeleteId);
  // Dynamically set labelremove, labeldelete, labelunsubscribe
  deleteItem.label = deleteItem.getAttribute("label" + type);
  // Dynamically set accesskeyremove, accesskeydelete, accesskeyunsubscribe
  deleteItem.accessKey = deleteItem.getAttribute("accesskey" + type);
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
  const calendarList = document.getElementById("calendar-list");
  if (calendarList) {
    const compositeCalendar = cal.view.getCompositeCalendar(window);
    compositeCalendar.addCalendar(aCalendar);
  }
}

/**
 * Hides the specified calendar if it is visible, or shows it if it is hidden.
 *
 * @param aCalendar   The calendar to show or hide
 */
function toggleCalendarVisible(aCalendar) {
  const composite = cal.view.getCompositeCalendar(window);
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
  const composite = cal.view.getCompositeCalendar(window);
  const cals = cal.manager.getCalendars();

  composite.startBatch();
  for (const calendar of cals) {
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
  const composite = cal.view.getCompositeCalendar(window);
  const cals = composite.getCalendars() || [];

  composite.startBatch();
  for (const calendar of cals) {
    if (calendar.id != aCalendar.id) {
      composite.removeCalendar(calendar);
    }
  }
  composite.addCalendar(aCalendar);
  composite.endBatch();
}

var compositeObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver", "calICompositeObserver"]),

  onStartBatch() {},
  onEndBatch() {},

  onLoad() {
    calendarUpdateNewItemsCommand();
    document.commandDispatcher.updateCommands("calendar_commands");
  },

  onAddItem() {},
  onModifyItem() {},
  onDeleteItem() {},
  onError() {},

  onPropertyChanged(calendar, name, value, oldValue) {
    if (name == "disabled" || name == "readOnly") {
      // Update commands when a calendar has been enabled or disabled.
      calendarUpdateNewItemsCommand();
      document.commandDispatcher.updateCommands("calendar_commands");
    }
  },

  onPropertyDeleting() {},

  onCalendarAdded(aCalendar) {
    // Update the calendar commands for number of remote calendars and for
    // more than one calendar.
    calendarUpdateNewItemsCommand();
    document.commandDispatcher.updateCommands("calendar_commands");
  },

  onCalendarRemoved(aCalendar) {
    // Update commands to disallow deleting the last calendar and only
    // allowing reload remote calendars when there are remote calendars.
    calendarUpdateNewItemsCommand();
    document.commandDispatcher.updateCommands("calendar_commands");
  },

  onDefaultCalendarChanged(aNewCalendar) {
    // A new default calendar may mean that the new calendar has different
    // ACLs. Make sure the commands are updated.
    calendarUpdateNewItemsCommand();
    document.commandDispatcher.updateCommands("calendar_commands");
  },
};

/**
 * Shows the filepicker and creates a new calendar with a local file using the ICS
 * provider.
 */
function openLocalCalendar() {
  const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  picker.init(window, cal.l10n.getCalString("Open"), Ci.nsIFilePicker.modeOpen);
  const wildmat = "*.ics";
  const description = cal.l10n.getCalString("filterIcs", [wildmat]);
  picker.appendFilter(description, wildmat);
  picker.appendFilters(Ci.nsIFilePicker.filterAll);

  picker.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK || !picker.file) {
      return;
    }

    const calendars = cal.manager.getCalendars();
    let calendar = calendars.find(x => x.uri.equals(picker.fileURL));
    if (!calendar) {
      calendar = cal.manager.createCalendar("ics", picker.fileURL);

      // Strip ".ics" from filename for use as calendar name.
      const prettyName = picker.fileURL.spec.match(/([^/:]+)\.ics$/);
      if (prettyName) {
        calendar.name = decodeURIComponent(prettyName[1]);
      } else {
        calendar.name = cal.l10n.getCalString("untitledCalendarName");
      }

      cal.manager.registerCalendar(calendar);
    }

    const calendarList = document.getElementById("calendar-list");
    for (let index = 0; index < calendarList.rowCount; index++) {
      if (calendarList.rows[index].getAttribute("calendar-id") == calendar.id) {
        calendarList.selectedIndex = index;
        break;
      }
    }
  });
}

/**
 * Calendar Offline Manager
 */
var calendarOfflineManager = {
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  init() {
    if (this.initialized) {
      throw Components.Exception("", Cr.NS_ERROR_ALREADY_INITIALIZED);
    }
    Services.obs.addObserver(this, "network:offline-status-changed");

    this.updateOfflineUI(!this.isOnline());
    this.initialized = true;
  },

  uninit() {
    if (!this.initialized) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_INITIALIZED);
    }
    Services.obs.removeObserver(this, "network:offline-status-changed");
    this.initialized = false;
  },

  isOnline() {
    return !Services.io.offline;
  },

  updateOfflineUI(aIsOffline) {
    // Refresh the current view
    currentView().goToDay(currentView().selectedDay);

    // Set up disabled locks for offline
    document.commandDispatcher.updateCommands("calendar_commands");
  },

  observe(aSubject, aTopic, aState) {
    if (aTopic == "network:offline-status-changed") {
      this.updateOfflineUI(aState == "offline");
    }
  },
};
