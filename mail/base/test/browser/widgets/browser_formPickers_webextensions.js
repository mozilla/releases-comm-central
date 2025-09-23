/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/* globals checkABrowser */
Services.scriptloader.loadSubScript(
  new URL("head_formPickers.js", getRootDirectory(gTestPath)).href,
  this
);

const TEST_DOCUMENT_URL =
  "http://mochi.test:8888/browser/comm/mail/base/test/browser/widgets/files/formContent.html";

const tabmail = document.getElementById("tabmail");
let testFolder;

add_setup(async () => {
  // We'll try composing, so need an account.
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  identity.email = "mochitest@localhost";
  account.addIdentity(identity);
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  MailServices.accounts.defaultAccount = account;
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("formPickerFolder")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const message = await IOUtils.readUTF8(
    getTestFilePath("files/formContent.eml")
  );
  testFolder.addMessage(message);

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testExtensionPopupWindow() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      await browser.windows.create({
        url: "formContent.html",
        type: "popup",
        width: 800,
        height: 500,
      });
      browser.test.notifyPass("ready");
    },
    files: {
      "formContent.html": await IOUtils.readUTF8(
        getTestFilePath("files/formContent.html")
      ),
    },
  });

  await extension.startup();
  await extension.awaitFinish("ready");

  const extensionPopup = Services.wm.getMostRecentWindow("mail:extensionPopup");
  // extensionPopup.xhtml needs time to initialise properly.
  await new Promise(resolve => extensionPopup.setTimeout(resolve, 500));
  await checkABrowser(extensionPopup.document.getElementById("requestFrame"));
  await BrowserTestUtils.closeWindow(extensionPopup);

  await extension.unload();
});

add_task(async function testExtensionBrowserAction() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "formContent.html": await IOUtils.readUTF8(
        getTestFilePath("files/formContent.html")
      ),
    },
    manifest: {
      applications: {
        gecko: {
          id: "formpickers@mochi.test",
        },
      },
      browser_action: {
        default_popup: "formContent.html",
      },
    },
  });

  await extension.startup();

  const { panel, browser } = await openExtensionPopup(
    window,
    "ext-formpickers@mochi.test"
  );
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
});

add_task(async function testExtensionComposeAction() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "formContent.html": await IOUtils.readUTF8(
        getTestFilePath("files/formContent.html")
      ),
    },
    manifest: {
      applications: {
        gecko: {
          id: "formpickers@mochi.test",
        },
      },
      compose_action: {
        default_popup: "formContent.html",
      },
    },
  });

  await extension.startup();

  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  const composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "load");

  const { panel, browser } = await openExtensionPopup(
    composeWindow,
    "formpickers_mochi_test-composeAction-toolbarbutton"
  );
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
  await BrowserTestUtils.closeWindow(composeWindow);
});

add_task(async function testExtensionMessageDisplayAction() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "formContent.html": await IOUtils.readUTF8(
        getTestFilePath("files/formContent.html")
      ),
    },
    manifest: {
      applications: {
        gecko: {
          id: "formpickers@mochi.test",
        },
      },
      message_display_action: {
        default_popup: "formContent.html",
      },
    },
  });

  await extension.startup();

  const messageWindowPromise = BrowserTestUtils.domWindowOpened();
  window.MsgOpenNewWindowForMessage([...testFolder.messages][0]);
  const messageWindow = await messageWindowPromise;
  const { target: aboutMessage } = await BrowserTestUtils.waitForEvent(
    messageWindow,
    "aboutMessageLoaded"
  );

  const { panel, browser } = await openExtensionPopup(
    aboutMessage,
    "formpickers_mochi_test-messageDisplayAction-toolbarbutton"
  );
  await checkABrowser(browser);
  panel.hidePopup();

  await extension.unload();
  await BrowserTestUtils.closeWindow(messageWindow);
});
