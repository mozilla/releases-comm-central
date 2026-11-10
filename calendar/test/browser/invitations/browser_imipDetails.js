/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { CalAttendee } = ChromeUtils.importESModule("resource:///modules/CalAttendee.sys.mjs");

const tabmail = document.getElementById("tabmail");
const EVENT_ID = "1e5fd4e6-bc52-439c-ac76-40da54f57c77@secure.example.com";
let calendar;
let folder;
let message;
let calendarEvent;

add_setup(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  const identity = MailServices.accounts.createIdentity();

  identity.email = "john.doe@example.com";
  account.addIdentity(identity);

  const rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("Details", null);
  folder = rootFolder.getChildNamed("Details");

  message = folder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .addMessage(
      (await IOUtils.readUTF8(getTestFilePath("data/message-non-invite.eml"))).replaceAll(
        /\r?\n/g,
        "\r\n"
      )
    );

  calendar = CalendarTestUtils.createCalendar("Details");

  registerCleanupFunction(() => {
    document.getElementById("calendarDialog")?.close();
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    CalendarTestUtils.removeCalendar(calendar);
    MailServices.accounts.removeAccount(account, true);
  });

  const win = await openImipMessage(
    new FileUtils.File(getTestFilePath("data/message-non-invite.eml"))
  );

  await clickAction(win, "imipAddButton");

  await TestUtils.waitForCondition(async () => {
    calendarEvent = await calendar.getItem(EVENT_ID);

    return !!calendarEvent;
  }, "Add should store the emailed event");

  await BrowserTestUtils.closeWindow(win);
});

/**
 * Opens the message in a pane, tab, or window and waits for Details.
 *
 * @param {"pane"|"tab"|"window"} context - Where to display the message.
 * @returns {Promise<{
 *   click: function(): boolean,
 *   close: function(): (void|Promise<Window[]>)
 * }>} Resolves when the Details button is available. `click()` clicks Details
 *   without waiting for the resulting tab or dialog. `close()` clears the pane
 *   selection or closes the message tab synchronously. For a message window,
 *   `close()` returns a promise that resolves after the window closes.
 */
async function openDetailsMessage(context) {
  let aboutMessage;
  let close;

  if (context == "window") {
    const win = await openImipMessage(
      new FileUtils.File(getTestFilePath("data/message-non-invite.eml"))
    );

    aboutMessage = win.document.getElementById("messageBrowser").contentWindow;
    close = () => BrowserTestUtils.closeWindow(win);
  } else if (context == "tab") {
    const loaded = BrowserTestUtils.waitForEvent(tabmail, "aboutMessageLoaded");
    const tab = tabmail.openTab("mailMessageTab", {
      messageURI: folder.getUriForMsg(message),
    });

    aboutMessage = (await loaded).target;
    close = () => tabmail.closeTab(tab);
  } else {
    tabmail.switchToTab(0);
    const about3Pane = tabmail.currentAbout3Pane;

    about3Pane.displayFolder(folder.URI);
    aboutMessage = about3Pane.messageBrowser.contentWindow;
    about3Pane.threadTree.selectedIndex = 0;
    close = () => {
      about3Pane.threadTree.selectedIndex = -1;
    };
  }

  const button = aboutMessage.document.getElementById("imipDetailsButton");

  await TestUtils.waitForCondition(
    () => !aboutMessage.document.getElementById("imip-bar").collapsed && !button.hidden,
    `Details should be available in the message ${context}`
  );

  return {
    click: () => EventUtils.synthesizeMouseAtCenter(button, {}, aboutMessage),
    close,
  };
}

add_task(async function test_detailsOpensEditorTab() {
  for (const isNewReadDialogEnabled of [false, true]) {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["calendar.item.editInTab", true],
        ["calendar.dialogs.new.enabled", isNewReadDialogEnabled],
        ["calendar.event.createEditDialog.enabled", true],
      ],
    });

    for (const context of ["pane", "tab", "window"]) {
      const source = await openDetailsMessage(context);
      const previousCount = tabmail.tabModes.calendarEvent.tabs.length;

      source.click();

      await TestUtils.waitForCondition(
        () => tabmail.tabModes.calendarEvent.tabs.length == previousCount + 1,
        `Details should open an editor tab from the message ${context}`
      );

      const editor = tabmail.tabModes.calendarEvent.tabs.at(-1);

      await TestUtils.waitForCondition(
        () => editor.iframe.contentWindow.calendarItem?.id == EVENT_ID,
        "The editor should load the emailed event"
      );

      Assert.equal(tabmail.currentTabInfo, editor, "The event tab should be selected");

      Assert.equal(
        editor.iframe.contentDocument.getElementById("item-title").value,
        calendarEvent.title,
        "The event title should be loaded in the editor"
      );

      Assert.ok(!document.getElementById("calendarDialog")?.open, "No read dialog should open");

      const closed = BrowserTestUtils.waitForEvent(editor.tabNode, "TabClose");

      tabmail.closeTab(editor);
      await closed;
      await source.close();
    }

    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_detailsUsesLegacyReadDialogWithoutTabEditing() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["calendar.item.editInTab", false],
      ["calendar.dialogs.new.enabled", false],
    ],
  });

  const source = await openDetailsMessage("window");
  const previousCount = tabmail.tabModes.calendarEvent.tabs.length;
  const opened = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    win => win.document.documentURI == "chrome://calendar/content/calendar-summary-dialog.xhtml"
  );

  source.click();
  const summary = await opened;

  Assert.equal(
    tabmail.tabModes.calendarEvent.tabs.length,
    previousCount,
    "No editor tab should open"
  );

  Assert.equal(
    summary.arguments[0].calendarEvent.id,
    EVENT_ID,
    "The summary should show the emailed event"
  );

  await BrowserTestUtils.closeWindow(summary);
  await source.close();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_detailsUsesNewReadDialogWithoutTabEditing() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["calendar.item.editInTab", false],
      ["calendar.dialogs.new.enabled", true],
    ],
  });

  const source = await openDetailsMessage("window");
  const previousCount = tabmail.tabModes.calendarEvent.tabs.length;
  const opened = TestUtils.waitForCondition(
    () => document.getElementById("calendarDialog")?.open,
    "The new read dialog should open"
  );

  source.click();
  await opened;

  Assert.equal(
    tabmail.tabModes.calendarEvent.tabs.length,
    previousCount,
    "No editor tab should open"
  );

  document.getElementById("calendarDialog").close();
  await source.close();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_detailsDoesNotEditReadOnlyEvent() {
  for (const isNewCreateEditDialogEnabled of [false, true]) {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["calendar.item.editInTab", true],
        ["calendar.event.createEditDialog.enabled", isNewCreateEditDialogEnabled],
      ],
    });

    const source = await openDetailsMessage("window");
    const readOnly = calendar.readOnly;

    // The message lookup skips read-only calendars. Details is now available,
    // so the test can make this calendar read-only.
    calendar.readOnly = true;

    const previousCount = tabmail.tabModes.calendarEvent.tabs.length;
    const opened = BrowserTestUtils.domWindowOpenedAndLoaded(
      undefined,
      win => win.document.documentURI == "chrome://calendar/content/calendar-summary-dialog.xhtml"
    );

    source.click();
    const summary = await opened;

    Assert.equal(
      tabmail.tabModes.calendarEvent.tabs.length,
      previousCount,
      "Read-only events should not open an editor tab"
    );

    Assert.equal(
      summary.arguments[0].inTab,
      false,
      "Read-only events should use the summary dialog"
    );

    await BrowserTestUtils.closeWindow(summary);
    await source.close();
    calendar.readOnly = readOnly;
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_detailsDoesNotEditInvitation() {
  for (const isNewCreateEditDialogEnabled of [false, true]) {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["calendar.item.editInTab", true],
        ["calendar.event.createEditDialog.enabled", isNewCreateEditDialogEnabled],
      ],
    });

    const organizerId = calendar.getProperty("organizerId");
    const originalAttendees = calendarEvent.getAttendees();

    calendar.setProperty("organizerId", "mailto:john.doe@example.com");

    const item = calendarEvent.clone();
    const attendee = new CalAttendee();

    attendee.id = "mailto:john.doe@example.com";
    attendee.participationStatus = "ACCEPTED";
    item.addAttendee(attendee);
    calendarEvent = await calendar.modifyItem(item, calendarEvent);

    Assert.ok(
      calendar.getSchedulingSupport().isInvitation(calendarEvent),
      "The event should be an invitation"
    );

    const source = await openDetailsMessage("window");
    const previousCount = tabmail.tabModes.calendarEvent.tabs.length;
    const opened = BrowserTestUtils.domWindowOpenedAndLoaded(
      undefined,
      win => win.document.documentURI == "chrome://calendar/content/calendar-summary-dialog.xhtml"
    );

    source.click();
    const summary = await opened;

    Assert.equal(
      tabmail.tabModes.calendarEvent.tabs.length,
      previousCount,
      "Invitations should not open an editor tab"
    );

    Assert.equal(summary.arguments[0].inTab, false, "Invitations should use the summary dialog");

    await BrowserTestUtils.closeWindow(summary);
    await source.close();

    const restoredItem = calendarEvent.clone();

    restoredItem.removeAllAttendees();

    for (const originalAttendee of originalAttendees) {
      restoredItem.addAttendee(originalAttendee);
    }

    calendarEvent = await calendar.modifyItem(restoredItem, calendarEvent);
    calendar.setProperty("organizerId", organizerId);
    await SpecialPowers.popPrefEnv();
  }
});
