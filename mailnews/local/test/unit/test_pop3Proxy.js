/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
// Test that POP3 over a proxy works.

Components.utils.import("resource://testing-common/mailnews/NetworkTestUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

const PORT = 110;

var server, daemon, incomingServer;

add_task(function* setup() {
  // Disable new mail notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);

  [daemon, server] = setupServerDaemon();
  server.start();
  NetworkTestUtils.configureProxy("pop.tinderbox.invalid", PORT, server.port);

  // Set up the basic accounts and folders
  incomingServer = createPop3ServerAndLocalFolders(PORT, "pop.tinderbox.invalid");

  // Add a message to download
  daemon.setMessages(["message1.eml"]);
});

add_task(function* downloadEmail() {
  // Check that we haven't got any messages in the folder, if we have its a test
  // setup issue.
  equal(localAccountUtils.inboxFolder.getTotalMessages(false), 0);

  // Now get the mail
  let urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(null, urlListener, localAccountUtils.inboxFolder,
                               incomingServer);
  yield urlListener.promise;

  // We downloaded a message, so it works!
  equal(localAccountUtils.inboxFolder.getTotalMessages(false), 1);
});

add_task(function* cleanUp() {
  NetworkTestUtils.shutdownServers();
  incomingServer.closeCachedConnections();
  server.stop();
});

function run_test() {
  run_next_test();
}
