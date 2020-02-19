/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

/*
 * Helpers for printing and print preparation
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.print namespace.

this.EXPORTED_SYMBOLS = ["calprint"]; /* exported calprint */

var calprint = {
  /**
   * Returns a simple key in the format YYYY-MM-DD for use in the table of
   * dates to day boxes
   *
   * @param dt    The date to translate
   * @return      YYYY-MM-DD
   */
  getDateKey(date) {
    return date.year + "-" + date.month + "-" + date.day;
  },

  /**
   * Serializes the given item by setting marked nodes to the item's content.
   * Has some expectations about the DOM document (in CSS-selector-speak), all
   * following nodes MUST exist.
   *
   * - #item-template will be cloned and filled, and modified:
   *   - .item-interval gets the time interval of the item.
   *   - .item-title gets the item title
   *   - .category-color-box gets a 2px solid border in category color
   *   - .calendar-color-box gets background color of the calendar
   *
   * @param document          The DOM Document to set things on
   * @param item              The item to serialize
   * @param dayContainer      The DOM Node to insert the container in
   */
  addItemToDaybox(document, item, boxDate, dayContainer) {
    // Clone our template
    let itemNode = document.getElementById("item-template").cloneNode(true);
    itemNode.removeAttribute("id");
    itemNode.item = item;

    // Fill in details of the item
    let itemInterval = cal.print.getItemIntervalString(item, boxDate);
    itemNode.querySelector(".item-interval").textContent = itemInterval;
    itemNode.querySelector(".item-title").textContent = item.title;

    // Fill in category details
    let categoriesArray = item.getCategories();
    if (categoriesArray.length > 0) {
      let cssClassesArray = categoriesArray.map(cal.view.formatStringForCSSRule);
      let categoriesBox = itemNode.querySelector(".category-color-box");
      categoriesBox.setAttribute("categories", cssClassesArray.join(" "));
      categoriesBox.style.border = `2px solid var(--category-${cssClassesArray[0]}-color)`;
    }

    // Fill in calendar color
    let cssSafeId = cal.view.formatStringForCSSRule(item.calendar.id);
    let colorBox = itemNode.querySelector(".calendar-color-box");
    colorBox.style.color = `var(--calendar-${cssSafeId}-forecolor)`;
    colorBox.style.backgroundColor = `var(--calendar-${cssSafeId}-backcolor)`;

    // Add it to the day container in the right order
    cal.data.binaryInsertNode(dayContainer, itemNode, item, cal.view.compareItems);
  },

  /**
   * Serializes the given item by setting marked nodes to the item's
   * content. Should be used for tasks with no start and due date. Has
   * some expectations about the DOM document (in CSS-selector-speak),
   * all following nodes MUST exist.
   *
   * - Nodes will be added to #task-container.
   * - #task-list-box will have the "hidden" attribute removed.
   * - #task-template will be cloned and filled, and modified:
   *   - .task-checkbox gets the "checked" attribute set, if completed
   *   - .task-title gets the item title.
   *
   * @param document          The DOM Document to set things on
   * @param item              The item to serialize
   */
  addItemToDayboxNodate(document, item) {
    let taskContainer = document.getElementById("task-container");
    let taskNode = document.getElementById("task-template").cloneNode(true);
    taskNode.removeAttribute("id");
    taskNode.item = item;

    let taskListBox = document.getElementById("tasks-list-box");
    if (taskListBox.hasAttribute("hidden")) {
      let tasksTitle = document.getElementById("tasks-title");
      taskListBox.removeAttribute("hidden");
      tasksTitle.textContent = cal.l10n.getCalString("tasksWithNoDueDate");
    }

    // Fill in details of the task
    if (item.isCompleted) {
      taskNode.querySelector(".task-checkbox").setAttribute("checked", "checked");
    }

    taskNode.querySelector(".task-title").textContent = item.title;

    let collator = cal.l10n.createLocaleCollator();
    cal.data.binaryInsertNode(
      taskContainer,
      taskNode,
      item,
      (a, b) => collator.compareString(0, a, b),
      node => node.item.title
    );
  },

  /**
   * Get time interval string for the given item. Returns an empty string for all-day items.
   *
   * @param aItem     The item providing the interval
   * @return          The string describing the interval
   */
  getItemIntervalString(aItem, aBoxDate) {
    // omit time label for all-day items
    let startDate = aItem[cal.dtz.startDateProp(aItem)];
    let endDate = aItem[cal.dtz.endDateProp(aItem)];
    if ((startDate && startDate.isDate) || (endDate && endDate.isDate)) {
      return "";
    }

    // check for tasks without start and/or due date
    if (!startDate || !endDate) {
      return cal.getDateFormatter().formatItemTimeInterval(aItem);
    }

    let dateFormatter = cal.getDateFormatter();
    let defaultTimezone = cal.dtz.defaultTimezone;
    startDate = startDate.getInTimezone(defaultTimezone);
    endDate = endDate.getInTimezone(defaultTimezone);
    let start = startDate.clone();
    let end = endDate.clone();
    start.isDate = true;
    end.isDate = true;
    if (start.compare(end) == 0) {
      // Events that start and end in the same day.
      return dateFormatter.formatTimeInterval(startDate, endDate);
    }
    // Events that span two or more days.
    let compareStart = aBoxDate.compare(start);
    let compareEnd = aBoxDate.compare(end);
    if (compareStart == 0) {
      return "\u21e4 " + dateFormatter.formatTime(startDate); // unicode '⇤'
    } else if (compareStart > 0 && compareEnd < 0) {
      return "\u21ff"; // unicode '↔'
    } else if (compareEnd == 0) {
      return "\u21e5 " + dateFormatter.formatTime(endDate); // unicode '⇥'
    }
    return "";
  },
};
