/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* Tests that cards are sent as vCard 3.0 to a server which announces support
 * only for vCard 3.0 in its supported-address-data property. */

const { VCardUtils } = ChromeUtils.importESModule(
  "resource:///modules/VCardUtils.sys.mjs"
);

const VCARD3 = `<card:address-data-type content-type="text/vcard" version="3.0"/>`;
const VCARD4 = `<card:address-data-type content-type="text/vcard" version="4.0"/>`;
const PREF = "ldap_2.servers.carddav.carddav.vcard3";

function newCard(uid) {
  return VCardUtils.vCardToAbCard(
    `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:${uid}\r\nPHOTO:data:image/png;base64,iVBORw0KGgo=\r\nUID:${uid}\r\nEND:VCARD\r\n`
  );
}

async function waitForCardOnServer(directory, uid) {
  await TestUtils.waitForCondition(
    () => directory.getCard(uid)?.getProperty("_etag", ""),
    `${uid} should be stored on the server`
  );
  const { vCard } = CardDAVServer.cards.get(
    directory.getCard(uid).getProperty("_href", "")
  );
  Assert.equal(
    directory.getCard(uid).getProperty("_vCard", ""),
    vCard,
    "local card should match the card on the server"
  );
  return vCard;
}

function checkVersion(vCard, expectVCard3) {
  if (expectVCard3) {
    Assert.stringContains(
      vCard,
      "VERSION:3.0\r\n",
      "card on the server should be vCard 3.0"
    );
    Assert.stringContains(
      vCard,
      "PHOTO;ENCODING=B:iVBORw0KGgo=\r\n",
      "photo on the server should be inline binary"
    );
    Assert.stringMatches(
      vCard,
      /^N:;;;;\r$/m,
      "card on the server should have an N property"
    );
  } else {
    Assert.stringContains(
      vCard,
      "VERSION:4.0\r\n",
      "card on the server should be vCard 4.0"
    );
    Assert.stringContains(
      vCard,
      "PHOTO:data:image/png;base64\\,iVBORw0KGgo=\r\n",
      "photo on the server should be a data URI"
    );
  }
}

async function cleanUp(directory) {
  await clearDirectory(directory);
  CardDAVServer.reset();
  CardDAVServer.mimicYahoo = false;
  Services.prefs.clearUserPref(PREF);
}

async function subtest(supportedAddressData, expectVCard3, initialVCard3) {
  CardDAVServer.supportedAddressData = supportedAddressData;
  if (initialVCard3) {
    Services.prefs.setBoolPref(PREF, true);
  }

  const directory = await initDirectory();
  await directory.fetchAllFromServer();
  Assert.equal(
    CardDAVServer.supportedAddressDataRequests,
    0,
    "supported address data should not be requested before an upload"
  );

  directory.addCard(newCard("first"));
  checkVersion(await waitForCardOnServer(directory, "first"), expectVCard3);
  Assert.equal(
    directory.getBoolValue("carddav.vcard3", false),
    expectVCard3,
    "carddav.vcard3 should reflect the supported address data"
  );

  directory.addCard(newCard("second"));
  checkVersion(await waitForCardOnServer(directory, "second"), expectVCard3);
  Assert.equal(
    CardDAVServer.supportedAddressDataRequests,
    1,
    "supported address data should be requested once per session"
  );

  await cleanUp(directory);
}

add_task(async function testNoSupportedAddressData() {
  await subtest(null, false);
});

add_task(async function testNoSupportedAddressDataKeepsSetting() {
  await subtest(null, true, true);
});

add_task(async function testVCard3Only() {
  await subtest(VCARD3, true);
});

add_task(async function testVCard3And4() {
  await subtest(VCARD3 + VCARD4, false);
});

add_task(async function testVCard4AddedLater() {
  await subtest(VCARD3 + VCARD4, false, true);
});

add_task(async function testDAViCal() {
  await subtest(
    `<card:address-data content-type="text/vcard" version="3.0"/>`,
    true
  );
});

add_task(async function testDefaultAttributes() {
  await subtest("<card:address-data-type/>", true);
});

/**
 * Tests that a server refusing the request is not asked again in the same
 * session, and that the setting is left alone.
 */
add_task(async function testRequestRefused() {
  CardDAVServer.mimicYahoo = true;
  Services.prefs.setBoolPref(PREF, true);

  const directory = await initDirectory();
  await directory.fetchAllFromServer();

  directory.addCard(newCard("first"));
  checkVersion(await waitForCardOnServer(directory, "first"), true);
  directory.addCard(newCard("second"));
  checkVersion(await waitForCardOnServer(directory, "second"), true);
  Assert.equal(
    CardDAVServer.supportedAddressDataRequests,
    1,
    "a refused request should not be repeated"
  );

  await cleanUp(directory);
});

/**
 * Tests that if the server can't be reached, the check is done when the card
 * is sent to the server by the next sync.
 */
add_task(async function testServerUnreachable() {
  CardDAVServer.supportedAddressData = VCARD3;

  const directory = await initDirectory();
  await directory.fetchAllFromServer();

  await CardDAVServer.close();
  const syncFailed = TestUtils.topicObserved("addrbook-directory-sync-failed");
  directory.addCard(newCard("first"));
  await syncFailed;
  Assert.ok(
    !directory.getBoolValue("carddav.vcard3", false),
    "carddav.vcard3 should not be set while the server is unreachable"
  );

  CardDAVServer.reopen();
  await directory.syncWithServer();
  checkVersion(await waitForCardOnServer(directory, "first"), true);
  Assert.equal(
    CardDAVServer.supportedAddressDataRequests,
    1,
    "supported address data should be requested once the server is back"
  );

  await cleanUp(directory);
});
