/**
 * Basic tests for importing accounts of Windows Live Mail.
 */

/* import-globals-from resources/mock_windows_reg_factory.js */
load("resources/mock_windows_reg_factory.js");

var expectedPop3TestTestAccount = {
  incomingServer: {
    type: "pop3",
    hostName: "pop3.test.test",
    prettyName: "testpopaccountname",
    port: 110,
    socketType: 0,
    doBiff: true,
    biffMinutes: 2,
    isSecure: false,
    username: "testpopusername",
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    leaveMessagesOnServer: false,
    deleteMailLeftOnServer: false,
    deleteByAgeFromServer: false,
    numDaysToLeaveOnServer: 7,
  },
  identity: {
    fullName: "popdisplayname",
    organization: "",
    email: "testpop@invalid.invalid",
  },
  smtpServer: {
    hostname: "smtp.pop.test",
    port: -1, // default port
    username: "",
    authMethod: Ci.nsMsgAuthMethod.none,
    socketType: 0,
  },
};

var expectedNewsMozillaOrgAccount = {
  incomingServer: {
    type: "nntp",
    hostName: "testnews.mozilla.org",
    prettyName: "accountnamemozillanews",
    port: 119,
    username: "",
    socketType: 0,
    isSecure: false,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    doBiff: false,
    biffMinutes: 10, // default value
  },
  identity: {
    fullName: "test",
    organization: "",
    email: "mozillanews@invalid.invalid",
  },
};

var expectedMicrosoftCommunitiesAccount = {
  incomingServer: {
    type: "nntp",
    hostName: "testmsnews.microsoft.invalid",
    prettyName: "Microsoft Communities Test",
    port: 119,
    username: "",
    socketType: 0,
    isSecure: false,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    doBiff: false,
    biffMinutes: 10, // default value
  },
  identity: {
    fullName: "",
    organization: "",
  },
};

var expectedDonHallNntpAccount = {
  incomingServer: {
    type: "nntp",
    hostName: "news.wingtiptoys.invalid",
    prettyName: "donhallnntp",
    port: 563,
    username: "don",
    isSecure: false,
    authMethod: Ci.nsMsgAuthMethod.secure,
    socketType: 0,
    doBiff: false,
    biffMinutes: 10, // default value
  },
  identity: {
    fullName: "Don Hall",
    organization: "Wingtip Toys",
    email: "don@wingtiptoys.invalid",
    replyTo: "don@wingtiptoys.invalid",
  },
};

var expectedDonHallImapAccount = {
  incomingServer: {
    type: "imap",
    hostName: "mail.wingtiptoys.invalid",
    prettyName: "donhallimap",
    port: 993,
    isSecure: true,
    doBiff: true,
    biffMinutes: 2,
    username: "don",
    authMethod: Ci.nsMsgAuthMethod.secure,
    socketType: Ci.nsMsgSocketType.SSL,
  },
  identity: {
    fullName: "Don Hall",
    organization: "Wingtip Toys",
    email: "don@wingtiptoys.invalid",
    replyTo: "don@wingtiptoys.invalid",
  },
  smtpServer: {
    hostname: "smtp.wingtiptoys.invalid",
    username: "don",
    port: 25,
    socketType: Ci.nsMsgSocketType.SSL,
    authMethod: Ci.nsMsgAuthMethod.secure,
  },
};

var expectedAccounts = [
  expectedPop3TestTestAccount,
  expectedNewsMozillaOrgAccount,
  expectedMicrosoftCommunitiesAccount,
  expectedDonHallNntpAccount,
  expectedDonHallImapAccount,
];

function WinLiveMailRegistry(rootPath) {
  this._rootPath = rootPath;
}

WinLiveMailRegistry.prototype = {
  get "Software\\Microsoft\\Windows Live Mail"() {
    return {
      "Default Mail Account": "fill in mail account",
      "Default News Account": "fill in news account",
      "Store Root": this._rootPath,
      mail: {
        "Poll For Mail": 120000,
      },
    };
  },
};

function _test(registry) {
  try {
    setup_mock_registry(registry);
    new SettingsImportHelper(
      null,
      "Windows Live Mail",
      expectedAccounts
    ).beginImport();
  } catch (e) {
    teardown();
    do_throw(e);
  }
  teardown();
}

function teardown() {
  for (const server of MailServices.outgoingServer.servers) {
    MailServices.outgoingServer.deleteServer(server);
  }

  teardown_mock_registry();
}

function run_test() {
  const root = do_get_file("resources/WindowsLiveMail");
  _test(new WinLiveMailRegistry(root.path));
}
