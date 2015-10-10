/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [];

var {classes: Cc, interfaces: Ci, utils: Cu, Constructor: CC} = Components;

Cu.import("resource:///modules/gloda/public.js");
Cu.import("resource:///modules/gloda/datamodel.js");
Cu.import("resource:///modules/gloda/indexer.js");
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/iteratorUtils.jsm");
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Task", "resource://gre/modules/Task.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "AsyncShutdown",
                                  "resource://gre/modules/AsyncShutdown.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "GlodaDatastore",
                                  "resource:///modules/gloda/datastore.js");

var kCacheFileName = "indexedFiles.json";

var FileInputStream = CC("@mozilla.org/network/file-input-stream;1",
                           "nsIFileInputStream",
                           "init");
var ScriptableInputStream = CC("@mozilla.org/scriptableinputstream;1",
                                 "nsIScriptableInputStream",
                                 "init");

// kIndexingDelay is how long we wait from the point of scheduling an indexing
// job to actually carrying it out.
var kIndexingDelay = 5000; // in milliseconds

XPCOMUtils.defineLazyGetter(this, "MailFolder", () =>
  Cc["@mozilla.org/rdf/resource-factory;1?name=mailbox"].createInstance(Ci.nsIMsgFolder)
);

var gIMAccounts = {};

function GlodaIMConversation(aTitle, aTime, aPath, aContent)
{
  // grokNounItem from gloda.js puts automatically the values of all
  // JS properties in the jsonAttributes magic attribute, except if
  // they start with _, so we put the values in _-prefixed properties,
  // and have getters in the prototype.
  this._title = aTitle;
  this._time = aTime;
  this._path = aPath;
  this._content = aContent;
}
GlodaIMConversation.prototype = {
  get title() { return this._title; },
  get time() { return this._time; },
  get path() { return this._path; },
  get content() { return this._content; },

  // for glodaFacetBindings.xml compatibility (pretend we are a message object)
  get account() {
    let [protocol, username] = this._path.split("/", 2);

    let cacheName = protocol + "/" + username;
    if (cacheName in gIMAccounts)
      return gIMAccounts[cacheName];

    // Find the nsIIncomingServer for the current imIAccount.
    let mgr = MailServices.accounts;
    for (let account in fixIterator(mgr.accounts, Ci.nsIMsgAccount)) {
      let incomingServer = account.incomingServer;
      if (!incomingServer || incomingServer.type != "im")
        continue;
      let imAccount = incomingServer.wrappedJSObject.imAccount;
      if (imAccount.protocol.normalizedName == protocol &&
          imAccount.normalizedName == username)
        return (gIMAccounts[cacheName] = new GlodaAccount(incomingServer));
    }
    // The IM conversation is probably for an account that no longer exists.
    return null;
  },
  get subject() { return this._title; },
  get date() { return new Date(this._time * 1000); },
  get involves() { return Gloda.IGNORE_FACET; },
  _recipients: null,
  get recipients() {
    if (!this._recipients)
      this._recipients = [{contact: {name: this._path.split("/", 2)[1]}}];
    return this._recipients;
  },
  _from: null,
  get from() {
    if (!this._from) {
      let from = "";
      let account = this.account;
      if (account)
        from = account.incomingServer.wrappedJSObject.imAccount.protocol.name;
      this._from = {value: "", contact: {name: from}};
    }
    return this._from;
  },
  get tags() { return []; },
  get starred() { return false; },
  get attachmentNames() { return null; },
  get indexedBodyText() { return this._content; },
  get read() { return true; },
  get folder() { return Gloda.IGNORE_FACET; },

  // for glodaFacetView.js _removeDupes
  get headerMessageID() { return this.id; }
};

// FIXME
var WidgetProvider = {
  providerName: "widget",
  process: function () {
    //XXX What is this supposed to do?
    yield Gloda.kWorkDone;
  }
};

var IMConversationNoun = {
  name: "im-conversation",
  clazz: GlodaIMConversation,
  allowsArbitraryAttrs: true,
  tableName: "imConversations",
  schema: {
    columns: [['id', 'INTEGER PRIMARY KEY'],
              ['title', 'STRING'],
              ['time', 'NUMBER'],
              ['path', 'STRING']
             ],
    fulltextColumns: [['content', 'STRING']]
  }
};
Gloda.defineNoun(IMConversationNoun);

// Needs to be set after calling defineNoun, otherwise it's replaced
// by databind.js' implementation.
IMConversationNoun.objFromRow = function(aRow) {
  // Row columns are:
  // 0 id
  // 1 title
  // 2 time
  // 3 path
  // 4 jsonAttributes
  // 5 content
  // 6 offsets
  let conv = new GlodaIMConversation(aRow.getString(1), aRow.getInt64(2),
                                     aRow.getString(3), aRow.getString(5));
  conv.id = aRow.getInt64(0); // handleResult will keep only our first result
                              // if the id property isn't set.
  return conv;
};

var EXT_NAME = "im";

// --- special (on-row) attributes
Gloda.defineAttribute({
  provider: WidgetProvider, extensionName: EXT_NAME,
  attributeType: Gloda.kAttrFundamental,
  attributeName: "time",
  singular: true,
  special: Gloda.kSpecialColumn,
  specialColumnName: "time",
  subjectNouns: [IMConversationNoun.id],
  objectNoun: Gloda.NOUN_NUMBER,
  canQuery: true
});
Gloda.defineAttribute({
  provider: WidgetProvider, extensionName: EXT_NAME,
  attributeType: Gloda.kAttrFundamental,
  attributeName: "title",
  singular: true,
  special: Gloda.kSpecialString,
  specialColumnName: "title",
  subjectNouns: [IMConversationNoun.id],
  objectNoun: Gloda.NOUN_STRING,
  canQuery: true
});
Gloda.defineAttribute({
  provider: WidgetProvider, extensionName: EXT_NAME,
  attributeType: Gloda.kAttrFundamental,
  attributeName: "path",
  singular: true,
  special: Gloda.kSpecialString,
  specialColumnName: "path",
  subjectNouns: [IMConversationNoun.id],
  objectNoun: Gloda.NOUN_STRING,
  canQuery: true
});

// --- fulltext attributes
Gloda.defineAttribute({
  provider: WidgetProvider, extensionName: EXT_NAME,
  attributeType: Gloda.kAttrFundamental,
  attributeName: "content",
  singular: true,
  special: Gloda.kSpecialFulltext,
  specialColumnName: "content",
  subjectNouns: [IMConversationNoun.id],
  objectNoun: Gloda.NOUN_FULLTEXT,
  canQuery: true
});

// -- fulltext search helper
// fulltextMatches.  Match over message subject, body, and attachments
// @testpoint gloda.noun.message.attr.fulltextMatches
this._attrFulltext = Gloda.defineAttribute({
  provider: WidgetProvider,
  extensionName: EXT_NAME,
  attributeType: Gloda.kAttrDerived,
  attributeName: "fulltextMatches",
  singular: true,
  special: Gloda.kSpecialFulltext,
  specialColumnName: "imConversationsText",
  subjectNouns: [IMConversationNoun.id],
  objectNoun: Gloda.NOUN_FULLTEXT
});
// For facet.js DateFaceter
Gloda.defineAttribute({
  provider: WidgetProvider, extensionName: EXT_NAME,
  attributeType: Gloda.kAttrDerived,
  attributeName: "date",
  singular: true,
  special: Gloda.kSpecialColumn,
  subjectNouns: [IMConversationNoun.id],
  objectNoun: Gloda.NOUN_NUMBER,
  facet: {
    type: "date"
  },
  canQuery: true
});

var GlodaIMIndexer = {
  name: "index_im",
  cacheVersion: 1,
  enable: function() {
    Services.obs.addObserver(this, "conversation-closed", false);
    Services.obs.addObserver(this, "new-ui-conversation", false);
    Services.obs.addObserver(this, "ui-conversation-closed", false);

    // The shutdown blocker ensures pending saves happen even if the app
    // gets shut down before the timer fires.
    if (this._shutdownBlockerAdded)
      return;
    this._shutdownBlockerAdded = true;
    AsyncShutdown.profileBeforeChange.addBlocker("GlodaIMIndexer cache save",
      () => {
        if (!this._cacheSaveTimer)
          return;
        clearTimeout(this._cacheSaveTimer);
        return this._saveCacheNow();
      });

    this._knownFiles = {};

    let dir = FileUtils.getFile("ProfD", ["logs"]);
    if (!dir.exists() || !dir.isDirectory())
      return;
    let cacheFile = dir.clone();
    cacheFile.append(kCacheFileName);
    if (!cacheFile.exists())
      return;

    const PR_RDONLY = 0x01;
    let fis = new FileInputStream(cacheFile, PR_RDONLY, parseInt("0444", 8),
                                  Ci.nsIFileInputStream.CLOSE_ON_EOF);
    let sis = new ScriptableInputStream(fis);
    let text = sis.read(sis.available());
    sis.close();

    let data = JSON.parse(text);

    // Check to see if the Gloda datastore ID matches the one that we saved
    // in the cache. If so, we can trust it. If not, that means that the
    // cache is likely invalid now, so we ignore it (and eventually
    // overwrite it).
    if ("datastoreID" in data &&
        Gloda.datastoreID &&
        data.datastoreID === Gloda.datastoreID) {
      // Ok, the cache's datastoreID matches the one we expected, so it's
      // still valid.
      this._knownFiles = data.knownFiles;
    }

    this.cacheVersion = data.version;

    // If there was no version set on the cache, there is a chance that the index
    // is affected by bug 1069845. fixEntriesWithAbsolutePaths() sets the version to 1.
    if (!this.cacheVersion)
      this.fixEntriesWithAbsolutePaths();
  },
  disable: function() {
    Services.obs.removeObserver(this, "conversation-closed");
    Services.obs.removeObserver(this, "new-ui-conversation");
    Services.obs.removeObserver(this, "ui-conversation-closed");
  },

  /* _knownFiles is a tree whose leaves are the last modified times of
   * log files when they were last indexed.
   * Each level of the tree is stored as an object. The root node is an
   * object that maps a protocol name to an object representing the subtree
   * for that protocol. The structure is:
   * _knownFiles    -> protoObj      -> accountObj  -> convObj
   * The corresponding keys of the above objects are:
   * protocol names -> account names -> conv names  -> file names -> last modified time
   * convObj maps ALL previously indexed log files of a chat buddy or MUC to
   * their last modified times. Note that gloda knows nothing about log grouping
   * done by logger.js.
   */
  _knownFiles: {},
  _cacheSaveTimer: null,
  _shutdownBlockerAdded: false,
  _scheduleCacheSave: function() {
    if (this._cacheSaveTimer)
      return;
    this._cacheSaveTimer = setTimeout(this._saveCacheNow, 5000);
  },
  _saveCacheNow: function() {
    GlodaIMIndexer._cacheSaveTimer = null;

    let data = {
      knownFiles: GlodaIMIndexer._knownFiles,
      datastoreID: Gloda.datastoreID,
      version: GlodaIMIndexer.cacheVersion
    };

    // Asynchronously copy the data to the file.
    let path = OS.Path.join(OS.Constants.Path.profileDir, "logs", kCacheFileName);
    return OS.File.writeAtomic(path, JSON.stringify(data),
                               {encoding: "utf-8", tmpPath: path + ".tmp"})
             .catch(aError => Cu.reportError("Failed to write cache file: " + aError));
  },

  _knownConversations: {},
  // Promise queue for indexing jobs. The next indexing job is queued using this
  // promise's then() to ensure we only load logs for one conv at a time.
  _indexingJobPromise: null,
  // Maps a conv id to the function that resolves the promise representing the
  // ongoing indexing job on it. This is called from indexIMConversation when it
  // finishes and will trigger the next queued indexing job.
  _indexingJobCallbacks: new Map(),

  _scheduleIndexingJob: function(aConversation) {
    let convId = aConversation.id;

    // If we've already scheduled this conversation to be indexed, let's
    // not repeat.
    if (!(convId in this._knownConversations)) {
      this._knownConversations[convId] = {
        id: convId,
        scheduledIndex: null,
        logFileCount: null,
        convObj: {}
      };
    }

    if (!this._knownConversations[convId].scheduledIndex) {
      // Ok, let's schedule the job.
      this._knownConversations[convId].scheduledIndex = setTimeout(
        this._beginIndexingJob.bind(this, aConversation),
        kIndexingDelay);
    }
  },

  _beginIndexingJob: function(aConversation) {
    let convId = aConversation.id;

    // In the event that we're triggering this indexing job manually, without
    // bothering to schedule it (for example, when a conversation is closed),
    // we give the conversation an entry in _knownConversations, which would
    // normally have been done in _scheduleIndexingJob.
    if (!(convId in this._knownConversations)) {
      this._knownConversations[convId] = {
        id: convId,
        scheduledIndex: null,
        logFileCount: null,
        convObj: {}
      };
    }

    let conv = this._knownConversations[convId];
    Task.spawn(function* () {
      // We need to get the log files every time, because a new log file might
      // have been started since we last got them.
      let logFiles =
        yield Services.logs.getLogPathsForConversation(aConversation);
      if (!logFiles.length) {
        // No log files exist yet, nothing to do!
        return;
      }

      if (conv.logFileCount == undefined) {
        // We initialize the _knownFiles tree path for the current files below in
        // case it doesn't already exist.
        let folder = OS.Path.dirname(logFiles[0]);
        let convName = OS.Path.basename(folder);
        folder = OS.Path.dirname(folder);
        let accountName = OS.Path.basename(folder);
        folder = OS.Path.dirname(folder);
        let protoName = OS.Path.basename(folder);
        if (!Object.prototype.hasOwnProperty.call(this._knownFiles, protoName))
          this._knownFiles[protoName] = {};
        let protoObj = this._knownFiles[protoName];
        if (!Object.prototype.hasOwnProperty.call(protoObj, accountName))
          protoObj[accountName] = {};
        let accountObj = protoObj[accountName];
        if (!Object.prototype.hasOwnProperty.call(accountObj, convName))
          accountObj[convName] = {};

        // convObj is the penultimate level of the tree,
        // maps file name -> last modified time
        conv.convObj = accountObj[convName];
        conv.logFileCount = 0;
      }

      // The last log file in the array is the one currently being written to.
      // When new log files are started, we want to finish indexing the previous
      // one as well as index the new ones. The index of the previous one is
      // conv.logFiles.length - 1, so we slice from there. This gives us all new
      // log files even if there are multiple new ones.
      let currentLogFiles = conv.logFileCount > 1 ?
                            logFiles.slice(conv.logFileCount - 1) :
                            logFiles;
      for (let logFile of currentLogFiles) {
        let fileName = OS.Path.basename(logFile);
        let lastModifiedTime =
          (yield OS.File.stat(logFile)).lastModificationDate.valueOf();
        if (Object.prototype.hasOwnProperty.call(conv.convObj, fileName) &&
            conv.convObj[fileName] == lastModifiedTime) {
          // The file hasn't changed since we last indexed it, so we're done.
          continue;
        }

        if (this._indexingJobPromise)
          yield this._indexingJobPromise;
        this._indexingJobPromise = new Promise(aResolve => {
          this._indexingJobCallbacks.set(convId, aResolve);
        });

        let job = new IndexingJob("indexIMConversation", null);
        job.conversation = conv;
        job.path = logFile;
        job.lastModifiedTime = lastModifiedTime;
        GlodaIndexer.indexJob(job);
      }
      conv.logFileCount = logFiles.length;
    }.bind(this)).catch(Components.utils.reportError);

    // Now clear the job, so we can index in the future.
    this._knownConversations[convId].scheduledIndex = null;
  },

  observe: function logger_observe(aSubject, aTopic, aData) {
    if (aTopic == "new-ui-conversation") {
      // Add ourselves to the ui-conversation's list of observers for the
      // unread-message-count-changed notification.
      // For this notification, aSubject is the ui-conversation that is opened.
      aSubject.addObserver(this);
      return;
    }

    if (aTopic == "ui-conversation-closed") {
      aSubject.removeObserver(this);
      return;
    }

    if (aTopic == "unread-message-count-changed") {
      // We get this notification by attaching observers to conversations
      // directly (see the new-ui-conversation handler for when we attach).
      if (aSubject.unreadIncomingMessageCount == 0) {
        // The unread message count changed to 0, meaning that a conversation
        // that had been in the background and receiving messages was suddenly
        // moved to the foreground and displayed to the user. We schedule an
        // indexing job on this conversation now, since we want to index messages
        // that the user has seen.
        this._scheduleIndexingJob(aSubject.target);
      }
      return;
    }

    if (aTopic == "conversation-closed") {
      let convId = aSubject.id;
      // If there's a scheduled indexing job, cancel it, because we're going
      // to index now.
      if (convId in this._knownConversations &&
          this._knownConversations[convId].scheduledIndex != null) {
        clearTimeout(this._knownConversations[convId].scheduledIndex);
      }

      this._beginIndexingJob(aSubject);
      delete this._knownConversations[convId];
      return;
    }

    if (aTopic == "new-text" && !aSubject.noLog) {
      // Ok, some new text is about to be put into a conversation. For this
      // notification, aSubject is a prplIMessage.
      let conv = aSubject.conversation;
      let uiConv = Services.conversations.getUIConversation(conv);

      // We only want to schedule an indexing job if this message is
      // immediately visible to the user. We figure this out by finding
      // the unread message count on the associated UIConversation for this
      // message. If the unread count is 0, we know that the message has been
      // displayed to the user.
      if (uiConv.unreadIncomingMessageCount == 0)
        this._scheduleIndexingJob(conv);

      return;
    }
  },


  /* If there is an existing gloda conversation for the given path,
   * find its id.
   */
  _getIdFromPath: function(aPath) {
    let selectStatement = GlodaDatastore._createAsyncStatement(
      "SELECT id FROM imConversations WHERE path = ?1");
    selectStatement.bindStringParameter(0, aPath);
    let id;
    return new Promise((resolve, reject) => {
      selectStatement.executeAsync({
        handleResult: aResultSet => {
          let row = aResultSet.getNextRow();
          if (!row)
            return;
          if (id || aResultSet.getNextRow()) {
            Cu.reportError("Warning: found more than one gloda conv id for " +
              aPath  + "\n");
          }
          id = id || row.getInt64(0); // We use the first found id.
        },
        handleError: aError =>
          Cu.reportError("Error finding gloda id from path:\n" + aError),
        handleCompletion: () => {resolve(id);}
      });
    });
  },

  // Get the path of a log file relative to the logs directory - the last 4
  // components of the path.
  _getRelativePath: function(aLogPath) {
    return OS.Path.split(aLogPath).components.slice(-4).join("/");
  },

  /* aGlodaConv is an optional inout param that lets the caller save and reuse
   * the GlodaIMConversation instance created when the conversation is indexed
   * the first time. After a conversation is indexed for the first time,
   * the GlodaIMConversation instance has its id property set to the row id of
   * the conversation in the database. This id is required to later update the
   * conversation in the database, so the caller dealing with ongoing
   * conversation has to provide the aGlodaConv parameter, while the caller
   * dealing with old conversations doesn't care.
   * The aCache parameter is an object mapping file names to their last
   * modified times at the time they were last indexed. The value for the file
   * currently being indexed is updated to the aLastModifiedTime parameter's
   * value once indexing is complete.
   * */
  indexIMConversation: Task.async(function* (aCallbackHandle, aLogPath, aLastModifiedTime, aCache, aGlodaConv) {
    let log = yield Services.logs.getLogFromFile(aLogPath);
    let logConv = yield log.getConversation();

    // Ignore corrupted log files.
    if (!logConv)
      return Gloda.kWorkDone;

    let fileName = OS.Path.basename(aLogPath);
    let content = logConv.getMessages()
                         // Some messages returned, e.g. sessionstart messages,
                         // may have the noLog flag set. Ignore these.
                         .filter(m => !m.noLog)
                         .map(m => {
                           let who = m.alias || m.who;
                           // Some messages like topic change notifications may
                           // not have a source.
                           let prefix = who ? who + ": " : "";
                           return prefix + MailFolder.convertMsgSnippetToPlainText(m.message);
                         })
                         .join("\n\n");
    let glodaConv;
    if (aGlodaConv && aGlodaConv.value) {
      glodaConv = aGlodaConv.value;
      glodaConv._content = content;
    }
    else {
      let relativePath = this._getRelativePath(aLogPath);
      glodaConv = new GlodaIMConversation(logConv.title, log.time, relativePath, content);
      // If we've indexed this file before, we need the id of the existing
      // gloda conversation so that the existing entry gets updated. This can
      // happen if the log sweep detects that the last messages in an open
      // chat were not in fact indexed before that session was shut down.
      let id = yield this._getIdFromPath(relativePath);
      if (id)
        glodaConv.id = id;
      if (aGlodaConv)
        aGlodaConv.value = glodaConv;
    }

    if (!aCache)
      throw("indexIMConversation called without aCache parameter.");
    let isNew = !Object.prototype.hasOwnProperty.call(aCache, fileName) && !glodaConv.id;
    let rv = aCallbackHandle.pushAndGo(
      Gloda.grokNounItem(glodaConv, {}, true, isNew, aCallbackHandle));

    if (!aLastModifiedTime)
      Cu.reportError("indexIMConversation called without lastModifiedTime parameter.");
    aCache[fileName] = aLastModifiedTime || 1;
    this._scheduleCacheSave();

    return rv;
  }),

  _worker_indexIMConversation: function(aJob, aCallbackHandle) {
    let glodaConv = {};
    let existingGlodaConv = aJob.conversation.glodaConv;
    if (existingGlodaConv &&
        existingGlodaConv.path == this._getRelativePath(aJob.path))
      glodaConv.value = aJob.conversation.glodaConv;

    // indexIMConversation may initiate an async grokNounItem sub-job.
    this.indexIMConversation(aCallbackHandle, aJob.path, aJob.lastModifiedTime,
                             aJob.conversation.convObj, glodaConv)
        .then(() => GlodaIndexer.callbackDriver());
    // Tell the Indexer that we're doing async indexing. We'll be left alone
    // until callbackDriver() is called above.
    yield Gloda.kWorkAsync;

    // Resolve the promise for this job.
    this._indexingJobCallbacks.get(aJob.conversation.id)();
    this._indexingJobCallbacks.delete(aJob.conversation.id);
    this._indexingJobPromise = null;
    aJob.conversation.indexPending = false;
    aJob.conversation.glodaConv = glodaConv.value;
    yield Gloda.kWorkDone;
  },

  _worker_logsFolderSweep: function(aJob) {
    let dir = FileUtils.getFile("ProfD", ["logs"]);
    if (!dir.exists() || !dir.isDirectory())
      return;

    // Sweep the logs directory for log files, adding any new entries to the
    // _knownFiles tree as we traverse.
    let children = dir.directoryEntries;
    while (children.hasMoreElements()) {
      let proto = children.getNext().QueryInterface(Ci.nsIFile);
      if (!proto.isDirectory())
        continue;
      let protoName = proto.leafName;
      if (!Object.prototype.hasOwnProperty.call(this._knownFiles, protoName))
        this._knownFiles[protoName] = {};
      let protoObj = this._knownFiles[protoName];
      let accounts = proto.directoryEntries;
      while (accounts.hasMoreElements()) {
        let account = accounts.getNext().QueryInterface(Ci.nsIFile);
        if (!account.isDirectory())
          continue;
        let accountName = account.leafName;
        if (!Object.prototype.hasOwnProperty.call(protoObj, accountName))
          protoObj[accountName] = {};
        let accountObj = protoObj[accountName];
        let convs = account.directoryEntries;
        while (convs.hasMoreElements()) {
          let conv = convs.getNext().QueryInterface(Ci.nsIFile);
          let convName = conv.leafName;
          if (!conv.isDirectory() || convName == ".system")
            continue;
          if (!Object.prototype.hasOwnProperty.call(accountObj, convName))
            accountObj[convName] = {};
          let job = new IndexingJob("convFolderSweep", null);
          job.folder = conv;
          job.convObj = accountObj[convName];
          GlodaIndexer.indexJob(job);
        }
      }
    }
  },

  _worker_convFolderSweep: function(aJob, aCallbackHandle) {
    let folder = aJob.folder;

    let sessions = folder.directoryEntries;
    while (sessions.hasMoreElements()) {
      let file = sessions.getNext().QueryInterface(Ci.nsIFile);
      let fileName = file.leafName;
      if (!file.isFile() || !file.isReadable() || !fileName.endsWith(".json") ||
          (Object.prototype.hasOwnProperty.call(aJob.convObj, fileName) &&
           aJob.convObj[fileName] == file.lastModifiedTime))
        continue;
      // indexIMConversation may initiate an async grokNounItem sub-job.
      this.indexIMConversation(aCallbackHandle, file.path,
                               file.lastModifiedTime, aJob.convObj)
          .then(() => GlodaIndexer.callbackDriver());
      // Tell the Indexer that we're doing async indexing. We'll be left alone
      // until callbackDriver() is called above.
      yield Gloda.kWorkAsync;
    }
    yield Gloda.kWorkDone;
  },

  get workers() {
    return [
      ["indexIMConversation", {
         worker: this._worker_indexIMConversation
       }],
      ["logsFolderSweep", {
         worker: this._worker_logsFolderSweep
       }],
      ["convFolderSweep", {
         worker: this._worker_convFolderSweep
       }]
    ];
  },

  initialSweep: function() {
    let job = new IndexingJob("logsFolderSweep", null);
    GlodaIndexer.indexJob(job);
  },

  // Due to bug 1069845, some logs were indexed against their full paths instead
  // of their path relative to the logs directory. These entries are updated to
  // use relative paths below.
  fixEntriesWithAbsolutePaths: function() {
    let store = GlodaDatastore;
    let selectStatement = store._createAsyncStatement(
      "SELECT id, path FROM imConversations");
    let updateStatement = store._createAsyncStatement(
      "UPDATE imConversations SET path = ?1 WHERE id = ?2");

    store._beginTransaction();
    selectStatement.executeAsync({
      handleResult: aResultSet => {
        let row;
        while ((row = aResultSet.getNextRow())) {
          // If the path has more than 4 components, it is not relative to
          // the logs folder. Update it to use only the last 4 components.
          // The absolute paths were stored as OS-specific paths, so we split
          // them with OS.Path.split(). It's a safe assumption that nobody
          // ported their profile folder to a different OS since the regression,
          // so this should work.
          let pathComponents = OS.Path.split(row.getString(1)).components;
          if (pathComponents.length > 4) {
            updateStatement.bindInt64Parameter(1, row.getInt64(0)); // id
            updateStatement.bindStringParameter(0,
              pathComponents.slice(-4).join("/")); // Last 4 path components
            updateStatement.executeAsync({
              handleResult: () => {},
              handleError: aError =>
                Cu.reportError("Error updating bad entry:\n" + aError),
              handleCompletion: () => {}
            });
          }
        }
      },

      handleError: aError =>
        Cu.reportError("Error looking for bad entries:\n" + aError),

      handleCompletion: () => {
        store.runPostCommit(() => {
          this.cacheVersion = 1;
          this._scheduleCacheSave();
        });
        store._commitTransaction();
      }
    });
  }
};

GlodaIndexer.registerIndexer(GlodaIMIndexer);
