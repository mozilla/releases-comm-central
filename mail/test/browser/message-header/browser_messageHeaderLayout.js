/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { be_in_folder, get_about_message, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

let view;
let messages;
let button;

add_setup(async function () {
  const account = createAccount();
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
  });
  const folder = await createSubfolder(
    account.incomingServer.rootFolder,
    "layout"
  );
  for (const from of [
    ["A", "a@example.com"],
    ["A much longer sender name that needs more space", "long@example.com"],
  ]) {
    createMessages(folder, {
      count: 1,
      from,
      to: [["Recipient", "sender@nul.invalid"]],
    });
  }
  messages = [...folder.messages];
  await be_in_folder(folder);
  await select_click_row(0, AccessibilityUtils);
  view = get_about_message();
  button = view.document.getElementById("hdrTrashButton");

  const browser = view.browsingContext.embedderElement;
  const browserStyle = browser.style.cssText;
  const root = view.document.documentElement;
  const fontSize = root.style.fontSize;
  const header = view.document.getElementById("messageHeader");
  const iconsOnly = header.classList.contains(
    "message-header-buttons-only-icons"
  );
  registerCleanupFunction(() => {
    browser.style.cssText = browserStyle;
    root.style.fontSize = fontSize;
    header.classList.toggle("message-header-buttons-only-icons", iconsOnly);
  });
});

async function setMessageWidth(width) {
  const browser = view.browsingContext.embedderElement;
  browser.style.inlineSize = `${width}px`;
  browser.style.minInlineSize = `${width}px`;
  browser.style.maxInlineSize = `${width}px`;
  await TestUtils.waitForCondition(
    () => view.innerWidth == width,
    `The message viewport should reach ${width}px`
  );
}

add_task(async function test_deletePositionWhenSenderWraps() {
  await setMessageWidth(2000);
  const initialLoad = BrowserTestUtils.waitForEvent(view, "MsgLoaded");
  view.displayMessage(messages[0].folder.getUriForMsg(messages[0]));
  await initialLoad;
  const toolbar = view.document.getElementById("header-view-toolbox");
  const sender = view.document.getElementById("expandedfromRow");
  // Leave room for the short sender, but make the longer sender wrap.
  await setMessageWidth(Math.ceil(toolbar.getBoundingClientRect().width) + 200);
  Assert.lessOrEqual(
    sender.getBoundingClientRect().right,
    toolbar.getBoundingClientRect().left,
    "The short sender should fit beside the toolbar"
  );
  const initialBounds = button.getBoundingClientRect();
  const clickPoint = {
    x: initialBounds.left + initialBounds.width / 2,
    y: initialBounds.top + initialBounds.height / 2,
  };

  // Switch from the displayed short sender to the long sender and back,
  // checking Delete's position and hit target in both directions.
  for (const message of [messages[1], messages[0]]) {
    const loaded = BrowserTestUtils.waitForEvent(view, "MsgLoaded");
    view.displayMessage(message.folder.getUriForMsg(message));
    await loaded;
    if (message.messageKey == messages[1].messageKey) {
      Assert.greaterOrEqual(
        sender.getBoundingClientRect().top,
        toolbar.getBoundingClientRect().bottom,
        "The longer sender should wrap below the toolbar"
      );
    }
    const bounds = button.getBoundingClientRect();
    for (const edge of ["left", "top", "width", "height"]) {
      Assert.lessOrEqual(
        Math.abs(bounds[edge] - initialBounds[edge]),
        1,
        `Delete's ${edge} should stay unchanged when switching senders`
      );
    }
    Assert.ok(
      button.contains(
        view.document.elementFromPoint(clickPoint.x, clickPoint.y)
      ),
      "The original Delete click point should still hit Delete after switching senders"
    );
  }
});

add_task(async function test_touchButtonSizing() {
  await SpecialPowers.pushPrefEnv({ set: [["mail.uidensity", 2]] });
  const header = view.document.getElementById("messageHeader");
  header.classList.add("message-header-buttons-only-icons");
  const iconHeight = button.getBoundingClientRect().height;
  Assert.greaterOrEqual(
    iconHeight,
    30,
    "The touch-mode Delete button should be at least 30px tall"
  );

  header.classList.remove("message-header-buttons-only-icons");
  view.document.documentElement.style.fontSize = "30px";
  const bounds = button.getBoundingClientRect();
  const label = button.querySelector(".toolbarbutton-text");
  Assert.ok(label, "Delete should have a label");
  const labelBounds = label.getBoundingClientRect();
  Assert.greater(
    bounds.height,
    iconHeight,
    "Delete should grow to accommodate a larger label"
  );
  Assert.greaterOrEqual(
    labelBounds.top,
    bounds.top,
    "The label should fit below the top of the button"
  );
  Assert.lessOrEqual(
    labelBounds.bottom,
    bounds.bottom,
    "The label should fit above the bottom of the button"
  );
});
