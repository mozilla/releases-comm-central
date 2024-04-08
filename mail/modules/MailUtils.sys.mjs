/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailConsts: "resource:///modules/MailConsts.sys.mjs",
  MailServices: "resource:///modules/MailServices.sys.mjs",
  MimeParser: "resource:///modules/mimeParser.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
  PluralForm: "resource:///modules/PluralForm.sys.mjs",
});

/**
 * This module has several utility functions for use by both core and
 * third-party code. Some functions are aimed at code that doesn't have a
 * window context, while others can be used anywhere.
 */
export var MailUtils = {
  /**
   * Restarts the application, keeping it in
   * safe mode if it is already in safe mode.
   */
  restartApplication() {
    const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
      Ci.nsISupportsPRBool
    );
    Services.obs.notifyObservers(
      cancelQuit,
      "quit-application-requested",
      "restart"
    );
    if (cancelQuit.data) {
      return;
    }
    // If already in safe mode restart in safe mode.
    if (Services.appinfo.inSafeMode) {
      Services.startup.restartInSafeMode(
        Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart
      );
      return;
    }
    Services.startup.quit(
      Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart
    );
  },

  /**
   * Discover all folders. This is useful during startup, when you have code
   * that deals with folders and that executes before the main 3pane window is
   * open (the folder tree wouldn't have been initialized yet).
   */
  discoverFolders() {
    for (const server of lazy.MailServices.accounts.allServers) {
      // Bug 466311 Sometimes this can throw file not found, we're unsure
      // why, but catch it and log the fact.
      try {
        server.rootFolder.subFolders;
      } catch (ex) {
        Services.console.logStringMessage(
          "Discovering folders for account failed with exception: " + ex
        );
      }
    }
  },

  /**
   * Get the nsIMsgFolder corresponding to this file. This just looks at all
   * folders and does a direct match.
   *
   * One of the places this is used is desktop search integration -- to open
   * the search result corresponding to a mozeml/wdseml file, we need to figure
   * out the folder using the file's path.
   *
   * @param aFile the nsIFile to convert to a folder
   * @returns the nsIMsgFolder corresponding to aFile, or null if the folder
   *          isn't found
   */
  getFolderForFileInProfile(aFile) {
    for (const folder of lazy.MailServices.accounts.allFolders) {
      if (folder.filePath.equals(aFile)) {
        return folder;
      }
    }
    return null;
  },

  /**
   * Get the nsIMsgFolder corresponding to this URI.
   *
   * @param aFolderURI the URI of the target folder
   * @returns {nsIMsgFolder} Folder corresponding to this URI, or null if
   *          the folder doesn't already exist.
   */
  getExistingFolder(aFolderURI) {
    const fls = Cc["@mozilla.org/mail/folder-lookup;1"].getService(
      Ci.nsIFolderLookupService
    );
    return fls.getFolderForURL(aFolderURI);
  },

  /**
   * Get the nsIMsgFolder corresponding to this URI, or create a detached
   * folder if it doesn't already exist.
   *
   * @param aFolderURI the URI of the target folder
   * @returns {nsIMsgFolder} Folder corresponding to this URI.
   */
  getOrCreateFolder(aFolderURI) {
    const fls = Cc["@mozilla.org/mail/folder-lookup;1"].getService(
      Ci.nsIFolderLookupService
    );
    return fls.getOrCreateFolderForURL(aFolderURI);
  },

  /**
   * Display this message header in a new tab, a new window or an existing
   * window, depending on the preference and whether a 3pane or standalone
   * window is already open. This function should be called when you'd like to
   * display a message to the user according to the pref set.
   *
   * @note Do not use this if you want to open multiple messages at once. Use
   *       |displayMessages| instead.
   *
   * @param {nsIMsgHdr} aMsgHdr - The message header to display.
   * @param {DBViewWrapper} [aViewWrapperToClone] - A view wrapper to clone.
   *   If null or not given, the message header's folder's default view will
   *   be used.
   * @param {Element} [aTabmail] - A tabmail element to use in case we need to
   *   open tabs. If null or not given:
   *    - if one or more 3pane windows are open, the most recent one's tabmail
   *      is used, and the window is brought to the front
   *    - if no 3pane windows are open, a standalone window is opened instead
   *      of a tab
   */
  displayMessage(aMsgHdr, aViewWrapperToClone, aTabmail) {
    this.displayMessages([aMsgHdr], aViewWrapperToClone, aTabmail);
  },

  /**
   * Display the warning if the number of messages to be displayed is greater than
   * the limit set in preferences.
   *
   * @param aNumMessages: number of messages to be displayed
   * @param aConfirmTitle: title ID
   * @param aConfirmMsg: message ID
   * @param aLiitingPref: the name of the pref to retrieve the limit from
   */
  confirmAction(aNumMessages, aConfirmTitle, aConfirmMsg, aLimitingPref) {
    const openWarning = Services.prefs.getIntPref(aLimitingPref);
    if (openWarning > 1 && aNumMessages >= openWarning) {
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/messenger.properties"
      );
      const title = bundle.GetStringFromName(aConfirmTitle);
      const message = lazy.PluralForm.get(
        aNumMessages,
        bundle.GetStringFromName(aConfirmMsg)
      ).replace("#1", aNumMessages);
      if (!Services.prompt.confirm(null, title, message)) {
        return true;
      }
    }
    return false;
  },

  /**
   * Display these message headers in new tabs, new windows or existing
   * windows, depending on the preference, the number of messages, and whether
   * a 3pane or standalone window is already open. This function should be
   * called when you'd like to display multiple messages to the user according
   * to the pref set.
   *
   * @param {nsIMsgHdr[]} aMsgHdrs - An array containing the message headers to
   *   display. The array should contain at least one message header.
   * @param {DBViewWrapper} [aViewWrapperToClone] - A DB view wrapper to clone
   *   for each of the tabs or windows.
   * @param {Element} [aTabmail] - A tabmail element to use in case we need to
   *   open tabs. If given, the window containing the tabmail is assumed to be
   *   in front. If null or not given:
   *    - if one or more 3pane windows are open, the most recent one's tabmail
   *      is used, and the window is brought to the front
   *    - if no 3pane windows are open, a standalone window is opened instead
   *      of a tab
   * @param {Boolean} [forceTab] - Boolean that let us know when the middle
   *   click button triggered the event. We then proceed to open the message in
   *   a new tab.
   * @param {Boolean} [shiftPressed] - We take into account if the user pressed
   *   the shift key to know how to open a message in a new tab.
   */
  displayMessages(
    aMsgHdrs,
    aViewWrapperToClone,
    aTabmail,
    forceTab = false,
    shiftPressed
  ) {
    const openMessageBehavior = Services.prefs.getIntPref(
      "mail.openMessageBehavior"
    );

    if (forceTab) {
      this.openMessageInNewTab(
        aMsgHdrs,
        aViewWrapperToClone,
        aTabmail,
        shiftPressed
      );
      return;
    }

    const behaviorEnum = lazy.MailConsts.OpenMessageBehavior;
    switch (openMessageBehavior) {
      case behaviorEnum.NEW_WINDOW:
        this.openMessagesInNewWindows(aMsgHdrs, aViewWrapperToClone);
        break;
      case behaviorEnum.EXISTING_WINDOW:
        // Try reusing an existing window. If we can't, fall back to opening
        // new windows.
        if (
          aMsgHdrs.length > 1 ||
          !this.openMessageInExistingWindow(aMsgHdrs[0])
        ) {
          this.openMessagesInNewWindows(aMsgHdrs, aViewWrapperToClone);
        }
        break;
      case behaviorEnum.NEW_TAB:
        this.openMessageInNewTab(
          aMsgHdrs,
          aViewWrapperToClone,
          aTabmail,
          shiftPressed
        );
        break;
    }
  },

  /**
   * Open the messages in a Tab.
   *
   * @param {nsIMsgHdr[]} aMsgHdrs - An array containing the message headers to
   *   display. The array should contain at least one message header.
   * @param {DBViewWrapper} [aViewWrapperToClone] - A DB view wrapper to clone
   *   for each of the tabs or windows.
   * @param {Element} [aTabmail] - A tabmail element to use in case we need to
   *   open tabs. If given, the window containing the tabmail is assumed to be
   *   in front. If null or not given:
   *    - if one or more 3pane windows are open, the most recent one's tabmail
   *      is used, and the window is brought to the front
   *    - if no 3pane windows are open, a standalone window is opened instead
   *      of a tab
   * @param {Boolean} [shiftPressed] - We take into account if the user pressed
   *   the shift key to know how to open a message in a new tab. We only look at
   *   the loadInBackground preferefence if this value is provided.
   */
  openMessageInNewTab(aMsgHdrs, aViewWrapperToClone, aTabmail, shiftPressed) {
    let mail3PaneWindow = null;
    if (!aTabmail) {
      // Try opening new tabs in a 3pane window.
      mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
      if (mail3PaneWindow) {
        aTabmail = mail3PaneWindow.document.getElementById("tabmail");
      }
    }

    if (!aTabmail) {
      // We still haven't found a tabmail, so we'll need to open new windows.
      this.openMessagesInNewWindows(aMsgHdrs, aViewWrapperToClone);
      return;
    }

    if (
      this.confirmAction(
        aMsgHdrs.length,
        "openTabWarningTitle",
        "openTabWarningConfirmation",
        "mailnews.open_tab_warning"
      )
    ) {
      return;
    }

    const loadInBgPref = Services.prefs.getBoolPref(
      "mail.tabs.loadInBackground"
    );

    // If shiftPressed is not specified the message should ignore the
    // loadInBackground preference.
    const loadInBackground =
      shiftPressed !== undefined && loadInBgPref !== shiftPressed;

    // Open all the tabs in the background, except for the last one.
    for (const [i, msgHdr] of aMsgHdrs.entries()) {
      aTabmail.openTab("mailMessageTab", {
        messageURI: msgHdr.folder.getUriForMsg(msgHdr),
        viewWrapper: aViewWrapperToClone,
        background: i < aMsgHdrs.length - 1 || loadInBackground,
        disregardOpener: aMsgHdrs.length > 1,
      });
    }

    mail3PaneWindow?.focus();
  },

  /**
   * Show this message in an existing window.
   *
   * @param {nsIMsgHdr} aMsgHdr - The message header to display.
   * @param {DBViewWrapper} [aViewWrapperToClone] - A DB view wrapper to clone
   *   for the message window.
   * @returns {boolean} true if an existing window was found and the message
   *   header was displayed, false otherwise.
   */
  openMessageInExistingWindow(aMsgHdr, aViewWrapperToClone) {
    const messageWindow = Services.wm.getMostRecentWindow("mail:messageWindow");
    if (messageWindow) {
      messageWindow.displayMessage(aMsgHdr, aViewWrapperToClone);
      return true;
    }
    return false;
  },

  /**
   * Open a new standalone message window with this header.
   *
   * @param {nsIMsgHdr} aMsgHdr the message header to display
   * @param {DBViewWrapper} [aViewWrapperToClone] - A DB view wrapper to clone
   *   for the message window.
   * @returns {DOMWindow} the opened window
   */
  openMessageInNewWindow(aMsgHdr, aViewWrapperToClone) {
    // It sucks that we have to go through XPCOM for this.
    const args = { msgHdr: aMsgHdr, viewWrapperToClone: aViewWrapperToClone };
    args.wrappedJSObject = args;

    return Services.ww.openWindow(
      null,
      "chrome://messenger/content/messageWindow.xhtml",
      "",
      "all,chrome,dialog=no,status,toolbar",
      args
    );
  },

  /**
   * Open new standalone message windows for these headers. This will prompt
   * for confirmation if the number of windows to be opened is greater than the
   * value of the mailnews.open_window_warning preference.
   *
   * @param {nsIMsgHdr[]} aMsgHdrs - An array containing the message headers
   *   to display.
   * @param {DBViewWrapper} [aViewWrapperToClone] - A DB view wrapper to clone
   *   for each message window.
   */
  openMessagesInNewWindows(aMsgHdrs, aViewWrapperToClone) {
    if (
      this.confirmAction(
        aMsgHdrs.length,
        "openWindowWarningTitle",
        "openWindowWarningConfirmation",
        "mailnews.open_window_warning"
      )
    ) {
      return;
    }

    for (const msgHdr of aMsgHdrs) {
      this.openMessageInNewWindow(msgHdr, aViewWrapperToClone);
    }
  },

  /**
   * Display the given folder in the 3pane of the most recent 3pane window.
   *
   * @param {string} folderURI - The URI of the folder to display
   */
  displayFolderIn3Pane(folderURI) {
    // Try opening new tabs in a 3pane window
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    const tabmail = win.document.getElementById("tabmail");
    if (!tabmail.currentAbout3Pane) {
      tabmail.switchToTab(tabmail.tabInfo[0]);
      tabmail.updateCurrentTab();
    }
    tabmail.currentAbout3Pane.displayFolder(folderURI);
    win.focus();
  },

  /**
   * Display this message header in a folder tab in a 3pane window. This is
   * useful when the message needs to be displayed in the context of its folder
   * or thread.
   *
   * @param {nsIMsgHdr} msgHdr - The message header to display.
   * @param {boolean} [openIfMessagePaneHidden] - If true, and the folder tab's
   *   message pane is hidden, opens the message in a new tab or window.
   *   Otherwise uses the folder tab.
   */
  displayMessageInFolderTab(msgHdr, openIfMessagePaneHidden) {
    // Try opening new tabs in a 3pane window
    const mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
    if (mail3PaneWindow) {
      if (openIfMessagePaneHidden) {
        const tab =
          mail3PaneWindow.document.getElementById("tabmail").tabInfo[0];
        if (!tab.chromeBrowser.contentWindow.paneLayout.messagePaneVisible) {
          this.displayMessage(msgHdr);
          return;
        }
      }

      mail3PaneWindow.MsgDisplayMessageInFolderTab(msgHdr);

      if (Ci.nsIMessengerWindowsIntegration) {
        Cc["@mozilla.org/messenger/osintegration;1"]
          .getService(Ci.nsIMessengerWindowsIntegration)
          .showWindow(mail3PaneWindow);
      }
      mail3PaneWindow.focus();
    } else {
      const args = { msgHdr };
      args.wrappedJSObject = args;
      Services.ww.openWindow(
        null,
        "chrome://messenger/content/messenger.xhtml",
        "",
        "all,chrome,dialog=no,status,toolbar",
        args
      );
    }
  },

  /**
   * Open the given .eml file.
   *
   * @param {DOMWindow} win - The window which the file is being opened within.
   * @param {nsIFile} aFile - The file being opened.
   * @param {nsIURL} aURL - The full file URL.
   */
  openEMLFile(win, aFile, aURL) {
    const url = aURL
      .mutate()
      .setQuery("type=application/x-message-display")
      .finalize();

    let fstream = null;
    let headers = new Map();
    // Read this eml and extract its headers to check for X-Unsent.
    try {
      fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
        Ci.nsIFileInputStream
      );
      fstream.init(aFile, -1, 0, 0);
      const data = lazy.NetUtil.readInputStreamToString(
        fstream,
        fstream.available()
      );
      headers = lazy.MimeParser.extractHeaders(data);
    } catch (e) {
      // Ignore errors on reading the eml or extracting its headers. The test for
      // the X-Unsent header below will fail and the message window will take care
      // of any error handling.
    } finally {
      if (fstream) {
        fstream.close();
      }
    }

    if (headers.get("X-Unsent") == "1") {
      const msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
        Ci.nsIMsgWindow
      );
      lazy.MailServices.compose.OpenComposeWindow(
        null,
        {},
        url.spec,
        Ci.nsIMsgCompType.Draft,
        Ci.nsIMsgCompFormat.Default,
        null,
        headers.get("from"),
        msgWindow
      );
    } else if (
      Services.prefs.getIntPref("mail.openMessageBehavior") ==
        lazy.MailConsts.OpenMessageBehavior.NEW_TAB &&
      win.document.getElementById("tabmail")
    ) {
      win.document
        .getElementById("tabmail")
        .openTab("mailMessageTab", { messageURI: url.spec });
    } else {
      win.openDialog(
        "chrome://messenger/content/messageWindow.xhtml",
        "_blank",
        "all,chrome,dialog=no,status,toolbar",
        url
      );
    }
  },

  /**
   * The number of milliseconds to wait between loading of folders in
   * |takeActionOnFolderAndDescendents|.  We wait at all because
   * opening msf databases is a potentially expensive synchronous operation that
   * can approach the order of a second in pathological cases like gmail's
   * all mail folder.
   *
   * If we did not use a timer or otherwise spin the event loop we would
   * completely lock up the UI.  In theory we would still maintain some degree
   * of UI responsiveness if we just used postMessage to break up our work so
   * that the event loop still got a chance to run between our folder openings.
   * The use of any delay between processing folders is to try and avoid causing
   * system-wide interactivity problems from dominating the system's available
   * disk seeks to such an extent that other applications start experiencing
   * non-trivial I/O waits.
   *
   * The specific choice of delay remains an arbitrary one to maintain app
   * and system responsiveness per the above while also processing as many
   * folders as quickly as possible.
   *
   * This is exposed primarily to allow unit tests to set this to 0 to minimize
   * throttling.
   */
  INTER_FOLDER_PROCESSING_DELAY_MS: 10,

  /**
   * Set a string property on a folder and all of its descendents, taking care
   * to avoid locking up the main thread and to avoid leaving folder databases
   * open.  To avoid locking up the main thread we operate in an asynchronous
   * fashion; we invoke a callback when we have completed our work.
   *
   * Using this function will write the value into the folder cache
   * as well as the folder itself.  Hopefully you want this; if
   * you do not, keep in mind that the only way to avoid that is to retrieve
   * the nsIMsgDatabase and then the nsIDbFolderInfo.  You would want to avoid
   * that as much as possible because once those are exposed to you, XPConnect
   * is going to hold onto them creating a situation where you are going to be
   * in severe danger of extreme memory bloat unless you force garbage
   * collections after every time you close a database.
   *
   * @param {nsIMsgFolder} folder - The parent folder; we take action on it and all
   *     of its descendents.
   * @param {Function} action - the function to call on each folder.
   */
  async takeActionOnFolderAndDescendents(folder, action) {
    // We need to add the base folder as it is not included by .descendants.
    const allFolders = [folder, ...folder.descendants];

    // - worker function
    function* folderWorker() {
      for (const folder of allFolders) {
        action(folder);
        yield undefined;
      }
    }
    const worker = folderWorker();

    return new Promise((resolve, reject) => {
      // - driver logic
      const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      function folderDriver() {
        try {
          if (worker.next().done) {
            timer.cancel();
            resolve();
          }
        } catch (ex) {
          // Any type of exception kills the generator.
          timer.cancel();
          reject(ex);
        }
      }
      // make sure there is at least 100 ms of not us between doing things.
      timer.initWithCallback(
        folderDriver,
        this.INTER_FOLDER_PROCESSING_DELAY_MS,
        Ci.nsITimer.TYPE_REPEATING_SLACK
      );
    });
  },

  /**
   * Get the identity that most likely is the best one to use, given the hint.
   *
   * @param {nsIMsgIdentity[]} identities - The candidates to pick from.
   * @param {string} [optionalHint] - String containing comma separated mailboxes.
   * @param {boolean} useDefault - If true, use the default identity of the
   *   account as last choice. This is useful when all default account as last
   *   choice. This is useful when all identities are passed in. Otherwise, use
   *   the first entity in the list.
   * @returns {Array} - An array of two elements, [identity, matchingHint].
   *   identity is an nsIMsgIdentity and matchingHint is a string.
   */
  getBestIdentity(identities, optionalHint, useDefault = false) {
    const identityCount = identities.length;
    if (identityCount < 1) {
      return [null, null];
    }

    // If we have a hint to help us pick one identity, search for a match.
    // Even if we only have one identity, check which hint might match.
    if (optionalHint) {
      const hints =
        lazy.MailServices.headerParser.makeFromDisplayAddress(optionalHint);

      for (const hint of hints) {
        for (const identity of identities.filter(i => i.email)) {
          if (hint.email.toLowerCase() == identity.email.toLowerCase()) {
            return [identity, hint];
          }
        }
      }

      // Lets search again, this time for a match from catchAll.
      for (const hint of hints) {
        for (const identity of identities.filter(
          i => i.email && i.catchAll && i.catchAllHint
        )) {
          for (let caHint of identity.catchAllHint.toLowerCase().split(",")) {
            // If the hint started with *@, it applies to the whole domain. In
            // this case return the hint so it can be used for replying.
            // If the hint was for a more specific hint, don't return a hint
            // so that the normal from address for the identity is used.
            const wholeDomain = caHint.trim().startsWith("*@");
            caHint = caHint.trim().replace(/^\*/, ""); // Remove initial star.
            if (hint.email.toLowerCase().includes(caHint)) {
              return wholeDomain ? [identity, hint] : [identity, null];
            }
          }
        }
      }
    }

    // Still no matches? Give up and pick the default or the first one.
    if (useDefault) {
      const defaultAccount = lazy.MailServices.accounts.defaultAccount;
      if (defaultAccount && defaultAccount.defaultIdentity) {
        return [defaultAccount.defaultIdentity, null];
      }
    }

    return [identities[0], null];
  },

  getIdentityForServer(server, optionalHint) {
    const identities =
      lazy.MailServices.accounts.getIdentitiesForServer(server);
    return this.getBestIdentity(identities, optionalHint);
  },

  /**
   * Get the identity for the given header.
   *
   * @param {nsIMsgHdr} hdr - Message header.
   * @param {nsIMsgCompType} type - Compose type the identity is used for.
   * @returns {Array} - An array of two elements, [identity, matchingHint].
   *   identity is an nsIMsgIdentity and matchingHint is a string.
   */
  getIdentityForHeader(hdr, type, hint = "") {
    let server = null;
    let identity = null;
    let matchingHint = null;
    const folder = hdr.folder;
    if (folder) {
      server = folder.server;
      identity = folder.customIdentity;
      if (identity) {
        return [identity, null];
      }
    }

    if (!server) {
      const accountKey = hdr.accountKey;
      if (accountKey) {
        const account = lazy.MailServices.accounts.getAccount(accountKey);
        if (account) {
          server = account.incomingServer;
        }
      }
    }

    let hintForIdentity = "";
    if (type == Ci.nsIMsgCompType.ReplyToList) {
      hintForIdentity = hint;
    } else if (
      type == Ci.nsIMsgCompType.Template ||
      type == Ci.nsIMsgCompType.EditTemplate ||
      type == Ci.nsIMsgCompType.EditAsNew
    ) {
      hintForIdentity = hdr.author;
    } else {
      hintForIdentity = hdr.recipients + "," + hdr.ccList + "," + hint;
    }

    if (server) {
      [identity, matchingHint] = this.getIdentityForServer(
        server,
        hintForIdentity
      );
    }

    if (!identity) {
      [identity, matchingHint] = this.getBestIdentity(
        lazy.MailServices.accounts.allIdentities,
        hintForIdentity,
        true
      );
    }
    return [identity, matchingHint];
  },

  getInboxFolder(server) {
    try {
      var rootMsgFolder = server.rootMsgFolder;

      // Now find the Inbox.
      return rootMsgFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
    } catch (ex) {
      dump(ex + "\n");
    }
    return null;
  },

  /**
   * Finds a mailing list anywhere in the address books.
   *
   * @param {string} entryName - Value against which dirName is checked.
   * @returns {nsIAbDirectory|null} - Found list or null.
   */
  findListInAddressBooks(entryName) {
    for (const abDir of lazy.MailServices.ab.directories) {
      if (abDir.supportsMailingLists) {
        for (const dir of abDir.childNodes) {
          if (dir.isMailList && dir.dirName == entryName) {
            return dir;
          }
        }
      }
    }
    return null;
  },

  /**
   * Recursively search for message id in a given folder and its subfolders,
   * return the first one found.
   *
   * @param {string} msgId - The message id to find.
   * @param {nsIMsgFolder} folder - The folder to check.
   * @returns {nsIMsgDBHdr}
   */
  findMsgIdInFolder(msgId, folder) {
    let msgHdr;

    // Search in folder.
    if (!folder.isServer) {
      try {
        msgHdr = folder.msgDatabase.getMsgHdrForMessageID(msgId);
        if (msgHdr) {
          return msgHdr;
        }
        folder.closeDBIfFolderNotOpen(true);
      } catch (ex) {
        console.error(`Database for ${folder.name} not accessible`);
      }
    }

    // Search subfolders recursively.
    for (const currentFolder of folder.subFolders) {
      msgHdr = this.findMsgIdInFolder(msgId, currentFolder);
      if (msgHdr) {
        return msgHdr;
      }
    }
    return null;
  },

  /**
   * Recursively search for message id in all msg folders, return the first one
   * found.
   *
   * @param {string} msgId - The message id to search for.
   * @param {nsIMsgIncomingServer} [startServer] - The server to check first.
   * @returns {nsIMsgDBHdr}
   */
  getMsgHdrForMsgId(msgId, startServer) {
    let allServers = lazy.MailServices.accounts.allServers;
    if (startServer) {
      allServers = [startServer].concat(
        allServers.filter(s => s.key != startServer.key)
      );
    }
    for (const server of allServers) {
      if (server && server.canSearchMessages && !server.isDeferredTo) {
        const msgHdr = this.findMsgIdInFolder(msgId, server.rootFolder);
        if (msgHdr) {
          return msgHdr;
        }
      }
    }
    return null;
  },

  /**
   * Recursively search for message id in all msg folders and open the first
   * matching message found.
   *
   * @param {string} msgId - The message id string without the brackets.
   * @param {nsIMsgIncomingServer} [startServer] - The server to check first.
   * @param {DOMWindow} [window] - The message window to load the message into.
   */
  openMessageForMessageId(msgId, startServer, window) {
    window?.setCursor("wait");
    const msgHdr = this.getMsgHdrForMsgId(msgId, startServer);
    window?.setCursor("auto");

    // If message was found open corresponding message.
    if (msgHdr) {
      if (window) {
        if (window.parent.location == "about:3pane") {
          // Message in 3pane.
          window.parent.selectMessage(msgHdr);
        } else {
          // Message in tab, standalone message window.
          const uri = msgHdr.folder.getUriForMsg(msgHdr);
          window.displayMessage(uri);
        }
      } else {
        this.displayMessage(msgHdr);
      }
      return;
    }
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
    Services.prompt.alert(
      window,
      bundle.GetStringFromName("errorOpenMessageForMessageIdTitle"),
      bundle.formatStringFromName("errorOpenMessageForMessageIdMessage", [
        `<${msgId}>`,
      ])
    );
  },

  /**
   * Take the message id from the messageIdNode and use the url defined in the
   * hidden pref "mailnews.messageid_browser.url" to open it in a browser window
   * (%mid is replaced by the message id).
   * @param {string} messageId - The message id to open.
   */
  openBrowserWithMessageId(messageId) {
    let browserURL = Services.prefs.getStringPref(
      "mailnews.messageid_browser.url"
    );
    browserURL = browserURL.replace(/%mid/, encodeURIComponent(messageId));
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .loadURI(Services.io.newURI(browserURL));
  },

  /**
   * If the 'news' URI contains a message-id, retrieve the corresponding
   * message from the server, save it in a temporary EML file, and display it
   * in a new tab or message window.
   * For URIs that identify a newsgroup, ask to subscribe, if necessary, and
   * open the group in the folder pane.
   * If no host is specified in the URI, the server of the first NNTP account
   * is used.
   *
   * @param {string} uri - The 'news' URI to open.
   * @param {DOMWindow} win - The window which the URI is being opened within.
   */
  handleNewsUri(uri, win) {
    // @see {@link https://datatracker.ietf.org/doc/html/rfc5538#section-2.2}
    const url = new URL(uri);
    if (url.pathname.length <= 1) {
      return;
    }

    // Treat deprecated 'snews' URIs exactly as 'news' URIs.
    // @see {@link https://datatracker.ietf.org/doc/html/rfc5538#section-8.1}
    if (url.protocol == "snews:") {
      url.protocol = "news:";
    }

    const firstNntpServer = lazy.MailServices.accounts.accounts.find(
      account => account.incomingServer.type == "nntp"
    )?.incomingServer;

    // 'news' URIs identifying a newsgroup.

    const identifier = decodeURIComponent(url.pathname.slice(1));
    if (!identifier.includes("@")) {
      if (identifier.includes("*")) {
        console.warn(`Unsupported news URI: ${url}`);
        return;
      }

      const server = url.hostname
        ? lazy.MailServices.accounts.findServer("", url.hostname, "nntp")
        : firstNntpServer;
      if (!server) {
        console.warn(`Unknown news server: ${url.hostname}`);
        return;
      }

      if (
        !server
          .QueryInterface(Ci.nsINntpIncomingServer)
          .containsNewsgroup(identifier)
      ) {
        const bundle = Services.strings.createBundle(
          "chrome://messenger/locale/news.properties"
        );
        const result = Services.prompt.confirm(
          win,
          null,
          bundle.formatStringFromName("autoSubscribeText", [identifier])
        );
        if (!result) {
          return;
        }
        server.subscribeToNewsgroup(identifier);
      }
      this.displayFolderIn3Pane(server.findGroup(identifier).URI);
      return;
    }

    // URIs that contain a message-ID.

    if (!url.hostname) {
      if (!firstNntpServer) {
        console.warn("No news server set up.");
        return;
      }
      url.hostname = firstNntpServer.hostName;
      url.port = firstNntpServer.port;
    }
    if (!url.port) {
      url.port = Ci.nsINntpUrl.DEFAULT_NNTP_PORT;
    }

    const tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
    tempFile.append("newsuri.eml");
    tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    const extAppLauncher = Cc[
      "@mozilla.org/uriloader/external-helper-app-service;1"
    ].getService(Ci.nsPIExternalAppLauncher);
    extAppLauncher.deleteTemporaryFileOnExit(tempFile);

    const messageService = Cc[
      "@mozilla.org/messenger/messageservice;1?type=news"
    ].getService(Ci.nsIMsgMessageService);
    const urlListener = {
      OnStopRunningUrl(url, aExitCode) {
        if (!Components.isSuccessCode(aExitCode) || tempFile.fileSize <= 0) {
          console.warn(`Could not open URI ${url.asciiSpec}`);
          return;
        }
        MailUtils.openEMLFile(win, tempFile, Services.io.newFileURI(tempFile));
      },
    };
    messageService.SaveMessageToDisk(
      url.href,
      tempFile,
      false,
      urlListener,
      {},
      true,
      null
    );
  },
};

/**
 * A class that listens to notifications about folders, and deals with them
 * appropriately.
 * @implements {nsIObserver}
 */
class FolderNotificationManager {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);

  static #manager = null;

  static init() {
    if (FolderNotificationManager.#manager) {
      return;
    }
    FolderNotificationManager.#manager = new FolderNotificationManager();
  }

  constructor() {
    Services.obs.addObserver(this, "profile-before-change");
    Services.obs.addObserver(this, "folder-attention");
  }

  observe(subject, topic) {
    switch (topic) {
      case "profile-before-change":
        Services.obs.removeObserver(this, "profile-before-change");
        Services.obs.removeObserver(this, "folder-attention");
        return;
      case "folder-attention":
        MailUtils.displayFolderIn3Pane(
          subject.QueryInterface(Ci.nsIMsgFolder).URI
        );
    }
  }
}
FolderNotificationManager.init();
