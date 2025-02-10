/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that clicking links in the message browser works.
 */

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let testMessage;

add_setup(async function () {
  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );

  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const testFolder = rootFolder
    .createLocalSubfolder("clickLinks")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const message = await IOUtils.readUTF8(
    getTestFilePath("files/clickableContent.eml")
  );
  testFolder.addMessage(message);
  testMessage = testFolder.messages.getNext();

  tabmail.currentAbout3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
  });
});

add_task(async function click_elements() {
  const about3Pane = tabmail.currentAbout3Pane;
  const { messageBrowser, threadTree } = about3Pane;

  threadTree.selectedIndex = 0;
  threadTree.scrollToIndex(0, true);
  await messageLoadedIn(messageBrowser);

  const aboutMessage = messageBrowser.contentWindow;
  const browser = aboutMessage.getMessagePaneBrowser();
  browser.focus();

  const messageBody = browser.contentDocument.body;
  const a_elements = messageBody.getElementsByTagName("a");
  const button_elements = messageBody.getElementsByTagName("button");

  const click_element = async element => {
    const openedLinkPromise = mockExternalProtocolService.promiseEvent();
    element.click();
    Assert.equal(
      await openedLinkPromise,
      "https://www.example.com/",
      "should have tried to open the browser"
    );
  };

  click_element(a_elements[0]);
  click_element(button_elements[0]);
  click_element(button_elements[1]);
  click_element(button_elements[2]);
});

/** @implements {nsIExternalProtocolService} */
const mockExternalProtocolService = {
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),

  _deferred: null,

  externalProtocolHandlerExists() {
    return true;
  },

  isExposedProtocol() {
    return true;
  },

  loadURI(aURI) {
    if (this._deferred) {
      const deferred = this._deferred;
      this._deferred = null;

      deferred.resolve(aURI.spec);
    } else {
      this.cancelPromise();
      Assert.ok(false, "unexpected call to external protocol service");
    }
  },

  promiseEvent() {
    this._deferred = Promise.withResolvers();
    return this._deferred.promise;
  },

  cancelPromise() {
    this._deferred = null;
  },
};
