/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["convertMailStoreTo", "terminateWorkers"];

ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
ChromeUtils.import("resource:///modules/MailUtils.jsm");
ChromeUtils.import("resource:///modules/MailServices.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
ChromeUtils.import("resource://gre/modules/osfile.jsm");
ChromeUtils.import("resource://gre/modules/Log.jsm");

var log = Log.repository.getLogger("MailStoreConverter");
log.level = Log.Level.Debug;
log.addAppender(new Log.DumpAppender(new Log.BasicFormatter()));

// Array to hold workers.
var gConverterWorkerArray = [];

/**
 * Creates "Converter" folder in tmp dir, moves the folder hierarchy of the
 * account root folder creating the same folder hierarchy in Converter
 * folder in tmp dir, copies the .msf and .dat files to proper places in
 * Converter folder, parses the mbox files and creates corresponding folders
 * and maildir files in proper places in "Converter" folder and returns a
 * promise.
 * @param aMailstoreContractId          - account mailstore contract id
 * @param {nsIMsgIncominserver} aServer - server for the account
 * @param aEventTarget                  - target on which the "progress"
 *                                        event will be dispatched
 * @return {Promise}                    - new root folder path of the converted
 *                                        server.
 */
function convertMailStoreTo(aMailstoreContractId, aServer, aEventTarget) {
  // {nsIMsgfolder} account root folder.
  var accountRootFolder = aServer.rootFolder.filePath;
  // {nsIFile} tmp dir.
  var tmpDir = FileUtils.getDir("TmpD", [], false);
  // Array to hold path to the Converter folder in tmp dir.
  var pathArray;
  // No. of messages that have been copied in case of a pop account, movemail
  // account, Local Folders account or any account with maildir mailstore type
  // having at least 1 message.
  // No. of files and folders that have been copied in case of a pop account,
  // movemail account, Local Folders account or any account with maildir
  // mailstore type having 0 messages.
  // No. of files and folders that have been copied in case of an imap account
  // or an nntp account.
  var progressValue = 0;
  // No. of files and folders in original account root folder for imap account
  // if mailstore type is mbox, or an nntp account.
  // No. of files and folders in original account root folder for a pop
  // account, Local Folders account or movemail account if no. of msgs is 0
  // and mailstore type is mbox.
  // No. of files and folders in any non nntp account if no. of msgs is
  // 0 and mailstore type is maildir.
  // No. of messages in a pop account, Local Folders account or movemail
  // account if no. of msgs is more than 0 and mailstore type is mbox.
  // No. of messages in any non nntp account if no. of msgs is more than 0 and
  // mailstore type is maildir.
  var totalCount = 0;
  // If there are zero msgs in the account "zeroMessages" is true else it is
  // false.
  var zeroMessages = false;

  // No. of files and folders in original account root folder for imap account.
  // We use a progress bar to show the status of the conversion process.
  // So, we need a value as the maximum value of the progress bar to measure the
  // progress.
  // During the conversion there are three kinds of files or folders that can be
  // encountered.
  // 1. A directory - This simply requires a directory to be created in the right
  //                  place. So this a single step.
  // 2. A .msf or a .dat file - This simply requires the file to be copied to the
  //                            right place. This too is a single step.
  // 3. A message file - A message file contains several messages and each one
  //                     needs to be copied to a separate file in the right
  //                     place. So parsing a parsing a message file consists of
  //                     several steps.
  //
  // So, it's the parsing of message files that is actually time consuming and
  // dealing with a directory, .msf, .dat file takes very little time.
  //
  // So it makes more sense to measure progress as the no. of messages copied.
  // But for an imap account, getTotalMessages(true) does not give the no. of
  // messages actually present in the account root folder, but gives the no. of
  // messages shown on Thunderbird which is less than the no. of messages
  // actually present in the account root folder. So can't use that.
  //
  // But we still need a way to measure progress for an imap account.
  // So we measure progress by the total no. of files and folders in the account
  // root folder and we increment the value of the progress bar every time a
  // .msf, .dat, or a message file or a directory is encountered during
  // conversion.

  /**
   * Count no. of files and folders in the account root folder for imap
   * accounts.
   * @param {nsIMsgFolder} aFolder - account root folder.
   */
  var countImapFileFolders = function(aFolder) {
    var count = 0;
    var contents = aFolder.directoryEntries;
    while (contents.hasMoreElements()) {
      var content = contents.getNext()
                            .QueryInterface(Ci.nsIFile);
      if (content.isDirectory()) {
        // Don't count Windows Search integration dir.
        if (content.leafName.substr(-8) != ".mozmsgs") {
          count = count + 1 + countImapFileFolders(content);
        }
      } else {
        count++;
      }
    }
    return count;
  }

  /**
   * Count the no. of msgs in account root folder if the mailstore type is
   * maildir.
   * @param {nsIMsgFolder} aFolder - account root folder.
   */
  var countMaildirMsgs = function(aFolder) {
    var count = 0;
    var contents = aFolder.directoryEntries;
    while (contents.hasMoreElements()) {
      var content = contents.getNext().QueryInterface(Ci.nsIFile);
      if (!content.isDirectory()) {
        continue;
      }
      if (content.leafName.substr(-8) == ".mozmsgs") {
        // Windows Search integration dir. Ignore.
        continue;
      }
      if (content.leafName.substr(-4) == ".sbd") {
        // A subfolder. Recurse into it.
        count = count + countMaildirMsgs(content);
      } else {
        // We assume everything else is an actual maildir, and count the messages.
        var cur = FileUtils.File(OS.Path.join(content.path,"cur"));
        var curContents = cur.directoryEntries;
        while (curContents.hasMoreElements()) {
          curContents.getNext();
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Count the no. of files and folders in account root folder if the mailstore
   * type is maildir and the no. of msgs in the account is 0.
   * @param {nsIMsgFolder} aFolder - account root folder.
   */
  var countMaildirZeroMsgs = function(aFolder) {
    var count = 0;
    var contents = aFolder.directoryEntries;
    while (contents.hasMoreElements()) {
      var content = contents.getNext().QueryInterface(Ci.nsIFile);
      if (!content.isDirectory()) {
        count++;
      } else if (content.leafName.substr(-4) == ".sbd") {
        // A subfolder. Recurse into it.
        count = count + 1 + countMaildirMsgs(content);
      } else if (content.leafName.substr(-8) != ".mozmsgs") {
        // Assume any other dir is an actual maildir.
        count++;
      }
    }
    return count;
  }

  var isMaildir = (aMailstoreContractId == "@mozilla.org/msgstore/maildirstore;1");

  var conversionOk; // Resolve callback function.
  var conversionFailed; // Reject callback function.

  /**
   * Moves the folder hierarchy of the account root folder creating the same
   * folder hierarchy in Converter folder in tmp dir, copies the .msf
   * and .dat files to proper places in Converter folder, parses the mbox
   * files and creates corresponding folders and maildir files in proper
   * places in "Converter" folder and resolves the promise returned by
   * convertmailStoreTo().
   *
   * @param {nsIFile} aFolder   - account root folder. Folder from where the
   *                              files and directories are to be migrated.
   * @param {nsIFile} aDestPath - "Converter" folder. Folder into which the
   *                              files directories are to be migrated.
   */
  var subDir = function(aFolder, aDestPath) {
    let contents = aFolder.directoryEntries;
    // For each file in the source folder...
    while (contents.hasMoreElements()) {
      let content = contents.getNext()
                            .QueryInterface(Ci.nsIFile);

      // Data to be passed to the worker. Initially "dataArray" contains
      // path of the directory in which the files and directories are to be
      // migrated, path of the file or directory encountered, name of the file
      // or directory encountered and the mailstore type, path of tmp dir,
      // server type.
      let dataArray = [
        aDestPath.path,
        content.path,
        content.leafName,
        aMailstoreContractId,
        tmpDir.path,
        aServer.type
      ];

      if (content.isDirectory()) {
        if (content.leafName.substr(-4) != ".sbd" && content.leafName.substr(-8) != ".mozmsgs") {
          // Assume it's a maildir, and grab the list of messages.
          // Array to hold unsorted list of maildir msg filenames.
          let dataArrayUnsorted = [];
          // "cur" directory inside the maildir msg folder.
          let cur = FileUtils.File(OS.Path.join(content.path,"cur"));
          // Msg files inside "cur" directory.
          let msgs = cur.directoryEntries;

          while (msgs.hasMoreElements()) {
            // Add filenames as integers into 'dataArrayUnsorted'.
            // TODO: this'll break if maildir scheme changes! (eg .eml extension)
            let msg = msgs.getNext()
                          .QueryInterface(Ci.nsIFile);
            dataArrayUnsorted.push(parseInt(msg.leafName));
          }
          dataArrayUnsorted.sort()
          // Add the maildir msg filenames into 'dataArray' in a sorted order.
          for (let elem of dataArrayUnsorted) {
            dataArray.push(elem.toString());
          }
        }
      }

      // Set up the worker.
      let converterWorker = new ChromeWorker(
        "resource:///modules/converterWorker.js");
      gConverterWorkerArray.push(converterWorker);
      log.debug("Processing " + content.path + " => : " + aDestPath.path);

      converterWorker.addEventListener("message", function(e) {
        var responseWorker = e.data[0];
        log.debug("Type of file or folder encountered: " + e.data);

        // Dispatch the "progress" event on the event target and increment
        // "progressValue" every time.
        //
        // mbox:
        // - IMAP: a file or folder is copied.
        //   This is because we cannot get the no. of messages actually present
        //   in an imap account so we need some  other way to measure the
        //   progress.
        // - POP: a msg is copied if the no. of msgs in the account is more than
        //   0. A file or folder is copied if the no. of msgs in the account is 0.
        // - NNTP: a file or folder is copied.
        // - MOVEMAIL: Same as POP.
        // - NONE (LOCAL FOLDERS): Same as POP.
        //
        // maildir:
        // - A msg is copied if the no. of msgs in the account is more than 0.
        // - A file or folder is copied if the no. of msgs in the account is 0.
        let popOrLocalOrMoveMailOrMaildir =
           aServer.type == "pop3" || aServer.type == "none" ||
           aServer.type == "movemail" || isMaildir;
        if (((responseWorker == "copied" || (responseWorker != "copied" && zeroMessages))
                                         && popOrLocalOrMoveMailOrMaildir)
           ||
             (responseWorker != "copied" && !popOrLocalOrMoveMailOrMaildir)
           ||
             (responseWorker != "copied" && aServer.type == "nntp")
           ) {
          progressValue++;
          log.debug("Progress: " + progressValue);

          let event = new Event("progress");
          event.detail = parseInt((progressValue/totalCount) * 100);
          aEventTarget.dispatchEvent(event);
          if (progressValue == totalCount) {
            log.info("Migration completed. Migrated " + totalCount + " items");

            // Migration is complete, get path of parent of account root
            // folder into "parentPath" check if Converter folder already
            // exists in "parentPath". If yes, remove it.
            let lastSlash = accountRootFolder.path.lastIndexOf("/");
            let parentPath = accountRootFolder.parent.path;
            log.info("Path to parent folder of account root" +
                     " folder: " + parentPath);

            let parent = new FileUtils.File(parentPath);
            log.info("Path to parent folder of account root folder: " +
              parent.path);

            var converterFolder = new FileUtils.File(OS.Path.join(parent.path,
              dir.leafName));
            if (converterFolder.exists()) {
              log.info("Converter folder exists in " + parentPath +
                       ". Removing already existing folder");
              converterFolder.remove(true);
            }

            // Move Converter folder into the parent of account root folder.
            try {
              dir.moveTo(parent, dir.leafName);
              // {nsIFile} new account root folder.
              var newRootFolder = new FileUtils.File(OS.Path.join(parent.path,
                dir.leafName));
              log.info("Path to new account root folder: " +
                       newRootFolder.path);
            } catch (e) {
              // Cleanup.
              log.error(e);
              var newRootFolder = new FileUtils.File(OS.Path.join(parent.path,
                dir.leafName));
              log.error("Trying to remove converter folder: " +
                newRootFolder.path);
              newRootFolder.remove(true);
              conversionFailed(e);
            }

            // If the account is imap then copy the msf file for the original
            // root folder and rename the copy with the name of the new root
            // folder.
            if (aServer.type != "pop3" && aServer.type != "none" &&
              aServer.type != "movemail") {
              let converterFolderMsf = new FileUtils.File(OS.Path.join(
                parent.path,dir.leafName + ".msf"));
              if (converterFolderMsf.exists()) {
                converterFolderMsf.remove(true);
              }

              let oldRootFolderMsf = new FileUtils.File(OS.Path.join(
                parent.path,accountRootFolder.leafName + ".msf"));
              if (oldRootFolderMsf.exists()) {
                oldRootFolderMsf.copyTo(parent, converterFolderMsf.leafName);
              }
            }

            if (aServer.type == "nntp") {
              let converterFolderNewsrc = new FileUtils.File(OS.Path.join(
                parent.path,"newsrc-" + dir.leafName));
              if (converterFolderNewsrc.exists()) {
                converterFolderNewsrc.remove(true);
              }
              let oldNewsrc = new FileUtils.File(OS.Path.join(parent.path,
                "newsrc-" + accountRootFolder.leafName));
              if (oldNewsrc.exists()) {
                oldNewsrc.copyTo(parent, converterFolderNewsrc.leafName);
              }
            }

            aServer.rootFolder.filePath = newRootFolder;
            aServer.localPath = newRootFolder;
            log.info("Path to account root folder: " +
                     aServer.rootFolder.filePath.path);

            // Set various preferences.
            let p1 = "mail.server." + aServer.key + ".directory";
            let p2 = "mail.server." + aServer.key + ".directory-rel";
            let p3 = "mail.server." + aServer.key + ".newsrc.file";
            let p4 = "mail.server." + aServer.key + ".newsrc.file-rel";
            let p5 = "mail.server." + aServer.key + ".storeContractID";

            Services.prefs.setCharPref(p1, newRootFolder.path);
            log.info(p1 + ": " + newRootFolder.path)

            // The directory-rel pref is of the form "[ProfD]Mail/pop.gmail.com
            // " (pop accounts) or "[ProfD]ImapMail/imap.gmail.com" (imap
            // accounts) ie the last slash "/" is followed by the root folder
            // name. So, replace the old root folder name that follows the last
            // slash with the new root folder name to set the correct value of
            // directory-rel pref.
            let directoryRel = Services.prefs.getCharPref(p2);
            lastSlash = directoryRel.lastIndexOf("/");
            directoryRel = directoryRel.slice(0, lastSlash) + "/" +
                                              newRootFolder.leafName;
            Services.prefs.setCharPref(p2, directoryRel);
            log.info(p2 + ": " + directoryRel);

            if (aServer.type == "nntp") {
              let newNewsrc = FileUtils.File(OS.Path.join(parent.path,
                "newsrc-" + newRootFolder.leafName));
              Services.prefs.setCharPref(p3, newNewsrc.path);

              // The newsrc.file-rel pref is of the form "[ProfD]News/newsrc-
              // news.mozilla.org" ie the last slash "/" is followed by the
              // newsrc file name. So, replace the old newsrc file name that
              // follows the last slash with the new newsrc file name to set
              // the correct value of newsrc.file-rel pref.
              let newsrcRel = Services.prefs.getCharPref(p4);
              lastSlash = newsrcRel.lastIndexOf("/");
              newsrcRel = newsrcRel.slice(0, lastSlash) + "/" +
                                          newNewsrc.leafName;
              Services.prefs.setCharPref(p4, newsrcRel);
              log.info(p4 + ": " + newsrcRel);
            }

            Services.prefs.setCharPref(p5, isMaildir ?
              "@mozilla.org/msgstore/berkeleystore;1" :
              "@mozilla.org/msgstore/maildirstore;1");

            Services.prefs.savePrefFile(null);
            log.info("Conversion done!");

            // Resolve the promise with the path of the new account root
            // folder.
            conversionOk(newRootFolder.path);
          }
        }
      });

      converterWorker.addEventListener("error", function(e) {
        let reasonString =
          "Error at " + e.filename + ":" + e.lineno + " - " +  e.message;
        log.error(reasonString);
        terminateWorkers();
        // Cleanup.
        log.error("Trying to remove converter folder: " +
          aDestPath.path);
        aDestPath.remove(true);
        conversionFailed(e.message);
      });

      // Kick off the worker.
      converterWorker.postMessage(dataArray);

      if (content.isDirectory()) {
        if (content.leafName.substr(-4) == ".sbd") {
          let dirNew = new FileUtils.File(OS.Path.join(aDestPath.path,
            content.leafName));
          subDir(content, dirNew);
        }
      }
    }
  }

  /**
   * Checks if Converter folder exists in tmp dir, removes it and creates a new
   * "Converter" folder.
   * @param {nsIFile} aFolder - account root folder.
   */
  var createTmpConverterFolder = function(aFolder) {
    let tmpFolder;
    switch (aMailstoreContractId) {
      case "@mozilla.org/msgstore/maildirstore;1": {
        if (aFolder.leafName.substr(-8) == "-maildir") {
          tmpFolder = new FileUtils.File(OS.Path.join(tmpDir.path,
            aFolder.leafName.substr(0, aFolder.leafName.length - 8) + "-mbox"));
        } else {
          tmpFolder = new FileUtils.File(OS.Path.join(tmpDir.path,
            aFolder.leafName + "-mbox"));
        }

        if (tmpFolder.exists()) {
          log.info("Temporary Converter folder " + tmpFolder.path +
                   "exists in tmp dir. Removing it");
          tmpFolder.remove(true);
        }
        return FileUtils.getDir("TmpD", [tmpFolder.leafName], true);
      }

      case "@mozilla.org/msgstore/berkeleystore;1": {
        if (aFolder.leafName.substr(-5) == "-mbox") {
          tmpFolder = new FileUtils.File(OS.Path.join(tmpDir.path,
            aFolder.leafName.substr(0, aFolder.leafName.length - 5) +
              "-maildir"));
        } else {
          tmpFolder = new FileUtils.File(OS.Path.join(tmpDir.path,
            aFolder.leafName + "-maildir"));
        }

        if (tmpFolder.exists()) {
          log.info("Temporary Converter folder " + tmpFolder.path +
                   "exists in tmp dir. Removing it");
          tmpFolder.remove(true);
        }
        return FileUtils.getDir("TmpD", [tmpFolder.leafName], true);
      }

      default: {
        throw new Error("Unexpected mailstoreContractId: " +
                        aMailstoreContractId);
      }
    }
  }

  if (isMaildir && aServer.type != "nntp") {

    // TODO: why can't maildir count use aServer.rootFolder.getTotalMessages(true)?
    totalCount = countMaildirMsgs(accountRootFolder);
    if (totalCount == 0) {
      totalCount = countMaildirZeroMsgs(accountRootFolder);
      zeroMessages = true;
    }
  } else if (aServer.type == "pop3" ||
             aServer.type == "none" || // none: Local Folders.
             aServer.type == "movemail") {
    totalCount = aServer.rootFolder.getTotalMessages(true);
    if (totalCount == 0) {
      totalCount = countImapFileFolders(accountRootFolder);
      zeroMessages = true;
    }
  } else if (aServer.type == "imap" || aServer.type == "nntp") {
    totalCount = countImapFileFolders(accountRootFolder);
  }
  log.debug("totalCount = " + totalCount + " (zeroMessages = " + zeroMessages + ")");

  // Go offline before conversion, so there aren't messages coming in during
  // the process.
  Services.io.offline = true;
  let dir = createTmpConverterFolder(accountRootFolder);
  return new Promise(function(resolve, reject) {
    conversionOk = resolve;
    conversionFailed = reject;
    subDir(accountRootFolder, dir);
  });
}

/**
 * Terminate all workers.
 */
function terminateWorkers() {
  for (let worker of gConverterWorkerArray) {
    worker.terminate();
  }
}
