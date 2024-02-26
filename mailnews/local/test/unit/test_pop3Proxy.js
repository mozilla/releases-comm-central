/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
// Test that POP3 over a proxy works.

const { NetworkTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/NetworkTestUtils.jsm"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const PORT = 110;

var server, daemon, incomingServer;

add_setup(async function () {
  // Disable new mail notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);

  [daemon, server] = setupServerDaemon();
  server.start();
  NetworkTestUtils.configureProxy("pop.tinderbox.invalid", PORT, server.port);

  // Set up the basic accounts and folders
  incomingServer = createPop3ServerAndLocalFolders(
    PORT,
    "pop.tinderbox.invalid"
  );

  // Add a message to download
  daemon.setMessages(["message1.eml"]);
});

add_task(async function downloadEmail() {
  // Check that we haven't got any messages in the folder, if we have its a test
  // setup issue.
  equal(localAccountUtils.inboxFolder.getTotalMessages(false), 0);

  // Now get the mail
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );
  await urlListener.promise;

  // We downloaded a message, so it works!
  equal(localAccountUtils.inboxFolder.getTotalMessages(false), 1);
});

add_task(async function cleanUp() {
  NetworkTestUtils.shutdownServers();
  incomingServer.closeCachedConnections();
  server.stop();
});
