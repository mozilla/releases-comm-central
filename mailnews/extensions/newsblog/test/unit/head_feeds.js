var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
var { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
);

let { FeedParser } = ChromeUtils.import("resource:///modules/FeedParser.jsm");
let { Feed } = ChromeUtils.import("resource:///modules/Feed.jsm");
let { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");
let { HttpServer } = ChromeUtils.import("resource://testing-common/httpd.js");

// Set up local web server to serve up test files.
// We run it on a random port so that other tests can run concurrently
// even if they also run a web server.
let httpServer = new HttpServer();
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
