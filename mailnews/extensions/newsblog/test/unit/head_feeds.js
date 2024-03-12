var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

const { FeedParser } = ChromeUtils.importESModule(
  "resource:///modules/FeedParser.sys.mjs"
);
const { Feed } = ChromeUtils.importESModule("resource:///modules/Feed.sys.mjs");
const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

// Set up local web server to serve up test files.
// We run it on a random port so that other tests can run concurrently
// even if they also run a web server.
const httpServer = new HttpServer();
httpServer.registerDirectory("/", do_get_file("resources"));
httpServer.start(-1);
const SERVER_PORT = httpServer.identity.primaryPort;

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../../";

registerCleanupFunction(async () => {
  await httpServer.stop();
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});
