/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
let composeWindow;

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

  const composeWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  composeWindow = await composeWindowPromise;

  Services.telemetry.clearScalars();

  registerCleanupFunction(async () => {
    await BrowserTestUtils.closeWindow(composeWindow);
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
  await clickExtensionButton(
    composeWindow,
    "interaction1_mochi_test-composeAction-toolbarbutton"
  );
  await SimpleTest.promiseFocus(window);

  // Check all of the things we clicked on have been recorded.

  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  const calendarScalars = scalars["tb.ui.interaction.calendar"];
  let composeScalars = scalars["tb.ui.interaction.message_compose"];
  let displayScalars = scalars["tb.ui.interaction.message_display"];
  let toolboxScalars = scalars["tb.ui.interaction.toolbox"];

  Assert.equal(
    toolboxScalars.calendarButton,
    1,
    "spaces toolbar calendar button"
  );
  Assert.equal(
    calendarScalars.newCalendarSidebarButton,
    1,
    "new calendar button"
  );
  Assert.equal(toolboxScalars["tab-close-button"], 1, "tab close button");

  // Check add-on buttons have the identifiers replaced with a generic `addonX`.

  let addonKeys = Object.keys(toolboxScalars).filter(k =>
    k.startsWith("addon")
  );
  Assert.equal(addonKeys.length, 1, "first add-on should have been recorded");
  info(`first addon key is ${addonKeys[0]}`);
  Assert.equal(
    toolboxScalars[addonKeys[0]],
    1,
    "first add-on browser action button"
  );
  Assert.equal(
    displayScalars[addonKeys[0]],
    1,
    "first add-on display action button uses the same add-on key"
  );
  Assert.equal(
    composeScalars[addonKeys[0]],
    1,
    "first add-on compose action button uses the same add-on key"
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

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  composeScalars = scalars["tb.ui.interaction.message_compose"];
  displayScalars = scalars["tb.ui.interaction.message_display"];
  toolboxScalars = scalars["tb.ui.interaction.toolbox"];

  addonKeys = Object.keys(toolboxScalars).filter(k => k.startsWith("addon"));
  Assert.equal(addonKeys.length, 2, "second add-on should have been recorded");
  addonKeys.sort();
  info(`second addon key is ${addonKeys[1]}`);
  Assert.equal(
    toolboxScalars[addonKeys[0]],
    1,
    "first add-on browser action button should be unchanged"
  );
  Assert.equal(
    displayScalars[addonKeys[0]],
    1,
    "first add-on display action button should be unchanged"
  );
  Assert.equal(
    composeScalars[addonKeys[0]],
    1,
    "first add-on compose action button should be unchanged"
  );
  Assert.equal(
    toolboxScalars[addonKeys[1]],
    1,
    "second add-on browser action button"
  );
  Assert.equal(
    displayScalars[addonKeys[1]],
    undefined,
    "second add-on display action button should have no record"
  );
  Assert.equal(
    composeScalars[addonKeys[1]],
    undefined,
    "second add-on compose action button should have no record"
  );

  // Click again on one of the first add-on's buttons. Check that the right
  // count is incremented.

  await clickExtensionButton(window, "ext-interaction1@mochi.test");

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  toolboxScalars = scalars["tb.ui.interaction.toolbox"];

  addonKeys = Object.keys(toolboxScalars).filter(k => k.startsWith("addon"));
  Assert.equal(addonKeys.length, 2);
  addonKeys.sort();
  Assert.equal(
    toolboxScalars[addonKeys[0]],
    2,
    "first add-on browser action button"
  );
  Assert.equal(
    toolboxScalars[addonKeys[1]],
    1,
    "second add-on browser action button"
  );

  await extension1.unload();
  await extension2.unload();
});
