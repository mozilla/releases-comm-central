/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var { EwsServer, RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const IMAGE_PATH = "/hello.jpg";

var ewsServer;
var incomingServer;
var httpServer;
var imageRequested = false;

add_setup(async function () {
  httpServer = new HttpServer();

  // Register a dummy handler that just responds with a 404 Not Found status.
  // The media will still end up triggering a content blocking policy
  // (`OpaqueResponseBlocking`) because of the non-2XX response status, but at
  // this point we'll have already registered that a request has been attempted,
  // which is all we care about.
  httpServer.registerPathHandler(IMAGE_PATH, (request, response) => {
    imageRequested = true;
    response.setStatusLine("1.1", 404, "Not Found");
  });
  httpServer.start(-1);

  // Create a new mock EWS server, and start it.
  ewsServer = new EwsServer({});
  ewsServer.start();

  // Create a new account and connect it to the mock EWS server.
  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "127.0.0.1",
    "ews"
  );

  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = incomingServer;

  // Store the account's credentials into the login manager so we're not
  // prompted for a password when trying to sync messages.
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "ews://127.0.0.1",
    null,
    "ews://127.0.0.1",
    "user",
    "password",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  registerCleanupFunction(() => {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
  });
});

function generate_message_body() {
  var image_url = `http://127.0.0.1:${httpServer.identity.primaryPort}${IMAGE_PATH}`;

  return (
    '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">\n' +
    "<html>\n" +
    "<head>\n" +
    "\n" +
    '<meta http-equiv="content-type" content="text/html; charset=ISO-8859-1">\n' +
    "</head>\n" +
    '<body bgcolor="#ffffff" text="#000000">\n' +
    `<img id="testelement" src="${image_url}"/>\n` +
    "</body>\n</html>\n"
  );
}

/**
 * Tests that remote content in EWS messages is blocked by default, inline with
 * other protocols.
 */
add_task(async function test_remote_content_blocked() {
  // Create a new folder for our test on the server.
  const folderName = "remotecontent";
  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, null)
  );

  // Create a fake message with the signed body and add it to the newly created
  // folder.
  const msgGen = new MessageGenerator();
  const msg = msgGen.makeMessage({
    from: ["Tinderbox", "tinderbox@foo.invalid"],
    to: [["Tinderbox", "tinderbox@foo.invalid"]],
    subject: "Hello world",
    body: { body: generate_message_body(), contentType: "text/html" },
  });

  ewsServer.addMessages(folderName, [msg]);

  // Sync the new folder and its message locally.
  const rootFolder = incomingServer.rootFolder;
  incomingServer.getNewMessages(rootFolder, null, null);

  const folder = await TestUtils.waitForCondition(
    () => rootFolder.getChildNamed(folderName),
    "waiting for folder to exist"
  );
  await TestUtils.waitForCondition(
    () => folder.getTotalMessages(false) == 1,
    "waiting for the message to exist"
  );

  const tabmail = window.document.getElementById("tabmail");

  // Navigate to the folder.
  const about3Pane = tabmail.currentAbout3Pane;
  const displayPromise = BrowserTestUtils.waitForEvent(
    about3Pane,
    "folderURIChanged"
  );
  about3Pane.displayFolder(folder.URI);
  await displayPromise;

  const { gDBView, messageBrowser } = about3Pane;
  const aboutMessage = messageBrowser.contentWindow;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();

  // Display the message.
  const loadedPromise = BrowserTestUtils.browserLoaded(
    messagePaneBrowser,
    undefined,
    url => url.endsWith(gDBView.getKeyAt(0))
  );
  about3Pane.threadTree.selectedIndex = 0;
  await loadedPromise;

  const notification = aboutMessage.document.querySelector(
    "notification-message"
  );

  // Check that the visual indicator of remote content blocking is there.
  Assert.ok(
    !!notification,
    "there should be a notification above the message content"
  );
  Assert.equal(
    notification.getAttribute("type"),
    "warning",
    "the notification should be a warning"
  );
  Assert.equal(
    notification.getAttribute("value"),
    "remoteContent",
    "the notification should be about remote content"
  );

  // Check that no request has been made to retrieve the remote content.
  Assert.ok(!imageRequested, "the image should not be requested");
});
