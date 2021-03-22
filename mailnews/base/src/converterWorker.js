/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/chrome-worker, node */

/**
 * This worker will perform mbox<->maildir conversions on a tree of
 * directories. It operates purely at the filesystem level.
 *
 * The initial message data should pass in these params to control
 * the conversion:
 *
 * srcType  - source mailstore type ('mbox' or 'maildir')
 * destType - destination mailstore type ('maildir' or 'mbox')
 * srcRoot  - root path of source (eg ".../ImapMail/imap.example.com")
 * destRoot - root path of destination (eg "/tmp/imap.example.com-maildir")
 *
 * The conversion is non-destructive - srcRoot will be left untouched.
 *
 * The worker will post progress messages back to the main thread of
 * the form:
 *
 *   {"msg": "progress", "val": val, "total": total}
 *
 * Where `val` is the current progress, out of `total`.
 * The units used for val and total are undefined.
 *
 * When the conversion is complete, before exiting, the worker sends a
 * message of the form:
 *
 *   {"msg": "success"}
 *
 * Errors are posted back to the main thread via the standard
 * "error" event.
 *
 */

importScripts("resource://gre/modules/osfile.jsm");

/**
 * Merge all the messages in a maildir into a single mbox file.
 *
 * @param {String} maildir              - Path to the source maildir.
 * @param {String} mboxFilename         - Path of the mbox file to create.
 * @param {Function(Number)} progressFn - Function to be invoked regularly with
 *                                        progress updates. Param is number of
 *                                        "units" processed since last update.
 */
function maildirToMBox(maildir, mboxFilename, progressFn) {
  // Helper to format dates
  // eg "Thu Jan 18 12:34:56 2018"
  let fmtUTC = function(d) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return (
      dayNames[d.getUTCDay()] +
      " " +
      monthNames[d.getUTCMonth()] +
      " " +
      d
        .getUTCDate()
        .toString()
        .padStart(2) +
      " " +
      d
        .getUTCHours()
        .toString()
        .padStart(2, "0") +
      ":" +
      d
        .getUTCMinutes()
        .toString()
        .padStart(2, "0") +
      ":" +
      d
        .getUTCSeconds()
        .toString()
        .padStart(2, "0") +
      " " +
      d.getUTCFullYear()
    );
  };

  let encoder = new TextEncoder();
  let mboxFile = OS.File.open(mboxFilename, { write: true, create: true }, {});

  // Iterate over all the message files in "cur".
  let curPath = OS.Path.join(maildir, "cur");
  let it = new OS.File.DirectoryIterator(curPath);
  try {
    let files = [];
    if ("winCreationDate" in OS.File.DirectoryIterator.Entry.prototype) {
      // Under Windows, additional information allow us to sort files immediately
      // without having to perform additional I/O.
      it.forEach(function(ent) {
        files.push({ path: ent.path, creationDate: ent.winCreationDate });
      });
    } else {
      // Under other OSes, we need to call OS.File.stat
      it.forEach(function(ent) {
        files.push({
          path: ent.path,
          creationDate: OS.File.stat(ent.path).creationDate,
        });
      });
    }
    // We write out the mbox messages ordered by creation time.
    // Not ideal, but best we can do without parsing message.
    files.sort(function(a, b) {
      return a.creationDate - b.creationDate;
    });

    for (let ent of files) {
      let inFile = OS.File.open(ent.path);
      try {
        let raw = inFile.read();
        // Old converter had a bug where maildir messages included the
        // leading "From " marker, so we need to cope with any
        // cases of this left in the wild.
        if (String.fromCharCode.apply(null, raw.slice(0, 5)) != "From ") {
          // Write the separator line.
          // Technically, timestamp should be the reception time of the
          // message, but we don't really want to have to parse the
          // message here and nothing is likely to rely on it.
          let sepLine = "From - " + fmtUTC(new Date()) + "\n";
          mboxFile.write(encoder.encode(sepLine));
        }

        mboxFile.write(raw);
      } finally {
        inFile.close();
      }
      // Maildir progress is one per message.
      progressFn(1);
    }
  } finally {
    it.close();
    mboxFile.close();
  }
}

/**
 * Split an mbox file up into a maildir.
 *
 * @param {String} mboxPath             - Path of the mbox file to split.
 * @param {String} maildirPath          - Path of the maildir to create.
 * @param {Function(Number)} progressFn - Function to be invoked regularly with
 *                                        progress updates. One parameter is
 *                                        passed - the number of "cost units"
 *                                        since the previous update.
 */
function mboxToMaildir(mboxPath, maildirPath, progressFn) {
  // Create the maildir structure.
  OS.File.makeDir(maildirPath);
  let curDirPath = OS.Path.join(maildirPath, "cur");
  let tmpDirPath = OS.Path.join(maildirPath, "tmp");
  OS.File.makeDir(curDirPath);
  OS.File.makeDir(tmpDirPath);

  const CHUNK_SIZE = 1000000;
  // SAFE_MARGIN is how much to keep back between chunks in order to
  // cope with separator lines which might span chunks.
  const SAFE_MARGIN = 100;

  // A regexp to match mbox separator lines. Separator lines in the wild can
  // have all sorts of forms, for example:
  //
  // "From "
  // "From MAILER-DAEMON Fri Jul  8 12:08:34 2011"
  // "From - Mon Jul 11 12:08:34 2011"
  // "From bob@example.com Fri Jul  8 12:08:34 2011"
  //
  // So we accept any line beginning with "From " and ignore the rest of it.
  //
  // We also require a message header on the next line, in order
  // to better cope with unescaped "From " lines in the message body.
  // note: the first subexpression matches the separator line, so
  // that it can be removed from the input.
  let sepRE = /^(From (?:.*?)\r?\n)[\x21-\x7E]+:/gm;

  // Use timestamp as starting name for output messages, incrementing
  // by one for each.
  let ident = Date.now();
  let outFile = null;

  /**
   * Helper. Convert a string into a Uint8Array, using no encoding. The low
   * byte of each 16 bit character will be used, the high byte discarded.
   *
   * @param {string} s - Input string with chars in 0-255 range.
   * @returns {Uint8Array} The output bytes.
   */
  let stringToBytes = function(str) {
    var bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes;
  };

  /**
   * Helper. Convert a Uint8Array directly into a string, using each byte
   * directly as a character code. So all characters in the resulting string
   * will range from 0 to 255, even though they are 16 bit values.
   *
   * @param {Uint8Array} bytes - The bytes to convert.
   * @returns {string} The byte values in string form.
   */
  let bytesToString = function(bytes) {
    return bytes.reduce(function(str, b) {
      return str + String.fromCharCode(b);
    }, "");
  };

  /**
   * Helper. Write out a block of bytes to the current message file, starting
   * a new file if required.
   *
   * @param {string} str - The bytes to append (as chars in range 0-255).
   */
  let writeToMsg = function(str) {
    if (!outFile) {
      let outPath = OS.Path.join(curDirPath, ident.toString() + ".eml");
      ident += 1;
      outFile = OS.File.open(outPath, { write: true, create: true }, {});
    }
    // We know that str is really raw 8-bit data, not UTF-16. So we can
    // discard the upper byte and just keep the low byte of each char.
    let raw = stringToBytes(str);
    outFile.write(raw);
    // For mbox->maildir conversion, progress is measured in bytes.
    progressFn(raw.byteLength);
  };

  /**
   * Helper. Close the current message file, if any.
   */
  let closeExistingMsg = function() {
    if (outFile) {
      outFile.close();
      outFile = null;
    }
  };

  let mboxFile = OS.File.open(mboxPath);
  let buf = "";
  let eof = false;
  while (!eof) {
    let rawBytes = mboxFile.read(CHUNK_SIZE);
    // We're using JavaScript strings (which hold 16bit characters) to store
    // 8 bit data. This sucks, but is faster than trying to operate directly
    // upon Uint8Arrays. A lot of work goes into optimising JavaScript strings.
    buf += bytesToString(rawBytes);
    eof = rawBytes.byteLength < CHUNK_SIZE;

    let pos = 0;
    sepRE.lastIndex = 0; // start at beginning of buf
    let m = null;
    while ((m = sepRE.exec(buf)) !== null) {
      // Output everything up to the line separator.
      if (m.index > pos) {
        writeToMsg(buf.substring(pos, m.index));
      }
      pos = m.index;
      pos += m[1].length; // skip the "From " line
      closeExistingMsg();
    }

    // Deal with whatever is left in the buffer.
    let endPos = buf.length;
    if (!eof) {
      // Keep back enough to cope with separator lines crossing
      // chunk boundaries.
      endPos -= SAFE_MARGIN;
      if (endPos < pos) {
        endPos = pos;
      }
    }

    if (endPos > pos) {
      writeToMsg(buf.substring(pos, endPos));
    }
    buf = buf.substring(endPos);
  }
  closeExistingMsg();
}

/**
 * Check if directory is a subfolder directory.
 *
 * @param {String} name     - Name of directory to check.
 * @returns {Boolean}       - true if subfolder.
 */
function isSBD(name) {
  return name.substr(-4) == ".sbd";
}

/**
 * Check if file is a type which should be copied verbatim as part of a
 * conversion.
 * See also: nsMsgLocalStoreUtils::nsShouldIgnoreFile().
 *
 * @param {String} name     - Name of file to check.
 * @returns {Boolean}       - true if file should be copied verbatim.
 */
function isFileToCopy(name) {
  let ext4 = name.substr(-4);
  // Database and config files.
  if (ext4 == ".msf" || ext4 == ".dat") {
    return true;
  }
  // Summary files.
  if (ext4 == ".snm" || ext4 == ".toc") {
    return true;
  }
  // A few files we know might be lurking there.
  const SPECIAL_FILES = [
    "filterlog.html",
    "junklog.html",
    "feeds.json",
    "feeditems.json",
    "mailfilt.log",
    "filters.js",
  ];
  if (SPECIAL_FILES.includes(name)) {
    return true;
  }
  return false;
}

/**
 * Check if file is an mbox.
 * (actually we can't really tell if it's an mbox or not just from the name.
 * we just assume it is, if it's not .msf or .dat).
 *
 * @param {String} name     - Name of file to check.
 * @returns {Boolean}       - true if file is an mbox
 */
function isMBoxName(name) {
  // If it's not a "special" file, assume it's mbox.
  return !isFileToCopy(name);
}

/**
 * Check if directory is a maildir (by looking for a "cur" subdir).
 *
 * @param {String} dir    - Path of directory to check.
 * @returns {Boolean}     - true if directory is a maildir.
 */
function isMaildir(dir) {
  try {
    let cur = OS.Path.join(dir, "cur");
    let fi = OS.File.stat(cur);
    return fi.isDir;
  } catch (ex) {
    if (ex instanceof OS.File.Error && ex.becauseNoSuchFile) {
      // "cur" does not exist - not a maildir.
      return false;
    }
    throw ex; // Other error.
  }
}

/**
 * Count the number of messages in the "cur" dir of maildir.
 *
 * @param {String} maildir  - Path of maildir.
 * @returns {Number}        - number of messages found.
 */
function countMaildirMsgs(maildir) {
  let cur = OS.Path.join(maildir, "cur");
  let it = new OS.File.DirectoryIterator(cur);
  let count = 0;
  try {
    it.forEach(function(ent) {
      count++;
    });
  } finally {
    it.close();
  }
  return count;
}

/**
 * Recursively calculate the 'cost' of a hierarchy of maildir folders.
 * This is the figure used for progress updates.
 * For maildir, cost is 1 per message.
 *
 * @param {String} srcPath  - Path of root dir containing maildirs.
 * @returns {Number}        - calculated conversion cost.
 */
function calcMaildirCost(srcPath) {
  let cost = 0;
  let it = new OS.File.DirectoryIterator(srcPath);
  try {
    it.forEach(function(ent) {
      if (ent.isDir) {
        if (isSBD(ent.name)) {
          // Recurse into subfolder.
          cost += calcMaildirCost(ent.path);
        } else if (isMaildir(ent.path)) {
          // Looks like a maildir. Cost is number of messages.
          cost += countMaildirMsgs(ent.path);
        }
      }
    });
  } finally {
    it.close();
  }
  return cost;
}

/**
 * Recursively calculate the 'cost' of a hierarchy of mbox folders.
 * This is the figure used for progress updates.
 * For mbox, cost is the total byte size of data. This avoids the need to
 * parse the mbox files to count the number of messages.
 * Note that this byte count cost is not 100% accurate because it includes
 * the "From " lines which are not written into the maildir files. But it's
 * definitely close enough to give good user feedback.
 *
 * @param {String} srcPath  - Path of root dir containing maildirs.
 * @returns {Number}        - calculated conversion cost.
 */
function calcMBoxCost(srcPath) {
  let cost = 0;
  let it = new OS.File.DirectoryIterator(srcPath);
  try {
    it.forEach(function(ent) {
      if (ent.isDir) {
        if (isSBD(ent.name)) {
          // Recurse into .sbd subfolder.
          cost += calcMBoxCost(ent.path);
        }
      } else if (isMBoxName(ent.name)) {
        let fi = OS.File.stat(ent.path);
        cost += fi.size;
      }
    });
  } finally {
    it.close();
  }
  return cost;
}

/**
 * Recursively convert a tree of mbox-based folders to maildirs.
 *
 * @param {String} srcPath              - Root path containing mboxes.
 * @param {String} destPath             - Where to create destination root.
 * @param {Function(Number)} progressFn - Function to be invoked regularly with
 *                                        progress updates (called with number of
 *                                        cost "units" since last update)
 */
function convertTreeMBoxToMaildir(srcPath, destPath, progressFn) {
  OS.File.makeDir(destPath);

  let it = new OS.File.DirectoryIterator(srcPath);
  try {
    it.forEach(function(ent) {
      let dest = OS.Path.join(destPath, ent.name);
      if (ent.isDir) {
        if (isSBD(ent.name)) {
          // Recurse into .sbd subfolder.
          convertTreeMBoxToMaildir(ent.path, dest, progressFn);
        }
      } else if (isFileToCopy(ent.name)) {
        OS.File.copy(ent.path, dest);
      } else if (isMBoxName(ent.name)) {
        // It's an mbox. Convert it.
        mboxToMaildir(ent.path, dest, progressFn);
      }
    });
  } finally {
    it.close();
  }
}

/**
 * Recursively convert a tree of maildir-based folders to mbox.
 *
 * @param {String} srcPath              - Root path containing maildirs.
 * @param {String} destPath             - Where to create destination root.
 * @param {Function(Number)} progressFn - Function to be invoked regularly with
 *                                        progress updates (called with number of
 *                                        cost "units" since last update)
 */
function convertTreeMaildirToMBox(srcPath, destPath, progressFn) {
  OS.File.makeDir(destPath);

  let it = new OS.File.DirectoryIterator(srcPath);
  try {
    it.forEach(function(ent) {
      let dest = OS.Path.join(destPath, ent.name);
      if (ent.isDir) {
        if (isSBD(ent.name)) {
          // Recurse into .sbd subfolder.
          convertTreeMaildirToMBox(ent.path, dest, progressFn);
        } else if (isMaildir(ent.path)) {
          // It's a maildir - convert it.
          maildirToMBox(ent.path, dest, progressFn);
        }
      } else if (isFileToCopy(ent.name)) {
        OS.File.copy(ent.path, dest);
      }
    });
  } finally {
    it.close();
  }
}

self.addEventListener("message", function(e) {
  // Unpack the request params from the main thread.
  let srcType = e.data.srcType;
  let destType = e.data.destType;
  let srcRoot = e.data.srcRoot;
  let destRoot = e.data.destRoot;
  // destRoot will be a temporary dir, so if it all goes pear-shaped
  // we can just bail out without cleaning up.

  // Configure the conversion.
  let costFn = null;
  let convertFn = null;
  if (srcType == "maildir" && destType == "mbox") {
    costFn = calcMaildirCost;
    convertFn = convertTreeMaildirToMBox;
  } else if (srcType == "mbox" && destType == "maildir") {
    costFn = calcMBoxCost;
    convertFn = convertTreeMBoxToMaildir;
  } else {
    throw new Error(`Unsupported conversion: ${srcType} => ${destType}`);
  }

  // Go!
  let totalCost = costFn(srcRoot);
  let v = 0;
  let progressFn = function(n) {
    v += n;
    self.postMessage({ msg: "progress", val: v, total: totalCost });
  };
  convertFn(srcRoot, destRoot, progressFn);

  // We fake a final progress update, with exactly 100% completed.
  // Our byte-counting on mbox->maildir conversion will fall slightly short:
  // The total is estimated from the mbox filesize, but progress is tracked
  // by counting bytes as they are written out - and the mbox "From " lines
  // are _not_ written out to the maildir files.
  // This is still accurate enough to provide progress to the user, but we
  // don't want the GUI left showing "progress 97% - conversion complete!"
  // or anything silly like that.
  self.postMessage({ msg: "progress", val: totalCost, total: totalCost });

  // Let the main thread know we succeeded.
  self.postMessage({ msg: "success" });
});
