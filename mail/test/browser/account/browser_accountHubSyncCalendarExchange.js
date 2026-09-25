/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { FindConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FindConfig.sys.mjs"
);
const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

const PASSWORD = "hunter2";
const USER = "test@graph.test";
// Encoding matches what FetchHTTP.sys.mjs uses.
const BASIC_AUTH = btoa(
  MailStringUtils.stringToByteString(`${USER}:${PASSWORD}`)
);

const emailUser = {
  name: "John Doe",
  email: USER,
  password: PASSWORD,
};

let parallelAutoDiscoveryStub;

add_setup(async () => {
  parallelAutoDiscoveryStub = sinon.stub(FindConfig, "parallelAutoDiscovery");
  registerCleanupFunction(() => {
    parallelAutoDiscoveryStub.restore();
  });
  const config = new AccountConfig();
  config.source = AccountConfig.kSourceXml;
  config.incoming.type = "graph";
  config.incoming.username = "test@graph.test";
  config.incoming.hostname = "graph.test";
  config.incoming.port = 80;
  config.incoming.socketType = 0;
  config.incoming.auth = 3;
  // eslint-disable-next-line sdl/no-insecure-url
  config.incoming.exchangeURL = "http://graph.test";
  parallelAutoDiscoveryStub.returns({
    next() {
      return Promise.resolve({ value: config, done: true });
    },
  });

  const graphServer = await ServerTestUtils.createServer({
    type: "graph",
    options: {
      username: USER,
      password: PASSWORD,
    },
    hostname: "graph.test",
    port: 80,
  });

  registerCleanupFunction(async () => {
    graphServer.stop();
    await Services.logins.removeAllLoginsAsync();
  });
});

add_task(async function test_graph_calendar_autodiscover() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["mailnews.auto_config_url", ""],
      ["calendar.graph.enabled", true],
    ],
  });
  const dialog = await subtest_open_account_hub_dialog();
  const emailTemplate = dialog.querySelector("email-auto-form");
  const footerForward = dialog.querySelector("#emailFooter #forward");

  await fillUserInformation(emailTemplate, {
    ...emailUser,
    email: "test@graph.test",
  });

  // Click continue and wait for config found template to be in view.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const configFoundTemplate = dialog.querySelector("email-config-found");
  info("Waiting for config found subview...");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", configFoundTemplate);

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  info("Expecting password entry");
  const passwordStep = dialog.querySelector("email-password-form");

  await BrowserTestUtils.waitForAttributeRemoval("hidden", passwordStep);
  info("Entering password");
  const passwordInput = passwordStep.querySelector("#password");

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(passwordInput),
    "The password form input should be visible."
  );
  EventUtils.synthesizeMouseAtCenter(passwordInput, {});

  const inputEvent = BrowserTestUtils.waitForEvent(
    passwordInput,
    "input",
    true,
    event => event.target.value === PASSWORD
  );
  EventUtils.sendString(PASSWORD);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const graphAccount = await new Promise(resolve => {
    const listener = {
      onServerLoaded() {
        const matchingAccount = MailServices.accounts.accounts.find(
          account => account.identities[0]?.email === emailUser.email
        );
        if (matchingAccount) {
          MailServices.accounts.removeIncomingServerListener(listener);
          resolve(matchingAccount);
        }
      },
      onServerUnloaded() {},
      onServerChanged() {},
    };
    MailServices.accounts.addIncomingServerListener(listener);
    listener.onServerLoaded();
  });

  const syncAccountsStep = dialog.querySelector("email-sync-accounts-form");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", syncAccountsStep);

  const calendarsContainer =
    syncAccountsStep.querySelectorAll("#calendars label");
  Assert.equal(calendarsContainer.length, 1, "There should be one calendar.");
  Assert.equal(
    syncAccountsStep.querySelectorAll("#calendars input:checked").length,
    1,
    "There should 1 checked calendar."
  );
  Assert.equal(
    calendarsContainer[0].textContent,
    "New Calendar",
    "The first calendar found should have the name - New Calendar"
  );

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  const successStep = dialog.querySelector("email-added-success");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", successStep);

  const calendars = cal.manager.getCalendars();
  Assert.equal(
    calendars.length,
    2,
    "Should have created one calendar in addition to home calendar."
  );
  Assert.equal(
    calendars[1].name,
    "New Calendar",
    "Calendar should be called New Calendar"
  );
  Assert.equal(
    calendars[1].type,
    "graph",
    "Calendar should be a graph calendar."
  );

  cal.manager.removeCalendar(calendars[1]);

  MailServices.accounts.removeAccount(graphAccount);
  MailServices.outgoingServer.deleteServer(
    MailServices.outgoingServer.servers.find(s => s.key != "smtp1")
  );
  await Services.logins.removeAllLoginsAsync();

  await subtest_close_account_hub_dialog(dialog, successStep);
  await SpecialPowers.popPrefEnv();
});
