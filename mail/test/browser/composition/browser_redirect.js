/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the message redirect works as it should
 */

"use strict";

var { close_compose_window, compose_window_ready } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);

var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_message,
  get_about_message,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folder;
var i = 0;

var myEmail = "me@example.com";
var myEmail2 = "otherme@example.com";

var identity;
var identity2;

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_setup(function () {
  // Now set up an account with some identities.
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "RedirectAddressesTesting",
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
  const rows = win.document.querySelectorAll(
    "#recipientsContainer .address-row:not(.hidden)"
  );

  const obtainedFields = [];
  for (const row of rows) {
    const addresses = [];
    for (const pill of row.querySelectorAll("mail-address-pill")) {
      addresses.push(pill.fullAddress);
    }

    obtainedFields[row.dataset.recipienttype] = addresses;
  }

  // Check what we expect is there.
  for (const type in expectedFields) {
    const expected = expectedFields[type];
    const obtained = obtainedFields[type];

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
  for (const type in obtainedFields) {
    const expected = expectedFields[type];
    const obtained = obtainedFields[type];
    if (!expected) {
      throw new Error(
        "Didn't expect a field for type=" + type + "; obtained=" + obtained
      );
    }
  }

  // Check if the input "aria-label" attribute was properly updated.
  for (const row of rows) {
    const addrLabel = row.querySelector(
      ".address-label-container > label"
    ).value;
    const addrTextbox = row.querySelector(".address-row-input");
    const ariaLabel = addrTextbox.getAttribute("aria-label");
    const pillCount = row.querySelectorAll("mail-address-pill").length;

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
  const msg0 = create_message({
    from: "Homer <homer@example.com>",
    to: myEmail2,
    cc: "Lisa <lisa@example.com>",
    subject: "testRedirectToMe",
  });
  await add_message_to_folder([folder], msg0);

  await be_in_folder(folder);
  const msg = await select_click_row(i++);
  await assert_selected_and_displayed(window, msg);

  // Open Other Actions.
  const aboutMessage = get_about_message();
  const otherActionsButton =
    aboutMessage.document.getElementById("otherActionsButton");
  EventUtils.synthesizeMouseAtCenter(otherActionsButton, {}, aboutMessage);
  const otherActionsPopup =
    aboutMessage.document.getElementById("otherActionsPopup");
  const popupshown = BrowserTestUtils.waitForEvent(
    otherActionsPopup,
    "popupshown"
  );
  await popupshown;
  info("otherActionsButton popup shown");

  const compWinPromise = promise_new_window("msgcompose");
  // Click the Redirect menu item
  EventUtils.synthesizeMouseAtCenter(
    otherActionsPopup.firstElementChild,
    {},
    aboutMessage
  );
  const cwc = await compose_window_ready(compWinPromise);
  Assert.equal(
    cwc.getCurrentIdentityKey(),
    identity2.key,
    "should be from second identity"
  );
  checkAddresses(
    cwc,
    // What would go into a reply should now be in Reply-To
    {
      addr_to: [], // empty
      addr_reply: ["Homer <homer@example.com>"],
    }
  );
  await close_compose_window(cwc, false);
});
