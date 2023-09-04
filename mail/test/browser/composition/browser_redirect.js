/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the message redirect works as it should
 */

"use strict";

var { async_wait_for_compose_window, close_compose_window } =
  ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");

var { async_plan_for_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_message,
  get_about_message,
  mc,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folder;
var i = 0;

var myEmail = "me@example.com";
var myEmail2 = "otherme@example.com";

var identity;
var identity2;

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

add_setup(function () {
  // Now set up an account with some identities.
  let account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "Redirect Addresses Testing",
    "pop3"
  );

  folder = account.incomingServer.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("Msgs4Redirect");

  identity = MailServices.accounts.createIdentity();
  identity.email = myEmail;
  account.addIdentity(identity);

  identity2 = MailServices.accounts.createIdentity();
  identity2.email = myEmail2;
  account.addIdentity(identity2);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, true);
  });

  // Let's add messages to the folder later as we go, it's hard to read
  // out of context what the expected results should be.
});

/**
 * Helper to check that the compose window has the expected address fields.
 */
function checkAddresses(win, expectedFields) {
  let rows = win.document.querySelectorAll(
    "#recipientsContainer .address-row:not(.hidden)"
  );

  let obtainedFields = [];
  for (let row of rows) {
    let addresses = [];
    for (let pill of row.querySelectorAll("mail-address-pill")) {
      addresses.push(pill.fullAddress);
    }

    obtainedFields[row.dataset.recipienttype] = addresses;
  }

  // Check what we expect is there.
  for (let type in expectedFields) {
    let expected = expectedFields[type];
    let obtained = obtainedFields[type];

    for (let i = 0; i < expected.length; i++) {
      if (!obtained || !obtained.includes(expected[i])) {
        throw new Error(
          expected[i] +
            " is not in " +
            type +
            " fields; " +
            "obtained=" +
            obtained
        );
      }
    }
    Assert.equal(
      obtained.length,
      expected.length,
      "Unexpected number of fields obtained for type=" +
        type +
        "; obtained=" +
        obtained +
        "; expected=" +
        expected
    );
  }

  // Check there's no "extra" fields either.
  for (let type in obtainedFields) {
    let expected = expectedFields[type];
    let obtained = obtainedFields[type];
    if (!expected) {
      throw new Error(
        "Didn't expect a field for type=" + type + "; obtained=" + obtained
      );
    }
  }

  // Check if the input "aria-label" attribute was properly updated.
  for (let row of rows) {
    let addrLabel = row.querySelector(".address-label-container > label").value;
    let addrTextbox = row.querySelector(".address-row-input");
    let ariaLabel = addrTextbox.getAttribute("aria-label");
    let pillCount = row.querySelectorAll("mail-address-pill").length;

    switch (pillCount) {
      case 0:
        Assert.equal(ariaLabel, addrLabel);
        break;
      case 1:
        Assert.equal(
          ariaLabel,
          addrLabel + " with one address, use left arrow key to focus on it."
        );
        break;
      default:
        Assert.equal(
          ariaLabel,
          addrLabel +
            " with " +
            pillCount +
            " addresses, use left arrow key to focus on them."
        );
        break;
    }
  }
}

/**
 * Tests that addresses get set properly when doing a redirect to a mail
 * w/ Reply-To.
 */
add_task(async function testRedirectToMe() {
  let msg0 = create_message({
    from: "Homer <homer@example.com>",
    to: myEmail2,
    cc: "Lisa <lisa@example.com>",
    subject: "testRedirectToMe",
  });
  await add_message_to_folder([folder], msg0);

  await be_in_folder(folder);
  let msg = select_click_row(i++);
  assert_selected_and_displayed(mc, msg);

  // Open Other Actions.
  let aboutMessage = get_about_message();
  let otherActionsButton =
    aboutMessage.document.getElementById("otherActionsButton");
  EventUtils.synthesizeMouseAtCenter(otherActionsButton, {}, aboutMessage);
  let otherActionsPopup =
    aboutMessage.document.getElementById("otherActionsPopup");
  let popupshown = BrowserTestUtils.waitForEvent(
    otherActionsPopup,
    "popupshown"
  );
  await popupshown;
  info("otherActionsButton popup shown");

  let compWinPromise = async_plan_for_new_window("msgcompose");
  // Click the Redirect menu item
  EventUtils.synthesizeMouseAtCenter(
    otherActionsPopup.firstElementChild,
    {},
    aboutMessage
  );
  let cwc = await async_wait_for_compose_window(mc, compWinPromise);
  Assert.equal(
    cwc.window.getCurrentIdentityKey(),
    identity2.key,
    "should be from second identity"
  );
  checkAddresses(
    cwc.window,
    // What would go into a reply should now be in Reply-To
    {
      addr_to: [], // empty
      addr_reply: ["Homer <homer@example.com>"],
    }
  );
  close_compose_window(cwc, false);
});
