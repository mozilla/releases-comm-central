/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { CardDAVDirectory } = ChromeUtils.import(
  "resource:///modules/CardDAVDirectory.jsm"
);
const { CardDAVServer } = ChromeUtils.import(
  "resource://testing-common/CardDAVServer.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
Cu.importGlobalProperties(["fetch"]);

do_get_profile();

async function checkCardsOnServer(expectedCards) {
  // Send a request to the server. When the server responds, we know it has
  // completed all earlier requests.
  await fetch(`${CardDAVServer.url}/ping`);

  let actualCards = [...CardDAVServer.cards];
  Assert.equal(actualCards.length, Object.keys(expectedCards).length);

  for (let [href, { etag, vCard }] of actualCards) {
    let baseName = href
      .substring(CardDAVServer.path.length)
      .replace(/\.vcf$/, "");
    info(baseName);
    Assert.equal(etag, expectedCards[baseName].etag);
    Assert.equal(href, expectedCards[baseName].href);
    Assert.equal(vCard, expectedCards[baseName].vCard);
  }
}

let observer = {
  notifications: {
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  },
  pendingPromise: null,
  init() {
    for (let key of Object.keys(this.notifications)) {
      Services.obs.addObserver(observer, key);
    }
  },
  checkAndClearNotifications(expected) {
    Assert.deepEqual(this.notifications, expected);
    for (let array of Object.values(this.notifications)) {
      array.length = 0;
    }
  },
  observe(subject, topic) {
    let uid = subject.QueryInterface(Ci.nsIAbCard).UID;
    if (this.pendingPromise && this.pendingPromise.topic == topic) {
      let promise = this.pendingPromise;
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
  CardDAVServer.open();
  registerCleanupFunction(async () => {
    await CardDAVServer.close();
  });
});
