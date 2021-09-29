/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers for printing.
 *
 * This file detects when printing starts, and if it's the calendar that is
 * being printed, injects calendar-print.js into the printing UI.
 *
 * Also contains the code for formatting the to-be-printed document as chosen
 * by the user.
 */

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.print namespace.

const EXPORTED_SYMBOLS = ["calprint"]; /* exported calprint */

const weekInfoService = cal.getWeekInfoService();

var calprint = {
  ensureInitialized() {
    // Deliberate no-op. By calling this function from outside, you've ensured
    // the observer has been added.
  },

  async draw(document, type, startDate, endDate, filter, notDueTasks) {
    cal.view.colorTracker.addColorsToDocument(document);

    let listContainer = document.getElementById("list-container");
    while (listContainer.lastChild) {
      listContainer.lastChild.remove();
    }
    let monthContainer = document.getElementById("month-container");
    while (monthContainer.lastChild) {
      monthContainer.lastChild.remove();
    }
    let weekContainer = document.getElementById("week-container");
    while (weekContainer.lastChild) {
      weekContainer.lastChild.remove();
    }

    let taskContainer = document.getElementById("task-container");
    while (taskContainer.lastChild) {
      taskContainer.lastChild.remove();
    }
    document.getElementById("tasks-list-box").hidden = true;

    switch (type) {
      case "list":
        await listView.draw(document, startDate, endDate, filter, notDueTasks);
        break;
      case "monthGrid":
        await monthGridView.draw(document, startDate, endDate, filter, notDueTasks);
        break;
      case "weekPlanner":
        await weekPlannerView.draw(document, startDate, endDate, filter, notDueTasks);
        break;
    }
  },
};

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
function addItemToDaybox(document, item, boxDate, dayContainer) {
  // Clone our template
  let itemNode = document.getElementById("item-template").content.firstElementChild.cloneNode(true);
  itemNode.removeAttribute("id");
  itemNode.item = item;

  // Fill in details of the item
  let itemInterval = getItemIntervalString(item, boxDate);
  itemNode.querySelector(".item-interval").textContent = itemInterval;
  itemNode.querySelector(".item-title").textContent = item.title;

  // Fill in category details
  let categoriesArray = item.getCategories();
  if (categoriesArray.length > 0) {
    let cssClassesArray = categoriesArray.map(cal.view.formatStringForCSSRule);
    itemNode.style.borderInlineEnd = `2px solid var(--category-${cssClassesArray[0]}-color)`;
  }

  // Fill in calendar color
  let cssSafeId = cal.view.formatStringForCSSRule(item.calendar.id);
  itemNode.style.color = `var(--calendar-${cssSafeId}-forecolor)`;
  itemNode.style.backgroundColor = `var(--calendar-${cssSafeId}-backcolor)`;

  // Add it to the day container in the right order
  cal.data.binaryInsertNode(dayContainer, itemNode, item, cal.view.compareItems);
}

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
function addItemToDayboxNodate(document, item) {
  let taskContainer = document.getElementById("task-container");
  let taskNode = document.getElementById("task-template").content.firstElementChild.cloneNode(true);
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

  const collator = new Intl.Collator();
  cal.data.binaryInsertNode(
    taskContainer,
    taskNode,
    item,
    collator.compare,
    node => node.item.title
  );
}

/**
 * Get time interval string for the given item. Returns an empty string for all-day items.
 *
 * @param aItem     The item providing the interval
 * @return          The string describing the interval
 */
function getItemIntervalString(aItem, aBoxDate) {
  // omit time label for all-day items
  let formatter = cal.dtz.formatter;
  let startDate = aItem[cal.dtz.startDateProp(aItem)];
  let endDate = aItem[cal.dtz.endDateProp(aItem)];
  if ((startDate && startDate.isDate) || (endDate && endDate.isDate)) {
    return "";
  }

  // check for tasks without start and/or due date
  if (!startDate || !endDate) {
    return formatter.formatItemTimeInterval(aItem);
  }

  let defaultTimezone = cal.dtz.defaultTimezone;
  startDate = startDate.getInTimezone(defaultTimezone);
  endDate = endDate.getInTimezone(defaultTimezone);
  let start = startDate.clone();
  let end = endDate.clone();
  start.isDate = true;
  end.isDate = true;
  if (start.compare(end) == 0) {
    // Events that start and end in the same day.
    return formatter.formatTimeInterval(startDate, endDate);
  }
  // Events that span two or more days.
  let compareStart = aBoxDate.compare(start);
  let compareEnd = aBoxDate.compare(end);
  if (compareStart == 0) {
    return "\u21e4 " + formatter.formatTime(startDate); // unicode '⇤'
  } else if (compareStart > 0 && compareEnd < 0) {
    return "\u21ff"; // unicode '↔'
  } else if (compareEnd == 0) {
    return "\u21e5 " + formatter.formatTime(endDate); // unicode '⇥'
  }
  return "";
}

/**
 * Gets items from the composite calendar for printing.
 *
 * @param {calIDateTime} startDate
 * @param {calIDateTime} endDate
 * @param {integer} filter - calICalendar ITEM_FILTER flags
 * @param {boolean} notDueTasks - if true, include tasks with no due date
 * @returns {calIItemBase[]}
 */
function getItems(startDate, endDate, filter, notDueTasks) {
  let window = Services.wm.getMostRecentWindow("mail:3pane");
  let compositeCalendar = cal.view.getCompositeCalendar(window);

  let itemList = [];
  return new Promise(resolve => {
    let listener = {
      QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
      onOperationComplete(calendar, status, operationType, id, dateTime) {
        resolve(itemList);
      },
      onGetResult(calendar, status, itemType, detail, items) {
        if (!notDueTasks) {
          items = items.filter(i => !i.isTodo() || i.entryDate || i.dueDate);
        }
        itemList = itemList.concat(items);
      },
    };
    compositeCalendar.getItems(filter, 0, startDate, endDate, listener);
  });
}

/**
 * A simple list of calendar items.
 */
let listView = {
  /**
   * Create the list view.
   *
   * @param {HTMLDocument} document
   * @param {calIDateTime} startDate - the first day of the months to be displayed
   * @param {calIDateTime} endDate - the first day of the month AFTER the
   *   months to be displayed
   * @param {integer} filter - calICalendar ITEM_FILTER flags
   * @param {boolean} notDueTasks - if true, include tasks with no due date
   */
  async draw(document, startDate, endDate, filter, notDueTasks) {
    let container = document.getElementById("list-container");
    let listItemTemplate = document.getElementById("list-item-template");

    // Get and sort items.
    let items = await getItems(startDate, endDate, filter, notDueTasks);
    items.sort((a, b) => {
      let start_a = a[cal.dtz.startDateProp(a)];
      if (!start_a) {
        return -1;
      }
      let start_b = b[cal.dtz.startDateProp(b)];
      if (!start_b) {
        return 1;
      }
      return start_a.compare(start_b);
    });

    // Display the items.
    for (let item of items) {
      let itemNode = listItemTemplate.content.firstElementChild.cloneNode(true);

      let setupTextRow = function(classKey, propValue, prefixKey) {
        if (propValue) {
          let prefix = cal.l10n.getCalString(prefixKey);
          itemNode.querySelector("." + classKey + "key").textContent = prefix;
          itemNode.querySelector("." + classKey).textContent = propValue;
        } else {
          let row = itemNode.querySelector("." + classKey + "row");
          if (
            row.nextSibling.nodeType == row.nextSibling.TEXT_NODE ||
            row.nextSibling.nodeType == row.nextSibling.CDATA_SECTION_NODE
          ) {
            row.nextSibling.remove();
          }
          row.remove();
        }
      };

      let itemStartDate = item[cal.dtz.startDateProp(item)];
      let itemEndDate = item[cal.dtz.endDateProp(item)];
      if (itemStartDate || itemEndDate) {
        // This is a task with a start or due date, format accordingly
        let prefixWhen = cal.l10n.getCalString("htmlPrefixWhen");
        itemNode.querySelector(".intervalkey").textContent = prefixWhen;

        let startNode = itemNode.querySelector(".dtstart");
        let dateString = cal.dtz.formatter.formatItemInterval(item);
        startNode.setAttribute("title", itemStartDate ? itemStartDate.icalString : "none");
        startNode.textContent = dateString;
      } else {
        let row = itemNode.querySelector(".intervalrow");
        row.remove();
        if (
          row.nextSibling &&
          (row.nextSibling.nodeType == row.nextSibling.TEXT_NODE ||
            row.nextSibling.nodeType == row.nextSibling.CDATA_SECTION_NODE)
        ) {
          row.nextSibling.remove();
        }
      }

      let itemTitle = item.isCompleted
        ? cal.l10n.getCalString("htmlTaskCompleted", [item.title])
        : item.title;
      setupTextRow("summary", itemTitle, "htmlPrefixTitle");

      setupTextRow("location", item.getProperty("LOCATION"), "htmlPrefixLocation");
      setupTextRow("description", item.getProperty("DESCRIPTION"), "htmlPrefixDescription");

      container.appendChild(itemNode);
    }

    // Set the page title.
    let startMonth = cal.l10n.formatMonth(startDate.month + 1, "calendar", "monthInYear");
    let startMonthTitle = cal.l10n.getCalString("monthInYear", [startMonth, startDate.year]);
    endDate.day--;
    let endMonth = cal.l10n.formatMonth(endDate.month + 1, "calendar", "monthInYear");
    let endMonthTitle = cal.l10n.getCalString("monthInYear", [endMonth, endDate.year]);

    if (startMonthTitle == endMonthTitle) {
      document.title = startMonthTitle;
    } else {
      document.title = `${startMonthTitle} – ${endMonthTitle}`;
    }
  },
};

/**
 * A layout with one calendar month per page.
 */
let monthGridView = {
  dayTable: {},

  /**
   * Create the month grid view.
   *
   * @param {HTMLDocument} document
   * @param {calIDateTime} startDate - the first day of the months to be displayed
   * @param {calIDateTime} endDate - the first day of the month AFTER the
   *   months to be displayed
   * @param {integer} filter - calICalendar ITEM_FILTER flags
   * @param {boolean} notDueTasks - if true, include tasks with no due date
   */
  async draw(document, startDate, endDate, filter, notDueTasks) {
    let container = document.getElementById("month-container");

    // Draw the month grid(s).
    let current = startDate.clone();
    do {
      container.appendChild(this.drawMonth(document, current));
      current.month += 1;
    } while (current.compare(endDate) < 0);

    // Extend the date range to include adjacent days that will be printed.
    startDate = weekInfoService.getStartOfWeek(startDate);
    // Get the end of the week containing the last day of the month, not the
    // week containing the first day of the next month.
    endDate.day--;
    endDate = weekInfoService.getEndOfWeek(endDate);
    endDate.day++; // Add a day to include items from the last day.

    // Get and display the items.
    let items = await getItems(startDate, endDate, filter, notDueTasks);
    let defaultTimezone = cal.dtz.defaultTimezone;
    for (let item of items) {
      let itemStartDate = item[cal.dtz.startDateProp(item)] || item[cal.dtz.endDateProp(item)];
      let itemEndDate = item[cal.dtz.endDateProp(item)] || item[cal.dtz.startDateProp(item)];

      if (!itemStartDate && !itemEndDate) {
        addItemToDayboxNodate(document, item);
        continue;
      }
      itemStartDate = itemStartDate.getInTimezone(defaultTimezone);
      itemEndDate = itemEndDate.getInTimezone(defaultTimezone);

      let boxDate = itemStartDate.clone();
      boxDate.isDate = true;
      for (boxDate; boxDate.compare(itemEndDate) < (itemEndDate.isDate ? 0 : 1); boxDate.day++) {
        let boxDateString = boxDate.icalString;
        if (boxDateString in this.dayTable) {
          for (let dayBox of this.dayTable[boxDateString]) {
            addItemToDaybox(document, item, boxDate, dayBox.querySelector(".items"));
          }
        }
      }
    }

    // Set the page title.
    let months = container.querySelectorAll("table");
    if (months.length == 1) {
      document.title = months[0].querySelector(".month-title").textContent;
    } else {
      document.title =
        months[0].querySelector(".month-title").textContent +
        " – " +
        months[months.length - 1].querySelector(".month-title").textContent;
    }
  },

  /**
   * Create one month from the template.
   *
   * @param {HTMLDocument} document
   * @param {calIDateTime} startOfMonth - the first day of the month
   */
  drawMonth(document, startOfMonth) {
    let monthTemplate = document.getElementById("month-template");
    let month = monthTemplate.content.firstElementChild.cloneNode(true);

    // Set up the month title
    let monthName = cal.l10n.formatMonth(startOfMonth.month + 1, "calendar", "monthInYear");
    let monthTitle = cal.l10n.getCalString("monthInYear", [monthName, startOfMonth.year]);
    month.rows[0].cells[0].firstElementChild.textContent = monthTitle;

    // Set up the weekday titles
    let weekStart = Services.prefs.getIntPref("calendar.week.start", 0);
    for (let i = 0; i < 7; i++) {
      let dayNumber = ((i + weekStart) % 7) + 1;
      month.rows[1].cells[i].firstElementChild.textContent = cal.l10n.getDateFmtString(
        `day.${dayNumber}.Mmm`
      );
    }

    // Set up each week
    let endOfMonthView = weekInfoService.getEndOfWeek(startOfMonth.endOfMonth);
    let startOfMonthView = weekInfoService.getStartOfWeek(startOfMonth);
    let mainMonth = startOfMonth.month;

    for (
      let weekStart = startOfMonthView;
      weekStart.compare(endOfMonthView) < 0;
      weekStart.day += 7
    ) {
      month.tBodies[0].appendChild(this.drawWeek(document, weekStart, mainMonth));
    }

    return month;
  },

  /**
   * Create one week from the template.
   *
   * @param {HTMLDocument} document
   * @param {calIDateTime} startOfWeek - the first day of the week
   * @param {number} mainMonth - the month that this week is being added to
   *   (for marking days that are in adjacent months)
   */
  drawWeek(document, startOfWeek, mainMonth) {
    const weekdayMap = [
      "d0sundaysoff",
      "d1mondaysoff",
      "d2tuesdaysoff",
      "d3wednesdaysoff",
      "d4thursdaysoff",
      "d5fridaysoff",
      "d6saturdaysoff",
    ];

    let weekTemplate = document.getElementById("month-week-template");
    let week = weekTemplate.content.firstElementChild.cloneNode(true);

    // Set up day numbers for all days in this week
    let date = startOfWeek.clone();
    for (let i = 0; i < 7; i++) {
      let dayBox = week.cells[i];
      dayBox.querySelector(".day-title").textContent = date.day;

      let weekDay = date.weekday;
      let dayOffPrefName = "calendar.week." + weekdayMap[weekDay];
      if (Services.prefs.getBoolPref(dayOffPrefName, false)) {
        dayBox.classList.add("day-off");
      }

      if (date.month != mainMonth) {
        dayBox.classList.add("out-of-month");
      }

      if (date.icalString in this.dayTable) {
        this.dayTable[date.icalString].push(dayBox);
      } else {
        this.dayTable[date.icalString] = [dayBox];
      }
      date.day++;
    }

    return week;
  },
};

/**
 * A layout with seven days per page. The week layout is NOT aware of the
 * start-of-week preferences. It always begins on a Monday.
 */
let weekPlannerView = {
  dayTable: {},

  /**
   * Create the week planner view.
   *
   * @param {HTMLDocument} document
   * @param {calIDateTime} startDate - the Monday of the first week to be displayed
   * @param {calIDateTime} endDate - the Monday AFTER the last week to be displayed
   * @param {integer} filter - calICalendar ITEM_FILTER flags
   * @param {boolean} notDueTasks - if true, include tasks with no due date
   */
  async draw(document, startDate, endDate, filter, notDueTasks) {
    let container = document.getElementById("week-container");

    // Draw the week grid(s).
    for (let current = startDate.clone(); current.compare(endDate) < 0; current.day += 7) {
      container.appendChild(this.drawWeek(document, current));
    }

    // Get and display the items.
    let items = await getItems(startDate, endDate, filter, notDueTasks);
    let defaultTimezone = cal.dtz.defaultTimezone;
    for (let item of items) {
      let itemStartDate = item[cal.dtz.startDateProp(item)] || item[cal.dtz.endDateProp(item)];
      let itemEndDate = item[cal.dtz.endDateProp(item)] || item[cal.dtz.startDateProp(item)];

      if (!itemStartDate && !itemEndDate) {
        addItemToDayboxNodate(document, item);
        continue;
      }
      itemStartDate = itemStartDate.getInTimezone(defaultTimezone);
      itemEndDate = itemEndDate.getInTimezone(defaultTimezone);

      let boxDate = itemStartDate.clone();
      boxDate.isDate = true;
      for (boxDate; boxDate.compare(itemEndDate) < (itemEndDate.isDate ? 0 : 1); boxDate.day++) {
        let boxDateString = boxDate.icalString;
        if (boxDateString in this.dayTable) {
          addItemToDaybox(document, item, boxDate, this.dayTable[boxDateString]);
        }
      }
    }

    // Set the page title.
    let weeks = container.querySelectorAll("table");
    if (weeks.length == 1) {
      document.title = cal.l10n.getCalString("singleLongCalendarWeek", [weeks[0].number]);
    } else {
      document.title = cal.l10n.getCalString("severalLongCalendarWeeks", [
        weeks[0].number,
        weeks[weeks.length - 1].number,
      ]);
    }
  },

  /**
   * Create one week from the template.
   *
   * @param {HTMLDocument} document
   * @param {calIDateTime} monday - the Monday of the week
   */
  drawWeek(document, monday) {
    // In the order they appear on the page.
    const weekdayMap = [
      "d1mondaysoff",
      "d2tuesdaysoff",
      "d3wednesdaysoff",
      "d4thursdaysoff",
      "d5fridaysoff",
      "d6saturdaysoff",
      "d0sundaysoff",
    ];

    let weekTemplate = document.getElementById("week-template");
    let week = weekTemplate.content.firstElementChild.cloneNode(true);

    // Set up the week number title
    week.number = weekInfoService.getWeekTitle(monday);
    week.querySelector(".week-title").textContent = cal.l10n.getCalString("WeekTitle", [
      week.number,
    ]);

    // Set up the day boxes
    let currentDate = monday.clone();
    for (let i = 0; i < 7; i++) {
      let day = week.rows[1].cells[i];

      let titleNode = day.querySelector(".day-title");
      titleNode.textContent = cal.dtz.formatter.formatDateLong(currentDate);

      this.dayTable[currentDate.icalString] = day.querySelector(".items");

      if (Services.prefs.getBoolPref("calendar.week." + weekdayMap[i], false)) {
        day.classList.add("day-off");
      }

      currentDate.day++;
    }

    return week;
  },
};

Services.obs.addObserver(
  {
    async observe(subDialogWindow) {
      if (!subDialogWindow.location.href.startsWith("chrome://global/content/print.html?")) {
        return;
      }

      await new Promise(resolve =>
        subDialogWindow.document.addEventListener("print-settings", resolve, { once: true })
      );

      if (
        subDialogWindow.PrintEventHandler.activeCurrentURI !=
        "chrome://calendar/content/printing-template.html"
      ) {
        return;
      }

      Services.scriptloader.loadSubScript(
        "chrome://calendar/content/calendar-print.js",
        subDialogWindow
      );
    },
  },
  "subdialog-loaded"
);
