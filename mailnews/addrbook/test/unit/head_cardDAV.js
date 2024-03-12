/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { CardDAVDirectory } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVDirectory.sys.mjs"
);
const { CardDAVServer } = ChromeUtils.importESModule(
  "resource://testing-common/CardDAVServer.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

do_get_profile();

registerCleanupFunction(function () {
  load("../../../resources/mailShutdown.js");
});

async function initDirectory() {
  // Set up a new directory and get the cards from the server. Do this by
  // creating an instance of CardDAVDirectory rather than through the address
  // book manager, so that we can access the internals of the directory.

  Services.prefs.setIntPref("ldap_2.servers.carddav.carddav.syncinterval", 0);
  Services.prefs.setStringPref(
    "ldap_2.servers.carddav.carddav.url",
    CardDAVServer.url
  );
  Services.prefs.setStringPref(
    "ldap_2.servers.carddav.carddav.username",
    "bob"
  );
  Services.prefs.setStringPref(
    "ldap_2.servers.carddav.description",
    "CardDAV Test"
  );
  Services.prefs.setIntPref(
    "ldap_2.servers.carddav.dirType",
    Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
  );
  Services.prefs.setStringPref(
    "ldap_2.servers.carddav.filename",
    "carddav.sqlite"
  );

  if (!Services.logins.findLogins(CardDAVServer.origin, null, "test").length) {
    // Save a username and password to the login manager.
    const loginInfo = Cc[
      "@mozilla.org/login-manager/loginInfo;1"
    ].createInstance(Ci.nsILoginInfo);
    loginInfo.init(CardDAVServer.origin, null, "test", "bob", "bob", "", "");
    await Services.logins.addLoginAsync(loginInfo);
  }

  const directory = new CardDAVDirectory();
  directory.init("jscarddav://carddav.sqlite");
  return directory;
}

async function clearDirectory(directory) {
  await directory.cleanUp();

  const database = do_get_profile();
  database.append("carddav.sqlite");
  database.remove(false);
}

async function checkCardsOnServer(expectedCards) {
  // Send a request to the server. When the server responds, we know it has
  // completed all earlier requests.
  await fetch(`${CardDAVServer.origin}/ping`);

  info("Checking cards on server are correct.");
  const actualCards = [...CardDAVServer.cards];
  Assert.equal(actualCards.length, Object.keys(expectedCards).length);

  for (let [href, { etag, vCard }] of actualCards) {
    const baseName = href
      .substring(CardDAVServer.path.length)
      .replace(/\.vcf$/, "");
    info(baseName);
    Assert.equal(etag, expectedCards[baseName].etag);
    Assert.equal(href, expectedCards[baseName].href);
    // Decode the vCard which is stored as UTF-8 on the server.
    vCard = new TextDecoder().decode(
      Uint8Array.from(vCard, c => c.charCodeAt(0))
    );
    vCardEqual(vCard, expectedCards[baseName].vCard);
  }
}

const observer = {
  notifications: {
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  },
  pendingPromise: null,
  init() {
    if (this.isInited) {
      return;
    }
    this.isInited = true;

    for (const key of Object.keys(this.notifications)) {
      Services.obs.addObserver(observer, key);
    }
  },
  checkAndClearNotifications(expected) {
    Assert.deepEqual(this.notifications, expected);
    for (const array of Object.values(this.notifications)) {
      array.length = 0;
    }
  },
  observe(subject, topic) {
    const uid = subject.QueryInterface(Ci.nsIAbCard).UID;
    info(`${topic}: ${uid}`);
    if (this.pendingPromise && this.pendingPromise.topic == topic) {
      const promise = this.pendingPromise;
      this.pendingPromise = null;
      promise.resolve(uid);
      return;
    }
    this.notifications[topic].push(uid);
  },
  waitFor(topic) {
    return new Promise(resolve => {
      this.pendingPromise = { resolve, topic };
    });
  },
};

add_task(async () => {
  CardDAVServer.open("bob", "bob");
  registerCleanupFunction(async () => {
    await CardDAVServer.close();
  });
});

// Checks two vCard strings have the same lines, in any order.
// Not very smart but smart enough.
function vCardEqual(lhs, rhs, message) {
  const lhsLines = lhs.split("\r\n").sort();
  const rhsLines = rhs.split("\r\n").sort();
  Assert.deepEqual(lhsLines, rhsLines, message);
}
