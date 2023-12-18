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

var test = null;

// WebApps.jsm called by ProxyAutoConfig (PAC) requires a valid nsIXULAppInfo.
var { getAppInfo, newAppInfo, updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
updateAppInfo();

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../";

var { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);
var { AuthPLAIN, AuthLOGIN, AuthCRAM } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Auth.sys.mjs"
);
var {
  Pop3Daemon,
  POP3_RFC1939_handler,
  POP3_RFC2449_handler,
  POP3_RFC5034_handler,
} = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Pop3d.sys.mjs"
);

// Setup the daemon and server
// If the debugOption is set, then it will be applied to the server.
function setupServerDaemon(debugOption) {
  var daemon = new Pop3Daemon();
  var extraProps = {};
  function createHandler(d) {
    var handler = new POP3_RFC5034_handler(d);
    for (var prop in extraProps) {
      handler[prop] = extraProps[prop];
    }
    return handler;
  }
  var server = new nsMailServer(createHandler, daemon);
  if (debugOption) {
    server.setDebugLevel(debugOption);
  }
  return [daemon, server, extraProps];
}

function createPop3ServerAndLocalFolders(port, hostname = "localhost") {
  localAccountUtils.loadLocalMailAccount();
  const server = localAccountUtils.create_incoming_server(
    "pop3",
    port,
    "fred",
    "wilma",
    hostname
  );
  return server;
}

var gCopyListener = {
  callbackFunction: null,
  copiedMessageHeaderKeys: [],
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {
    try {
      this.copiedMessageHeaderKeys.push(aKey);
    } catch (ex) {
      dump(ex);
    }
  },
  GetMessageId(aMessageId) {},
  OnStopCopy(aStatus) {
    if (this.callbackFunction) {
      mailTestUtils.do_timeout_function(0, this.callbackFunction, null, [
        this.copiedMessageHeaderKeys,
        aStatus,
      ]);
    }
  },
};

/**
 * copyFileMessageInLocalFolder
 * A utility wrapper of nsIMsgCopyService.copyFileMessage to copy a message
 * into local inbox folder.
 *
 * @param aMessageFile     An instance of nsIFile to copy.
 * @param aMessageFlags    Message flags which will be set after message is
 *                         copied
 * @param aMessageKeyword  Keywords which will be set for newly copied
 *                         message
 * @param aMessageWindow   Window for notification callbacks, can be null
 * @param aCallback        Callback function which will be invoked after
 *                         message is copied
 */
function copyFileMessageInLocalFolder(
  aMessageFile,
  aMessageFlags,
  aMessageKeywords,
  aMessageWindow,
  aCallback
) {
  // Set up local folders
  localAccountUtils.loadLocalMailAccount();

  gCopyListener.callbackFunction = aCallback;
  // Copy a message into the local folder
  MailServices.copy.copyFileMessage(
    aMessageFile,
    localAccountUtils.inboxFolder,
    null,
    false,
    aMessageFlags,
    aMessageKeywords,
    gCopyListener,
    aMessageWindow
  );
}

function do_check_transaction(real, expected) {
  // If we don't spin the event loop before starting the next test, the readers
  // aren't expired. In this case, the "real" real transaction is the last one.
  if (Array.isArray(real)) {
    real = real[real.length - 1];
  }

  // real.them may have an extra QUIT on the end, where the stream is only
  // closed after we have a chance to process it and not them. We therefore
  // excise this from the list
  if (real.them[real.them.length - 1] == "QUIT") {
    real.them.pop();
  }

  if (expected[0] == "AUTH") {
    // We don't send initial AUTH command now.
    expected = expected.slice(1);
  }

  Assert.equal(real.them.join(","), expected.join(","));
  dump("Passed test " + test + "\n");
}

function create_temporary_directory() {
  const directory = Services.dirsvc.get("TmpD", Ci.nsIFile);
  directory.append("mailFolder");
  directory.createUnique(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0700", 8));
  return directory;
}

function create_sub_folders(parent, subFolders) {
  parent.leafName = parent.leafName + ".sbd";
  parent.create(Ci.nsIFile.DIRECTORY_TYPE, parseInt("0700", 8));

  for (const folder in subFolders) {
    const subFolder = parent.clone();
    subFolder.append(subFolders[folder].name);
    subFolder.create(Ci.nsIFile.NORMAL_FILE_TYPE, parseInt("0600", 8));
    if (subFolders[folder].subFolders) {
      create_sub_folders(subFolder, subFolders[folder].subFolders);
    }
  }
}

function create_mail_directory(subFolders) {
  const root = create_temporary_directory();

  for (const folder in subFolders) {
    if (!subFolders[folder].subFolders) {
      continue;
    }
    const directory = root.clone();
    directory.append(subFolders[folder].name);
    create_sub_folders(directory, subFolders[folder].subFolders);
  }

  return root;
}

function setup_mailbox(type, mailboxPath) {
  const user = Services.uuid.generateUUID().toString();
  const incomingServer = MailServices.accounts.createIncomingServer(
    user,
    "Local Folder",
    type
  );
  incomingServer.localPath = mailboxPath;

  return incomingServer.rootFolder;
}

registerCleanupFunction(function () {
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});
