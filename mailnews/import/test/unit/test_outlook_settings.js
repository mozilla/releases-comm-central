var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/* import-globals-from resources/mock_windows_reg_factory.js */
load("resources/mock_windows_reg_factory.js");

function POP3Account() {}

POP3Account.prototype = {
  "Account Name": "POP3 Account Name",
  "POP3 Server": "pop.host.invalid",
  "POP3 User Name": "pop3user",
  "Leave Mail On Server": 1,
  "SMTP Server": "smtp.host.invalid",
  "SMTP Display Name": "SMTP Display Name",
  "SMTP Email Address": "pop3user@host.invalid",
  "SMTP Reply To Email Address": "pop3user@host.invalid",
  "SMTP Organization Name": "SMTP Organization Name",
  "SMTP User Name": "smtpuser",
};

function IMAPAccount() {}

IMAPAccount.prototype = {
  "Account Name": "IMAP Account Name",
  "IMAP Server": "imap.host.invalid",
  "IMAP User Name": "imapuser",
  "SMTP Server": "smtp.host.invalid",
  "SMTP Display Name": "SMTP Display Name",
  "SMTP Email Address": "imapuser@host.invalid",
  "SMTP Reply To Email Address": "imapuser@host.invalid",
  "SMTP Organization Name": "SMTP Organization Name",
  "SMTP User Name": "smtpuser",
};

/* Outlook 98 */
function Outlook98Registry(defaultAccount) {
  this._defaultAccount = defaultAccount;
}

Outlook98Registry.prototype = {
  get "Software\\Microsoft\\Office\\8.0\\Outlook\\OMI Account Manager"() {
    return {
      "Default Mail Account": "00000001",
      "00000001": this._defaultAccount,
    };
  },
};

/* Outlook 2003 - */
function Outlook2003Registry(defaultAccount) {
  this._defaultAccount = defaultAccount;
}

Outlook2003Registry.prototype = {
  get "Software\\Microsoft\\Office\\Outlook\\OMI Account Manager"() {
    return {
      "Default Mail Account": "00000001",
      "00000001": this._defaultAccount,
    };
  },
};

var expectedPop3Account = {
  incomingServer: {
    prettyName: "POP3 Account Name",
    type: "pop3",
    hostName: "pop.host.invalid",
    username: "pop3user",
    leaveMessagesOnServer: true,

    // These are account default values, not imported from Outlook.
    // They should probably be omitted, but the check functions in
    // import_helper.js expect to find them.
    deleteMailLeftOnServer: false,
    deleteByAgeFromServer: false,
    numDaysToLeaveOnServer: 7,
    port: 110,
    isSecure: false,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    socketType: Ci.nsMsgSocketType.plain,
    doBiff: true,
    biffMinutes: 10,
  },
  identity: {
    fullName: "SMTP Display Name",
    email: "pop3user@host.invalid",
    replyTo: "pop3user@host.invalid",
    organization: "SMTP Organization Name",
  },
  smtpServer: {
    hostname: "smtp.host.invalid",
    username: "smtpuser",
    port: -1, // default port
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    socketType: Ci.nsMsgSocketType.plain,
  },
};

var expectedImapAccount = {
  incomingServer: {
    prettyName: "IMAP Account Name",
    type: "imap",
    hostName: "imap.host.invalid",
    username: "imapuser",

    // These are account default values, not imported from Outlook.
    // They should probably be omitted, but the check functions in
    // import_helper.js expect to find them.
    port: 143,
    isSecure: false,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    socketType: Ci.nsMsgSocketType.plain,
    doBiff: true,
    biffMinutes: 10,
  },
  identity: {
    fullName: "SMTP Display Name",
    email: "imapuser@host.invalid",
    replyTo: "imapuser@host.invalid",
    organization: "SMTP Organization Name",
  },
  smtpServer: {
    hostname: "smtp.host.invalid",
    username: "smtpuser",
    port: -1, // default port
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    socketType: Ci.nsMsgSocketType.plain,
  },
};

function teardown() {
  for (const server of MailServices.outgoingServer.servers) {
    MailServices.outgoingServer.deleteServer(server);
  }

  teardown_mock_registry();
}

function _test(registry, expectedAccount) {
  try {
    setup_mock_registry(registry);
    new SettingsImportHelper(null, "Outlook", [expectedAccount]).beginImport();
  } catch (e) {
    teardown();
    do_throw(e);
  }
  teardown();
}

function run_test() {
  _test(new Outlook2003Registry(new POP3Account()), expectedPop3Account);
  _test(new Outlook2003Registry(new IMAPAccount()), expectedImapAccount);

  _test(new Outlook98Registry(new POP3Account()), expectedPop3Account);
  _test(new Outlook98Registry(new IMAPAccount()), expectedImapAccount);
}
