var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
);

var test = null;

// WebApps.jsm called by ProxyAutoConfig (PAC) requires a valid nsIXULAppInfo.
var { getAppInfo, newAppInfo, updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
updateAppInfo();

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../";

// Import the servers
var { nsMailServer } = ChromeUtils.import(
  "resource://testing-common/mailnews/Maild.jsm"
);
var {
  NewsArticle,
  NNTP_Giganews_handler,
  NNTP_RFC2980_handler,
  NNTP_RFC4643_extension,
  NNTP_RFC977_handler,
  NntpDaemon,
} = ChromeUtils.import("resource://testing-common/mailnews/Nntpd.jsm");

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
  ["misc.test", false],
  ["test.empty", false],
  ["test.subscribe.empty", true],
  ["test.subscribe.simple", true],
  ["test.filter", true],
];
// Sets up the NNTP daemon object for use in fake server
function setupNNTPDaemon() {
  var daemon = new NntpDaemon();

  groups.forEach(function (element) {
    daemon.addGroup(element[0]);
  });

  var auto_add = do_get_file("postings/auto-add/");
  var files = [...auto_add.directoryEntries];

  files.sort(function (a, b) {
    if (a.leafName == b.leafName) {
      return 0;
    }
    return a.leafName < b.leafName ? -1 : 1;
  });

  files.forEach(function (file) {
    var fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
      Ci.nsIFileInputStream
    );
    var sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
    fstream.init(file, -1, 0, 0);
    sstream.init(fstream);

    var post = "";
    let part = sstream.read(4096);
    while (part.length > 0) {
      post += part;
      part = sstream.read(4096);
    }
    sstream.close();
    fstream.close();
    daemon.addArticle(new NewsArticle(post));
  });

  var article = new NewsArticle(kSimpleNewsArticle);
  daemon.addArticleToGroup(article, "test.subscribe.simple", 1);

  return daemon;
}

function makeServer(handler, daemon) {
  function createHandler(d) {
    return new handler(d);
  }
  return new nsMailServer(createHandler, daemon);
}

// Enable strict threading
Services.prefs.setBoolPref("mail.strict_threading", true);

// Make sure we don't try to use a protected port. I like adding 1024 to the
// default port when doing so...
var NNTP_PORT = 1024 + 119;

var _server = null;
var _account = null;

function subscribeServer(incomingServer) {
  // Subscribe to newsgroups
  incomingServer.QueryInterface(Ci.nsINntpIncomingServer);
  groups.forEach(function (element) {
    if (element[1]) {
      incomingServer.subscribeToNewsgroup(element[0]);
    }
  });
  // Only allow one connection
  incomingServer.maximumConnectionsNumber = 1;
}

// Sets up the client-side portion of fakeserver
function setupLocalServer(port, host = "localhost") {
  if (_server != null) {
    return _server;
  }
  const serverAndAccount = localAccountUtils.create_incoming_server_and_account(
    "nntp",
    port,
    null,
    null,
    host
  );
  const server = serverAndAccount.server;
  subscribeServer(server);

  _server = server;
  _account = serverAndAccount.account;

  return server;
}

// Sets up a protocol object and prepares to run the test for the news url
function setupProtocolTest(port, newsUrl, incomingServer) {
  var url;
  if (newsUrl instanceof Ci.nsIMsgMailNewsUrl) {
    url = newsUrl;
  } else {
    url = Services.io.newURI(newsUrl);
  }

  var newsServer = incomingServer;
  if (!newsServer) {
    newsServer = setupLocalServer(port);
  }

  var listener = {
    onStartRequest() {},
    onStopRequest() {
      if (!this.called) {
        this.called = true;
        newsServer.closeCachedConnections();
        this.called = false;
      }
    },
    onDataAvailable() {},
    QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
  };
  listener.called = false;
  newsServer.loadNewsUrl(url, null, listener);
}

function create_post(baseURL, file) {
  var url = Services.io.newURI(baseURL);
  url.QueryInterface(Ci.nsINntpUrl);

  var post = Cc["@mozilla.org/messenger/nntpnewsgrouppost;1"].createInstance(
    Ci.nsINNTPNewsgroupPost
  );
  post.postMessageFile = do_get_file(file);
  url.messageToPost = post;
  return url;
}

function resetFolder(folder) {
  var headers = [...folder.messages];

  var db = folder.msgDatabase;
  db.dBFolderInfo.knownArtsSet = "";
  for (var header of headers) {
    db.deleteHeader(header, null, true, false);
  }
  dump("resetting folder\n");
  folder.msgDatabase = null;
}

function do_check_transaction(real, expected) {
  if (Array.isArray(real)) {
    real = real.at(-1);
  }

  // real.them may have an extra QUIT on the end, where the stream is only
  // closed after we have a chance to process it and not them. We therefore
  // excise this from the list
  if (real.them[real.them.length - 1] == "QUIT") {
    real.them.pop();
  }

  Assert.equal(real.them.join(","), expected.join(","));
  dump("Passed test " + test + "\n");
}

function make_article(file) {
  var fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  var sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  fstream.init(file, -1, 0, 0);
  sstream.init(fstream);

  var post = "";
  let part = sstream.read(4096);
  while (part.length > 0) {
    post += part;
    part = sstream.read(4096);
  }
  sstream.close();
  fstream.close();
  return new NewsArticle(post);
}

registerCleanupFunction(function () {
  load("../../../resources/mailShutdown.js");
});
