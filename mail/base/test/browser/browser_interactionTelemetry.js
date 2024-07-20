/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const testFolder = rootFolder
    .createLocalSubfolder("interactionTelemetry")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessage(generator.makeMessage({}).toMessageString());

  about3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });
  about3Pane.threadTree.selectedIndex = 0;

  Services.fog.testResetFOG();

  registerCleanupFunction(async () => {
    // Prevent the test timing out waiting for focus.
    document.getElementById("button-appmenu").focus();
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function () {
  await SimpleTest.promiseFocus(window);

  // Open the calendar tab by clicking on the spaces toolbar button.

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("calendarButton"),
    {},
    window
  );

  // Click the button for creating a new calendar.

  const calendarWindowPromise = BrowserTestUtils.promiseAlertDialog(
    "cancel",
    "chrome://calendar/content/calendar-creation.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(
    document.querySelector("#newCalendarSidebarButton"),
    {},
    window
  );
  await calendarWindowPromise;
  await SimpleTest.promiseFocus(window);

  // Close the calendar tab.

  EventUtils.synthesizeMouseAtCenter(
    document.querySelector("#tabmail-tabs tab:nth-child(2) .tab-close-button"),
    {},
    window
  );

  // Install an add-on with action buttons.

  const extension1 = ExtensionTestUtils.loadExtension({
    manifest: {
      applications: {
        gecko: {
          id: "interaction1@mochi.test",
        },
      },
      browser_action: {},
      compose_action: {},
      message_display_action: {},
    },
  });
  await extension1.startup();

  // Click the action buttons.

  await clickExtensionButton(window, "ext-interaction1@mochi.test");
  await clickExtensionButton(
    tabmail.currentAboutMessage,
    "interaction1_mochi_test-messageDisplayAction-toolbarbutton"
  );

  const composeWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const composeWindow = await composeWindowPromise;
  await clickExtensionButton(
    composeWindow,
    "interaction1_mochi_test-composeAction-toolbarbutton"
  );
  await BrowserTestUtils.closeWindow(composeWindow);
  await SimpleTest.promiseFocus(window);

  // Check all of the things we clicked on have been recorded.
  let events = await Glean.mail.uiInteraction.testGetValue();
  let calendarEvents = events.filter(e => e.extra.source == "calendar");
  let composeEvents = events.filter(e => e.extra.source == "message-compose");
  let displayEvents = events.filter(e => e.extra.source == "message-display");
  let toolboxEvents = events.filter(e => e.extra.source == "toolbox");

  Assert.equal(
    toolboxEvents.filter(e => e.extra.id == "calendarButton")?.length,
    1,
    "should have recorded spaces toolbar calendar button"
  );
  Assert.equal(
    calendarEvents.filter(e => e.extra.id == "newCalendarSidebarButton")
      ?.length,
    1,
    "should have recorded newCalendarSidebarButton"
  );
  Assert.equal(
    toolboxEvents.filter(e => e.extra.id == "tab-close-button")?.length,
    1,
    "should have recorded tab-close-button"
  );

  // Check add-on buttons have the identifiers replaced with a generic `addonX`.
  let addonKeys = toolboxEvents.filter(k => k.extra.id.startsWith("addon"));
  Assert.equal(addonKeys.length, 1, "first add-on should have been recorded");
  info(`first addon key is ${addonKeys[0].extra.id}`);
  Assert.equal(
    addonKeys.length,
    1,
    "first add-on browser action button should be recoreded"
  );
  Assert.equal(
    displayEvents[0].extra.id,
    addonKeys[0].extra.id,
    "first add-on display action button should use the same add-on key"
  );
  Assert.equal(
    composeEvents[0].extra.id,
    addonKeys[0].extra.id,
    "first add-on compose action button should use the same add-on key"
  );

  // Install a second add-on with action buttons.

  const extension2 = ExtensionTestUtils.loadExtension({
    manifest: {
      applications: {
        gecko: {
          id: "interaction2@mochi.test",
        },
      },
      browser_action: {},
      compose_action: {},
      message_display_action: {},
    },
  });
  await extension2.startup();

  // Click one of the action buttons.

  await clickExtensionButton(window, "ext-interaction2@mochi.test");

  // Check the second add-on has a second generic identifier and that only the
  // action button we clicked on has been recorded for it.

  events = await Glean.mail.uiInteraction.testGetValue();
  calendarEvents = events.filter(e => e.extra.source == "calendar");
  composeEvents = events.filter(e => e.extra.source == "message-compose");
  displayEvents = events.filter(e => e.extra.source == "message-display");
  toolboxEvents = events.filter(e => e.extra.source == "toolbox");

  addonKeys = toolboxEvents.filter(k => k.extra.id.startsWith("addon"));
  Assert.equal(addonKeys.length, 2, "second add-on should have been recorded");
  addonKeys.sort();
  info(`second addon key is ${addonKeys[1].extra.id}`);
  Assert.ok(
    toolboxEvents.find(e => e.extra.id == addonKeys[0].extra.id),
    "first add-on browser action button should be unchanged"
  );
  Assert.ok(
    displayEvents.find(e => e.extra.id == addonKeys[0].extra.id),
    "first add-on display action button should be unchanged"
  );
  Assert.ok(
    composeEvents.find(e => e.extra.id == addonKeys[0].extra.id),
    "first add-on compose action button should be unchanged"
  );
  Assert.ok(
    toolboxEvents.find(e => e.extra.id == addonKeys[1].extra.id),
    "second add-on browser action button should be recorded"
  );
  Assert.ok(
    !displayEvents.find(e => e.extra.id == addonKeys[1].extra.id),
    "second add-on display action button should have no record"
  );
  Assert.ok(
    !composeEvents.find(e => e.extra.id == addonKeys[1].extra.id),
    "second add-on compose action button should have no record"
  );

  // Click again on one of the first add-on's buttons. Check that the right
  // count is incremented.

  await clickExtensionButton(window, "ext-interaction1@mochi.test");

  events = await Glean.mail.uiInteraction.testGetValue();
  calendarEvents = events.filter(e => e.extra.source == "calendar");
  composeEvents = events.filter(e => e.extra.source == "message-compose");
  displayEvents = events.filter(e => e.extra.source == "message-display");
  toolboxEvents = events.filter(e => e.extra.source == "toolbox");

  addonKeys = toolboxEvents.filter(k => k.extra.id.startsWith("addon"));
  const uniqueAddOns = new Set(addonKeys.map(a => a.extra.id));
  Assert.equal(uniqueAddOns.size, 2, "should still be two add-ons recorded");
  addonKeys.sort();
  Assert.equal(
    toolboxEvents.filter(e => e.extra.id == addonKeys[0].extra.id)?.length,
    2,
    "first add-on browser action button should be recorded twice"
  );
  Assert.equal(
    toolboxEvents.filter(e => e.extra.id == addonKeys[1].extra.id)?.length,
    1,
    "second add-on browser action button should be recorded once"
  );

  await extension1.unload();
  await extension2.unload();
});
