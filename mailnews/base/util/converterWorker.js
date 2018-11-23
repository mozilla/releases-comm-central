/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This worker performs one of a set of operations requested by
 * mailstoreConverter.jsm. The possible operations are:
 * - copy a file (.dat or .msf)
 * - split a mbox file out into a maildir
 * - join the contents of a maildir into a mbox file
 * - create a subfolder (.sbd dir)
 * - handle a .mozmsgs directory
 *
 * The caller relies on each worker to send the right number (and type)
 * of update notifications for the operation that worker is responsible
 * for.
 * The caller counts notifications to detect when the overall mailstore
 * conversion is complete.
 *
 * Currently, the worker decides which operation it is responsible for
 * performing by looking at:
 *  - the name of the source
 *  - the type of the source (file or directory),
 *  - xpcom interface of the source mailstore (maildir or mbox).
 * Since mailstoreConverter.jsm is already scanning the store
 * and making these decisions, it would probably make sense to have it
 * specify the operation type explicitly rather than repeating the
 * logic here so the worker can decide.
 */

self.importScripts("resource://gre/modules/osfile.jsm");
self.addEventListener("message", function(e) {
  try {
    // {String} sourceFile - path to file or directory encountered.
    var sourceFile = e.data[1];
    // {String} dest - path to directory in which the new files or directories
    // need to be created.
    var dest = e.data[0];
    // {String} destFile - name of the file or directory encountered.
    var destFile = e.data[2];
    var mailstoreContractId = e.data[3];
    var tmpDir = e.data[4];
    var serverType = e.data[5];
    var stat = OS.File.stat(sourceFile);

    if (stat.isDir && sourceFile.substr(-8) == ".mozmsgs") {
      // it's an OS search integration dir.
      // A no-op for now. Maildir/OS search integration is still
      // a little undecided (see bug 1144478).
      return;
    }

    if (stat.isDir && sourceFile.substr(-4) == ".sbd") {
      // it's a subfolder
      OS.File.makeDir(dest, {from: tmpDir});
      OS.File.makeDir(OS.Path.join(dest, destFile), {from: tmpDir});

      // Send message to "mailstoreConverter.jsm" indicating that a directory
      // was created.
      // This would indicate "progress" for an imap account but not for a pop
      // account if the number of messages in the pop account is more than 0 and
      // mailstore type is mbox.
      // This would indicate "progress" for a pop account if the number of
      // messages in the pop account is 0 and the mailstore type is
      // mbox.
      // This would indicate "progress" for pop or imap account if the noumber
      // of messages in the account is 0.
      self.postMessage(["dir", sourceFile]);
      return;
    }

    if (mailstoreContractId == "@mozilla.org/msgstore/maildirstore;1" &&
        stat.isDir && sourceFile.substr(-4) != ".sbd") {
      // copy messages from maildir -> mbox

      // Create a directory with path 'dest'.
      OS.File.makeDir(dest, {from: tmpDir});

      // If the file with path 'dest/destFile' does not exist, create it,
      // open it for writing. This is the mbox msg file with the same name as
      // 'sourceFile'.
      let mboxFile;
      if (!OS.File.exists(OS.Path.join(dest,destFile))) {
        mboxFile = OS.File.open(OS.Path.join(dest,destFile), {write: true,
          create: true}, {});
      }

      // If length of 'e.data' is greater than 6, we know that e.data carries
      // maildir msg file names.
      if (e.data.length > 6) {
        for(let msgCount = 0; msgCount < e.data.length - 6; msgCount++) {
          let n = e.data[msgCount + 6];
          // Open the file 'sourceFile/cur/msgFile' for reading.
          let msgFileOpen = OS.File.open(OS.Path.join(sourceFile, "cur", n));
          mboxFile.write(msgFileOpen.read());
          msgFileOpen.close();

          // Send a message to "mailstoreConverter.jsm" indicating that a
          // msg was copied. This would indicate "progress" for both imap and
          // pop accounts if mailstore type is maildir and the no. of
          // msgs in the account is greater than zero.
          self.postMessage(["copied", OS.Path.join(sourceFile, "cur", n)]);
        }
      }

      mboxFile.close();

      // Send a message to "mailstoreConverter.jsm" indicating that an mbox msg
      // file was created. This would indicate "progress" for both imap and pop
      // accounts if mailstore type is maildir and the no. of messages in
      // the account is 0.
      self.postMessage(["file", sourceFile, e.data.length]);
      return;
    }


    // If a file is encountered, then if it is a .dat file, copy the
    // file to the directory whose path is in 'dest'.
    // For Local Folders, pop3, and movemail accounts, when the .msf files
    // are copied, something goes wrong with the .msf files and the messages
    // don't show up. Thunderbird automatically creates .msf files. So to
    // resolve this, .msf files are not copied for Local Folders, pop3 and
    // movemail accounts.
    let ext = sourceFile.substr(-4);
    if (!stat.isDir && ((ext == ".msf") || (ext == ".dat"))) {
      if (ext == ".dat" || (serverType == "imap" || serverType == "nntp")) {
        // If the directory with path 'dest' does not exist, create it.
        if (!OS.File.exists(dest)) {
          OS.File.makeDir(dest, {from: tmpDir});
        }
        OS.File.copy(sourceFile, OS.Path.join(dest,destFile));
      }

      // Send a message to "mailstoreConverter.jsm" indicating that a .msf or
      // .dat file was copied.
      // This is used to indicate progress on IMAP accounts if mailstore
      // type is mbox.
      // This is used to indicate progress on pop accounts if the no. of msgs
      // in the account is 0 and mailstore type is mbox.
      // This is used to indicate progress on pop and imap accounts if the
      // no. of msgs in the account is 0 and mailstore type is maildir.
      self.postMessage(["msfdat", sourceFile]);
      return;
    }

    // All other files are assumed to be mbox.
    if (!stat.isDir && mailstoreContractId != "@mozilla.org/msgstore/maildirstore;1") {
      // An mbox message file is encountered. Split it up into a maildir.

      const constNoOfBytes = 10000000;
      // (TODO: check this doesn't bound the size of messages we can convert!)

      // Create a directory with path 'dest'.
      OS.File.makeDir(dest, {from: tmpDir});

      // Create a directory with same name as the file encountered in the
      // directory with path 'dest'.
      // In this directory create a directory with name "cur" and a directory
      // with name "tmp".
      OS.File.makeDir(OS.Path.join(dest, destFile));
      OS.File.makeDir(OS.Path.join(dest, destFile, "cur"));
      OS.File.makeDir(OS.Path.join(dest, destFile, "tmp"));

      let decoder = new TextDecoder();
      let encoder = new TextEncoder();

      // File to which the message is to be copied.
      let targetFile = null;
      // Get a timestamp for file name.
      let name = Date.now();
      // No. of bytes to be read from the source file.
      // Needs to be a large size to read in chunks.
      let noOfBytes = constNoOfBytes;
      // 'text' holds the string that was read.
      let text = null;
      // Index of last match in 'text'.
      let lastMatchIndex;
      // Current position in the source file before reading bytes from it.
      let position;
      // New position in the source file after reading bytes from it.
      let nextPos;
      // New length of the text read from source file.
      let nextLen;
      // Position in the file after reading the bytes in the previous
      // iteration.
      let prevPos = 0;
      // Length of the text read from source file in the previous
      // iteration.
      let prevLen = 0;
      // Bytes read from the source file are decoded into a string and
      // assigned to 'textNew'.
      let textNew;

      // Read the file. Since the files can be large, we read it in chunks.
      let sourceFileOpen = OS.File.open(sourceFile);
      while (true) {
        position = sourceFileOpen.getPosition();
        let array = sourceFileOpen.read(noOfBytes);
        textNew = decoder.decode(array);
        nextPos = sourceFileOpen.getPosition();
        nextLen = textNew.length;

        if (nextPos == prevPos && nextLen == prevLen) {
          // Reached the last message in the source file.
          if (text !== null) {
            // Array to hold indices of "From -" matches found within 'text'.
            let lastPos = [];
            // Regular expression to find "From - " at beginning of lines.
            let regexpLast = /^(From - )/gm;
            let resultLast = regexpLast.exec(text);
            while (resultLast !== null) {
              lastPos[lastPos.length] = resultLast.index;
              resultLast = regexpLast.exec(text);
            }

            // Create a maildir message file in 'dest/destFile/cur/'
            // and open it for writing.
            targetFile = OS.File.open(OS.Path.join(dest, destFile, "cur",
              name.toString() + ".eml"), {write: true, create: true}, {});

            // Extract the text in 'text' between 'lastPos[0]' ie the
            // index of the first "From - " match and the end of 'text'.
            targetFile.write(encoder.encode(text.substring(lastPos[0],
              text.length)));
            targetFile.close();

            // Send a message indicating that a message was copied.
            // This indicates progress for a pop account if the no. of msgs
            // in the account is more than 0 and mailstore type is mbox.
            self.postMessage(["copied", name, position]);
          }

          break;
        }  else {
          // We might have more messages in the source file.
          prevPos = nextPos;
          prevLen = nextLen;
          text = textNew;
        }

        // Array to hold indices of "From -" matches found within 'text'.
        let msgPos = [];
        // Regular expression to find "From - " at beginning of lines.
        let regexp = /^(From - )/gm;
        let result = regexp.exec(text);
        while (result !== null) {
          msgPos[msgPos.length] = result.index;
          result = regexp.exec(text);
        }

        if (msgPos.length > 1) {
          // More than one "From - " match is found.
          noOfBytes = constNoOfBytes;
          for (let i = 0; i < msgPos.length - 1; i++) {
            // Create and open a new file in 'dest/destFile/cur'
            // to hold the next mail.
            targetFile = OS.File.open(OS.Path.join(dest, destFile, "cur",
              name.toString() + ".eml"), {write: true, create: true}, {});
            // Extract the text lying between consecutive indices, encode
            // it and write it.
            targetFile.write(encoder.encode(text.substring(msgPos[i],
              msgPos[i + 1])));
            targetFile.close();

            // Send a message indicating that a mail was copied.
            // This indicates progress for a pop account if the no. of msgs
            // in the account is more than 0 and mailstore type is mbox.
            self.postMessage(["copied", name, position + msgPos[i],
              position + msgPos[i + 1]]);

            // Increment 'name' to get a new file name.
            // Cannot use Date.now() because it is possible to get the
            // same timestamp as before.
            name++;

            // Set index of the (i+1)th "From - " match found in 'text'.
            lastMatchIndex = msgPos[i + 1];
          }

          // Now 'lastMatchIndex' holds the index of the last match found in
          // 'text'. So we move the position in the file to 'position +
          // lastMatchIndex' from the beginning of the file.
          // This ensures that the next 'text' starts from "From - "
          // and that there is at least 1 match every time.
          sourceFileOpen.setPosition(position + lastMatchIndex,
            OS.File.POS_START);
        } else {
          // If 1 match is found increase the no. of bytes to be extracted by
          // 1000000 and move the position in the file to 'position', i.e. the
          // position in the file before reading the bytes.
          sourceFileOpen.setPosition(position, OS.File.POS_START);
          noOfBytes = noOfBytes + 1000000;
        }
      }

      // Send a message indicating that a message file was encountered.
      // This indicates progress for an imap account if mailstore type is
      // mbox.
      // This indicates progress for a pop account if mailstore type is
      // mbox and the no. of msgs in the account is 0.
      self.postMessage(["file", sourceFile, textNew.length]);
      return;
    }

    // Should never get here, but the above rules are a little
    // complex. So just in case.
    throw new Error("Unhandled source: " + sourceFile);

  } catch (e) {
    // We try-catch the error because otherwise the error from File.OS is
    // not properly propagated back to the worker error handling.
    throw new Error(e);
  }
});
