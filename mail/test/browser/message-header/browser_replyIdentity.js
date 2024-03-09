/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that actions such as replying choses the most suitable identity.
 */

"use strict";

var { close_compose_window, open_compose_with_reply } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  create_message,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var testFolder = null;

var identity1Email = "carl@example.com";
var identity2Email = "lenny@springfield.invalid";

add_setup(async function () {
  addIdentitiesAndFolder();
  // Msg #0
  await add_message_to_folder(
    [testFolder],
    create_message({
      from: "Homer <homer@example.com>",
      to: "workers@springfield.invalid",
      subject: "no matching identity, like bcc/list",
      body: {
        body: "Alcohol is a way of life, alcohol is my way of life, and I aim to keep it.",
      },
      clobberHeaders: {},
    })
  );
  // Msg #1
  await add_message_to_folder(
    [testFolder],
    create_message({
      from: "Homer <homer@example.com>",
      to: "powerplant-workers@springfield.invalid",
      subject: "only delivered-to header matching identity",
      body: {
        body: "Just because I don't care doesn't mean I don't understand.",
      },
      clobberHeaders: {
        "Delivered-To": "<" + identity2Email + ">",
      },
    })
  );
  // Msg #2
  await add_message_to_folder(
    [testFolder],
    create_message({
      from: "Homer <homer@example.com>",
      to: "powerplant-workers@springfield.invalid, Apu <apu@test.invalid>",
      cc: "other." + identity2Email,
      subject: "subpart of cc address matching identity",
      body: { body: "Blame the guy who doesn't speak Engish." },
      clobberHeaders: {},
    })
  );
  // Msg #3
  await add_message_to_folder(
    [testFolder],
    create_message({
      from: "Homer <homer@example.com>",
      to: "Lenny <" + identity2Email + ">",
      subject: "normal to:address match, with full name",
      body: {
        body: "Remember as far as anyone knows, we're a nice normal family.",
      },
    })
  );
  // Msg #4
  await add_message_to_folder(
    [testFolder],
    create_message({
      from: "Homer <homer@example.com>",
      to: "powerplant-workers@springfield.invalid",
      subject: "delivered-to header matching only subpart of identity email",
      body: { body: "Mmmm...Forbidden donut" },
      clobberHeaders: {
        "Delivered-To": "<other." + identity2Email + ">",
      },
    })
  );
  // Msg #5
  await add_message_to_folder(
    [testFolder],
    create_message({
      from: identity2Email + " <" + identity2Email + ">",
      to: "Marge <marge@example.com>",
      subject: "from second self",
      body: {
        body: "All my life I've had one dream, to achieve my many goals.",
      },
    })
  );
});

function addIdentitiesAndFolder() {
  const server = MailServices.accounts.createIncomingServer(
    "nobody",
    "Reply Identity Testing",
    "pop3"
  );
  testFolder = server.rootFolder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("Replies");

  const identity = MailServices.accounts.createIdentity();
  identity.email = identity1Email;

  const identity2 = MailServices.accounts.createIdentity();
  identity2.email = identity2Email;

  const account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  account.addIdentity(identity);
  account.addIdentity(identity2);
}

function checkReply(replyWin, expectedFromEmail) {
  const identityList = replyWin.document.getElementById("msgIdentity");
  if (!identityList.selectedItem.label.includes(expectedFromEmail)) {
    throw new Error(
      "The From address is not correctly selected! Expected: " +
        expectedFromEmail +
        "; Actual: " +
        identityList.selectedItem.label
    );
  }
}

add_task(async function test_reply_no_matching_identity() {
  await be_in_folder(testFolder);

  const msg = await select_click_row(-1);
  await assert_selected_and_displayed(window, msg);

  const replyWin = await open_compose_with_reply();
  // Should have selected the default identity.
  checkReply(replyWin, identity1Email);
  await close_compose_window(replyWin);
});

add_task(async function test_reply_matching_only_deliveredto() {
  await be_in_folder(testFolder);

  const msg = await select_click_row(-2);
  await assert_selected_and_displayed(window, msg);

  const replyWin = await open_compose_with_reply();
  // Should have selected the second id, which is listed in Delivered-To:.
  checkReply(replyWin, identity2Email);
  await close_compose_window(replyWin);
}).skip();

add_task(async function test_reply_matching_subaddress() {
  await be_in_folder(testFolder);

  const msg = await select_click_row(-3);
  await assert_selected_and_displayed(window, msg);

  const replyWin = await open_compose_with_reply();
  // Should have selected the first id, the email doesn't fully match.
  // other.lenny != "our" lenny
  checkReply(replyWin, identity1Email);
  await close_compose_window(replyWin);
});

add_task(async function test_reply_to_matching_second_id() {
  await be_in_folder(testFolder);

  const msg = await select_click_row(-4);
  await assert_selected_and_displayed(window, msg);

  const replyWin = await open_compose_with_reply();
  // Should have selected the second id, which was in To;.
  checkReply(replyWin, identity2Email);
  await close_compose_window(replyWin);
});

add_task(async function test_deliveredto_to_matching_only_parlty() {
  await be_in_folder(testFolder);

  const msg = await select_click_row(-5);
  await assert_selected_and_displayed(window, msg);

  const replyWin = await open_compose_with_reply();
  // Should have selected the (default) first id.
  checkReply(replyWin, identity1Email);
  await close_compose_window(replyWin);
});

/**
 * A reply from self is treated as a follow-up. And this self
 * was the second identity, so the reply should also be from the second identity.
 */
add_task(async function test_reply_to_self_second_id() {
  await be_in_folder(testFolder);

  const msg = await select_click_row(0);
  await assert_selected_and_displayed(window, msg);

  const replyWin = await open_compose_with_reply();
  // Should have selected the second id, which was in From.
  checkReply(replyWin, identity2Email);
  await close_compose_window(replyWin, false /* no prompt*/);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
