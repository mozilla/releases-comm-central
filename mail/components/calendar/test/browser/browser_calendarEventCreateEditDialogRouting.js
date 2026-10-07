/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals createCalendar, createEvent, createEventWithDialog, createTodoWithDialog, modifyEventWithDialog, CalendarTestUtils */

"use strict";

const { startAxeMutationObserverInWindow } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);
const { CalTodo } = ChromeUtils.importESModule(
  "resource:///modules/CalTodo.sys.mjs"
);

const CREATE_EDIT_DIALOG_PREF = "calendar.event.createEditDialog.enabled";
const tabmail = document.getElementById("tabmail");
let calendar;
let calendarEvent;
let recurringEvent;
let calendarTask;

add_setup(async function () {
  await CalendarTestUtils.openCalendarTab(window);

  calendar = createCalendar();
  calendarEvent = await createEvent({
    calendar,
    name: "Create/Edit Route Event",
  });
  recurringEvent = await createEvent({
    calendar,
    name: "Create/Edit Route Recurring Event",
    repeats: true,
  });
  calendarTask = new CalTodo();
  calendarTask.title = "Create/Edit Route Task";
  calendarTask = await calendar.addItem(calendarTask);

  const axeWatcher = await startAxeMutationObserverInWindow(window, {
    container: document.querySelector(".calendar-dialog-root"),
    message: "The routed create/edit dialog stayed axe-clean",
  });

  registerCleanupFunction(async () => {
    await axeWatcher.finish();
    const dialog = getCreateEditDialog();
    if (dialog?.open) {
      dialog.close();
    }
    CalendarTestUtils.removeCalendar(calendar);
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

function getCreateEditDialog() {
  return document.getElementById("calendarEventCreateEditDialog");
}

function assertNewEventRoute(dialog, source) {
  Assert.ok(dialog.open, `${source} opens the create/edit dialog`);
  Assert.equal(
    dialog.getAttribute("calendar-id"),
    null,
    `${source} has no calendar ID`
  );
  Assert.equal(
    dialog.getAttribute("event-id"),
    null,
    `${source} has no event ID`
  );
  Assert.equal(
    dialog.getAttribute("recurrence-id"),
    null,
    `${source} has no recurrence ID`
  );
  Assert.ok(
    !("calendarEvent" in dialog),
    `${source} does not give the dialog a raw Calendar event`
  );
}

function assertEditEventRoute(dialog, event, source) {
  Assert.ok(dialog.open, `${source} opens the create/edit dialog`);
  Assert.equal(
    dialog.getAttribute("calendar-id"),
    calendar.id,
    `${source} sets the calendar ID`
  );
  Assert.equal(
    dialog.getAttribute("event-id"),
    event.id,
    `${source} sets the event ID`
  );
}

function waitForCreateEditDialogOpen() {
  const dialogRoot = document.querySelector(".calendar-dialog-root");
  return BrowserTestUtils.waitForMutationCondition(
    dialogRoot,
    {
      attributes: true,
      attributeFilter: ["open"],
      childList: true,
      subtree: true,
    },
    () => getCreateEditDialog()?.open,
    "Waiting for the create/edit dialog to open"
  ).then(() => {
    const dialog = getCreateEditDialog();
    Assert.ok(BrowserTestUtils.isVisible(dialog), "The dialog is visible");
    Assert.ok(dialog.container, "The dialog has a positioning container");
    Assert.equal(
      dialog.margin,
      12,
      "The dialog has a finite positioning margin"
    );
    Assert.ok(dialog.style.left, "The dialog has a horizontal position");
    Assert.ok(dialog.style.top, "The dialog has a vertical position");
    Assert.ok(dialog.style.maxHeight, "The dialog has a height limit");
    return dialog;
  });
}

async function closeCreateEditDialog(dialog) {
  if (!dialog.open) {
    return;
  }
  const closed = BrowserTestUtils.waitForMutationCondition(
    dialog,
    {
      attributes: true,
      attributeFilter: ["open"],
    },
    () => !dialog.open,
    "Waiting for the create/edit dialog to close"
  );
  dialog.close();
  await closed;
}

async function closeLegacyEventDialog(dialogWindow) {
  const closed = BrowserTestUtils.domWindowClosed(dialogWindow);
  dialogWindow.document.querySelector("dialog").getButton("cancel").click();
  await closed;
}

add_task(async function test_prefEnabledRoutesEventsByIdentity() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CREATE_EDIT_DIALOG_PREF, true],
      ["calendar.item.editInTab", false],
    ],
  });

  let dialogOpen = waitForCreateEditDialogOpen();
  createEventWithDialog(calendar, null, null);
  let dialog = await dialogOpen;

  assertNewEventRoute(dialog, "New Event");
  await closeCreateEditDialog(dialog);

  dialogOpen = waitForCreateEditDialogOpen();
  modifyEventWithDialog(calendarEvent, false);
  dialog = await dialogOpen;

  assertEditEventRoute(dialog, calendarEvent, "Edit");
  Assert.equal(
    dialog.getAttribute("recurrence-id"),
    null,
    "Editing a non-recurring event has no recurrence ID"
  );
  await closeCreateEditDialog(dialog);

  const occurrence = recurringEvent.recurrenceInfo.getNextOccurrence(
    recurringEvent.startDate
  );
  Assert.ok(occurrence, "The recurring event has an occurrence");

  dialogOpen = waitForCreateEditDialogOpen();
  modifyEventWithDialog(occurrence, false);
  dialog = await dialogOpen;

  assertEditEventRoute(dialog, recurringEvent, "Occurrence edit");
  Assert.equal(
    dialog.getAttribute("recurrence-id"),
    String(occurrence.recurrenceId.nativeTime),
    "Occurrence edit sets the exact recurrence ID"
  );
  await closeCreateEditDialog(dialog);
});

add_task(async function test_newEventControlsRouteToDialog() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CREATE_EDIT_DIALOG_PREF, true],
      ["calendar.item.editInTab", false],
    ],
  });

  const controls = [
    ["calendar-new-event-menuitem", "File > New Event"],
    ["calNewEvent2", "Events and Tasks > New Event"],
    ["appmenu_calendar-new-event-menu-item", "App menu > New Event"],
    [
      "calendar-item-context-menu-newevent-menutitem",
      "Event context menu > New Event",
    ],
    ["calendar-view-context-menu-newevent", "View context menu > New Event"],
    ["todaypane-new-event-button", "Today Pane > New Event"],
  ];

  for (const [id, source] of controls) {
    const control = document.getElementById(id);
    Assert.ok(control, `${source} control exists`);
    const dialogOpen = waitForCreateEditDialogOpen();
    control.doCommand();
    const dialog = await dialogOpen;
    assertNewEventRoute(dialog, source);
    await closeCreateEditDialog(dialog);
  }

  const primaryButton = document.getElementById("sidePanelNewEvent");
  Assert.ok(primaryButton, "Calendar primary New Event button exists");
  const dialogOpen = waitForCreateEditDialogOpen();
  primaryButton.click();
  const dialog = await dialogOpen;
  assertNewEventRoute(dialog, "Calendar primary New Event button");
  await closeCreateEditDialog(dialog);

  const key = document.getElementById("calendar-new-event-key");
  Assert.equal(
    key.getAttribute("command"),
    "calendar_new_event_command",
    "New Event key uses the new event command"
  );

  const newEventToolbarButton =
    document.getElementById("newEventTemplate").content.firstElementChild;
  Assert.equal(
    newEventToolbarButton.getAttribute("command"),
    "calendar_new_event_command",
    "New Event toolbar button uses the new event command"
  );
});

add_task(async function test_templateEventRouteHasNoIdentity() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CREATE_EDIT_DIALOG_PREF, true],
      ["calendar.item.editInTab", false],
    ],
  });

  const templateEvent = calendarEvent.clone();
  const dialogOpen = waitForCreateEditDialogOpen();
  createEventWithDialog(null, null, null, null, templateEvent);
  const dialog = await dialogOpen;
  assertNewEventRoute(dialog, "Create Event from a template");
  await closeCreateEditDialog(dialog);
});

add_task(async function test_viewCreateAndEditRoutes() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CREATE_EDIT_DIALOG_PREF, true],
      ["calendar.item.editInTab", false],
      ["calendar.events.defaultActionEdit", true],
    ],
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  window.goToDate(calendarEvent.startDate);
  await CalendarTestUtils.ensureViewLoaded(window);

  const hourBox = CalendarTestUtils.dayView.getHourBoxAt(window, 9);
  hourBox.scrollIntoView({ block: "center" });
  let dialogOpen = waitForCreateEditDialogOpen();
  EventUtils.synthesizeMouseAtCenter(hourBox, { clickCount: 2 }, window);
  let dialog = await dialogOpen;
  assertNewEventRoute(dialog, "Double-click on an empty time slot");
  await closeCreateEditDialog(dialog);

  const eventBox = await TestUtils.waitForCondition(
    () =>
      [...CalendarTestUtils.dayView.getEventBoxes(window)].find(
        box => box.occurrence.id === calendarEvent.id
      ),
    "Waiting for the event to edit"
  );
  eventBox.scrollIntoView({ block: "center" });
  dialogOpen = waitForCreateEditDialogOpen();
  EventUtils.synthesizeMouseAtCenter(eventBox, { clickCount: 2 }, window);
  dialog = await dialogOpen;
  assertEditEventRoute(dialog, calendarEvent, "Double-click on an event");
  await closeCreateEditDialog(dialog);
});

add_task(async function test_editEventCommandsRouteToDialog() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CREATE_EDIT_DIALOG_PREF, true],
      ["calendar.item.editInTab", false],
    ],
  });

  await CalendarTestUtils.openCalendarTab(window);
  await CalendarTestUtils.ensureViewLoaded(window);
  window.currentView().focus();
  window.currentView().setSelectedItems([calendarEvent]);
  await TestUtils.waitForCondition(
    () =>
      !document
        .getElementById("calendar_modify_event_command")
        .hasAttribute("disabled"),
    "Waiting for the Edit Event command to be enabled"
  );

  const contextEdit = document.getElementById(
    "calendar-item-context-menu-modify-menuitem"
  );
  Assert.equal(
    contextEdit.getAttribute("command"),
    "calendar_modify_event_command",
    "Event context menu Edit uses the Edit Event command"
  );
  const contextMenu = document.getElementById("calendar-item-context-menu");
  const menuShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  contextMenu.openPopup(window.currentView(), "after_start");
  await menuShown;
  Assert.ok(!contextEdit.disabled, "The context menu Edit item is enabled");
  const menuHidden = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  let dialogOpen = waitForCreateEditDialogOpen();
  EventUtils.synthesizeMouseAtCenter(contextEdit, {}, window);
  await menuHidden;
  let dialog = await dialogOpen;
  assertEditEventRoute(dialog, calendarEvent, "Event context menu Edit");
  await closeCreateEditDialog(dialog);

  const editEventToolbarButton =
    document.getElementById("editEventTemplate").content.firstElementChild;
  Assert.equal(
    editEventToolbarButton.getAttribute("command"),
    "calendar_modify_focused_item_command",
    "Edit Event toolbar button uses the focused item command"
  );
  dialogOpen = waitForCreateEditDialogOpen();
  document.getElementById("calendar_modify_focused_item_command").doCommand();
  dialog = await dialogOpen;
  assertEditEventRoute(dialog, calendarEvent, "Edit Event toolbar command");
  await closeCreateEditDialog(dialog);
});

add_task(async function test_prefDisabledUsesLegacyEventDialog() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CREATE_EDIT_DIALOG_PREF, false],
      ["calendar.item.editInTab", false],
    ],
  });

  let legacyDialog = CalendarTestUtils.waitForEventDialog("edit");
  createEventWithDialog(calendar, null, null);
  await closeLegacyEventDialog(await legacyDialog);

  legacyDialog = CalendarTestUtils.waitForEventDialog("edit");
  modifyEventWithDialog(calendarEvent, false);
  await closeLegacyEventDialog(await legacyDialog);

  Assert.ok(
    !getCreateEditDialog()?.open,
    "The create/edit dialog stays closed when its pref is disabled"
  );
});

add_task(async function test_tabEditingAndTodosKeepLegacyRoutes() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CREATE_EDIT_DIALOG_PREF, true],
      ["calendar.item.editInTab", true],
    ],
  });

  const tabOpen = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  modifyEventWithDialog(calendarEvent, false);
  const {
    detail: { tabInfo },
  } = await tabOpen;

  Assert.equal(
    tabInfo.mode.name,
    "calendarEvent",
    "Edit in Tab opens the existing event tab"
  );
  Assert.ok(
    !getCreateEditDialog()?.open,
    "Edit in Tab does not open the create/edit dialog"
  );
  tabmail.closeTab(tabInfo);

  await SpecialPowers.pushPrefEnv({
    set: [["calendar.item.editInTab", false]],
  });
  const legacyDialog = CalendarTestUtils.waitForEventDialog("edit");
  createTodoWithDialog(calendar, null, null);
  await closeLegacyEventDialog(await legacyDialog);

  const taskEditDialog = CalendarTestUtils.waitForEventDialog("edit");
  modifyEventWithDialog(calendarTask, false);
  await closeLegacyEventDialog(await taskEditDialog);

  Assert.ok(
    !getCreateEditDialog()?.open,
    "Tasks do not open the event create/edit dialog"
  );
});
