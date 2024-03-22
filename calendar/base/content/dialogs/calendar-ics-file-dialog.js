/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals addMenuItem, getItemsFromIcsFile, putItemsIntoCal,
           sortCalendarArray */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const gModel = {
  /** @type {calICalendar[]} */
  calendars: [],

  /** @type {Map<number, calIItemBase>} */
  itemsToImport: new Map(),

  /** @type {nsIFile | null} */
  file: null,

  /** @type {Map<number, CalendarItemSummary>} */
  itemSummaries: new Map(),
};

/**
 * Window load event handler.
 */
async function onWindowLoad() {
  // Workaround to add padding to the dialog buttons area which is in shadow dom.
  // If the padding value changes here it should also change in the CSS.
  const dialog = document.getElementsByTagName("dialog")[0];
  dialog.shadowRoot.querySelector(".dialog-button-box").style = "padding-inline: 10px;";

  gModel.file = window.arguments[0];
  document.getElementById("calendar-ics-file-dialog-file-path").value = gModel.file.path;

  const calendars = cal.manager.getCalendars();
  gModel.calendars = getCalendarsThatCanImport(calendars);
  if (!gModel.calendars.length) {
    // No calendars to import into. Show error dialog and close the window.
    cal.showError(await document.l10n.formatValue("calendar-ics-file-dialog-no-calendars"), window);
    window.close();
    return;
  }

  const composite = cal.view.getCompositeCalendar(window);
  const defaultCalendarId = composite && composite.defaultCalendar?.id;
  setUpCalendarMenu(gModel.calendars, defaultCalendarId);
  cal.view.colorTracker.registerWindow(window);

  // Finish laying out and displaying the window, then come back to do the hard work.
  Services.tm.dispatchToMainThread(async () => {
    const startTime = Date.now();

    getItemsFromIcsFile(gModel.file).forEach((item, index) => {
      gModel.itemsToImport.set(index, item);
    });
    if (gModel.itemsToImport.size == 0) {
      // No items to import, close the window. An error dialog has already been
      // shown by `getItemsFromIcsFile`.
      window.close();
      return;
    }

    // We know that if `getItemsFromIcsFile` took a long time, then `setUpItemSummaries` will also
    // take a long time. Show a loading message so the user knows something is happening.
    const loadingMessage = document.getElementById(
      "calendar-ics-file-dialog-items-loading-message"
    );
    if (Date.now() - startTime > 150) {
      loadingMessage.removeAttribute("hidden");
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    // Not much point filtering or sorting if there's only one event.
    if (gModel.itemsToImport.size == 1) {
      document.getElementById("calendar-ics-file-dialog-filters").collapsed = true;
    }

    await setUpItemSummaries();

    // Remove the loading message from the DOM to avoid it causing problems later.
    loadingMessage.remove();

    document.addEventListener("dialogaccept", importRemainingItems);
  });
}
window.addEventListener("load", onWindowLoad);

/**
 * Takes an array of calendars and returns a sorted array of the calendars
 * that can import items.
 *
 * @param {calICalendar[]} calendars - An array of calendars.
 * @returns {calICalendar[]} Sorted array of calendars that can import items.
 */
function getCalendarsThatCanImport(calendars) {
  const calendarsThatCanImport = calendars.filter(
    calendar =>
      !calendar.getProperty("disabled") &&
      !calendar.readOnly &&
      cal.acl.userCanAddItemsToCalendar(calendar)
  );
  return sortCalendarArray(calendarsThatCanImport);
}

/**
 * Add calendars to the calendar drop down menu, and select one.
 *
 * @param {calICalendar[]} calendars - An array of calendars.
 * @param {string | null} defaultCalendarId - ID of the default (currently selected) calendar.
 */
function setUpCalendarMenu(calendars, defaultCalendarId) {
  const menulist = document.getElementById("calendar-ics-file-dialog-calendar-menu");
  for (const calendar of calendars) {
    const menuitem = addMenuItem(menulist, calendar.name, calendar.name);
    const cssSafeId = cal.view.formatStringForCSSRule(calendar.id);
    menuitem.style.setProperty("--item-color", `var(--calendar-${cssSafeId}-backcolor)`);
    menuitem.classList.add("menuitem-iconic");
  }

  const index = defaultCalendarId
    ? calendars.findIndex(calendar => calendar.id == defaultCalendarId)
    : 0;

  menulist.selectedIndex = index == -1 ? 0 : index;
  updateCalendarMenu();
}

/**
 * Update to reflect a change in the selected calendar.
 */
function updateCalendarMenu() {
  const menulist = document.getElementById("calendar-ics-file-dialog-calendar-menu");
  menulist.style.setProperty(
    "--item-color",
    menulist.selectedItem.style.getPropertyValue("--item-color")
  );
}

/**
 * Display summaries of each calendar item from the file being imported.
 */
async function setUpItemSummaries() {
  const items = [...gModel.itemsToImport];
  const itemsContainer = document.getElementById("calendar-ics-file-dialog-items-container");

  // Sort the items, chronologically first, tasks without a date to the end,
  // then alphabetically.
  const collator = new Intl.Collator(undefined, { numeric: true });
  items.sort(([, a], [, b]) => {
    const aStartDate =
      a.startDate?.nativeTime ||
      a.entryDate?.nativeTime ||
      a.dueDate?.nativeTime ||
      Number.MAX_SAFE_INTEGER;
    const bStartDate =
      b.startDate?.nativeTime ||
      b.entryDate?.nativeTime ||
      b.dueDate?.nativeTime ||
      Number.MAX_SAFE_INTEGER;
    return aStartDate - bStartDate || collator.compare(a.title, b.title);
  });

  const [eventButtonText, taskButtonText] = await document.l10n.formatValues([
    "calendar-ics-file-dialog-import-event-button-label",
    "calendar-ics-file-dialog-import-task-button-label",
  ]);

  items.forEach(([index, item]) => {
    const itemFrame = document.createXULElement("vbox");
    itemFrame.classList.add("calendar-ics-file-dialog-item-frame");

    const importButton = document.createXULElement("button");
    importButton.classList.add("calendar-ics-file-dialog-item-import-button");
    importButton.setAttribute("label", item.isEvent() ? eventButtonText : taskButtonText);
    importButton.addEventListener("command", importSingleItem.bind(null, item, index));

    const buttonBox = document.createXULElement("hbox");
    buttonBox.setAttribute("pack", "end");
    buttonBox.setAttribute("align", "end");

    const summary = document.createXULElement("calendar-item-summary");
    summary.setAttribute("id", "import-item-summary-" + index);

    itemFrame.appendChild(summary);
    buttonBox.appendChild(importButton);
    itemFrame.appendChild(buttonBox);

    itemsContainer.appendChild(itemFrame);
    summary.item = item;

    summary.updateItemDetails();
    gModel.itemSummaries.set(index, summary);
  });
}

/**
 * Filter item summaries by search string.
 *
 * @param {searchString} [searchString] - Terms to search for.
 */
function filterItemSummaries(searchString = "") {
  const itemsContainer = document.getElementById("calendar-ics-file-dialog-items-container");

  searchString = searchString.trim();
  // Nothing to search for. Display all item summaries.
  if (!searchString) {
    gModel.itemSummaries.forEach(s => {
      s.closest(".calendar-ics-file-dialog-item-frame").hidden = false;
    });

    itemsContainer.scrollTo(0, 0);
    return;
  }

  searchString = searchString.toLowerCase().normalize();

  // Split the search string into tokens. Quoted strings are preserved.
  let searchTokens = [];
  let startIndex;
  while ((startIndex = searchString.indexOf('"')) != -1) {
    let endIndex = searchString.indexOf('"', startIndex + 1);
    if (endIndex == -1) {
      endIndex = searchString.length;
    }

    searchTokens.push(searchString.substring(startIndex + 1, endIndex));
    let query = searchString.substring(0, startIndex);
    if (endIndex < searchString.length) {
      query += searchString.substr(endIndex + 1);
    }

    searchString = query.trim();
  }

  if (searchString.length != 0) {
    searchTokens = searchTokens.concat(searchString.split(/\s+/));
  }

  // Check the title and description of each item for matches.
  gModel.itemSummaries.forEach(s => {
    let title, description;
    const matches = searchTokens.every(term => {
      if (title === undefined) {
        title = s.item.title.toLowerCase().normalize();
      }
      if (title?.includes(term)) {
        return true;
      }

      if (description === undefined) {
        description = s.item.getProperty("description")?.toLowerCase().normalize();
      }
      return description?.includes(term);
    });
    s.closest(".calendar-ics-file-dialog-item-frame").hidden = !matches;
  });

  itemsContainer.scrollTo(0, 0);
}

/**
 * Sort item summaries.
 *
 * @param {Event} event - The oncommand event that triggered this sort.
 */
function sortItemSummaries(event) {
  const [key, direction] = event.target.value.split(" ");

  let comparer;
  if (key == "title") {
    const collator = new Intl.Collator(undefined, { numeric: true });
    if (direction == "ascending") {
      comparer = (a, b) => collator.compare(a.item.title, b.item.title);
    } else {
      comparer = (a, b) => collator.compare(b.item.title, a.item.title);
    }
  } else if (key == "start") {
    if (direction == "ascending") {
      comparer = (a, b) => a.item.startDate.nativeTime - b.item.startDate.nativeTime;
    } else {
      comparer = (a, b) => b.item.startDate.nativeTime - a.item.startDate.nativeTime;
    }
  } else {
    // How did we get here?
    throw new Error(`Unexpected sort key: ${key}`);
  }

  const items = [...gModel.itemSummaries.values()].sort(comparer);
  const itemsContainer = document.getElementById("calendar-ics-file-dialog-items-container");
  for (const item of items) {
    itemsContainer.appendChild(item.closest(".calendar-ics-file-dialog-item-frame"));
  }
  itemsContainer.scrollTo(0, 0);

  for (const menuitem of document.querySelectorAll(
    "#calendar-ics-file-dialog-sort-popup > menuitem"
  )) {
    menuitem.checked = menuitem == event.target;
  }
}

/**
 * Get the currently selected calendar.
 *
 * @returns {calICalendar} The currently selected calendar.
 */
function getCurrentlySelectedCalendar() {
  const menulist = document.getElementById("calendar-ics-file-dialog-calendar-menu");
  const calendar = gModel.calendars[menulist.selectedIndex];
  return calendar;
}

/**
 * Handler for buttons that import a single item. The arguments are bound for
 * each button instance, except for the event argument.
 *
 * @param {calIItemBase} item - Calendar item.
 * @param {number} itemIndex - Index of the calendar item in the item array.
 * @param {Event} event - The button event.
 */
async function importSingleItem(item, itemIndex, event) {
  const dialog = document.getElementsByTagName("dialog")[0];
  const acceptButton = dialog.getButton("accept");
  const cancelButton = dialog.getButton("cancel");

  acceptButton.disabled = true;
  cancelButton.disabled = true;

  const calendar = getCurrentlySelectedCalendar();

  await putItemsIntoCal(calendar, [item], {
    onDuplicate() {
      // TODO: CalCalendarManager already shows a not-very-useful error pop-up.
      // Once that is fixed, use this callback to display a proper error message.
    },
    onError() {
      // TODO: CalCalendarManager already shows a not-very-useful error pop-up.
      // Once that is fixed, use this callback to display a proper error message.
    },
  });

  event.target.closest(".calendar-ics-file-dialog-item-frame").remove();
  gModel.itemsToImport.delete(itemIndex);
  gModel.itemSummaries.delete(itemIndex);

  acceptButton.disabled = false;
  if (gModel.itemsToImport.size > 0) {
    // Change the cancel button label to Close, as we've done some work that
    // won't be cancelled.
    cancelButton.label = await document.l10n.formatValue(
      "calendar-ics-file-cancel-button-close-label"
    );
    cancelButton.disabled = false;
  } else {
    // No more items to import, remove the "Import All" option.
    document.removeEventListener("dialogaccept", importRemainingItems);

    cancelButton.hidden = true;
    acceptButton.label = await document.l10n.formatValue(
      "calendar-ics-file-accept-button-ok-label"
    );
  }
}

/**
 * "Import All" button command handler.
 *
 * @param {Event} event - Button command event.
 */
async function importRemainingItems(event) {
  event.preventDefault();

  const dialog = document.getElementsByTagName("dialog")[0];
  const acceptButton = dialog.getButton("accept");
  const cancelButton = dialog.getButton("cancel");

  acceptButton.disabled = true;
  cancelButton.disabled = true;

  const calendar = getCurrentlySelectedCalendar();
  const filteredSummaries = [...gModel.itemSummaries.values()].filter(
    summary => !summary.closest(".calendar-ics-file-dialog-item-frame").hidden
  );
  const remainingItems = filteredSummaries.map(summary => summary.item);

  const progressElement = document.getElementById("calendar-ics-file-dialog-progress");
  const duplicatesElement = document.getElementById("calendar-ics-file-dialog-duplicates-message");
  const errorsElement = document.getElementById("calendar-ics-file-dialog-errors-message");

  const optionsPane = document.getElementById("calendar-ics-file-dialog-options-pane");
  const progressPane = document.getElementById("calendar-ics-file-dialog-progress-pane");
  const resultPane = document.getElementById("calendar-ics-file-dialog-result-pane");

  const importListener = {
    count: 0,
    duplicatesCount: 0,
    errorsCount: 0,
    progressInterval: null,

    onStart() {
      progressElement.max = remainingItems.length;
      optionsPane.hidden = true;
      progressPane.hidden = false;

      this.progressInterval = setInterval(() => {
        progressElement.value = this.count;
      }, 50);
    },
    onDuplicate() {
      this.duplicatesCount++;
    },
    onError() {
      this.errorsCount++;
    },
    onProgress(count) {
      this.count = count;
    },
    async onEnd() {
      progressElement.value = this.count;
      clearInterval(this.progressInterval);

      document.l10n.setAttributes(duplicatesElement, "calendar-ics-file-import-duplicates", {
        duplicatesCount: this.duplicatesCount,
      });
      duplicatesElement.hidden = this.duplicatesCount == 0;
      document.l10n.setAttributes(errorsElement, "calendar-ics-file-import-errors", {
        errorsCount: this.errorsCount,
      });
      errorsElement.hidden = this.errorsCount == 0;

      const [acceptButtonLabel, cancelButtonLabel] = await document.l10n.formatValues([
        { id: "calendar-ics-file-accept-button-ok-label" },
        { id: "calendar-ics-file-cancel-button-close-label" },
      ]);

      filteredSummaries.forEach(summary => {
        const itemIndex = parseInt(summary.id.substring("import-item-summary-".length), 10);
        gModel.itemsToImport.delete(itemIndex);
        gModel.itemSummaries.delete(itemIndex);
        summary.closest(".calendar-ics-file-dialog-item-frame").remove();
      });

      document.getElementById("calendar-ics-file-dialog-search-input").value = "";
      filterItemSummaries();
      const itemsRemain = !!document.querySelector(".calendar-ics-file-dialog-item-frame");

      // An artificial delay so the progress pane doesn't appear then immediately disappear.
      setTimeout(() => {
        if (itemsRemain) {
          acceptButton.disabled = false;
          cancelButton.label = cancelButtonLabel;
          cancelButton.disabled = false;
        } else {
          acceptButton.label = acceptButtonLabel;
          acceptButton.disabled = false;
          cancelButton.hidden = true;
          document.removeEventListener("dialogaccept", importRemainingItems);
        }

        optionsPane.hidden = !itemsRemain;
        progressPane.hidden = true;
        resultPane.hidden = itemsRemain;
      }, 500);
    },
  };

  putItemsIntoCal(calendar, remainingItems, importListener);
}

/**
 * These functions are called via `putItemsIntoCal` in import-export.js so
 * they need to be defined in global scope but they don't need to do anything
 * in this case.
 */
function startBatchTransaction() {}
function endBatchTransaction() {}
