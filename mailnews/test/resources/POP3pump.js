/**
 * This routine will allow the easy processing of
 * messages through the fake POP3 server into the local
 * folder. It uses a single global defined as:
 *
 *  gPOP3Pump:        the main access to the routine
 *  gPOP3Pump.run()   function to run to load the messages. Returns promise that
 *                    resolves when done.
 *  gPOP3Pump.files:  (in) an array of message files to load
 *  gPOP3Pump.onDone: function to execute after completion
                      (optional and deprecated)
 *  gPOP3Pump.fakeServer:  (out) the POP3 incoming server
 *  gPOP3Pump.resetPluggableStore(): function to change the pluggable store for the
 *                                   server to the input parameter's store.
 *                                   (in) pluggable store contract ID
 *
 * adapted from test_pop3GetNewMail.js
 *
 * Original Author: Kent James <kent@caspia.com>
 *
 */

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://testing-common/mailnews/localAccountUtils.js");

// Import the pop3 server scripts
Components.utils.import("resource://testing-common/mailnews/maild.js");
Components.utils.import("resource://testing-common/mailnews/auth.js");
Components.utils.import("resource://testing-common/mailnews/pop3d.js");
Components.utils.import("resource://gre/modules/Promise.jsm");

function POP3Pump()
{
  // public attributes
  this.fakeServer = null;
  this.onDone = null;
  this.files = null;

  // local private variables

  this.kPOP3_PORT = 1024 + 110;
  this._server = null;
  this._daemon = null;
  this._incomingServer = null;
  this._pop3Service = null;
  this._firstFile = true;
  this._tests = [];
  this._finalCleanup = false;
  this._expectedResult = Components.results.NS_OK;
  this._actualResult = Components.results.NS_ERROR_UNEXPECTED;
  this._mailboxStoreContractID =
    Services.prefs.getCharPref("mail.serverDefaultStoreContractID");
}

// nsIUrlListener implementation
POP3Pump.prototype.OnStartRunningUrl = function OnStartRunningUrl(url) {};

POP3Pump.prototype.OnStopRunningUrl = function OnStopRunningUrl(aUrl, aResult)
{
  this._actualResult = aResult;
  if (aResult != Components.results.NS_OK)
  {
    // If we have an error, clean up nicely.
    this._server.stop();

    var thread = Services.tm.currentThread;
    while (thread.hasPendingEvents())
      thread.processNextEvent(true);
  }
  do_check_eq(aResult, this._expectedResult);

  // Let OnStopRunningUrl return cleanly before doing anything else.
  do_timeout(0, _checkPumpBusy);
};

// Setup the daemon and server
// If the debugOption is set, then it will be applied to the server.
POP3Pump.prototype._setupServerDaemon = function _setupServerDaemon(aDebugOption)
{
  this._daemon = new pop3Daemon();
  function createHandler(d) {
    return new POP3_RFC1939_handler(d);
  }
  this._server = new nsMailServer(createHandler, this._daemon);
  if (aDebugOption)
    this._server.setDebugLevel(aDebugOption);
  return [this._daemon, this._server];
};

POP3Pump.prototype._createPop3ServerAndLocalFolders =
  function _createPop3ServerAndLocalFolders()
{
  if (typeof localAccountUtils.inboxFolder == 'undefined')
    localAccountUtils.loadLocalMailAccount();

  if (!this.fakeServer)
    this.fakeServer = localAccountUtils.create_incoming_server("pop3", this.kPOP3_PORT,
							       "fred", "wilma");

  return this.fakeServer;
};

POP3Pump.prototype.resetPluggableStore = function(aStoreContractID)
{
  if (aStoreContractID == this._mailboxStoreContractID)
    return;

  Services.prefs.setCharPref("mail.serverDefaultStoreContractID", aStoreContractID);

  // Cleanup existing files, server and account instances, if any.
  if (this._server)
    this._server.stop();

  if (this.fakeServer && this.fakeServer.valid) {
    this.fakeServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(this.fakeServer, false);
  }

  this.fakeServer = null;
  localAccountUtils.clearAll();

  this._incomingServer = this._createPop3ServerAndLocalFolders();
  this._mailboxStoreContractID = aStoreContractID;
};

POP3Pump.prototype._checkBusy = function _checkBusy()
{
  if (this._tests.length == 0 && !this._finalCleanup)
  {
    this._incomingServer.closeCachedConnections();

    // No more tests, let everything finish
    this._server.stop();
    this._finalCleanup = true;
    do_timeout(20, _checkPumpBusy);
    return;
  }

  if (this._finalCleanup)
  {
    if (Services.tm.currentThread.hasPendingEvents())
      do_timeout(20, _checkPumpBusy);
    else
    {
      // exit this module
      do_test_finished();
      if (this.onDone)
        this._promise.then(this.onDone, this.onDone);
      if (this._actualResult == Components.results.NS_OK)
        this._resolve();
      else
        this._reject(this._actualResult);
    }
    return;
  }

  // If the server hasn't quite finished, just delay a little longer.
  if (this._incomingServer.serverBusy ||
      (this._incomingServer instanceof Ci.nsIPop3IncomingServer &&
       this._incomingServer.runningProtocol))
  {
    do_timeout(20, _checkPumpBusy);
    return;
  }

  this._testNext();
};

POP3Pump.prototype._testNext = function _testNext()
{
  let thisFiles = this._tests.shift();
  if (!thisFiles)
    this._checkBusy();  // exit

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try
  {
    if (this._firstFile)
    {
      this._firstFile = false;

      // Start the fake POP3 server
      this._server.start();
      this.kPOP3_PORT = this._server.port;
      if (this.fakeServer)
        this.fakeServer.port = this.kPOP3_PORT;
    }
    else
    {
      this._server.resetTest();
    }

    // Set up the test
    this._daemon.setMessages(thisFiles);

    // Now get the mail, get inbox in case it got un-deferred.
    let inbox = this._incomingServer
                    .rootMsgFolder
                    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
    this._pop3Service.GetNewMail(null, this, inbox,
                                 this._incomingServer);

    this._server.performTest();
  } catch (e)
  {
    this._server.stop();

    do_throw(e);
  }
};

POP3Pump.prototype.run = function run(aExpectedResult)
{
  do_test_pending();
  // Disable new mail notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);

  this._server = this._setupServerDaemon();
  this._daemon = this._server[0];
  this._server = this._server[1];

  this._firstFile = true;
  this._finalCleanup = false;

  if (aExpectedResult)
    this._expectedResult = aExpectedResult;

  // In the default configuration, only a single test is accepted
  // by this routine. But the infrastructure exists to support
  // multiple tests, as this was in the original files. We leave that
  // infrastructure in place, so that if desired this routine could
  // be easily copied and modified to make multiple passes through
  // a POP3 server.

  this._tests[0] = this.files;

  this._pop3Service = MailServices.pop3;
  this._testNext();

  // This probably does not work with multiple tests, but nobody is using that.
  this._promise = new Promise( (resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
  return this._promise;
};

var gPOP3Pump = new POP3Pump();
gPOP3Pump._incomingServer = gPOP3Pump._createPop3ServerAndLocalFolders();

function _checkPumpBusy() { gPOP3Pump._checkBusy(); }
