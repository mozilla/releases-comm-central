/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MessageInjection"];

var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);
var { VirtualFolderHelper } = ChromeUtils.import(
  "resource:///modules/VirtualFolderWrapper.jsm"
);
var { ImapMessage } = ChromeUtils.import(
  "resource://testing-common/mailnews/Imapd.jsm"
);
var { IMAPPump, setupIMAPPump } = ChromeUtils.import(
  "resource://testing-common/mailnews/IMAPpump.jsm"
);

const SEARCH_TERM_MAP_HELPER = {
  subject: Ci.nsMsgSearchAttrib.Subject,
  body: Ci.nsMsgSearchAttrib.Body,
  from: Ci.nsMsgSearchAttrib.Sender,
  to: Ci.nsMsgSearchAttrib.To,
  cc: Ci.nsMsgSearchAttrib.CC,
  recipient: Ci.nsMsgSearchAttrib.ToOrCC,
  involves: Ci.nsMsgSearchAttrib.AllAddresses,
  age: Ci.nsMsgSearchAttrib.AgeInDays,
  tags: Ci.nsMsgSearchAttrib.Keywords,
  // If a test uses a custom search term, they must register that term
  //  with the id "mailnews@mozilla.org#test"
  custom: Ci.nsMsgSearchAttrib.Custom,
};

/**
 * Handling for Messages in Folders. Usage of either `local` or `imap`.
 *
 * Beware:
 * Currently only one active instance of MessageInjection is supported due
 * to a dependency on retrieving an account in the constructor.
 */
class MessageInjection {
  /**
   * MessageInjectionSetup
   */
  _mis = {
    _nextUniqueFolderId: 0,

    injectionConfig: {
      mode: "none",
    },
    listeners: [],
    notifyListeners(handlerName, args) {
      for (const listener of this.listeners) {
        if (handlerName in listener) {
          listener[handlerName].apply(listener, args);
        }
      }
    },

    /**
     * The nsIMsgIncomingServer
     */
    incomingServer: null,

    /**
     * The incoming server's (synthetic) root message folder.
     */
    rootFolder: null,

    /**
     * The nsIMsgFolder that is the inbox.
     */
    inboxFolder: null,

    /**
     * Fakeserver daemon, if applicable.
     */
    daemon: null,
    /**
     * Fakeserver server instance, if applicable.
     */
    server: null,
  };
  /**
   * Creates an environment for tests.
   * Usage either with "local" or "imap".
   * An Inbox folder is created. Retrieve it via `getInboxFolder`
   *
   * IMAP:
   *  Starts an IMAP Server for you
   *
   * @param {object} injectionConfig
   * @param {"local"|"imap"} injectionConfig.mode mode One of "local", "imap".
   * @param {boolean} [injectionConfig.offline] Should the folder be marked offline (and
   *     fully downloaded)?  Only relevant for IMAP.
   * @param {MessageGenerator} [msgGen] The MessageGenerator which generates the new
   *     SyntheticMessages. We do not create our own because we would lose track of
   *     messages created from another MessageGenerator.
   *     It's optional as it is used only for a subset of methods.
   */
  constructor(injectionConfig, msgGen) {
    // Set the injection Mode.
    this._mis.injectionConfig = injectionConfig;

    // Disable new mail notifications.
    Services.prefs.setBoolPref("mail.biff.play_sound", false);
    Services.prefs.setBoolPref("mail.biff.show_alert", false);
    Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
    Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);

    // Set msgGen if given.
    if (msgGen) {
      this.msgGen = msgGen;
    }

    // we need to pull in the notification service so we get events?
    MailServices.mfn;

    if (this._mis.injectionConfig.mode == "local") {
      // This does createIncomingServer() and createAccount(), sets the server as
      //  the account's server, then sets the server.
      try {
        MailServices.accounts.createLocalMailAccount();
      } catch (ex) {
        // This will fail if someone already called this.  Like in the mozmill
        //  case.
      }

      const localAccount = MailServices.accounts.findAccountForServer(
        MailServices.accounts.localFoldersServer
      );

      // We need an identity or we get angry warnings.
      const identity = MailServices.accounts.createIdentity();
      // We need an email to protect against random code assuming it exists and
      // throwing exceptions.
      identity.email = "sender@nul.invalid";
      localAccount.addIdentity(identity);
      localAccount.defaultIdentity = identity;

      this._mis.incomingServer = MailServices.accounts.localFoldersServer;
      // Note: Inbox is not created automatically when there is no deferred server,
      // so we need to create it.
      this._mis.rootFolder = this._mis.incomingServer.rootMsgFolder;
      this._mis.rootFolder.createSubfolder("Inbox", null);
      this._mis.inboxFolder = this._mis.rootFolder.getChildNamed("Inbox");
      // a local inbox should have a Mail flag!
      this._mis.inboxFolder.setFlag(Ci.nsMsgFolderFlags.Mail);
      this._mis.inboxFolder.setFlag(Ci.nsMsgFolderFlags.Inbox);
      this._mis.notifyListeners("onRealFolderCreated", [this._mis.inboxFolder]);

      // Force an initialization of the Inbox folder database.
      this._mis.inboxFolder.prettyName;
    } else if (this._mis.injectionConfig.mode == "imap") {
      // Disable autosync in favor of our explicitly forcing downloads of all
      //  messages in a folder.  This is being done speculatively because when we
      //  didn't do this we got tripped up by the semaphore being in use and
      //  concern over inability to hang a listener off of the completion of the
      //  download.  (Although I'm sure there are various ways we could do it.)
      Services.prefs.setBoolPref(
        "mail.server.default.autosync_offline_stores",
        false
      );
      // Set the offline property based on the configured setting.  This will
      //  affect newly created folders.
      Services.prefs.setBoolPref(
        "mail.server.default.offline_download",
        this._mis.injectionConfig.offline
      );

      // set up IMAP fakeserver and incoming server
      setupIMAPPump("");
      this._mis.daemon = IMAPPump.daemon;
      this._mis.server = IMAPPump.server;
      this._mis.incomingServer = IMAPPump.incomingServer;
      // this.#mis.server._debug = 3;

      // do not log transactions; it's just a memory leak to us
      this._mis.server._logTransactions = false;

      // We need an identity so that updateFolder doesn't fail
      const localAccount = MailServices.accounts.defaultAccount;
      // We need an email to protect against random code assuming it exists and
      // throwing exceptions.
      const identity = localAccount.defaultIdentity;
      identity.email = "sender@nul.invalid";

      // The server doesn't support more than one connection
      Services.prefs.setIntPref(
        "mail.server.server1.max_cached_connections",
        1
      );
      // We aren't interested in downloading messages automatically
      Services.prefs.setBoolPref("mail.server.server1.download_on_biff", false);

      this._mis.rootFolder = this._mis.incomingServer.rootMsgFolder;

      this._mis.inboxFolder = this._mis.rootFolder.getChildNamed("Inbox");
      // make sure the inbox's offline state is correct. (may be excessive now
      //  that we set the pref above?)
      if (this._mis.injectionConfig.offline) {
        this._mis.inboxFolder.setFlag(Ci.nsMsgFolderFlags.Offline);
      } else {
        this._mis.inboxFolder.clearFlag(Ci.nsMsgFolderFlags.Offline);
      }
      this._mis.notifyListeners("onRealFolderCreated", [this._mis.inboxFolder]);

      this._mis.handleUriToRealFolder = {};
      this._mis.handleUriToFakeFolder = {};
      this._mis.realUriToFakeFolder = {};
      this._mis.realUriToFakeFolder[this._mis.inboxFolder.URI] =
        this._mis.daemon.getMailbox("INBOX");
    } else {
      throw new Error(
        "Illegal injection config option: " + this._mis.injectionConfig.mode
      );
    }

    this._mis.junkHandle = null;
    this._mis.junkFolder = null;

    this._mis.trashHandle = null;
    this._mis.trashFolder = null;
  }

  /**
   * @returns {nsIMsgFolder}
   */
  getInboxFolder() {
    return this._mis.inboxFolder;
  }
  /**
   * @returns {boolean}
   */
  messageInjectionIsLocal() {
    return this._mis.injectionConfig.mode == "local";
  }
  /**
   * Call this method to finish the use of MessageInjection.
   *  Stops the IMAP server (if used) and stops internal functions.
   */
  teardownMessageInjection() {
    if (this._mis.injectionConfig.mode == "imap") {
      this._mis.incomingServer.closeCachedConnections();

      // No more tests, let everything finish.
      // (This spins its own event loop...)
      this._mis.server.stop();
    }

    // Clean out this.#mis; we don't just null the global because it's conceivable we
    //  might still have some closures floating about.
    for (const key in this._mis) {
      delete this._mis[key];
    }
  }
  /**
   * Register a listener to be notified when interesting things happen involving
   *  calls made to the message injection API.
   *
   * @param {object} listener
   * @param {Function} listener.onVirtualFolderCreated Called when a virtual
   *   folder is created using |makeVirtualFolder|. Takes a nsIMsgFolder
   *   that defines the virtual folder as argument.
   */
  registerMessageInjectionListener(listener) {
    this._mis.listeners.push(listener);
  }
  /**
   * Create and return an empty folder.  If you want to delete this folder
   *  you must call |deleteFolder| to kill it!  If you want to rename it, you
   *  must implement a method called renameFolder and then call it.
   *
   * @param {string} [folderName] A folder name with no support for hierarchy at this
   *     time.  A name of the form "gabba#" will be autogenerated if you do not
   *     provide one.
   * @param {nsMsgFolderFlags[]} [specialFlags] A list of nsMsgFolderFlags bits to set.
   * @returns {nsIMsgFolder|string} In local mode a nsIMsgFolder is returned.
   *     In imap mode a folder URI is returned.
   */
  async makeEmptyFolder(folderName, specialFlags) {
    if (folderName == null) {
      folderName = "gabba" + this._mis._nextUniqueFolderId++;
    }
    let testFolder;

    if (this._mis.injectionConfig.mode == "local") {
      const localRoot = this._mis.rootFolder.QueryInterface(
        Ci.nsIMsgLocalMailFolder
      );
      testFolder = localRoot.createLocalSubfolder(folderName);
      // it seems dumb that we have to set this.
      testFolder.setFlag(Ci.nsMsgFolderFlags.Mail);
      if (specialFlags) {
        for (const flag of specialFlags) {
          testFolder.setFlag(flag);
        }
      }
      this._mis.notifyListeners("onRealFolderCreated", [testFolder]);
    } else if (this._mis.injectionConfig.mode == "imap") {
      // Circumvent this scoping.
      const mis = this._mis;
      const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener({
        OnStopRunningUrl: (url, exitCode) => {
          // get the newly created nsIMsgFolder folder
          const msgFolder = mis.rootFolder.getChildNamed(folderName);

          // XXX there is a bug that causes folders to be reported as ImapPublic
          //  when there is no namespace support by the IMAP server.  This is
          //  a temporary workaround.
          msgFolder.clearFlag(Ci.nsMsgFolderFlags.ImapPublic);
          msgFolder.setFlag(Ci.nsMsgFolderFlags.ImapPersonal);

          if (specialFlags) {
            for (const flag of specialFlags) {
              msgFolder.setFlag(flag);
            }
          }

          // get a reference to the fake server folder
          const fakeFolder = this._mis.daemon.getMailbox(folderName);
          // establish the mapping
          mis.handleUriToRealFolder[testFolder] = msgFolder;
          mis.handleUriToFakeFolder[testFolder] = fakeFolder;
          mis.realUriToFakeFolder[msgFolder.URI] = fakeFolder;

          // notify listeners
          mis.notifyListeners("onRealFolderCreated", [msgFolder]);
        },
      });

      testFolder = this._mis.rootFolder.URI + "/" + folderName;

      // Tell the IMAP service to create the folder, adding a listener that
      //  hooks up the 'handle' URI -> actual folder mapping.
      MailServices.imap.createFolder(
        this._mis.rootFolder,
        folderName,
        promiseUrlListener
      );
      await promiseUrlListener.promise;
    }

    return testFolder;
  }
  /**
   * Small helper for moving folder.
   *
   * @param {nsIMsgFolder} source
   * @param {nsIMsgFolder} target
   */
  static async moveFolder(source, target) {
    // we're doing a true move
    await new Promise((resolve, reject) => {
      MailServices.copy.copyFolder(
        MessageInjection.get_nsIMsgFolder(source),
        MessageInjection.get_nsIMsgFolder(target),
        true,
        {
          /* nsIMsgCopyServiceListener implementation */
          OnStartCopy() {},
          OnProgress(progress, progressMax) {},
          SetMessageKey(key) {},
          SetMessageId(messageId) {},
          OnStopCopy(status) {
            if (Components.isSuccessCode(status)) {
              resolve();
            } else {
              reject();
            }
          },
        },
        null
      );
    });
  }
  /**
   *
   * Get/create the junk folder handle.  Use getRealInjectionFolder if you
   *  need the underlying nsIFolder.
   *
   * @returns {nsIMsgFolder}
   */
  async getJunkFolder() {
    if (!this._mis.junkHandle) {
      this._mis.junkHandle = await this.makeEmptyFolder("Junk", [
        Ci.nsMsgFolderFlags.Junk,
      ]);
    }

    return this._mis.junkHandle;
  }
  /**
   * Get/create the trash folder handle.  Use getRealInjectionFolder if you
   *  need the underlying nsIMsgFolder.
   *
   * @returns {nsIMsgFolder|string}
   */
  async getTrashFolder() {
    if (!this._mis.trashHandle) {
      // the folder may have been created and already known...
      this._mis.trashFolder = this._mis.rootFolder.getFolderWithFlags(
        Ci.nsMsgFolderFlags.Trash
      );
      if (this._mis.trashFolder) {
        this._mis.trashHandle = this._mis.rootFolder.URI + "/Trash";
        const fakeFolder = this._mis.daemon.getMailbox("Trash");
        this._mis.handleUriToRealFolder[this._mis.trashHandle] =
          this._mis.trashFolder;
        this._mis.handleUriToFakeFolder[this._mis.trashHandle] = fakeFolder;
        this._mis.realUriToFakeFolder[this._mis.trashFolder.URI] = fakeFolder;
      } else {
        this._mis.trashHandle = await this.makeEmptyFolder("Trash", [
          Ci.nsMsgFolderFlags.Trash,
        ]);
      }
    }

    return this._mis.trashHandle;
  }
  /**
   * Create and return a virtual folder.
   *
   * @param {nsIMsgFolder[]} folders The real folders this virtual folder should draw from.
   * @param {SEARCH_TERM_MAP_HELPER} searchDef The search definition to use
   *     to build the list of search terms that populate this virtual folder.
   *     Keys should be stuff from SEARCH_TERM_MAP_HELPER and values should be
   *     strings to search for within those attribute things.
   * @param {boolean} [booleanAnd] Should the search terms be and-ed together.
   *     Defaults to false.
   * @param {string} [folderName] Name to use.
   * @returns {nsIMsgFolder|string} In local usage returns a nsIMsgFolder
   *     in imap usage returns a Folder URI.
   */
  makeVirtualFolder(folders, searchDef, booleanAnd, folderName) {
    const name = folderName
      ? folderName
      : "virt" + this._mis._nextUniqueFolderId++;

    const terms = [];
    const termCreator = Cc[
      "@mozilla.org/messenger/searchSession;1"
    ].createInstance(Ci.nsIMsgSearchSession);
    for (const key in searchDef) {
      const val = searchDef[key];
      const term = termCreator.createTerm();
      const value = term.value;
      value.str = val;
      term.value = value;
      term.attrib = SEARCH_TERM_MAP_HELPER[key];
      if (term.attrib == Ci.nsMsgSearchAttrib.Custom) {
        term.customId = "mailnews@mozilla.org#test";
      }
      term.op = Ci.nsMsgSearchOp.Contains;
      term.booleanAnd = Boolean(booleanAnd);
      terms.push(term);
    }
    // create an ALL case if we didn't add any terms
    if (terms.length == 0) {
      const term = termCreator.createTerm();
      term.matchAll = true;
      terms.push(term);
    }

    const wrapped = VirtualFolderHelper.createNewVirtualFolder(
      name,
      this._mis.rootFolder,
      folders,
      terms,
      /* online */ false
    );
    this._mis.notifyListeners("onVirtualFolderCreated", [
      wrapped.virtualFolder,
    ]);
    return wrapped.virtualFolder;
  }
  /**
   * Mark the folder as offline and force all of its messages to be downloaded.
   *  This is an asynchronous operation that will call resolve once the
   *  download is completed.
   *
   * @param {string} folderHandle Folder URI.
   */
  async makeFolderAndContentsOffline(folderHandle) {
    if (this._mis.injectionConfig.mode != "imap") {
      return;
    }

    const msgFolder = this.getRealInjectionFolder(folderHandle);
    msgFolder.setFlag(Ci.nsMsgFolderFlags.Offline);
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    msgFolder.downloadAllForOffline(promiseUrlListener, null);
    await promiseUrlListener.promise;
  }

  /**
   * Create multiple new local folders, populating them with messages according to
   *  the set definitions provided.  Differs from makeFolderWithSets by taking
   *  the number of folders to create and return the list of created folders as
   *  the first element in the returned list.  This method is simple enough that
   *  the limited code duplication is deemed acceptable in support of readability.
   *
   * @param {number} folderCount
   * @param {MakeMessageOptions[]} synSetDefs A synthetic set
   *     definition, as appropriate to pass to makeNewSetsInFolders.
   * @returns {Promise<object[]>} A Promise with a list whose first element are
   *   the nsIMsgFolders created and whose subsequent items are the
   *   SyntheticMessageSets used to populate the folder (as returned by
   *   makeNewSetsInFolders). So nsIMsgFolder[], ...SyntheticMessageSet.
   *
   *  Please note that the folders are either nsIMsgFolder, or folder
   *     URIs, depending on whether we're in local injection mode, or on IMAP. This
   *     should be transparent to you, unless you start trying to inject messages
   *     into a folder that hasn't been created by makeFoldersWithSets. See
   *     test_folder_deletion_nested in base_index_messages.js for an example of
   *     such pain.
   */
  async makeFoldersWithSets(folderCount, synSetDefs) {
    const msgFolders = [];
    for (let i = 0; i < folderCount; i++) {
      msgFolders.push(await this.makeEmptyFolder());
    }
    let results = await this.makeNewSetsInFolders(msgFolders, synSetDefs);
    // results may be referenced by addSetsToFolders in an async fashion, so
    //  don't change it.
    results = results.concat();
    results.unshift(msgFolders);
    return results;
  }
  /**
   * Given one or more existing folders, create new message sets and
   *   add them to the folders using.
   *
   * @param {nsIMsgFolder[]} msgFolders A list of nsIMsgFolder.
   *     The synthetic messages will be added to the folder(s).
   * @param {MakeMessageOptions[]} synSetDefs A list of set definition objects as
   *     defined by MessageGenerator.makeMessages.
   * @param {boolean} [doNotForceUpdate=false] By default we force an updateFolder on IMAP
   *     folders to ensure Thunderbird knows about the newly injected messages.
   *     If you are testing Thunderbird's use of updateFolder itself, you will
   *     not want this and so will want to pass true for this argument.
   * @returns {SyntheticMessageSet[]} A Promise with a list of SyntheticMessageSet objects,
   *     each corresponding to the entry in synSetDefs (or implied if an integer was passed).
   */
  async makeNewSetsInFolders(msgFolders, synSetDefs, doNotForceUpdate) {
    // - create the synthetic message sets
    const messageSets = [];
    for (const synSetDef of synSetDefs) {
      // Using the getter of the MessageGenerator for error handling.
      const messages = this.messageGenerator.makeMessages(synSetDef);
      messageSets.push(new SyntheticMessageSet(messages));
    }

    // - add the messages to the folders (interleaving them)
    await this.addSetsToFolders(msgFolders, messageSets, doNotForceUpdate);

    return messageSets;
  }
  /**
   * Spreads the messages in messageSets across the folders in msgFolders.  Each
   *  message set is spread in a round-robin fashion across all folders.  At the
   *  same time, each message-sets insertion is interleaved with the other message
   *  sets.  This distributes message across multiple folders for useful
   *  cross-folder threading testing (via the round robin) while also hopefully
   *  avoiding making things pathologically easy for the code under test (by way
   *  of the interleaving.)
   *
   * For example, given the following 2 input message sets:
   *  message set 'lower': [a b c d e f]
   *  message set 'upper': [A B C D E F G H]
   *
   * across 2 folders:
   *  folder 1: [a A c C e E G]
   *  folder 2: [b B d D f F H]
   * across 3 folders:
   *  folder 1: [a A d D G]
   *  folder 2: [b B e E H]
   *  folder 3: [c C f F]
   *
   * @param {nsIMsgFolder[]} msgFolders
   *     An nsIMsgFolder to add the message sets to or a list of them.
   * @param {SyntheticMessageSet[]} messageSets A list of SyntheticMessageSets.
   * @param {boolean} [doNotForceUpdate=false] By default we force an updateFolder on IMAP
   *     folders to ensure Thunderbird knows about the newly injected messages.
   *     If you are testing Thunderbird's use of updateFolder itself, you will
   *     not want this and so will want to pass true for this argument.
   */
  async addSetsToFolders(msgFolders, messageSets, doNotForceUpdate) {
    let iterFolders;

    this._mis.notifyListeners("onInjectingMessages", []);

    // -- Pre-loop
    if (this._mis.injectionConfig.mode == "local") {
      for (const folder of msgFolders) {
        if (!(folder instanceof Ci.nsIMsgLocalMailFolder)) {
          throw new Error("All folders in msgFolders must be local folders!");
        }
      }
    } else if (this._mis.injectionConfig.mode == "imap") {
      // no protection is possible because of our dependency on promises,
      //  although we could check that the fake URL is one we handed out.
    } else {
      throw new Error("Message injection is not configured!");
    }

    if (this._mis.injectionConfig.mode == "local") {
      // Note: in order to cut down on excessive fsync()s, we do a two-pass
      //  approach.  In the first pass we just allocate messages to the folder
      //  we are going to insert them into.  In the second pass we insert the
      //  messages into folders in batches and perform any mutations.
      const folderBatches = msgFolders.map(folder => {
        return { folder, messages: [] };
      });
      iterFolders = this._looperator([...folderBatches.keys()]);
      let iPerSet = 0,
        folderNext = iterFolders.next();

      // - allocate messages to folders
      // loop, incrementing our subscript until all message sets are out of messages
      let didSomething;
      do {
        didSomething = false;
        // for each message set, if it is not out of messages, add the message
        for (const messageSet of messageSets) {
          if (iPerSet < messageSet.synMessages.length) {
            const synMsg = messageSet._trackMessageAddition(
              folderBatches[folderNext.value].folder,
              iPerSet
            );
            folderBatches[folderNext.value].messages.push({
              messageSet,
              synMsg,
              index: iPerSet,
            });
            didSomething = true;
          }
        }
        iPerSet++;
        folderNext = iterFolders.next();
      } while (didSomething);

      // - inject messages
      for (const folderBatch of folderBatches) {
        // it is conceivable some folders might not get any messages, skip them.
        if (!folderBatch.messages.length) {
          continue;
        }

        const folder = folderBatch.folder;
        folder.gettingNewMessages = true;
        const messageStrings = folderBatch.messages.map(message =>
          message.synMsg.toMboxString()
        );
        folder.addMessageBatch(messageStrings);

        for (const message of folderBatch.messages) {
          const synMsgState = message.synMsg.metaState;
          // If we need to mark the message as junk grab the header and do so.
          if (synMsgState.junk) {
            message.messageSet.setJunk(
              true,
              message.messageSet.getMsgHdr(message.index)
            );
          }
          if (synMsgState.read) {
            // XXX this will generate an event; I'm not sure if we should be
            //  trying to avoid that or not.  This case is really only added
            //  for IMAP where this makes more sense.
            message.messageSet.setRead(
              true,
              message.messageSet.getMsgHdr(message.index)
            );
          }
        }
        if (folderBatch.messages.length) {
          const lastMRUTime = Math.floor(
            Number(folderBatch.messages[0].synMsg.date) / 1000
          );
          folder.setStringProperty("MRUTime", lastMRUTime);
        }
        folder.gettingNewMessages = false;
        folder.hasNewMessages = true;
        folder.setNumNewMessages(
          folder.getNumNewMessages(false) + messageStrings.length
        );
        folder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NewMail;
      }

      // make sure that junk filtering gets a turn
      // XXX we probably need to be doing more in terms of filters here,
      //  although since filters really want to be run on the inbox, there
      //  are separate potential semantic issues involved.
      for (const folder of msgFolders) {
        folder.callFilterPlugins(null);
      }
    } else if (this._mis.injectionConfig.mode == "imap") {
      iterFolders = this._looperator(msgFolders);
      // we need to call updateFolder on all the folders, not just the first
      //  one...
      let iPerSet = 0,
        folder = iterFolders.next();
      let didSomething;
      do {
        didSomething = false;
        for (const messageSet of messageSets) {
          if (iPerSet < messageSet.synMessages.length) {
            didSomething = true;

            const realFolder = this._mis.handleUriToRealFolder[folder.value];
            const fakeFolder = this._mis.handleUriToFakeFolder[folder.value];
            const synMsg = messageSet._trackMessageAddition(
              realFolder,
              iPerSet
            );
            const msgURI = Services.io.newURI(
              "data:text/plain;base64," + btoa(synMsg.toMessageString())
            );
            const imapMsg = new ImapMessage(
              msgURI.spec,
              fakeFolder.uidnext++,
              []
            );
            // If the message's meta-state indicates it is junk, set that flag.
            // There is also a NotJunk flag, but we're not playing with that
            //  right now; as long as nothing is ever marked as junk, the junk
            //  classifier won't run, so it's moot for now.
            if (synMsg.metaState.junk) {
              imapMsg.setFlag("Junk");
            }
            if (synMsg.metaState.read) {
              imapMsg.setFlag("\\Seen");
            }
            fakeFolder.addMessage(imapMsg);
          }
        }
        iPerSet++;
        folder = iterFolders.next();
      } while (didSomething);

      // We have nothing more to do if we aren't support to force the update.
      if (doNotForceUpdate) {
        return;
      }

      for (let iFolder = 0; iFolder < msgFolders.length; iFolder++) {
        const realFolder = this._mis.handleUriToRealFolder[msgFolders[iFolder]];
        await new Promise(resolve => {
          mailTestUtils.updateFolderAndNotify(realFolder, resolve);
        });

        // compel download of the messages if appropriate
        if (realFolder.flags & Ci.nsMsgFolderFlags.Offline) {
          const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
          realFolder.downloadAllForOffline(promiseUrlListener, null);
          await promiseUrlListener.promise;
        }
      }
    }
  }
  /**
   * Return the nsIMsgFolder associated with a folder handle.  If the folder has
   *  been created since the last injection and you are using IMAP, you may need
   *  to first resolve the Promises for us to be able to provide
   *  you with a result.
   *
   * @param {nsIMsgFolder|string} folderHandle nsIMsgFolder or folder URI.
   * @returns {nsIMsgFolder}
   */
  getRealInjectionFolder(folderHandle) {
    if (this._mis.injectionConfig.mode == "imap") {
      return this._mis.handleUriToRealFolder[folderHandle];
    }
    return folderHandle;
  }
  /**
   * Move messages in the given set to the destination folder.
   *
   * For IMAP moves we force an update of the source folder and then the
   *  destination folder.  This ensures that any (pseudo-)offline operations in
   *  the source folder have had a chance to run and that we have seen the changes
   *  in the target folder.
   * We additionally cause all of the message bodies to be downloaded in the
   *  target folder if the folder has the Offline flag set.
   *
   * @param {SyntheticMessageSet} synMessageSet The messages to move.
   * @param {nsIMsgFolder|string} destFolder The target folder or target folder URI.
   * @param {boolean} [allowUndo=false] Should we generate undo operations and, as a
   *     side-effect, offline operations?  (The code uses undo operations as
   *     a proxy-indicator for it coming from the UI and therefore performing
   *     pseudo-offline operations instead of trying to do things online.)
   */
  async moveMessages(synMessageSet, destFolder, allowUndo) {
    const realDestFolder = this.getRealInjectionFolder(destFolder);

    for (const [folder, msgs] of synMessageSet.foldersWithMsgHdrs) {
      // In the IMAP case tell listeners we are moving messages without
      //  destination headers.
      if (!this.messageInjectionIsLocal()) {
        this._mis.notifyListeners("onMovingMessagesWithoutDestHeaders", [
          realDestFolder,
        ]);
      }
      const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
      MailServices.copy.copyMessages(
        folder,
        msgs,
        realDestFolder,
        /* move */ true,
        promiseCopyListener,
        null,
        Boolean(allowUndo)
      );
      await promiseCopyListener.promise;
      // update the synthetic message set's folder entry...
      synMessageSet._folderSwap(folder, realDestFolder);

      // IMAP special case per function doc...
      if (!this.messageInjectionIsLocal()) {
        // update the source folder to force it to issue the move
        await new Promise(resolve => {
          mailTestUtils.updateFolderAndNotify(folder, resolve);
        });

        // update the dest folder to see the new header.
        await new Promise(resolve => {
          mailTestUtils.updateFolderAndNotify(realDestFolder, resolve);
        });

        // compel download of messages in dest folder if appropriate
        if (realDestFolder.flags & Ci.nsMsgFolderFlags.Offline) {
          const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
          realDestFolder.downloadAllForOffline(promiseUrlListener, null);
          await promiseUrlListener.promise;
        }
      }
    }
  }
  /**
   * Move the messages to the trash; do not use this on messages that are already
   *  in the trash, we are not clever enough for that.
   *
   * @param {SyntheticMessageSet} synMessageSet The set of messages to trash.
   *     The messages do not all have to be in the same folder,
   *     but we have to trash them folder by folder if they are not.
   */
  async trashMessages(synMessageSet) {
    for (const [folder, msgs] of synMessageSet.foldersWithMsgHdrs) {
      // In the IMAP case tell listeners we are moving messages without
      //  destination headers, since that's what trashing amounts to.
      if (!this.messageInjectionIsLocal()) {
        this._mis.notifyListeners("onMovingMessagesWithoutDestHeaders", []);
      }
      const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
      folder.deleteMessages(
        msgs,
        null,
        false,
        true,
        promiseCopyListener,
        /* do not allow undo, currently leaks */ false
      );
      await promiseCopyListener.promise;

      // just like the move case we need to force updateFolder calls for IMAP
      if (!this.messageInjectionIsLocal()) {
        // update the source folder to force it to issue the move
        await new Promise(resolve => {
          mailTestUtils.updateFolderAndNotify(folder, resolve);
        });

        // trash folder may not have existed at startup but the deletion
        //  will have created it.
        const trashFolder = this.getRealInjectionFolder(
          await this.getTrashFolder()
        );

        // update the dest folder to see the new header.
        await new Promise(resolve => {
          mailTestUtils.updateFolderAndNotify(trashFolder, resolve);
        });

        // compel download of messages in dest folder if appropriate
        if (trashFolder.flags & Ci.nsMsgFolderFlags.Offline) {
          const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
          trashFolder.downloadAllForOffline(promiseUrlListener, null);
          await promiseUrlListener.promise;
        }
      }
    }
  }
  /**
   * Delete all of the messages in a SyntheticMessageSet like the user performed a
   *  shift-delete (or if the messages were already in the trash).
   *
   * @param {SyntheticMessageSet} synMessageSet The set of messages to delete.
   *     The messages do not all have to be in the same folder, but we have to
   *     delete them folder by folder if they are not.
   */
  static async deleteMessages(synMessageSet) {
    for (const [folder, msgs] of synMessageSet.foldersWithMsgHdrs) {
      const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
      folder.deleteMessages(
        msgs,
        null,
        /* delete storage */ true,
        /* is move? */ false,
        promiseCopyListener,
        /* do not allow undo, currently leaks */ false
      );
      await promiseCopyListener.promise;
    }
  }
  /**
   * Empty the trash.
   */
  async emptyTrash() {
    const trashHandle = await this.getTrashFolder();
    const trashFolder = this.getRealInjectionFolder(trashHandle);
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    trashFolder.emptyTrash(promiseUrlListener);
    await promiseUrlListener.promise;
  }
  /**
   * Delete the given folder, removing the storage.  We do not move it to the
   *  trash.
   */
  deleteFolder(folder) {
    const realFolder = this.getRealInjectionFolder(folder);
    realFolder.parent.propagateDelete(realFolder, true);
  }

  /**
   * @param {nsIMsgFolder} folder
   * @returns {nsIMsgFolder}
   */
  static get_nsIMsgFolder(folder) {
    if (!(folder instanceof Ci.nsIMsgFolder)) {
      return MailUtils.getOrCreateFolder(folder);
    }
    return folder;
  }
  /**
   * An iterator that generates an infinite sequence of its argument.  So
   *  _looperator(1, 2, 3) will generate the iteration stream: [1, 2, 3, 1, 2, 3,
   *  1, 2, 3, ...].
   */
  *_looperator(list) {
    if (list.length == 0) {
      throw new Error("list must have at least one item!");
    }

    let i = 0;
    const length = list.length;
    while (true) {
      yield list[i];
      i = (i + 1) % length;
    }
  }

  get messageGenerator() {
    if (this.msgGen === undefined) {
      throw new Error(
        "MessageInjection.jsm needs a MessageGenerator for new messages. " +
          "The MessageGenerator helps you with threaded messages. If you use " +
          "two different MessageGenerators the behaviour with threads are complicated."
      );
    }
    return this.msgGen;
  }
  /**
   * @param {MessageGenerator} msgGen The MessageGenerator which generates the new
   *     SyntheticMessages. We do not create our own because we would lose track of
   *     messages created from another MessageGenerator.
   */
  set messageGenerator(msgGen) {
    this.msgGen = msgGen;
  }
}
