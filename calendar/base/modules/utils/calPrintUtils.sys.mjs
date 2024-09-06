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

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.print namespace.
const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));

export var print = {
  ensureInitialized() {
    // Deliberate no-op. By calling this function from outside, you've ensured
    // the observer has been added.
  },

  async draw(document, type, startDate, endDate, filter, notDueTasks) {
    lazy.cal.view.colorTracker.addColorsToDocument(document);

    const listContainer = document.getElementById("list-container");
    while (listContainer.lastChild) {
      listContainer.lastChild.remove();
    }
    const monthContainer = document.getElementById("month-container");
    while (monthContainer.lastChild) {
      monthContainer.lastChild.remove();
    }
    const weekContainer = document.getElementById("week-container");
    while (weekContainer.lastChild) {
      weekContainer.lastChild.remove();
    }

    const taskContainer = document.getElementById("task-container");
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
  const itemNode = document
    .getElementById("item-template")
    .content.firstElementChild.cloneNode(true);
  itemNode.removeAttribute("id");
  itemNode.item = item;

  // Fill in details of the item
  const itemInterval = getItemIntervalString(item, boxDate);
  itemNode.querySelector(".item-interval").textContent = itemInterval;
  itemNode.querySelector(".item-title").textContent = item.title;

  // Fill in category details
  const categoriesArray = item.getCategories();
  if (categoriesArray.length > 0) {
    const cssClassesArray = categoriesArray.map(lazy.cal.view.formatStringForCSSRule);
    itemNode.style.borderInlineEnd = `2px solid var(--category-${cssClassesArray[0]}-color)`;
  }

  // Fill in calendar color
  const cssSafeId = lazy.cal.view.formatStringForCSSRule(item.calendar.id);
  itemNode.style.color = `var(--calendar-${cssSafeId}-forecolor)`;
  itemNode.style.backgroundColor = `var(--calendar-${cssSafeId}-backcolor)`;

  // Add it to the day container in the right order
  lazy.cal.data.binaryInsertNode(dayContainer, itemNode, item, lazy.cal.view.compareItems);
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
  const taskContainer = document.getElementById("task-container");
  const taskNode = document
    .getElementById("task-template")
    .content.firstElementChild.cloneNode(true);
  taskNode.item = item;

  const taskListBox = document.getElementById("tasks-list-box");
  if (taskListBox.hasAttribute("hidden")) {
    const tasksTitle = document.getElementById("tasks-title");
    taskListBox.removeAttribute("hidden");
    tasksTitle.textContent = lazy.l10n.formatValueSync("tasks-with-no-due-date");
  }

  // Fill in details of the task
  if (item.isCompleted) {
    taskNode.querySelector(".task-checkbox").setAttribute("checked", "checked");
  }

  taskNode.querySelector(".task-title").textContent = item.title;

  const collator = new Intl.Collator();
  lazy.cal.data.binaryInsertNode(
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
 * @returns The string describing the interval
 */
function getItemIntervalString(aItem, aBoxDate) {
  // omit time label for all-day items
  const formatter = lazy.cal.dtz.formatter;
  let startDate = aItem[lazy.cal.dtz.startDateProp(aItem)];
  let endDate = aItem[lazy.cal.dtz.endDateProp(aItem)];
  if ((startDate && startDate.isDate) || (endDate && endDate.isDate)) {
    return "";
  }

  // check for tasks without start and/or due date
  if (!startDate || !endDate) {
    return formatter.formatItemTimeInterval(aItem);
  }

  const defaultTimezone = lazy.cal.dtz.defaultTimezone;
  startDate = startDate.getInTimezone(defaultTimezone);
  endDate = endDate.getInTimezone(defaultTimezone);
  const start = startDate.clone();
  const end = endDate.clone();
  start.isDate = true;
  end.isDate = true;
  if (start.compare(end) == 0) {
    // Events that start and end in the same day.
    return formatter.formatTimeInterval(startDate, endDate);
  }
  // Events that span two or more days.
  const compareStart = aBoxDate.compare(start);
  const compareEnd = aBoxDate.compare(end);
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
 * @returns {Promise<calIItemBase[]>}
 */
async function getItems(startDate, endDate, filter, notDueTasks) {
  const window = Services.wm.getMostRecentWindow("mail:3pane");
  const compositeCalendar = lazy.cal.view.getCompositeCalendar(window);

  let itemList = [];
  for await (let items of lazy.cal.iterate.streamValues(
    compositeCalendar.getItems(filter, 0, startDate, endDate)
  )) {
    if (!notDueTasks) {
      items = items.filter(i => !i.isTodo() || i.entryDate || i.dueDate);
    }
    itemList = itemList.concat(items);
  }
  return itemList;
}

/**
 * A simple list of calendar items.
 */
const listView = {
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
    const container = document.getElementById("list-container");
    const listItemTemplate = document.getElementById("list-item-template");

    // Get and sort items.
    const items = await getItems(startDate, endDate, filter, notDueTasks);
    items.sort((a, b) => {
      const start_a = a[lazy.cal.dtz.startDateProp(a)];
      if (!start_a) {
        return -1;
      }
      const start_b = b[lazy.cal.dtz.startDateProp(b)];
      if (!start_b) {
        return 1;
      }
      return start_a.compare(start_b);
    });

    // Display the items.
    for (const item of items) {
      const itemNode = listItemTemplate.content.firstElementChild.cloneNode(true);

      const setupTextRow = function (classKey, propValue, prefixKey) {
        if (propValue) {
          const prefix = lazy.l10n.formatValueSync(prefixKey);
          itemNode.querySelector("." + classKey + "key").textContent = prefix;
          itemNode.querySelector("." + classKey).textContent = propValue;
        } else {
          const row = itemNode.querySelector("." + classKey + "row");
          if (
            row.nextSibling.nodeType == row.nextSibling.TEXT_NODE ||
            row.nextSibling.nodeType == row.nextSibling.CDATA_SECTION_NODE
          ) {
            row.nextSibling.remove();
          }
          row.remove();
        }
      };

      const itemStartDate = item[lazy.cal.dtz.startDateProp(item)];
      const itemEndDate = item[lazy.cal.dtz.endDateProp(item)];
      if (itemStartDate || itemEndDate) {
        // This is a task with a start or due date, format accordingly
        const prefixWhen = lazy.l10n.formatValueSync("html-prefix-when");
        itemNode.querySelector(".intervalkey").textContent = prefixWhen;

        const startNode = itemNode.querySelector(".dtstart");
        const dateString = lazy.cal.dtz.formatter.formatItemInterval(item);
        startNode.setAttribute("title", itemStartDate ? itemStartDate.icalString : "none");
        startNode.textContent = dateString;
      } else {
        const row = itemNode.querySelector(".intervalrow");
        row.remove();
        if (
          row.nextSibling &&
          (row.nextSibling.nodeType == row.nextSibling.TEXT_NODE ||
            row.nextSibling.nodeType == row.nextSibling.CDATA_SECTION_NODE)
        ) {
          row.nextSibling.remove();
        }
      }

      const itemTitle = item.isCompleted
        ? lazy.l10n.formatValueSync("html-task-completed", { task: item.title })
        : item.title;
      setupTextRow("summary", itemTitle, "html-prefix-title");

      setupTextRow("location", item.getProperty("LOCATION"), "html-prefix-location");
      setupTextRow("description", item.getProperty("DESCRIPTION"), "html-prefix-description");

      container.appendChild(itemNode);
    }

    // Set the page title.
    endDate.day--;
    document.title = lazy.cal.dtz.formatter.formatInterval(startDate, endDate);
  },
};

/**
 * A layout with one calendar month per page.
 */
const monthGridView = {
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
    const container = document.getElementById("month-container");

    // Draw the month grid(s).
    const current = startDate.clone();
    do {
      container.appendChild(this.drawMonth(document, current));
      current.month += 1;
    } while (current.compare(endDate) < 0);

    // Extend the date range to include adjacent days that will be printed.
    startDate = lazy.cal.weekInfoService.getStartOfWeek(startDate);
    // Get the end of the week containing the last day of the month, not the
    // week containing the first day of the next month.
    endDate.day--;
    endDate = lazy.cal.weekInfoService.getEndOfWeek(endDate);
    endDate.day++; // Add a day to include items from the last day.

    // Get and display the items.
    const items = await getItems(startDate, endDate, filter, notDueTasks);
    const defaultTimezone = lazy.cal.dtz.defaultTimezone;
    for (const item of items) {
      let itemStartDate =
        item[lazy.cal.dtz.startDateProp(item)] || item[lazy.cal.dtz.endDateProp(item)];
      let itemEndDate =
        item[lazy.cal.dtz.endDateProp(item)] || item[lazy.cal.dtz.startDateProp(item)];

      if (!itemStartDate && !itemEndDate) {
        addItemToDayboxNodate(document, item);
        continue;
      }
      itemStartDate = itemStartDate.getInTimezone(defaultTimezone);
      itemEndDate = itemEndDate.getInTimezone(defaultTimezone);

      const boxDate = itemStartDate.clone();
      boxDate.isDate = true;
      for (boxDate; boxDate.compare(itemEndDate) < (itemEndDate.isDate ? 0 : 1); boxDate.day++) {
        const boxDateString = boxDate.icalString;
        if (boxDateString in this.dayTable) {
          for (const dayBox of this.dayTable[boxDateString]) {
            addItemToDaybox(document, item, boxDate, dayBox.querySelector(".items"));
          }
        }
      }
    }

    // Set the page title.
    const months = container.querySelectorAll("table");
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
    const monthTemplate = document.getElementById("month-template");
    const month = monthTemplate.content.firstElementChild.cloneNode(true);

    // Set up the month title.
    month.rows[0].cells[0].firstElementChild.textContent = new Date(
      startOfMonth.year,
      startOfMonth.month
    ).toLocaleDateString(undefined, { month: "long", year: "numeric" });

    // Set up the weekday titles
    const weekStart = Services.prefs.getIntPref("calendar.week.start", 0);
    for (let i = 0; i < 7; i++) {
      const dayNumber = ((i + weekStart) % 7) + 1;
      month.rows[1].cells[i].firstElementChild.textContent = lazy.cal.l10n.getDateFmtString(
        `day.${dayNumber}.Mmm`
      );
    }

    // Set up each week
    const endOfMonthView = lazy.cal.weekInfoService.getEndOfWeek(startOfMonth.endOfMonth);
    const startOfMonthView = lazy.cal.weekInfoService.getStartOfWeek(startOfMonth);
    const mainMonth = startOfMonth.month;

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

    const weekTemplate = document.getElementById("month-week-template");
    const week = weekTemplate.content.firstElementChild.cloneNode(true);

    // Set up day numbers for all days in this week
    const date = startOfWeek.clone();
    for (let i = 0; i < 7; i++) {
      const dayBox = week.cells[i];
      dayBox.querySelector(".day-title").textContent = date.day;

      const weekDay = date.weekday;
      const dayOffPrefName = "calendar.week." + weekdayMap[weekDay];
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
const weekPlannerView = {
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
    const container = document.getElementById("week-container");

    // Draw the week grid(s).
    for (let current = startDate.clone(); current.compare(endDate) < 0; current.day += 7) {
      container.appendChild(this.drawWeek(document, current));
    }

    // Get and display the items.
    const items = await getItems(startDate, endDate, filter, notDueTasks);
    const defaultTimezone = lazy.cal.dtz.defaultTimezone;
    for (const item of items) {
      let itemStartDate =
        item[lazy.cal.dtz.startDateProp(item)] || item[lazy.cal.dtz.endDateProp(item)];
      let itemEndDate =
        item[lazy.cal.dtz.endDateProp(item)] || item[lazy.cal.dtz.startDateProp(item)];

      if (!itemStartDate && !itemEndDate) {
        addItemToDayboxNodate(document, item);
        continue;
      }
      itemStartDate = itemStartDate.getInTimezone(defaultTimezone);
      itemEndDate = itemEndDate.getInTimezone(defaultTimezone);

      const boxDate = itemStartDate.clone();
      boxDate.isDate = true;
      for (boxDate; boxDate.compare(itemEndDate) < (itemEndDate.isDate ? 0 : 1); boxDate.day++) {
        const boxDateString = boxDate.icalString;
        if (boxDateString in this.dayTable) {
          addItemToDaybox(document, item, boxDate, this.dayTable[boxDateString]);
        }
      }
    }

    // Set the page title.
    const weeks = container.querySelectorAll("table");
    if (weeks.length == 1) {
      document.title = lazy.l10n.formatValueSync("single-long-calendar-week", {
        index: weeks[0].number,
      });
    } else {
      document.title = lazy.l10n.formatValueSync("several-long-calendar-weeks", {
        startIndex: weeks[0].number,
        endIndex: weeks[weeks.length - 1].number,
      });
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

    const weekTemplate = document.getElementById("week-template");
    const week = weekTemplate.content.firstElementChild.cloneNode(true);

    // Set up the week number title
    week.number = lazy.cal.weekInfoService.getWeekTitle(monday);
    week.querySelector(".week-title").textContent = lazy.l10n.formatValueSync("week-title", {
      title: week.number,
    });

    // Set up the day boxes
    const currentDate = monday.clone();
    for (let i = 0; i < 7; i++) {
      const day = week.rows[1].cells[i];

      const titleNode = day.querySelector(".day-title");
      titleNode.textContent = lazy.cal.dtz.formatter.formatDateLong(currentDate);

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
      if (!subDialogWindow.location.href.startsWith("chrome://global/content/print.html")) {
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
        "chrome://calendar/content/widgets/calendar-minimonth.js",
        subDialogWindow
      );
      Services.scriptloader.loadSubScript(
        "chrome://calendar/content/calendar-print.js",
        subDialogWindow
      );
    },
  },
  "subdialog-loaded"
);
