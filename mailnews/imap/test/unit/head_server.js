// We can be executed from multiple depths
// Provide gDEPTH if not already defined
if (typeof gDEPTH == "undefined") {
  var gDEPTH = "../../../../";
}

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
var { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
);
var { IMAPPump, setupIMAPPump, teardownIMAPPump } = ChromeUtils.import(
  "resource://testing-common/mailnews/IMAPpump.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var CC = Components.Constructor;

// WebApps.jsm called by ProxyAutoConfig (PAC) requires a valid nsIXULAppInfo.
var { getAppInfo, newAppInfo, updateAppInfo } = ChromeUtils.import(
  "resource://testing-common/AppInfo.jsm"
);
updateAppInfo();

// Ensure the profile directory is set up
do_get_profile();

// Import fakeserver
var {
  nsMailServer,
  gThreadManager,
  fsDebugNone,
  fsDebugAll,
  fsDebugRecv,
  fsDebugRecvSend,
} = ChromeUtils.import("resource://testing-common/mailnews/Maild.jsm");
var imapd = {};
ChromeUtils.import("resource://testing-common/mailnews/Imapd.jsm", imapd);
var { imapDaemon, imapMessage } = imapd;
var { AuthPLAIN, AuthLOGIN, AuthCRAM } = ChromeUtils.import(
  "resource://testing-common/mailnews/Auth.jsm"
);

function makeServer(daemon, infoString, otherProps) {
  if (infoString in imapd.configurations) {
    return makeServer(
      daemon,
      imapd.configurations[infoString].join(","),
      otherProps
    );
  }

  function createHandler(d) {
    var handler = new imapd.IMAP_RFC3501_handler(d);
    if (!infoString) {
      infoString = "RFC2195";
    }

    var parts = infoString.split(/ *, */);
    for (var part of parts) {
      if (part.startsWith("RFC")) {
        imapd.mixinExtension(handler, imapd["IMAP_" + part + "_extension"]);
      }
    }
    if (otherProps) {
      for (var prop in otherProps) {
        handler[prop] = otherProps[prop];
      }
    }
    return handler;
  }
  var server = new nsMailServer(createHandler, daemon);
  server.start();
  return server;
}

function createLocalIMAPServer(port, hostname = "localhost") {
  let server = localAccountUtils.create_incoming_server(
    "imap",
    port,
    "user",
    "password",
    hostname
  );
  server.QueryInterface(Ci.nsIImapIncomingServer);
  return server;
}

// <copied from="head_maillocal.js">
/**
 * @param fromServer server.playTransaction
 * @param expected ["command", "command", ...]
 * @param withParams if false,
 *    everything apart from the IMAP command will the stripped.
 *    E.g. 'lsub "" "*"' will be compared as 'lsub'.
 *    Exception is "authenticate", which also get its first parameter in upper case,
 *    e.g. "authenticate CRAM-MD5".
 */
function do_check_transaction(fromServer, expected, withParams) {
  // If we don't spin the event loop before starting the next test, the readers
  // aren't expired. In this case, the "real" real transaction is the last one.
  if (fromServer instanceof Array) {
    fromServer = fromServer[fromServer.length - 1];
  }

  let realTransaction = [];
  for (let i = 0; i < fromServer.them.length; i++) {
    var line = fromServer.them[i]; // e.g. '1 login "user" "password"'
    var components = line.split(" ");
    if (components.length < 2) {
      throw new Error("IMAP command in transaction log missing: " + line);
    }
    if (withParams) {
      realTransaction.push(line.substr(components[0].length + 1));
    } else if (components[1] == "authenticate") {
      realTransaction.push(components[1] + " " + components[2].toUpperCase());
    } else {
      realTransaction.push(components[1]);
    }
  }

  Assert.equal(realTransaction.join(", "), expected.join(", "));
}

/**
 * add a simple message to the IMAP pump mailbox
 */
function addImapMessage() {
  let messages = [];
  let messageGenerator = new MessageGenerator(); // eslint-disable-line no-undef
  messages = messages.concat(messageGenerator.makeMessage());
  let dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[0].toMessageString())
  );
  let imapMsg = new imapMessage(dataUri.spec, IMAPPump.mailbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(imapMsg);
}

registerCleanupFunction(function() {
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});
