/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { FindConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FindConfig.sys.mjs"
);
const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

let parallelAutoDiscoveryStub;

add_setup(() => {
  parallelAutoDiscoveryStub = sinon.stub(FindConfig, "parallelAutoDiscovery");
  registerCleanupFunction(() => {
    parallelAutoDiscoveryStub.restore();
  });
});

const CONFIG_FOUND_TESTS = [
  {
    name: "exchange",
    source: AccountConfig.kSourceExchange,
    messageId: "account-hub-config-success-exchange",
  },
  {
    name: "guess",
    source: AccountConfig.kSourceGuess,
    messageId: "account-hub-config-success-guess",
  },
  {
    name: "unknown source",
    source: null,
    messageId: "account-hub-config-success-unknown",
  },
  {
    name: "XML from disk",
    source: AccountConfig.kSourceXML,
    subSource: "xml-from-disk",
    messageId: "account-hub-config-success-disk",
  },
  {
    name: "XML from ISP (HTTPS)",
    source: AccountConfig.kSourceXML,
    subSource: "xml-from-isp-https",
    messageId: "account-hub-config-success-isp",
  },
  {
    name: "XML from ISP (HTTP)",
    source: AccountConfig.kSourceXML,
    subSource: "xml-from-isp-http",
    messageId: "account-hub-config-success-isp",
  },
  {
    name: "XML from DB",
    source: AccountConfig.kSourceXML,
    subSource: "xml-from-db",
    messageId: "account-hub-config-success",
  },
];

add_task(async function test_configFoundMessage() {
  for (const testDetails of CONFIG_FOUND_TESTS) {
    info(`Checking config found message for config from ${testDetails.name}`);
    const dialog = await subtest_find_config(
      testDetails.source,
      testDetails.subSource
    );
    await checkConfigFoundMessage(dialog, testDetails.messageId);
    await subtest_close_account_hub_dialog(
      dialog,
      dialog.querySelector("email-config-found")
    );
  }
});

/**
 * Open account hub and find a config of the given source.
 *
 * @param {string} source - Config source identifier string. Should be a value
 *   defined as "kSource*" on AccountConfig.
 * @param {*} [subSource] - Config source specifier for XML type.
 * @returns {HTMLElement} reference to the account hub dialog.
 */
async function subtest_find_config(source, subSource) {
  const dialog = await subtest_open_account_hub_dialog();
  const config = new AccountConfig();
  config.source = source;
  if (subSource) {
    config.subSource = subSource;
  }
  config.incoming.type = "imap";
  config.incoming.username = "john.doe@momo.invalid";
  config.incoming.hostname = "mail.momo.invalid";
  config.incoming.port = 99900;
  config.incoming.socketType = 3;
  config.outgoing.type = "smtp";
  config.outgoing.hostname = "mail.momo.invalid";
  config.outgoing.port = 465;
  config.outgoing.socketType = 3;
  parallelAutoDiscoveryStub.returns({
    next() {
      return Promise.resolve({ value: config, done: true });
    },
  });

  await subtest_fill_initial_config_fields(dialog);

  return dialog;
}

/**
 * Check that a config found message is being displayed.
 *
 * @param {HTMLDialogElement} dialog - Reference to the account hub dial
 * @param {string} foundStringId - The fluent ID of the message to expect.
 */
async function checkConfigFoundMessage(dialog, foundStringId) {
  const step = dialog.querySelector("email-config-found");
  const header = step.shadowRoot.querySelector("account-hub-header");
  const notificationTitle = header.shadowRoot.querySelector(
    "#emailFormNotificationTitle"
  );
  info(`Waiting for ${foundStringId} config found message...`);
  const notification = header.shadowRoot.querySelector(
    "#emailFormNotification"
  );
  await BrowserTestUtils.waitForMutationCondition(
    notification,
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isVisible(notificationTitle)
  );
  await TestUtils.waitForTick();
  Assert.ok(
    notification.classList.contains("success"),
    "Should be a success notification"
  );
  Assert.equal(
    document.l10n.getAttributes(
      notificationTitle.querySelector(".localized-title")
    ).id,
    foundStringId,
    "Should display correct message"
  );
}
