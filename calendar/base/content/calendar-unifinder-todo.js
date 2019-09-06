/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported prepareCalendarToDoUnifinder */

/* import-globals-from calendar-views-utils.js */

// TODO: just include these in today-pane.js

/**
 * Called when the window is loaded to set up the unifinder-todo.
 */
function prepareCalendarToDoUnifinder() {
  // add listener to update the date filters
  getViewDeck().addEventListener("dayselect", event => {
    updateCalendarToDoUnifinder();
  });

  updateCalendarToDoUnifinder();
}

/**
 * Updates the applied filter and show completed view of the unifinder todo.
 *
 * @param {String} [filter] - The filter name to set.
 */
function updateCalendarToDoUnifinder(filter) {
  let tree = document.getElementById("unifinder-todo-tree");

  // Set up hiding completed tasks for the unifinder-todo tree
  filter = filter || tree.getAttribute("filterValue") || "throughcurrent";
  tree.setAttribute("filterValue", filter);

  document
    .querySelectorAll('menuitem[command="calendar_task_filter_todaypane_command"][type="radio"]')
    .forEach(item => {
      if (item.getAttribute("value") == filter) {
        item.setAttribute("checked", "true");
      } else {
        item.removeAttribute("checked");
      }
    });

  let showCompleted = document.getElementById("show-completed-checkbox").checked;
  if (!showCompleted) {
    let filterProps = tree.mFilter.getDefinedFilterProperties(filter);
    if (filterProps) {
      filterProps.status =
        (filterProps.status || filterProps.FILTER_STATUS_ALL) &
        (filterProps.FILTER_STATUS_INCOMPLETE | filterProps.FILTER_STATUS_IN_PROGRESS);
      filter = filterProps;
    }
  }

  // update the filter
  tree.showCompleted = showCompleted;
  tree.updateFilter(filter);
}
