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

var CC = Components.Constructor;

// WebApps.sys.mjs called by ProxyAutoConfig (PAC) requires a valid nsIXULAppInfo.
var { getAppInfo, newAppInfo, updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
updateAppInfo();

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../";

// Import the required setup scripts.

/* import-globals-from ../../../test/resources/abSetup.js */
load("../../../resources/abSetup.js");

// Import the smtp server scripts
var { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);
var { SmtpDaemon, SMTP_RFC2821_handler } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Smtpd.sys.mjs"
);
var { AuthPLAIN, AuthLOGIN, AuthCRAM } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Auth.sys.mjs"
);

var gDraftFolder;

// Setup the daemon and server
function setupServerDaemon(handler) {
  if (!handler) {
    handler = function (d) {
      return new SMTP_RFC2821_handler(d);
    };
  }
  var server = new nsMailServer(handler, new SmtpDaemon());
  return server;
}

function getBasicSmtpServer(port = 1, hostname = "localhost") {
  const server = localAccountUtils.create_outgoing_server(
    port,
    "user",
    "password",
    hostname
  );

  // Override the default greeting so we get something predicitable
  // in the ELHO message
  Services.prefs.setCharPref("mail.smtpserver.default.hello_argument", "test");

  return server;
}

function getSmtpIdentity(senderName, smtpServer) {
  // Set up the identity
  const identity = MailServices.accounts.createIdentity();
  identity.email = senderName;
  identity.smtpServerKey = smtpServer.key;

  return identity;
}

var test;

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

/**
 * This listener is designed just to call OnStopCopy() when its onStopCopy
 * function is called - the rest of the functions are unneeded for a lot of
 * tests (but we can't use asyncCopyListener because we need the
 * nsIMsgSendListener interface as well).
 *
 * @implements {nsIMsgSendListener}
 * @implements {nsIMsgCopyServiceListener}
 */
var copyListener = {
  // nsIMsgSendListener
  onStartSending() {},
  onSendProgress() {},
  onStatus() {},
  onStopSending() {},
  onGetDraftFolderURI() {},
  onSendNotPerformed() {},
  onTransportSecurityError() {},

  // nsIMsgCopyServiceListener
  onStartCopy() {},
  onProgress() {},
  setMessageKey() {},
  getMessageId() {
    return null;
  },
  onStopCopy(aStatus) {
    /* globals OnStopCopy */
    OnStopCopy(aStatus);
  },

  // QueryInterface
  QueryInterface: ChromeUtils.generateQI([
    "nsIMsgSendListener",
    "nsIMsgCopyServiceListener",
  ]),
};

/** @implements {nsIWebProgressListener} */
var progressListener = {
  onStateChange(aWebProgress, aRequest, aStateFlags) {
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      this.resolve(gDraftFolder && mailTestUtils.firstMsgHdr(gDraftFolder));
    }
  },

  onProgressChange() {},
  onLocationChange() {},
  onStatusChange() {},
  onSecurityChange() {},
  onContentBlockingEvent() {},

  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),
};

function createMessage(aAttachment) {
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.from = "Nobody <nobody@tinderbox.test>";

  let attachments = [];
  if (aAttachment) {
    const attachment = Cc[
      "@mozilla.org/messengercompose/attachment;1"
    ].createInstance(Ci.nsIMsgAttachment);
    if (aAttachment instanceof Ci.nsIFile) {
      attachment.url = "file://" + aAttachment.path;
      attachment.contentType = "text/plain";
      attachment.name = aAttachment.leafName;
    } else {
      attachment.url = "data:,sometext";
      attachment.name = aAttachment;
    }
    attachments = [attachment];
  }
  return richCreateMessage(fields, attachments);
}

function richCreateMessage(
  fields,
  attachments = [],
  identity = null,
  account = null
) {
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = fields;

  const msgCompose = MailServices.compose.initCompose(params);
  if (identity === null) {
    identity = getSmtpIdentity(null, getBasicSmtpServer());
  }

  const rootFolder = localAccountUtils.rootFolder;
  gDraftFolder = null;
  // Make sure the drafts folder is empty
  try {
    gDraftFolder = rootFolder.getChildNamed("Drafts");
  } catch (e) {
    // we don't have to remove the folder because it doesn't exist yet
    gDraftFolder = rootFolder.createLocalSubfolder("Drafts");
  }
  // Clear all messages
  const msgs = [...gDraftFolder.msgDatabase.enumerateMessages()];
  if (msgs.length > 0) {
    gDraftFolder.deleteMessages(msgs, null, true, false, null, false);
  }

  // Set attachment
  fields.removeAttachments();
  for (const attachment of attachments) {
    fields.addAttachment(attachment);
  }

  const progress = Cc["@mozilla.org/messenger/progress;1"].createInstance(
    Ci.nsIMsgProgress
  );
  const promise = new Promise((resolve, reject) => {
    progressListener.resolve = resolve;
    progressListener.reject = reject;
  });
  progress.registerListener(progressListener);
  msgCompose.sendMsg(
    Ci.nsIMsgSend.nsMsgSaveAsDraft,
    identity,
    account ? account.key : "",
    null,
    progress
  );
  return promise;
}

function getAttachmentFromContent(aContent) {
  function getBoundaryStringFromContent() {
    const found = aContent.match(
      /Content-Type: multipart\/mixed;\s+boundary="(.*?)"/
    );
    Assert.notEqual(found, null);
    Assert.equal(found.length, 2);

    return found[1];
  }

  const boundary = getBoundaryStringFromContent(aContent);
  const regex = new RegExp(
    "\\r\\n\\r\\n--" +
      boundary +
      "\\r\\n" +
      "([\\s\\S]*?)\\r\\n" +
      "--" +
      boundary +
      "--",
    "m"
  );
  const attachments = aContent.match(regex);
  Assert.notEqual(attachments, null);
  Assert.equal(attachments.length, 2);
  return attachments[1];
}

/**
 * Get the body part of an MIME message.
 *
 * @param {string} content - The message content.
 * @returns {string}
 */
function getMessageBody(content) {
  const separatorIndex = content.indexOf("\r\n\r\n");
  Assert.equal(content.slice(-2), "\r\n", "Should end with a line break.");
  return content.slice(separatorIndex + 4, -2);
}

registerCleanupFunction(function () {
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});
