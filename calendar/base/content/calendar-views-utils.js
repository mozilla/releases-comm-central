/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported switchToView, minimonthPick,
 *          observeViewDaySelect, toggleOrientation,
 *          toggleWorkdaysOnly, toggleTasksInView, toggleShowCompletedInView,
 *          goToDate, gLastShownCalendarView, deleteSelectedEvents,
 *          editSelectedEvents, selectAllEvents, calendarNavigationBar
 */

/* import-globals-from item-editing/calendar-item-editing.js */
/* import-globals-from calendar-modes.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { countOccurrences } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calRecurrenceUtils.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});

/**
 * Controller for the views
 *
 * @see calIcalendarViewController
 */
var calendarViewController = {
  QueryInterface: ChromeUtils.generateQI(["calICalendarViewController"]),

  /**
   * Creates a new event
   *
   * @see calICalendarViewController
   */
  createNewEvent(calendar, startTime, endTime, forceAllday) {
    // if we're given both times, skip the dialog
    if (startTime && endTime && !startTime.isDate && !endTime.isDate) {
      const item = new CalEvent();
      setDefaultItemValues(item, calendar, startTime, endTime);
      doTransaction("add", item, item.calendar, null, null);
    } else {
      createEventWithDialog(calendar, startTime, null, null, null, forceAllday);
    }
  },

  /**
   * View the given occurrence.
   *
   * @param {calIItemBase} occurrence
   * @see calICalendarViewController
   */
  viewOccurrence(occurrence) {
    openEventDialogForViewing(occurrence);
  },

  /**
   * Modifies the given occurrence
   *
   * @see calICalendarViewController
   */
  modifyOccurrence(occurrence, newStartTime, newEndTime, newTitle) {
    // if modifying this item directly (e.g. just dragged to new time),
    // then do so; otherwise pop up the dialog
    if (newStartTime || newEndTime || newTitle) {
      const instance = occurrence.clone();

      if (newTitle) {
        instance.title = newTitle;
      }

      // When we made the executive decision (in bug 352862) that
      // dragging an occurrence of a recurring event would _only_ act
      // upon _that_ occurrence, we removed a bunch of code from this
      // function. If we ever revert that decision, check CVS history
      // here to get that code back.

      if (newStartTime || newEndTime) {
        // Yay for variable names that make this next line look silly
        if (instance.isEvent()) {
          if (newStartTime && instance.startDate) {
            instance.startDate = newStartTime;
          }
          if (newEndTime && instance.endDate) {
            instance.endDate = newEndTime;
          }
        } else {
          if (newStartTime && instance.entryDate) {
            instance.entryDate = newStartTime;
          }
          if (newEndTime && instance.dueDate) {
            instance.dueDate = newEndTime;
          }
        }
      }

      doTransaction("modify", instance, instance.calendar, occurrence, null);
    } else {
      modifyEventWithDialog(occurrence, true);
    }
  },

  /**
   * Deletes the given occurrences
   *
   * @see calICalendarViewController
   */
  deleteOccurrences(occurrencesArg, useParentItems, doNotConfirm, extResponseArg = null) {
    if (!cal.window.promptDeleteItems(occurrencesArg)) {
      return;
    }
    startBatchTransaction();
    const recurringItems = {};
    const extResponse = extResponseArg || { responseMode: Ci.calIItipItem.USER };

    const getSavedItem = function (itemToDelete) {
      // Get the parent item, saving it in our recurringItems object for
      // later use.
      const hashVal = itemToDelete.parentItem.hashId;
      if (!recurringItems[hashVal]) {
        recurringItems[hashVal] = {
          oldItem: itemToDelete.parentItem,
          newItem: itemToDelete.parentItem.clone(),
        };
      }
      return recurringItems[hashVal];
    };

    // Make sure we are modifying a copy of aOccurrences, otherwise we will
    // run into race conditions when the view's doRemoveItem removes the
    // array elements while we are iterating through them. While we are at
    // it, filter out any items that have readonly calendars, so that
    // checking for one total item below also works out if all but one item
    // are readonly.
    const occurrences = occurrencesArg.filter(item => cal.acl.isCalendarWritable(item.calendar));

    // we check how many occurrences the parent item has
    const parents = new Map();
    for (const occ of occurrences) {
      if (!parents.has(occ.id)) {
        parents.set(occ.id, countOccurrences(occ));
      }
    }

    let promptUser = !doNotConfirm;
    let previousResponse = 0;
    for (let itemToDelete of occurrences) {
      if (parents.get(itemToDelete.id) == -1) {
        // we have scheduled the master item for deletion in a previous
        // loop already
        continue;
      }
      if (useParentItems || parents.get(itemToDelete.id) == 1 || previousResponse == 3) {
        // Usually happens when ctrl-click is used. In that case we
        // don't need to ask the user if he wants to delete an
        // occurrence or not.
        // if an occurrence is the only one of a series or the user
        // decided so before, we delete the series, too.
        itemToDelete = itemToDelete.parentItem;
        parents.set(itemToDelete.id, -1);
      } else if (promptUser) {
        const [targetItem, , response] = promptOccurrenceModification(
          itemToDelete,
          false,
          "delete"
        );
        if (!response) {
          // The user canceled the dialog, bail out
          break;
        }
        itemToDelete = targetItem;

        // if we have multiple items and the user decided already for one
        // item whether to delete the occurrence or the entire series,
        // we apply that decision also to subsequent items
        previousResponse = response;
        promptUser = false;
      }

      // Now some dirty work: Make sure more than one occurrence can be
      // deleted by saving the recurring items and removing occurrences as
      // they come in. If this is not an occurrence, we can go ahead and
      // delete the whole item.
      if (itemToDelete.parentItem.hashId == itemToDelete.hashId) {
        doTransaction("delete", itemToDelete, itemToDelete.calendar, null, null, extResponse);
      } else {
        const savedItem = getSavedItem(itemToDelete);
        savedItem.newItem.recurrenceInfo.removeOccurrenceAt(itemToDelete.recurrenceId);
        // Dont start the transaction yet. Do so later, in case the
        // parent item gets modified more than once.
      }
    }

    // Now handle recurring events. This makes sure that all occurrences
    // that have been passed are deleted.
    for (const hashVal in recurringItems) {
      const ritem = recurringItems[hashVal];
      doTransaction(
        "modify",
        ritem.newItem,
        ritem.newItem.calendar,
        ritem.oldItem,
        null,
        extResponse
      );
    }
    endBatchTransaction();
  },
};

/**
 * This function does the common steps to switch between views. Should be called
 * from app-specific view switching functions
 *
 * @param viewType     The type of view to select.
 */
function switchToView(viewType) {
  const viewBox = getViewBox();
  let selectedDay;
  let currentSelection = [];

  // Set up the view commands
  const views = viewBox.children;
  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const commandId = "calendar_" + view.id + "_command";
    const command = document.getElementById(commandId);
    if (view.id == viewType + "-view") {
      command.setAttribute("checked", "true");
    } else {
      command.removeAttribute("checked");
    }
  }

  document.l10n.setAttributes(
    document.getElementById("previousViewButton"),
    `calendar-nav-button-prev-tooltip-${viewType}`
  );
  document.l10n.setAttributes(
    document.getElementById("nextViewButton"),
    `calendar-nav-button-next-tooltip-${viewType}`
  );
  document.l10n.setAttributes(
    document.getElementById("calendar-view-context-menu-previous"),
    `calendar-context-menu-previous-${viewType}`
  );
  document.l10n.setAttributes(
    document.getElementById("calendar-view-context-menu-next"),
    `calendar-context-menu-next-${viewType}`
  );

  // These are hidden until the calendar is loaded.
  for (const node of document.querySelectorAll(".hide-before-calendar-loaded")) {
    node.removeAttribute("hidden");
  }

  // Anyone wanting to plug in a view needs to follow this naming scheme
  const view = document.getElementById(viewType + "-view");
  const oldView = currentView();
  if (oldView?.isActive) {
    if (oldView == view) {
      // Not actually changing view, there's nothing else to do.
      return;
    }

    selectedDay = oldView.selectedDay;
    currentSelection = oldView.getSelectedItems();
    oldView.deactivate();
  }

  if (!selectedDay) {
    selectedDay = cal.dtz.now();
  }
  for (let i = 0; i < viewBox.children.length; i++) {
    if (view.id == viewBox.children[i].id) {
      viewBox.children[i].hidden = false;
      viewBox.setAttribute("selectedIndex", i);
    } else {
      viewBox.children[i].hidden = true;
    }
  }

  view.ensureInitialized();
  if (!view.controller) {
    view.timezone = cal.dtz.defaultTimezone;
    view.controller = calendarViewController;
  }

  view.goToDay(selectedDay);
  view.setSelectedItems(currentSelection);

  view.onResize(view);
  view.activate();
}

/**
 * Returns the calendar view box element.
 *
 * @returns The view-box element.
 */
function getViewBox() {
  return document.getElementById("view-box");
}

/**
 * Returns the currently selected calendar view.
 *
 * @returns The selected calendar view
 */
function currentView() {
  for (const element of getViewBox().children) {
    if (!element.hidden) {
      return element;
    }
  }
  return null;
}

/**
 * Handler function to set the selected day in the minimonth to the currently
 * selected day in the current view.
 *
 * @param event     The "dayselect" event emitted from the views.
 *
 */
function observeViewDaySelect(event) {
  const date = event.detail;
  const jsDate = new Date(date.year, date.month, date.day);

  // for the month and multiweek view find the main month,
  // which is the month with the most visible days in the view;
  // note, that the main date is the first day of the main month
  let jsMainDate;
  if (!event.target.supportsDisjointDates) {
    let mainDate = null;
    let maxVisibleDays = 0;
    const startDay = currentView().startDay;
    const endDay = currentView().endDay;
    const firstMonth = startDay.startOfMonth;
    const lastMonth = endDay.startOfMonth;
    for (let month = firstMonth.clone(); month.compare(lastMonth) <= 0; month.month += 1) {
      let visibleDays = 0;
      if (month.compare(firstMonth) == 0) {
        visibleDays = startDay.endOfMonth.day - startDay.day + 1;
      } else if (month.compare(lastMonth) == 0) {
        visibleDays = endDay.day;
      } else {
        visibleDays = month.endOfMonth.day;
      }
      if (visibleDays > maxVisibleDays) {
        mainDate = month.clone();
        maxVisibleDays = visibleDays;
      }
    }
    jsMainDate = new Date(mainDate.year, mainDate.month, mainDate.day);
  }

  getMinimonth().selectDate(jsDate, jsMainDate);
  currentView().focus();
}

/**
 * Shows the given date in the current view, if in calendar mode.
 *
 * @param aNewDate      The new date as a JSDate.
 */
function minimonthPick(aNewDate) {
  if (gCurrentMode == "calendar" || gCurrentMode == "task") {
    const cdt = cal.dtz.jsDateToDateTime(aNewDate, currentView().timezone);
    cdt.isDate = true;
    currentView().goToDay(cdt);

    // update date filter for task tree
    const tree = document.getElementById("calendar-task-tree");
    tree.updateFilter();
  }
}

/**
 * Provides a neutral way to get the minimonth.
 *
 * @returns The XUL minimonth element.
 */
function getMinimonth() {
  return document.getElementById("calMinimonth");
}

/**
 * Update the view orientation based on the checked state of the command
 */
function toggleOrientation() {
  const cmd = document.getElementById("calendar_toggle_orientation_command");
  const newValue = cmd.getAttribute("checked") == "true" ? "false" : "true";
  cmd.setAttribute("checked", newValue);

  for (const view of getViewBox().children) {
    view.rotated = newValue == "true";
  }

  // orientation refreshes automatically
}

/**
 * Toggle the workdays only checkbox and refresh the current view
 *
 * XXX We shouldn't need to refresh the view just to toggle the workdays. This
 * should happen automatically.
 */
function toggleWorkdaysOnly() {
  const cmd = document.getElementById("calendar_toggle_workdays_only_command");
  const newValue = cmd.getAttribute("checked") == "true" ? "false" : "true";
  cmd.setAttribute("checked", newValue);

  for (const view of getViewBox().children) {
    view.workdaysOnly = newValue == "true";
  }

  // Refresh the current view
  currentView().goToDay();
}

/**
 * Toggle the tasks in view checkbox and refresh the current view
 */
function toggleTasksInView() {
  const cmd = document.getElementById("calendar_toggle_tasks_in_view_command");
  const newValue = cmd.getAttribute("checked") == "true" ? "false" : "true";
  cmd.setAttribute("checked", newValue);

  for (const view of getViewBox().children) {
    view.tasksInView = newValue == "true";
  }

  // Refresh the current view
  currentView().goToDay();
}

/**
 * Toggle the show completed in view checkbox and refresh the current view
 */
function toggleShowCompletedInView() {
  const cmd = document.getElementById("calendar_toggle_show_completed_in_view_command");
  const newValue = cmd.getAttribute("checked") == "true" ? "false" : "true";
  cmd.setAttribute("checked", newValue);

  for (const view of getViewBox().children) {
    view.showCompleted = newValue == "true";
  }

  // Refresh the current view
  currentView().goToDay();
}

/**
 * Open the calendar layout options menu popup.
 *
 * @param {Event} event - The click DOMEvent.
 */
function showCalControlBarMenuPopup(event) {
  const moreContext = document.getElementById("calControlBarMenuPopup");
  moreContext.openPopup(event.target, {
    position: "after_end",
    triggerEvent: event,
  });
}

/**
 * Provides a neutral way to go to the current day in the views and minimonth.
 *
 * @param date     The date to go.
 */
function goToDate(date) {
  getMinimonth().value = cal.dtz.dateTimeToJsDate(date);
  currentView().goToDay(date);
}

var gLastShownCalendarView = {
  _lastView: null,

  /**
   * Returns the calendar view that was selected before restart, or the current
   * calendar view if it has already been set in this session.
   *
   * @returns {string} The last calendar view.
   */
  get() {
    if (!this._lastView) {
      if (Services.xulStore.hasValue(document.location.href, "view-box", "selectedIndex")) {
        const viewBox = getViewBox();
        const selectedIndex = Services.xulStore.getValue(
          document.location.href,
          "view-box",
          "selectedIndex"
        );
        for (let i = 0; i < viewBox.children.length; i++) {
          viewBox.children[i].hidden = selectedIndex != i;
        }
        const viewNode = viewBox.children[selectedIndex];
        this._lastView = viewNode.id.replace(/-view/, "");
        document
          .querySelector(`.calview-toggle-item[aria-controls="${viewNode.id}"]`)
          ?.setAttribute("aria-selected", true);
      } else {
        // No deck item was selected beforehand, default to week view.
        this._lastView = "week";
        document
          .querySelector(`.calview-toggle-item[aria-controls="week-view"]`)
          ?.setAttribute("aria-selected", true);
      }
    }
    return this._lastView;
  },

  set(view) {
    this._lastView = view;
  },
};

/**
 * Deletes items currently selected in the view and clears selection.
 */
function deleteSelectedEvents() {
  const selectedItems = currentView().getSelectedItems();
  calendarViewController.deleteOccurrences(selectedItems, false, false);
  // clear selection
  currentView().setSelectedItems([], true);
}

/**
 * Open the items currently selected in the view.
 */
function viewSelectedEvents() {
  const items = currentView().getSelectedItems();
  if (items.length >= 1) {
    openEventDialogForViewing(items[0]);
  }
}

/**
 * Edit the items currently selected in the view with the event dialog.
 */
function editSelectedEvents() {
  const selectedItems = currentView().getSelectedItems();
  if (selectedItems && selectedItems.length >= 1) {
    modifyEventWithDialog(selectedItems[0], true);
  }
}

/**
 * Select all events from all calendars. Use with care.
 */
async function selectAllEvents() {
  const composite = cal.view.getCompositeCalendar(window);
  let filter = composite.ITEM_FILTER_CLASS_OCCURRENCES;

  if (currentView().tasksInView) {
    filter |= composite.ITEM_FILTER_TYPE_ALL;
  } else {
    filter |= composite.ITEM_FILTER_TYPE_EVENT;
  }
  if (currentView().showCompleted) {
    filter |= composite.ITEM_FILTER_COMPLETED_ALL;
  } else {
    filter |= composite.ITEM_FILTER_COMPLETED_NO;
  }

  // Need to move one day out to get all events
  const end = currentView().endDay.clone();
  end.day += 1;

  const items = await composite.getItemsAsArray(filter, 0, currentView().startDay, end);
  currentView().setSelectedItems(items, false);
}

var calendarNavigationBar = {
  setDateRange(startDate, endDate) {
    let docTitle = "";
    if (startDate) {
      const intervalLabel = document.getElementById("intervalDescription");
      const firstWeekNo = cal.weekInfoService.getWeekTitle(startDate);
      let secondWeekNo = firstWeekNo;
      const weekLabel = document.getElementById("calendarWeek");
      if (startDate.nativeTime == endDate.nativeTime) {
        intervalLabel.textContent = cal.dtz.formatter.formatDate(startDate);
      } else {
        intervalLabel.textContent = currentView().getRangeDescription();
        secondWeekNo = cal.weekInfoService.getWeekTitle(endDate);
      }
      if (secondWeekNo == firstWeekNo) {
        document.l10n.setAttributes(weekLabel, "single-calendar-week", {
          index: firstWeekNo,
        });
      } else {
        document.l10n.setAttributes(weekLabel, "several-calendar-weeks", {
          startIndex: firstWeekNo,
          endIndex: secondWeekNo,
        });
      }
      docTitle = intervalLabel.textContent;
    }

    if (gCurrentMode == "calendar") {
      document.title =
        (docTitle ? docTitle + " - " : "") +
        cal.l10n.getAnyString("branding", "brand", "brandFullName");
    }
  },
};

var timezoneObserver = {
  observe() {
    const minimonth = getMinimonth();
    minimonth.update(minimonth.value);
  },
};
Services.obs.addObserver(timezoneObserver, "defaultTimezoneChanged");
window.addEventListener("unload", () => {
  Services.obs.removeObserver(timezoneObserver, "defaultTimezoneChanged");
});
