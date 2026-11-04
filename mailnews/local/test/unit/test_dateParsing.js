/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that Date headers the database can't store fall back to other dates.
 */

function addMessage(headers) {
  localAccountUtils.inboxFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  localAccountUtils.inboxFolder.clearNewMessages();
  localAccountUtils.inboxFolder.addMessage(
    "From \r\n" +
      "From: alice@t1.example.com\r\n" +
      "To: bob@t2.example.net\r\n" +
      headers +
      "\r\nhello\r\n"
  );
  return localAccountUtils.inboxFolder.firstNewMessage;
}

add_task(function test_dates() {
  for (const storeID of localAccountUtils.pluggableStores) {
    localAccountUtils.loadLocalMailAccount(storeID);
    checkDates();
  }
});

function checkDates() {
  let msgHdr = addMessage("Date: Sat, 18 Jan 2020 15:05:30 GMT\r\n");
  Assert.equal(
    msgHdr.dateInSeconds,
    Date.UTC(2020, 0, 18, 15, 5, 30) / 1000,
    "a normal date should be stored as is"
  );

  msgHdr = addMessage(
    "Received: from mx.example.com by mx.example.net; Wed, 28 Oct 2026 05:47:05 GMT\r\n" +
      "Date: Sat, 18 Jan 2612 15:05:30 GMT\r\n"
  );
  const receivedSecs = Date.UTC(2026, 9, 28, 5, 47, 5) / 1000;
  Assert.equal(
    msgHdr.dateInSeconds,
    receivedSecs,
    "a date after 2106 should fall back to the received date"
  );
  Assert.equal(
    msgHdr.date,
    receivedSecs * 1000000,
    "the cached date should match the stored date"
  );
  Assert.equal(
    msgHdr.getUint32Property("dateReceived"),
    receivedSecs,
    "the received date should be the Received header date"
  );

  msgHdr = addMessage(
    "Received: from mx.example.com by mx.example.net; Wed, 28 Oct 2026 05:47:05 GMT\r\n" +
      "Date: Sat, 18 Jan 1960 15:05:30 GMT\r\n"
  );
  Assert.equal(
    msgHdr.dateInSeconds,
    receivedSecs,
    "a date before 1970 should fall back to the received date"
  );

  const before = Math.floor(Date.now() / 1000);
  msgHdr = addMessage("Date: Sat, 18 Jan 2612 15:05:30 GMT\r\n");
  const after = Math.ceil(Date.now() / 1000);
  Assert.greaterOrEqual(
    msgHdr.dateInSeconds,
    before,
    "a date after 2106 without other dates should fall back to now"
  );
  Assert.lessOrEqual(
    msgHdr.dateInSeconds,
    after,
    "a date after 2106 without other dates should fall back to now"
  );
}
