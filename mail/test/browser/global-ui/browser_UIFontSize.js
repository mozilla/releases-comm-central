/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the global font size handled via UIFontSize.sys.mjs is properly
 * working.
 */

const { UIFontSize } = ChromeUtils.importESModule(
  "resource:///modules/UIFontSize.sys.mjs"
);

const {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  close_popup,
  create_folder,
  create_message,
  get_about_3pane,
  get_about_message,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

const about3Pane = get_about_3pane();
const aboutMessage = get_about_message();

var folder;

async function waitForL10n() {
  if (document.hasPendingL10nMutations) {
    await BrowserTestUtils.waitForEvent(document, "L10nMutationsFinished");
  }
}

add_setup(async function () {
  // Set a value lower than the minimum allowed font size.
  Services.prefs.setIntPref("mail.uifontsize", 7);

  folder = await create_folder("MessageWindowA");

  const message = create_message({
    subject: "Simple subject",
    body: { body: "Body for font size test." },
  });

  await add_message_to_folder([folder], message);

  registerCleanupFunction(async () => {
    folder.deleteSelf(null);
    Services.prefs.clearUserPref("mail.uifontsize");
  });
});

add_task(async function testInitialization() {
  Assert.notEqual(
    UIFontSize.osValue,
    0,
    "Attaching to the first window should initialize the OS value"
  );
  Assert.equal(UIFontSize.prefValue, 7, "Pref value should be attached");
  Assert.notEqual(
    UIFontSize.isEdited,
    UIFontSize.isDefault,
    "isEdited should get initialized"
  );
});

add_task(async function testAppMenuGlobalFontSizeInteraction() {
  await be_in_folder(folder);
  const curMessage = await select_click_row(-1);
  await assert_selected_and_displayed(window, curMessage);

  const appMenu = document.getElementById("appMenu-popup");
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("button-appmenu"),
    {},
    window
  );
  await BrowserTestUtils.waitForPopupEvent(appMenu, "shown");

  Assert.equal(
    appMenu.querySelector("#appMenu-fontSizeReset-button > label").value,
    `${UIFontSize.MIN_VALUE}px`,
    "The minimum value should be enforced"
  );
  Assert.ok(
    appMenu
      .querySelector("#appMenu-fontSizeReduce-button")
      .hasAttribute("disabled"),
    "The reduce button should be disabled"
  );

  let fontChangedPromise = BrowserTestUtils.waitForEvent(
    about3Pane,
    "uifontsizechange"
  );
  EventUtils.synthesizeMouseAtCenter(
    appMenu.querySelector("#appMenu-fontSizeEnlarge-button"),
    {}
  );
  await fontChangedPromise;
  await waitForL10n();
  Assert.ok(
    !appMenu
      .querySelector("#appMenu-fontSizeReduce-button")
      .hasAttribute("disabled"),
    "The reduce button should be enabled"
  );
  Assert.notEqual(
    UIFontSize.isEdited,
    UIFontSize.isDefault,
    "isEdited and isDefault should be opposites"
  );

  Assert.equal(
    appMenu.querySelector("#appMenu-fontSizeReset-button > label").value,
    about3Pane.window.document.documentElement.style.fontSize,
    "The custom font size value should be applied to the document"
  );

  Assert.equal(
    appMenu.querySelector("#appMenu-fontSizeReset-button > label").value,
    aboutMessage.window.document.documentElement.style.fontSize,
    "The custom font size value should be applied to the message body"
  );

  fontChangedPromise = BrowserTestUtils.waitForEvent(
    about3Pane,
    "uifontsizechange"
  );
  EventUtils.synthesizeMouseAtCenter(
    appMenu.querySelector("#appMenu-fontSizeReset-button"),
    {}
  );

  await fontChangedPromise;
  await waitForL10n();
  Assert.equal(
    appMenu.querySelector("#appMenu-fontSizeReset-button > label").value,
    `${UIFontSize.osValue}px`,
    "The value in the app menu should be reset to the correct default"
  );
  Assert.ok(!UIFontSize.isEdited, "isEdited should be false after resetting");
  Assert.ok(UIFontSize.isDefault, "isDefault should be true after resetting");
  Assert.equal(
    UIFontSize.prefValue,
    UIFontSize.DEFAULT,
    "Should reset pref to the default value"
  );

  await close_popup(window, appMenu);
});
