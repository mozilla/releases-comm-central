/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals calFilter, calFilter, getViewBox, openEventDialogForViewing,
   modifyEventWithDialog, createEventWithDialog, currentView,
   calendarController, editSelectedEvents, deleteSelectedEvents,
   getEventStatusString, goToggleToolbar, CalendarFilteredTreeView */

/* exported toggleUnifinder, prepareCalendarUnifinder, getUnifinderView,
 *          finishCalendarUnifinder, unifinderDoubleClick */

/**
 * This file provides API for initializing and manipulating the unifinder view
 * in the calendar, which provides users with a list of event occurrences
 * filterable by date and event title.
 */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

/**
 * Toggles the hidden state of the unifinder.
 */
function toggleUnifinder() {
  const wasHidden = document.getElementById("bottom-events-box").hidden;
  if (!wasHidden) {
    // It will be hidden, deactivate the view.
    getUnifinderView().deactivate();
  }

  // Toggle the elements
  goToggleToolbar("bottom-events-box", "calendar_show_unifinder_command");
  goToggleToolbar("calendar-view-splitter");
  window.dispatchEvent(new CustomEvent("viewresize"));

  if (wasHidden) {
    // It's now visible, activate the view.
    getUnifinderView().activate();
    refreshUnifinderFilterInterval();
  }
}

/**
 * Gets the tree element for the unifinder.
 *
 * @returns {XULTreeElement} The tree element containing the current filtered
 *   list of events.
 */
function getUnifinderTree() {
  return document.getElementById("unifinder-search-results-tree");
}

/**
 * Called when calendar component is loaded to prepare the unifinder. This
 * function is used to add observers, event listeners, etc.
 */
async function prepareCalendarUnifinder() {
  const filteredView = new CalendarFilteredTreeView();
  filteredView.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;

  const unifinderTree = getUnifinderTree();
  unifinderTree.view = filteredView;

  const viewBox = getViewBox();

  // Listen for the selected interval to change so we can adjust our filter.
  viewBox.addEventListener("dayselect", refreshUnifinderFilterInterval);

  // Listen for the selected item(s) to change in the calendar so we can adjust
  // our selection.
  viewBox.addEventListener("itemselect", unifinderItemSelect);

  // Listen for the selected item(s) to change in the unifinder so we can adjust
  // the calendar view.
  unifinderTree.addEventListener("select", unifinderSelect, true);

  unifinderTree.addEventListener("sort-changed", function (event) {
    for (const existing of this.querySelectorAll("treecol[sortDirection]")) {
      existing.removeAttribute("sortDirection");
    }

    const { column, direction } = event.detail;
    const columnHeader = document.getElementById(column);
    columnHeader.setAttribute("sortDirection", direction);
  });

  const searchBox = document.getElementById("unifinder-search-field");
  searchBox.addEventListener("command", updateUnifinderFilterText);
}

/**
 * Called when the window is unloaded to clean up any observers and listeners
 * added.
 */
function finishCalendarUnifinder() {
  const unifinderTree = getUnifinderTree();
  unifinderTree.removeEventListener("select", unifinderSelect, true);

  const viewBox = getViewBox();
  viewBox.removeEventListener("dayselect", refreshUnifinderFilterInterval);
  viewBox.removeEventListener("itemselect", unifinderItemSelect);

  const searchBox = document.getElementById("unifinder-search-field");
  searchBox.removeEventListener("command", updateUnifinderFilterText);

  getUnifinderView()?.deactivate();
}

/**
 * Gets the tree view backing the unifinder box.
 *
 * @returns {CalendarFilteredTreeView} The tree view for the unifinder.
 */
function getUnifinderView() {
  const unifinderTree = getUnifinderTree();

  // This function can be called while the Find Events pane is hidden, in which
  // case the view will be null.
  return unifinderTree.view?.wrappedJSObject;
}

/**
 * Handler function for double clicking the unifinder.
 *
 * @param {Event} event - The DOM doubleclick event.
 */
function unifinderDoubleClick(event) {
  const calendarEvent = getUnifinderView().getItemAtCoordinates(event.clientX, event.clientY);
  if (calendarEvent) {
    if (Services.prefs.getBoolPref("calendar.events.defaultActionEdit", true)) {
      modifyEventWithDialog(calendarEvent, true);
      return;
    }

    openEventDialogForViewing(calendarEvent);
  } else {
    createEventWithDialog();
  }
}

/**
 * Handle selection events in the unifinder, ensuring that they are synced to
 * the calendar view.
 *
 * @param {Event} _event - The DOM selection event.
 */
async function unifinderSelect(_event) {
  const treeView = getUnifinderView();
  const currentSelection = treeView.selection;
  if (!currentSelection || currentSelection.getRangeCount() == 0) {
    return;
  }

  const selectedItems = [];

  // Get the selected events from the tree
  const start = {};
  const end = {};
  const numRanges = currentSelection.getRangeCount();

  for (let range = 0; range < numRanges; range++) {
    currentSelection.getRangeAt(range, start, end);

    for (let i = start.value; i <= end.value; i++) {
      try {
        selectedItems.push(treeView.getItemAt(i));
      } catch (e) {
        cal.WARN("Error getting Event from row: " + e + "\n");
      }
    }
  }

  const view = currentView();
  if (selectedItems.length == 1) {
    // Go to the day of the selected item in the current view.
    const startDate = selectedItems[0].startDate;
    if (view.startDate.compare(startDate) > 0 || view.endDate.compare(startDate) <= 0) {
      view.goToDay(startDate);
      await view.ready;
    }
  }

  // Set up the selected items in the view. Pass in true to suppress firing the
  // "itemselect" event, so we don't end up in a circular loop.
  view.setSelectedItems(selectedItems, true);
  calendarController.onSelectionChanged({ detail: selectedItems });
  getUnifinderTree().focus();
}

/**
 * Handle items being selected outside the unifinder, keeping the unifinder
 * selection in sync with the calendar view.
 *
 * @param {CustomEvent} event - The "itemselect" event representing the change
 *   in selection.
 */
function unifinderItemSelect(event) {
  const treeView = getUnifinderView();
  if (!treeView) {
    // Unifinder is hidden.
    return;
  }

  // `nsITreeSelection` automatically fires a select event when re-enabling
  // select events after suppression. The result is this "brutal hack" to avoid
  // bogus selection events when we sync from the calendar. Remove the select
  // handler entirely until the event has been fired.
  // See https://bugzilla.mozilla.org/show_bug.cgi?id=168211 for more.
  const unifinderTree = getUnifinderTree();
  unifinderTree.removeEventListener("select", unifinderSelect, true);

  treeView.setSelectionFromItems(event.detail);

  // Re-enable the handler once the event has been fired.
  unifinderTree.addEventListener("select", unifinderSelect, true);
}

/**
 * Handler function for keypress in the unifinder.
 *
 * @param {Event} aEvent - The DOM Key event.
 */
function unifinderKeyPress(aEvent) {
  switch (aEvent.key) {
    case "Enter":
      // Enter, edit the event
      editSelectedEvents();
      aEvent.stopPropagation();
      aEvent.preventDefault();
      break;
    case "Backspace":
    case "Delete":
      deleteSelectedEvents();
      aEvent.stopPropagation();
      aEvent.preventDefault();
      break;
  }
}

/**
 * Update the text used for filtering events in the unifinder based on the value
 * in the search box.
 */
function updateUnifinderFilterText() {
  const filteredView = getUnifinderView();

  const searchBox = document.getElementById("unifinder-search-field");
  if (!searchBox.value) {
    filteredView.clearFiltering();
    return;
  }

  // @see calFilter.textFilter()

  const normalize = str => str.normalize().toLowerCase();
  const normalValue = normalize(searchBox.value);
  filteredView.applyFiltering(item =>
    ["SUMMARY", "DESCRIPTION", "LOCATION", "URL"]
      .map(p => item.getProperty(p))
      .some(v => v && normalize(v).includes(normalValue))
  );
}

/**
 * Updates the start and end date of the filer based on the current interval
 * selection.
 */
function refreshUnifinderFilterInterval() {
  const view = currentView();
  const today = cal.dtz.now();
  today.isDate = true;

  let startDate, endDate;

  const intervalSelection = document.getElementById("event-filter-menulist").selectedItem.value;
  switch (intervalSelection) {
    case "past":
      startDate = today.clone();
      // Use last 100 yrs instead of unbounded value, to avoid performance
      // issues with recurring events.
      startDate.year -= 100;
      endDate = today;
      break;
    case "today":
      startDate = today;
      endDate = today.clone();
      endDate.day++;
      break;
    case "P7D":
      startDate = today;
      endDate = today.clone();
      endDate.day += 7;
      break;
    case "P14D":
      startDate = today;
      endDate = today.clone();
      endDate.day += 14;
      break;
    case "P31D":
      startDate = today;
      endDate = today.clone();
      endDate.day += 31;
      break;
    case "next6Months":
      startDate = today;
      endDate = today.clone();
      endDate.month += 6;
      break;
    case "next12Months":
      startDate = today;
      endDate = today.clone();
      endDate.month += 12;
      break;
    case "future":
      // Use next 100 yrs instead of unbounded values, to avoid performance
      // issues with recurring events.
      startDate = today.clone();
      endDate = today.clone();
      endDate.year += 100;
      break;
    case "thisCalendarMonth":
      startDate = today.startOfMonth;
      endDate = today.endOfMonth;
      endDate.day++;
      break;
    case "current":
      startDate = view.selectedDay;
      endDate = startDate.clone();
      endDate.day++;
      break;
    case "currentview":
      startDate = view.startDate;
      endDate = view.endDate;
      break;
    case "all":
      // Use last +-100 yrs instead of unbounded values, to avoid performance
      // issues with recurring events.
      startDate = today.clone();
      startDate.year -= 100;
      endDate = today.clone();
      endDate.year += 100;
      break;
  }

  const filteredView = getUnifinderView();
  if (filteredView) {
    filteredView.setDateRange(startDate, endDate);
    filteredView.refreshItems();
  }
}
