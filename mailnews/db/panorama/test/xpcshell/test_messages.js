/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Just a stub test to prove that the messages database works.
 */

add_setup(async function () {
  await installDB("messages.sqlite");
});

add_setup(function testMessagesDBWorks() {
  Assert.equal(messages.totalCount, 10);

  const added = messages.addMessage(
    "253372@example.invalid",
    new Date("Wed, 20 Oct 1993 02:49:00 +0000"),
    "karlie@example.org",
    "Synergized real-time portal",
    2, // folderId
    0, // flags
    "" // tags
  );
  Assert.equal(messages.totalCount, 11);

  messages.removeMessage(added);
  Assert.equal(messages.totalCount, 10);
});
