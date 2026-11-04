/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function test_defaultAccountName() {
  const url = "chrome://messenger-newsblog/content/feedAccountWizard.xhtml";
  const opened = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win => win.document.documentURI == url
  );
  window.openDialog(url, "", "chrome,dialog=no");
  const wizardWindow = await opened;
  registerCleanupFunction(async () => {
    if (!wizardWindow.closed) {
      await BrowserTestUtils.closeWindow(wizardWindow);
    }
  });

  const doc = wizardWindow.document;
  const nameInput = doc.getElementById("prettyName");
  const wizard = doc.querySelector("wizard");
  await TestUtils.waitForCondition(
    () => !nameInput.disabled,
    "The account name input should be ready for editing"
  );
  await doc.l10n.ready;

  const [defaultName, title] = await doc.l10n.formatValues([
    "account-settings-rss-default-account-name",
    "account-settings-rss-wizard-title",
  ]);
  Assert.equal(
    nameInput.value,
    defaultName,
    "The account name input should display the localized default name"
  );
  Assert.equal(
    doc.l10n.getAttributes(doc.querySelector("title")).id,
    "account-settings-rss-wizard-title",
    "The wizard title should use its Fluent message"
  );
  Assert.equal(doc.title, title, "The wizard title should be localized");
  Assert.ok(wizard.canAdvance, "The default name should allow continuing");

  await SimpleTest.promiseFocus(wizardWindow);
  nameInput.focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, wizardWindow);
  EventUtils.synthesizeKey("KEY_Backspace", {}, wizardWindow);
  Assert.ok(!wizard.canAdvance, "An empty name should prevent continuing");

  EventUtils.sendString("Custom Feeds", wizardWindow);
  Assert.ok(wizard.canAdvance, "An edited name should allow continuing");
  Assert.equal(
    wizardWindow.FeedAccountWizard.accountName,
    "Custom Feeds",
    "The wizard should use the edited account name"
  );
});
