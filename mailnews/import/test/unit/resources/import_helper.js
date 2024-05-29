var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

// used by checkProgress to periodically check the progress of the import
var gGenericImportHelper;
/**
 * GenericImportHelper
 * The parent class of AbImportHelper, SettingsImportHelper and
 * FiltersImportHelper.
 *
 * @param {"addressbook"|"settings"|"filters"} aModuleType -
 *   The type of import module.
 * @param {string} aContractID - The contract ID of the importer to fetch.
 * @param {nsIFile} aFile - A file to import.
 */
function GenericImportHelper(aModuleType, aContractID, aFile) {
  gGenericImportHelper = null;
  if (!["addressbook", "mail", "settings", "filters"].includes(aModuleType)) {
    do_throw("Unexpected type passed to the GenericImportHelper constructor");
  }
  this.mModuleType = aModuleType;
  this.mInterface = Cc[aContractID]
    .createInstance(Ci.nsIImportModule)
    .GetImportInterface(aModuleType)
    .QueryInterface(this.interfaceType);
  Assert.ok(this.mInterface !== null);

  this.mFile = aFile; // checked in the beginImport method
}

GenericImportHelper.prototype = {
  interfaceType: Ci.nsIImportGeneric,
  /**
   * GenericImportHelper.beginImport
   * Imports the given address book export or mail data and invoke
   * checkProgress of child class to check the data,
   */
  beginImport() {
    Assert.ok(this.mFile instanceof Ci.nsIFile && this.mFile.exists());

    if (this.mModuleType == "addressbook") {
      this.mInterface.SetData("addressLocation", this.mFile);
    }

    Assert.ok(this.mInterface.WantsProgress());
    const error = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    Assert.ok(this.mInterface.BeginImport(null, error));
    Assert.equal(error.data, "");
    do_test_pending();
    this.checkProgress();
  },
  /**
   * GenericImportHelper.getInterface
   *
   * @returns An nsIImportGeneric import interface.
   */
  getInterface() {
    return this.mInterface;
  },

  /**
   * GenericImportHelper.checkProgress
   * Checks the progress of an import every 200 milliseconds until it is
   * complete.  Checks the test results if there is an original address book,
   * otherwise evaluates the optional command, or calls do_test_finished().
   */
  checkProgress() {
    Assert.ok(
      this.mInterface && this.mInterface instanceof Ci.nsIImportGeneric
    );
    Assert.ok(this.mInterface.ContinueImport());
    // if the import isn't done, check again in 200 milliseconds.
    if (this.mInterface.GetProgress() != 100) {
      // use the helper object to check the progress of the import after 200 ms
      gGenericImportHelper = this;
      do_timeout(200, function () {
        gGenericImportHelper.checkProgress();
      });
    } else {
      // if it is done, check the results or finish the test.
      this.checkResults();
      do_test_finished();
    }
  },

  /**
   * GenericImportHelper.checkResults
   * Checks the results of the import.
   * Child class should implement this method.
   */
  checkResults() {},
};

/**
 * SettingsImportHelper
 * A helper for settings imports.
 *
 * @param {nsIFile} aFile - A file to import.
 * @param {string} aContractID - The contract ID of the importer to fetch.
 * @param {object[]} aExpected - An array of object which has incomingServer,
 *   identity and smtpSever to compare with imported nsIMsgAccount.
 */
function SettingsImportHelper(aFile, aContractID, aExpected) {
  GenericImportHelper.call(this, "settings", aContractID, aFile);
  this.mExpected = aExpected;
}

SettingsImportHelper.prototype = {
  __proto__: GenericImportHelper.prototype,
  interfaceType: Ci.nsIImportSettings,
  /**
   * SettingsImportHelper.beginImport
   * Imports settings from a specific file or auto-located if the file is null,
   * and compare the import results with the expected array.
   */
  beginImport() {
    this._ensureNoAccounts();
    if (this.mFile) {
      this.mInterface.SetLocation(this.mFile);
    } else {
      Assert.equal(true, this.mInterface.AutoLocate({}, {}));
    }
    Assert.equal(true, this.mInterface.Import({}));
    this.checkResults();
  },

  _ensureNoAccounts() {
    for (const account of MailServices.accounts.accounts) {
      MailServices.accounts.removeAccount(account);
    }
  },

  _checkSmtpServer(expected, actual) {
    Assert.equal(expected.port, actual.serverURI.port);
    Assert.equal(expected.username, actual.username);
    Assert.equal(expected.authMethod, actual.authMethod);
    Assert.equal(expected.socketType, actual.socketType);
  },

  _checkIdentity(expected, actual) {
    Assert.equal(expected.fullName, actual.fullName);
    Assert.equal(expected.email, actual.email);
    Assert.equal(expected.replyTo, actual.replyTo);
    Assert.equal(expected.organization, actual.organization);
  },

  _checkPop3IncomingServer(expected, actual) {
    Assert.equal(expected.leaveMessagesOnServer, actual.leaveMessagesOnServer);
    Assert.equal(
      expected.deleteMailLeftOnServer,
      actual.deleteMailLeftOnServer
    );
    Assert.equal(expected.deleteByAgeFromServer, actual.deleteByAgeFromServer);
    Assert.equal(
      expected.numDaysToLeaveOnServer,
      actual.numDaysToLeaveOnServer
    );
  },

  _checkIncomingServer(expected, actual) {
    Assert.equal(expected.type, actual.type);
    Assert.equal(expected.port, actual.port);
    Assert.equal(expected.username, actual.username);
    Assert.equal(expected.isSecure, actual.isSecure);
    Assert.equal(expected.hostName, actual.hostName);
    Assert.equal(expected.prettyName, actual.prettyName);
    Assert.equal(expected.authMethod, actual.authMethod);
    Assert.equal(expected.socketType, actual.socketType);
    Assert.equal(expected.doBiff, actual.doBiff);
    Assert.equal(expected.biffMinutes, actual.biffMinutes);

    if (expected.type == "pop3") {
      this._checkPop3IncomingServer(
        expected,
        actual.QueryInterface(Ci.nsIPop3IncomingServer)
      );
    }
  },

  _checkAccount(expected, actual) {
    this._checkIncomingServer(expected.incomingServer, actual.incomingServer);

    Assert.equal(1, actual.identities.length);
    const actualIdentity = actual.identities[0];
    this._checkIdentity(expected.identity, actualIdentity);

    if (expected.incomingServer.type != "nntp") {
      const actualSmtpServer = MailServices.outgoingServer.getServerByKey(
        actualIdentity.smtpServerKey
      );
      this._checkSmtpServer(expected.smtpServer, actualSmtpServer);
    }
  },

  _isLocalMailAccount(account) {
    return (
      account.incomingServer.type == "none" &&
      account.incomingServer.username == "nobody" &&
      account.incomingServer.hostName == "Local Folders"
    );
  },

  _findExpectedAccount(account) {
    return this.mExpected.filter(function (expectedAccount) {
      return (
        expectedAccount.incomingServer.type == account.incomingServer.type &&
        expectedAccount.incomingServer.username ==
          account.incomingServer.username &&
        expectedAccount.incomingServer.hostName ==
          account.incomingServer.hostName
      );
    });
  },

  checkResults() {
    for (const actualAccount of MailServices.accounts.accounts) {
      if (this._isLocalMailAccount(actualAccount)) {
        continue;
      }
      const expectedAccounts = this._findExpectedAccount(actualAccount);
      Assert.notEqual(null, expectedAccounts);
      Assert.equal(1, expectedAccounts.length);
      this._checkAccount(expectedAccounts[0], actualAccount);
    }
  },
};
