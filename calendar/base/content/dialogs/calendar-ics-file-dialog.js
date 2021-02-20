/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals addMenuItem, getItemsFromFile, putItemsIntoCal, removeChildren,
           sortCalendarArray */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const gModel = {
  /** @type {calICalendar[]} */
  calendars: [],

  /** @type {calIItemBase[]} */
  itemsToImport: [],

  /** @type {nsIFile | null} */
  file: null,

  /** @type {CalendarItemSummary[]} */
  itemSummaries: [],
};

/**
 * Window load event handler.
 */
async function onWindowLoad() {
  // Workaround to add padding to the dialog buttons area which is in shadow dom.
  // If the padding value changes here it should also change in the CSS.
  let dialog = document.getElementsByTagName("dialog")[0];
  dialog.shadowRoot.querySelector(".dialog-button-box").style = "padding-inline: 10px;";

  gModel.file = window.arguments[0];
  document.getElementById("calendar-ics-file-dialog-file-path").value = gModel.file.path;

  let calendars = cal.getCalendarManager().getCalendars();
  gModel.calendars = getCalendarsThatCanImport(calendars);
  if (!gModel.calendars.length) {
    // No calendars to import into. Show error dialog and close the window.
    cal.showError(await document.l10n.formatValue("calendar-ics-file-dialog-no-calendars"), window);
    window.close();
    return;
  }

  let composite = cal.view.getCompositeCalendar(window);
  let defaultCalendarId = composite && composite.defaultCalendar?.id;
  setUpCalendarMenu(gModel.calendars, defaultCalendarId);
  cal.view.colorTracker.registerWindow(window);

  // Finish laying out and displaying the window, then come back to do the hard work.
  Services.tm.dispatchToMainThread(async () => {
    let startTime = Date.now();

    gModel.itemsToImport = getItemsFromFile(gModel.file);
    if (!gModel.itemsToImport.length) {
      // No items to import, close the window. An error dialog has already been
      // shown by `getItemsFromFile`.
      window.close();
      return;
    }

    // We know that if `getItemsFromFile` took a long time, then `setUpItemSummaries` will also
    // take a long time. Show a loading message so the user knows something is happening.
    let loadingMessage = document.getElementById("calendar-ics-file-dialog-items-loading-message");
    if (Date.now() - startTime > 150) {
      loadingMessage.removeAttribute("hidden");
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    await setUpItemSummaries(gModel.itemsToImport);

    // Remove the loading message from the DOM to avoid it causing problems later.
    loadingMessage.remove();

    document.addEventListener("dialogaccept", importRemainingItems);

    window.addEventListener("resize", () => {
      for (let summary of gModel.itemSummaries) {
        if (summary) {
          summary.onWindowResize();
        }
      }
    });
  });
}
window.addEventListener("load", onWindowLoad);

/**
 * Takes an array of calendars and returns a sorted array of the calendars
 * that can import items.
 *
 * @param {calICalendar[]} calendars - An array of calendars.
 * @return {calICalendar[]} Sorted array of calendars that can import items.
 */
function getCalendarsThatCanImport(calendars) {
  let calendarsThatCanImport = calendars.filter(
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
  let menulist = document.getElementById("calendar-ics-file-dialog-calendar-menu");
  for (let calendar of calendars) {
    let menuitem = addMenuItem(menulist, calendar.name, calendar.name);
    let cssSafeId = cal.view.formatStringForCSSRule(calendar.id);
    menuitem.style.setProperty("--item-color", `var(--calendar-${cssSafeId}-backcolor)`);
    menuitem.classList.add("menuitem-iconic");
  }

  let index = defaultCalendarId
    ? calendars.findIndex(calendar => calendar.id == defaultCalendarId)
    : 0;

  menulist.selectedIndex = index == -1 ? 0 : index;
  updateCalendarMenu();
}

/**
 * Update to reflect a change in the selected calendar.
 */
function updateCalendarMenu() {
  let menulist = document.getElementById("calendar-ics-file-dialog-calendar-menu");
  menulist.style.setProperty(
    "--item-color",
    menulist.selectedItem.style.getPropertyValue("--item-color")
  );
}

/**
 * Display summaries of each calendar item from the file being imported.
 *
 * @param {calIItemBase[]} items - An array of calendar events and tasks.
 */
async function setUpItemSummaries(items) {
  let itemsContainer = document.getElementById("calendar-ics-file-dialog-items-container");

  // Sort the items, chronologically first, then alphabetically.
  let collator = new Intl.Collator(undefined, { numeric: true });
  items.sort((a, b) => {
    return a.startDate.nativeTime - b.startDate.nativeTime || collator.compare(a.title, b.title);
  });

  let [eventButtonText, taskButtonText] = await document.l10n.formatValues([
    "calendar-ics-file-dialog-import-event-button-label",
    "calendar-ics-file-dialog-import-task-button-label",
  ]);

  items.forEach((item, index) => {
    let itemFrame = document.createXULElement("vbox");
    itemFrame.classList.add("calendar-ics-file-dialog-item-frame");

    let importButton = document.createXULElement("button");
    importButton.classList.add("calendar-ics-file-dialog-item-import-button");
    importButton.setAttribute("label", item.isEvent() ? eventButtonText : taskButtonText);
    importButton.addEventListener("command", importSingleItem.bind(null, item, index));

    let buttonBox = document.createXULElement("hbox");
    buttonBox.setAttribute("pack", "end");
    buttonBox.setAttribute("align", "end");

    let summary = document.createXULElement("calendar-item-summary");
    summary.setAttribute("id", "import-item-summary-" + index);

    itemFrame.appendChild(summary);
    buttonBox.appendChild(importButton);
    itemFrame.appendChild(buttonBox);

    itemsContainer.appendChild(itemFrame);
    summary.item = item;

    summary.updateItemDetails();
    gModel.itemSummaries.push(summary);
  });
}

/**
 * Get the currently selected calendar.
 *
 * @return {calICalendar} The currently selected calendar.
 */
function getCurrentlySelectedCalendar() {
  let menulist = document.getElementById("calendar-ics-file-dialog-calendar-menu");
  let calendar = gModel.calendars[menulist.selectedIndex];
  return calendar;
}

/**
 * Handler for buttons that import a single item. The arguments are bound for
 * each button instance, except for the event argument.
 *
 * @param {calIItemBase} item - Calendar item.
 * @param {number} itemIndex - Index of the calendar item in the item array.
 * @param {string} filePath - Path to the file being imported.
 * @param {Event} event - The button event.
 */
async function importSingleItem(item, itemIndex, event) {
  let dialog = document.getElementsByTagName("dialog")[0];
  let acceptButton = dialog.getButton("accept");
  let cancelButton = dialog.getButton("cancel");

  acceptButton.disabled = true;
  cancelButton.disabled = true;

  let calendar = getCurrentlySelectedCalendar();

  await putItemsIntoCal(calendar, [item], {
    onDuplicate(item, error) {
      // TODO: CalCalendarManager already shows a not-very-useful error pop-up.
      // Once that is fixed, use this callback to display a proper error message.
    },
    onError(item, error) {
      // TODO: CalCalendarManager already shows a not-very-useful error pop-up.
      // Once that is fixed, use this callback to display a proper error message.
    },
  });

  event.target.closest(".calendar-ics-file-dialog-item-frame").remove();
  delete gModel.itemsToImport[itemIndex];
  delete gModel.itemSummaries[itemIndex];

  acceptButton.disabled = false;
  if (gModel.itemsToImport.some(item => item)) {
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

  let dialog = document.getElementsByTagName("dialog")[0];
  let acceptButton = dialog.getButton("accept");
  let cancelButton = dialog.getButton("cancel");

  acceptButton.disabled = true;
  cancelButton.hidden = true;

  document.getElementById("calendar-ics-file-dialog-file-path").hidden = true;
  document.getElementById("calendar-ics-file-dialog-items-container").hidden = true;
  document.getElementById("calendar-ics-file-dialog-calendar-menu-label").hidden = true;
  document.getElementById("calendar-ics-file-dialog-calendar-menu").hidden = true;

  document.removeEventListener("dialogaccept", importRemainingItems);

  let calendar = getCurrentlySelectedCalendar();
  let remainingItems = gModel.itemsToImport.filter(item => item);

  let progressElement = document.getElementById("calendar-ics-file-dialog-progress");
  let duplicatesElement = document.getElementById("calendar-ics-file-dialog-duplicates-message");
  let errorsElement = document.getElementById("calendar-ics-file-dialog-errors-message");

  let optionsPane = document.getElementById("calendar-ics-file-dialog-options-pane");
  let progressPane = document.getElementById("calendar-ics-file-dialog-progress-pane");
  let resultPane = document.getElementById("calendar-ics-file-dialog-result-pane");

  let importListener = {
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
    onDuplicate(item, error) {
      this.duplicatesCount++;
    },
    onError(item, error) {
      this.errorsCount++;
    },
    onProgress(count, total) {
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

      let btnLabel = await document.l10n.formatValue("calendar-ics-file-accept-button-ok-label");
      setTimeout(() => {
        acceptButton.label = btnLabel;
        acceptButton.disabled = false;

        progressPane.hidden = true;
        resultPane.hidden = false;
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
