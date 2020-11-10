/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals addMenuItem, getItemsFromFile, putItemsIntoCal, removeChildren,
           sortCalendarArray */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

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

  gModel.itemsToImport = getItemsFromFile(gModel.file);
  if (!gModel.itemsToImport.length) {
    // No items to import, close the window. An error dialog has already been
    // shown by `getItemsFromFile`.
    window.close();
    return;
  }

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

  setUpItemSummaries(gModel.itemsToImport, gModel.file.path);

  document.addEventListener("dialogaccept", importRemainingItems);

  window.addEventListener("resize", () => {
    for (let summary of gModel.itemSummaries) {
      if (summary) {
        summary.onWindowResize();
      }
    }
  });
  window.sizeToContent();
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
    calendar => calendar && cal.acl.userCanAddItemsToCalendar(calendar)
  );
  return sortCalendarArray(calendarsThatCanImport);
}

/**
 * Ensure a calendar is enabled and writable.
 *
 * @param {calICalendar} calendar - The calendar to check.
 */
function ensureCalendarIsWritable(calendar) {
  if (calendar.getProperty("disabled")) {
    calendar.setProperty("disabled", false);
  }
  if (calendar.readOnly) {
    calendar.readOnly = false;
  }
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
    addMenuItem(menulist, calendar.name, calendar.name);
  }

  let index = defaultCalendarId
    ? calendars.findIndex(calendar => calendar.id == defaultCalendarId)
    : 0;

  menulist.selectedIndex = index == -1 ? 0 : index;
}

/**
 * Display summaries of each calendar item from the file being imported.
 *
 * @param {calIItemBase[]} items - An array of calendar events and tasks.
 * @param {string} filePath - The path to the file being imported.
 */
function setUpItemSummaries(items, filePath) {
  let itemsContainer = document.getElementById("calendar-ics-file-dialog-items-container");

  items.forEach(async (item, index) => {
    let itemFrame = document.createXULElement("vbox");
    itemFrame.classList.add("calendar-ics-file-dialog-item-frame");

    let importButton = document.createXULElement("button");
    importButton.classList.add("calendar-ics-file-dialog-item-import-button");

    let buttonTextIdentifier = cal.item.isEvent(item)
      ? "calendar-ics-file-dialog-import-event-button-label"
      : "calendar-ics-file-dialog-import-task-button-label";

    let buttonText = await document.l10n.formatValue(buttonTextIdentifier);
    importButton.setAttribute("label", buttonText);

    importButton.addEventListener("command", importSingleItem.bind(null, item, index, filePath));

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
async function importSingleItem(item, itemIndex, filePath, event) {
  event.target.closest(".calendar-ics-file-dialog-item-frame").remove();
  delete gModel.itemsToImport[itemIndex];
  delete gModel.itemSummaries[itemIndex];

  let calendar = getCurrentlySelectedCalendar();
  ensureCalendarIsWritable(calendar);

  putItemsIntoCal(calendar, [item], filePath);

  if (!gModel.itemsToImport.some(item => item)) {
    // No more items to import, remove the "Import All" option.
    document.removeEventListener("dialogaccept", importRemainingItems);

    let dialog = document.getElementsByTagName("dialog")[0];
    dialog.getButton("cancel").hidden = true;
    dialog.getButton("accept").label = await document.l10n.formatValue(
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
  ensureCalendarIsWritable(calendar);
  let remainingItems = gModel.itemsToImport.filter(item => item);

  let [importResult] = await Promise.allSettled([
    putItemsIntoCal(calendar, remainingItems, gModel.file.path),
    new Promise(resolve => setTimeout(resolve, 500)),
  ]);

  let messageIdentifier = importResult.value
    ? "calendar-ics-file-import-success"
    : "calendar-ics-file-import-error";

  let [msgValue, btnLabel] = await document.l10n.formatValues([
    { id: messageIdentifier },
    { id: "calendar-ics-file-accept-button-ok-label" },
  ]);

  let messageElement = document.getElementById("calendar-ics-file-dialog-message");
  messageElement.value = msgValue;

  acceptButton.label = btnLabel;
  acceptButton.disabled = false;
}

/**
 * These functions are called via `putItemsIntoCal` in import-export.js so
 * they need to be defined in global scope but they don't need to do anything
 * in this case.
 */
function startBatchTransaction() {}
function endBatchTransaction() {}
