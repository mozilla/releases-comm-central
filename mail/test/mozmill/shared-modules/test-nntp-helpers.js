/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var MODULE_NAME = "nntp-helpers";
var RELATIVE_ROOT = "../shared-modules";
var MODULES_REQUIRES = ["folder-display-helpers", "window-helpers"];

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

var kSimpleNewsArticle =
  "From: John Doe <john.doe@example.com>\n" +
  "Date: Sat, 24 Mar 1990 10:59:24 -0500\n" +
  "Newsgroups: test.subscribe.simple\n" +
  "Subject: H2G2 -- What does it mean?\n" +
  "Message-ID: <TSS1@nntp.invalid>\n" +
  "\n" +
  "What does the acronym H2G2 stand for? I've seen it before...\n";

// The groups to set up on the fake server.
// It is an array of tuples, where the first element is the group name and the
// second element is whether or not we should subscribe to it.
var groups = [
  ["test.empty", false],
  ["test.subscribe.empty", true],
  ["test.subscribe.simple", true],
  ["test.filter", true],
];

var folderDisplayHelper;
var mc;
var windowHelper;

var testHelperModule;

function setupModule() {
  folderDisplayHelper = collector.getModule("folder-display-helpers");
  mc = folderDisplayHelper.mc;
  windowHelper = collector.getModule("window-helpers");
  testHelperModule = {
    Cc,
    Ci,
    Cu,
    // fake some xpcshell stuff
    _TEST_FILE: ["mozmill"],
    do_throw(aMsg) {
      throw new Error(aMsg);
    },
  };
  folderDisplayHelper.load_via_src_path("fakeserver/nntpd.js", testHelperModule);
  folderDisplayHelper.load_via_src_path("fakeserver/maild.js", testHelperModule);
}

function installInto(module) {
  setupModule();

  // Now copy helper functions
  module.setupNNTPDaemon = setupNNTPDaemon;
  module.NNTP_PORT = NNTP_PORT;
  module.setupLocalServer = setupLocalServer;
  module.startupNNTPServer = startupNNTPServer;
  module.shutdownNNTPServer = shutdownNNTPServer;
}


// Sets up the NNTP daemon object for use in fake server
function setupNNTPDaemon() {
  var daemon = new testHelperModule.nntpDaemon();

  groups.forEach(function(element) {
    daemon.addGroup(element[0]);
  });

  var article = new testHelperModule.newsArticle(kSimpleNewsArticle);
  daemon.addArticleToGroup(article, "test.subscribe.simple", 1);

  return daemon;
}

// Startup server
function startupNNTPServer(daemon, port) {
  var handler = testHelperModule.NNTP_RFC977_handler;

  function createHandler(daemon) {
    return new handler(daemon);
  }

  var server = new testHelperModule.nsMailServer(createHandler, daemon);
  server.start(port);
  return server;
}

// Shutdown server
function shutdownNNTPServer(server) {
  server.stop();
}

// Enable strict threading
Services.prefs.setBoolPref("mail.strict_threading", true);


// Make sure we don't try to use a protected port. I like adding 1024 to the
// default port when doing so...
var NNTP_PORT = 1024 + 119;

var _server = null;

function subscribeServer(incomingServer) {
  // Subscribe to newsgroups
  incomingServer.QueryInterface(Ci.nsINntpIncomingServer);
  groups.forEach(function(element) {
      if (element[1])
        incomingServer.subscribeToNewsgroup(element[0]);
    });
  // Only allow one connection
  incomingServer.maximumConnectionsNumber = 1;
}

// Sets up the client-side portion of fakeserver
function setupLocalServer(port) {
  if (_server != null)
    return _server;

  var server = MailServices.accounts.createIncomingServer(null, "localhost", "nntp");
  server.port = port;
  server.valid = false;

  var account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  server.valid = true;
  // hack to cause an account loaded notification now the server is valid
  // (see also Bug 903804)
  account.incomingServer = account.incomingServer; // eslint-disable-line no-self-assign

  subscribeServer(server);

  _server = server;

  return server;
}
