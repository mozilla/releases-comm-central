/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { fsDebugAll, gThreadManager, nsMailServer } = ChromeUtils.import(
  "resource://testing-common/mailnews/Maild.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

ExtensionTestUtils.init(this);

var IS_IMAP = false;
var IS_NNTP = false;

function createAccount(type = "none") {
  let account;

  if (type == "local") {
    MailServices.accounts.createLocalMailAccount();
    account = MailServices.accounts.FindAccountForServer(
      MailServices.accounts.localFoldersServer
    );
  } else {
    account = MailServices.accounts.createAccount();
    account.incomingServer = MailServices.accounts.createIncomingServer(
      `${account.key}user`,
      "localhost",
      type
    );
  }

  if (type == "imap") {
    IMAPServer.open();
    account.incomingServer.port = IMAPServer.port;
    account.incomingServer.username = "user";
    account.incomingServer.password = "password";
  }

  if (type == "nntp") {
    NNTPServer.open();
    account.incomingServer.port = NNTPServer.port;
  }
  info(`Created account ${account.toString()}`);
  return account;
}

function cleanUpAccount(account) {
  info(`Cleaning up account ${account.toString()}`);
  MailServices.accounts.removeAccount(account, true);
}

registerCleanupFunction(() => {
  MailServices.accounts.accounts.forEach(cleanUpAccount);
});

function addIdentity(account, email = "xpcshell@localhost") {
  let identity = MailServices.accounts.createIdentity();
  identity.email = email;
  account.addIdentity(identity);
  if (!account.defaultIdentity) {
    account.defaultIdentity = identity;
  }
  info(`Created identity ${identity.toString()}`);
  return identity;
}

async function createSubfolder(parent, name) {
  if (parent.server.type == "nntp") {
    createNewsgroup(name);
    let account = MailServices.accounts.FindAccountForServer(parent.server);
    subscribeNewsgroup(account, name);
    return parent.getChildNamed(name);
  }

  let promiseAdded = PromiseTestUtils.promiseFolderAdded(name);
  parent.createSubfolder(name, null);
  await promiseAdded;
  return parent.getChildNamed(name);
}

function createMessages(folder, makeMessagesArg) {
  if (typeof makeMessagesArg == "number") {
    makeMessagesArg = { count: makeMessagesArg };
  }
  if (!createMessages.messageGenerator) {
    createMessages.messageGenerator = new MessageGenerator();
  }

  let messages = createMessages.messageGenerator.makeMessages(makeMessagesArg);
  return addGeneratedMessages(folder, messages);
}

class FakeGeneratedMessage {
  constructor(msg) {
    this.msg = msg;
  }
  toMessageString() {
    return this.msg;
  }
  toMboxString() {
    // A cheap hack. It works for existing uses but may not work for future uses.
    let fromAddress = this.msg.match(/From: .* <(.*@.*)>/)[0];
    let mBoxString = `From ${fromAddress}\r\n${this.msg}`;
    // Ensure a trailing empty line.
    if (!mBoxString.endsWith("\r\n")) {
      mBoxString = mBoxString + "\r\n";
    }
    return mBoxString;
  }
}

async function createMessageFromFile(folder, path) {
  let message = await IOUtils.readUTF8(path);
  return addGeneratedMessages(folder, [new FakeGeneratedMessage(message)]);
}

async function createMessageFromString(folder, message) {
  return addGeneratedMessages(folder, [new FakeGeneratedMessage(message)]);
}

async function addGeneratedMessages(folder, messages) {
  if (folder.server.type == "imap") {
    return IMAPServer.addMessages(folder, messages);
  }
  if (folder.server.type == "nntp") {
    return NNTPServer.addMessages(folder, messages);
  }

  let messageStrings = messages.map(message => message.toMboxString());
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch(messageStrings);
  folder.callFilterPlugins(null);
  return Promise.resolve();
}

async function getUtilsJS() {
  return IOUtils.readUTF8(do_get_file("data/utils.js").path);
}

var IMAPServer = {
  open() {
    let { imapDaemon, imapMessage, IMAP_RFC3501_handler } = ChromeUtils.import(
      "resource://testing-common/mailnews/Imapd.jsm"
    );
    IMAPServer.imapMessage = imapMessage;

    this.daemon = new imapDaemon();
    this.server = new nsMailServer(
      daemon => new IMAP_RFC3501_handler(daemon),
      this.daemon
    );
    this.server.start();

    registerCleanupFunction(() => this.close());
  },
  close() {
    this.server.stop();
  },
  get port() {
    return this.server.port;
  },

  addMessages(folder, messages) {
    let fakeFolder = IMAPServer.daemon.getMailbox(folder.name);
    messages.forEach(message => {
      if (typeof message != "string") {
        message = message.toMessageString();
      }
      let msgURI = Services.io.newURI(
        "data:text/plain;base64," + btoa(message)
      );
      let imapMsg = new IMAPServer.imapMessage(
        msgURI.spec,
        fakeFolder.uidnext++,
        []
      );
      fakeFolder.addMessage(imapMsg);
    });

    return new Promise(resolve =>
      mailTestUtils.updateFolderAndNotify(folder, resolve)
    );
  },
};

function subscribeNewsgroup(account, group) {
  account.incomingServer.QueryInterface(Ci.nsINntpIncomingServer);
  account.incomingServer.subscribeToNewsgroup(group);
  account.incomingServer.maximumConnectionsNumber = 1;
}

function createNewsgroup(group) {
  if (!NNTPServer.hasGroup(group)) {
    NNTPServer.addGroup(group);
  }
}

var NNTPServer = {
  open() {
    let { NNTP_RFC977_handler, nntpDaemon } = ChromeUtils.import(
      "resource://testing-common/mailnews/Nntpd.jsm"
    );

    this.daemon = new nntpDaemon();
    this.server = new nsMailServer(
      daemon => new NNTP_RFC977_handler(daemon),
      this.daemon
    );
    this.server.start();

    registerCleanupFunction(() => this.close());
  },

  close() {
    this.server.stop();
  },
  get port() {
    return this.server.port;
  },

  addGroup(group) {
    return this.daemon.addGroup(group);
  },

  hasGroup(group) {
    return this.daemon.getGroup(group) != null;
  },

  addMessages(folder, messages) {
    let { newsArticle } = ChromeUtils.import(
      "resource://testing-common/mailnews/Nntpd.jsm"
    );

    let group = folder.name;
    messages.forEach(message => {
      if (typeof message != "string") {
        message = message.toMessageString();
      }
      // The NNTP daemon needs a trailing empty line.
      if (!message.endsWith("\r\n")) {
        message = message + "\r\n";
      }
      let article = new newsArticle(message);
      article.groups = [group];
      this.daemon.addArticle(article);
    });

    return new Promise(resolve => {
      mailTestUtils.updateFolderAndNotify(folder, resolve);
    });
  },
};
