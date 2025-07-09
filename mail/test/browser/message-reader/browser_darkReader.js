/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that messages behave correctly when in dark mode.
 */

"use strict";

const { open_message_from_file, get_about_message } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

let aboutMessage, msgc, lightTheme, darkTheme;

add_setup(async function () {
  // Disable dark message mode before setting up anything else.
  Services.prefs.setBoolPref("mail.dark-reader.enabled", false);

  const file = new FileUtils.File(getTestFilePath("data/dark_mode_test.eml"));
  msgc = await open_message_from_file(file);
  aboutMessage = get_about_message(msgc);

  lightTheme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  darkTheme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );

  registerCleanupFunction(async () => {
    await BrowserTestUtils.closeWindow(msgc);
    Services.prefs.clearUserPref("mail.dark-reader.enabled");
    Services.prefs.clearUserPref("mail.dark-reader.show-toggle");
    lightTheme.disable();
    darkTheme.disable();
  });
});

async function toggle_theme(theme, enable) {
  await Promise.all([
    BrowserTestUtils.waitForEvent(window, "windowlwthemeupdate"),
    enable ? theme.enable() : theme.disable(),
  ]);
  await new Promise(resolve => requestAnimationFrame(resolve));
}

async function toggle_dark_reader(enable) {
  const msgLoaded = BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  Services.prefs.setBoolPref("mail.dark-reader.enabled", enable);
  await msgLoaded;
}

add_task(async function test_dark_light_reader_mode() {
  info("Enable light theme.");
  await toggle_theme(lightTheme, true);
  // Check that the default style is correct.
  await assert_light_style();

  info("Enable dark message mode.");
  await toggle_dark_reader(true);
  // Changing that pref shouldn't affect anything if we're still in light theme.
  await assert_light_style();

  info("Enable dark theme.");
  const msgLoaded = BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  await toggle_theme(darkTheme, true);
  await msgLoaded;
  // Check that we're adapting the style for dark theme.
  await assert_dark_style();

  info("Disable dark message mode.");
  await toggle_dark_reader(false);
  // Check that we don't keep any alteration after dark message mode is
  // disabled.
  await assert_light_style();
});

add_task(async function test_message_header_toggle() {
  info("Enable dark message mode.");
  let msgLoaded = BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  await toggle_dark_reader(true);
  await msgLoaded;

  info("Enable light theme.");
  msgLoaded = BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  await toggle_theme(lightTheme, true);
  await msgLoaded;

  const toggle = aboutMessage.document.getElementById("darkReaderToggle");

  Assert.ok(
    BrowserTestUtils.isHidden(toggle),
    "toggle button should be hidden"
  );

  info("Enable dark theme.");
  msgLoaded = BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  await toggle_theme(darkTheme, true);
  await msgLoaded;

  Assert.ok(
    BrowserTestUtils.isVisible(toggle),
    "toggle button should be visible"
  );

  info("Disable the toggle visibility");
  Services.prefs.setBoolPref("mail.dark-reader.show-toggle", false);
  await BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(toggle),
    "toggle button should be hidden"
  );

  info("Enable the toggle visibility");
  Services.prefs.setBoolPref("mail.dark-reader.show-toggle", true);

  await BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(toggle),
    "toggle button should be visible"
  );

  info("Disable the toggle visibility from the header customizer");
  const moreBtn = aboutMessage.document.getElementById("otherActionsButton");
  const popup = aboutMessage.document.getElementById("otherActionsPopup");
  Assert.equal(
    "closed",
    popup.state,
    "Popup state should be correct before synthesizing a mouse click"
  );
  EventUtils.synthesizeMouseAtCenter(moreBtn, {}, aboutMessage);
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");

  const panel = aboutMessage.document.getElementById(
    "messageHeaderCustomizationPanel"
  );
  Assert.equal(
    "closed",
    panel.state,
    "Panel state should be correct before synthesizing a mouse click"
  );
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("messageHeaderMoreMenuCustomize"),
    {},
    aboutMessage
  );
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  await BrowserTestUtils.waitForPopupEvent(panel, "shown");

  const darkToggleCustomizer = aboutMessage.document.getElementById(
    "headerShowDarkToggle"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(toggle),
    "Dark reader toggle should be visible before synthesizing mouse click"
  );
  EventUtils.synthesizeMouseAtCenter(darkToggleCustomizer, {}, aboutMessage);
  await BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(toggle),
    "toggle button should be hidden"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(toggle),
    "Dark reader toggle should be hidden before synthesizing mouse click"
  );
  EventUtils.synthesizeMouseAtCenter(darkToggleCustomizer, {}, aboutMessage);
  await BrowserTestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(toggle),
    "toggle button should be visible"
  );

  Assert.equal(
    "open",
    panel.state,
    "Panel should be open before synthesizing the ESC key"
  );
  EventUtils.synthesizeKey("KEY_Escape", {}, aboutMessage);
  await BrowserTestUtils.waitForPopupEvent(panel, "hidden");

  info("Synthesizing mouse click on dark reader toggle");
  msgLoaded = BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  EventUtils.synthesizeMouseAtCenter(toggle, {}, aboutMessage);
  await msgLoaded;
  info("Message loaded after switching reader mode");

  await assert_light_style();
});

add_task(async function test_message_scroll_position() {
  info("Enable dark message mode.");
  let msgLoaded = BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  await toggle_dark_reader(true);
  await msgLoaded;

  info("Scroll the message body.");
  aboutMessage
    .getMessagePaneBrowser()
    .contentDocument.documentElement.scrollTo({
      top: 143,
      behavior: "instant",
    });
  await BrowserTestUtils.waitForCondition(
    () =>
      aboutMessage.getMessagePaneBrowser().contentDocument.documentElement
        .scrollTop === 143,
    "The message should have been scrolled to the wanted position"
  );

  info("Synthesizing mouse click on dark reader toggle");
  msgLoaded = BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("darkReaderToggle"),
    {},
    aboutMessage
  );
  await msgLoaded;

  await BrowserTestUtils.waitForCondition(
    () =>
      aboutMessage.getMessagePaneBrowser().contentDocument.documentElement
        .scrollTop === 143,
    "The message should have been scrolled to its original position"
  );
  Assert.equal(
    aboutMessage.document.activeElement,
    aboutMessage.getMessagePaneBrowser(),
    "The focus should be on the message browser"
  );

  await assert_light_style();
});

async function assert_light_style() {
  await new Promise(resolve => aboutMessage.requestAnimationFrame(resolve));
  const msgDoc =
    aboutMessage.document.getElementById("messagepane").contentDocument;

  Assert.equal(
    msgDoc.body.getAttribute("bgcolor"),
    "#FFFFFF",
    "The body should have a white background"
  );
  Assert.equal(
    msgDoc.body.getAttribute("color"),
    "#000",
    "The body should have a black text color"
  );
  Assert.equal(
    msgDoc.querySelector("#div").style.getPropertyValue("background-color"),
    "red",
    "The first div should have a red background color"
  );
  Assert.equal(
    msgDoc
      .querySelector("#paragraph")
      .style.getPropertyValue("background-color"),
    "white",
    "The paragraph should have a white background color"
  );

  // Check embedded styles.
  const headStyle = aboutMessage.getComputedStyle(
    msgDoc.querySelector("#headStyle")
  );
  Assert.equal(
    headStyle.color,
    "rgb(0, 0, 0)",
    "The #headStyle should have a black color"
  );

  const headStyle2 = aboutMessage.getComputedStyle(
    msgDoc.querySelector("#headStyle2")
  );
  Assert.equal(
    headStyle2.color,
    "rgb(255, 255, 255)",
    "The #headStyle2 should have a white color"
  );
  Assert.equal(
    headStyle2.background,
    "rgb(74, 74, 0)",
    "The #headStyle2 should have a brown background"
  );

  const headStyle3 = aboutMessage.getComputedStyle(
    msgDoc.querySelector("#headStyle3")
  );
  Assert.equal(
    headStyle3.color,
    "rgb(0, 0, 0)",
    "The #headStyle3 should have a black color"
  );
  Assert.equal(
    headStyle3.backgroundColor,
    "rgb(173, 173, 173)",
    "The #headStyle3 should have a dark grey background-color"
  );

  Assert.equal(
    msgDoc.querySelector("#span").style.getPropertyValue("color"),
    "black",
    "The span should have a black text color"
  );

  const table = msgDoc.querySelector("#table");
  Assert.equal(
    table.getAttribute("bgcolor"),
    "yellow",
    "The table should have a yellow background color"
  );
  Assert.equal(
    table.getAttribute("color"),
    "#678367",
    "The table should have a #678367 text color"
  );

  const tableBlock = aboutMessage.getComputedStyle(
    msgDoc.querySelector(".table-block")
  );
  Assert.equal(
    tableBlock.color,
    "rgb(221, 222, 223)",
    "The .table-block should have a light grey color"
  );
  Assert.equal(
    tableBlock.backgroundColor,
    "rgb(255, 255, 255)",
    "The .table-block should have a white background-color"
  );

  Assert.equal(
    msgDoc.getElementsByTagName("text")[0].getAttribute("fill"),
    "black",
    "The text SVG should have a black fill"
  );
}

async function assert_dark_style() {
  await new Promise(resolve => aboutMessage.requestAnimationFrame(resolve));
  const msgDoc =
    aboutMessage.document.getElementById("messagepane").contentDocument;

  Assert.ok(
    !msgDoc.body.hasAttribute("bgcolor"),
    "The body shouldn't have background"
  );
  Assert.ok(
    !msgDoc.body.hasAttribute("color"),
    "The body shouldn't have a text color"
  );
  Assert.ok(
    !msgDoc.querySelector("#div").style.getPropertyValue("background-color"),
    "The first div shouldn't have a background color"
  );
  Assert.ok(
    !msgDoc
      .querySelector("#paragraph")
      .style.getPropertyValue("background-color"),
    "The paragraph shouldn't have a background color"
  );

  // Check embedded styles.
  const headStyle = aboutMessage.getComputedStyle(
    msgDoc.querySelector("#headStyle")
  );
  Assert.equal(
    headStyle.color,
    "rgb(255, 255, 255)",
    "The #headStyle should have a white color"
  );

  const headStyle2 = aboutMessage.getComputedStyle(
    msgDoc.querySelector("#headStyle2")
  );
  Assert.equal(
    headStyle2.color,
    "rgb(255, 255, 255)",
    "The #headStyle2 should maintain the same white color"
  );
  Assert.equal(
    headStyle2.background,
    "rgb(74, 74, 0)",
    "The #headStyle2 should maintain the same brown background"
  );

  const headStyle3 = aboutMessage.getComputedStyle(
    msgDoc.querySelector("#headStyle3")
  );
  Assert.equal(
    headStyle3.color,
    "rgb(0, 0, 0)",
    "The #headStyle3 should maintain the same black color"
  );
  Assert.equal(
    headStyle3.backgroundColor,
    "rgb(173, 173, 173)",
    "The #headStyle3 should maintain the same dark grey background-color"
  );

  Assert.ok(
    !msgDoc.querySelector("#span").style.getPropertyValue("color"),
    "The span shouldn't have a text color"
  );

  const table = msgDoc.querySelector("#table");
  Assert.ok(
    !table.hasAttribute("bgcolor"),
    "The table shouldn't have a background color"
  );
  Assert.ok(
    !table.hasAttribute("color"),
    "The table shouldn't have a text color"
  );

  const buttonStyle = msgDoc.querySelector("#button").style;
  Assert.ok(
    buttonStyle.getPropertyValue("background") == "blue" &&
      buttonStyle.getPropertyValue("color") == "white",
    "The button style shouldn't have been edited"
  );

  const style = aboutMessage.getComputedStyle(
    msgDoc.querySelector("#headStyle")
  );
  Assert.equal(
    style.color,
    "rgb(255, 255, 255)",
    "The paragraph styled via CSS class should inherit the white body color."
  );

  const tableBlock = aboutMessage.getComputedStyle(
    msgDoc.querySelector(".table-block")
  );
  Assert.equal(
    tableBlock.color,
    "rgb(221, 222, 223)",
    "The .table-block should have a light grey color"
  );
  Assert.equal(
    tableBlock.backgroundColor,
    "rgba(0, 0, 0, 0)",
    "The .table-block should have a transparent background-color"
  );

  Assert.equal(
    msgDoc.getElementsByTagName("text")[0].getAttribute("fill"),
    "currentColor",
    "The text SVG should have a fill set to currentColor"
  );
}
