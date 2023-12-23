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

/**
 * Merge all the messages in a maildir into a single mbox file.
 *
 * @param {string} maildir - Path to the source maildir.
 * @param {string} mboxFilename - Path of the mbox file to create.
 * @param {function(integer):void} progressFn - Function to be invoked regularly
 *   with progress updates. Takes param specifying numbers of "units" processed
 *   since last update.
 */
async function maildirToMBox(maildir, mboxFilename, progressFn) {
  // Helper to format dates
  // eg "Thu Jan 18 12:34:56 2018"
  const fmtUTC = function (d) {
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
      d.getUTCDate().toString().padStart(2) +
      " " +
      d.getUTCHours().toString().padStart(2, "0") +
      ":" +
      d.getUTCMinutes().toString().padStart(2, "0") +
      ":" +
      d.getUTCSeconds().toString().padStart(2, "0") +
      " " +
      d.getUTCFullYear()
    );
  };

  // Initialize mbox file
  await IOUtils.write(mboxFilename, new Uint8Array(), {
    mode: "create",
  });

  // Iterate over all the message files in "cur".
  const curPath = PathUtils.join(maildir, "cur");
  const paths = await IOUtils.getChildren(curPath);
  const files = await Promise.all(
    paths.map(async path => {
      const stat = await IOUtils.stat(path);
      return {
        path,
        creationDate: stat.creationTime,
      };
    })
  );
  // We write out the mbox messages ordered by creation time.
  // Not ideal, but best we can do without parsing message.
  files.sort(function (a, b) {
    return a.creationDate - b.creationDate;
  });

  for (const ent of files) {
    const raw = await IOUtils.read(ent.path);
    // Old converter had a bug where maildir messages included the
    // leading "From " marker, so we need to cope with any
    // cases of this left in the wild.
    if (String.fromCharCode.apply(null, raw.slice(0, 5)) != "From ") {
      // Write the separator line.
      // Technically, timestamp should be the reception time of the
      // message, but we don't really want to have to parse the
      // message here and nothing is likely to rely on it.
      const sepLine = "From - " + fmtUTC(new Date()) + "\n";
      await IOUtils.writeUTF8(mboxFilename, sepLine, {
        mode: "append",
      });
    }

    await IOUtils.write(mboxFilename, raw, {
      mode: "append",
    });
    // Maildir progress is one per message.
    progressFn(1);
  }
}

/**
 * Split an mbox file up into a maildir.
 *
 * @param {string} mboxPath - Path of the mbox file to split.
 * @param {string} maildirPath - Path of the maildir to create.
 * @param {function(integer):void} progressFn - Function to be invoked regularly
 *   with progress updates. Takes param specifying numbers of "units" processed
 *   since last update.
 */
async function mboxToMaildir(mboxPath, maildirPath, progressFn) {
  // Create the maildir structure.
  await IOUtils.makeDirectory(maildirPath);
  const curDirPath = PathUtils.join(maildirPath, "cur");
  const tmpDirPath = PathUtils.join(maildirPath, "tmp");
  await IOUtils.makeDirectory(curDirPath);
  await IOUtils.makeDirectory(tmpDirPath);

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
  const sepRE = /^(From (?:.*?)\r?\n)[\x21-\x7E]+:/gm;

  // Use timestamp as starting name for output messages, incrementing
  // by one for each.
  let ident = Date.now();

  /**
   * Helper. Convert a string into a Uint8Array, using no encoding. The low
   * byte of each 16 bit character will be used, the high byte discarded.
   *
   * @param {string} str - Input string with chars in 0-255 range.
   * @returns {Uint8Array} The output bytes.
   */
  const stringToBytes = function (str) {
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
  const bytesToString = function (bytes) {
    return bytes.reduce(function (str, b) {
      return str + String.fromCharCode(b);
    }, "");
  };

  let outPath;

  /**
   * Helper. Write out a block of bytes to the current message file, starting
   * a new file if required.
   *
   * @param {string} str - The bytes to append (as chars in range 0-255).
   */
  const writeToMsg = async function (str) {
    let mode = "append";
    if (!outPath) {
      outPath = PathUtils.join(curDirPath, ident.toString() + ".eml");
      ident += 1;
      mode = "create";
    }
    // We know that str is really raw 8-bit data, not UTF-16. So we can
    // discard the upper byte and just keep the low byte of each char.
    const raw = stringToBytes(str);
    await IOUtils.write(outPath, raw, { mode });
    // For mbox->maildir conversion, progress is measured in bytes.
    progressFn(raw.byteLength);
  };

  let buf = "";
  let eof = false;
  let offset = 0;
  while (!eof) {
    const rawBytes = await IOUtils.read(mboxPath, {
      offset,
      maxBytes: CHUNK_SIZE,
    });
    // We're using JavaScript strings (which hold 16bit characters) to store
    // 8 bit data. This sucks, but is faster than trying to operate directly
    // upon Uint8Arrays. A lot of work goes into optimising JavaScript strings.
    buf += bytesToString(rawBytes);
    offset += rawBytes.byteLength;
    eof = rawBytes.byteLength < CHUNK_SIZE;

    let pos = 0;
    sepRE.lastIndex = 0; // start at beginning of buf
    let m = null;
    while ((m = sepRE.exec(buf)) !== null) {
      // Output everything up to the line separator.
      if (m.index > pos) {
        await writeToMsg(buf.substring(pos, m.index));
      }
      pos = m.index;
      pos += m[1].length; // skip the "From " line
      // Reset the current message file path if any.
      if (outPath) {
        outPath = null;
      }
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
      await writeToMsg(buf.substring(pos, endPos));
    }
    buf = buf.substring(endPos);
  }
}

/**
 * Check if directory is a subfolder directory.
 *
 * @param {string} name - Name of directory to check.
 * @returns {boolean} - true if subfolder.
 */
function isSBD(name) {
  return name.substr(-4) == ".sbd";
}

/**
 * Check if file is a type which should be copied verbatim as part of a
 * conversion.
 * See also: nsMsgLocalStoreUtils::nsShouldIgnoreFile().
 *
 * @param {string} name - Name of file to check.
 * @returns {boolean} - true if file should be copied verbatim.
 */
function isFileToCopy(name) {
  const ext4 = name.substr(-4);
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
    "feeds.json.tmp",
    "feeds.json.backup",
    "feeds.json.corrupt",
    "feeditems.json",
    "feeditems.json.tmp",
    "feeditems.json.backup",
    "feeditems.json.corrupt",
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
 * @param {string} name - Name of file to check.
 * @returns {boolean} - true if file is an mbox
 */
function isMBoxName(name) {
  // If it's not a "special" file, assume it's mbox.
  return !isFileToCopy(name);
}

/**
 * Check if directory is a maildir (by looking for a "cur" subdir).
 *
 * @param {string} dir - Path of directory to check.
 * @returns {Promise<boolean>} - true if directory is a maildir.
 */
async function isMaildir(dir) {
  try {
    const cur = PathUtils.join(dir, "cur");
    const fi = await IOUtils.stat(cur);
    return fi.type === "directory";
  } catch (ex) {
    if (ex instanceof DOMException && ex.name === "NotFoundError") {
      // "cur" does not exist - not a maildir.
      return false;
    }
    throw ex; // Other error.
  }
}

/**
 * Count the number of messages in the "cur" dir of maildir.
 *
 * @param {string} maildir - Path of maildir.
 * @returns {Promise<number>} - number of messages found.
 */
async function countMaildirMsgs(maildir) {
  const cur = PathUtils.join(maildir, "cur");
  const paths = await IOUtils.getChildren(cur);
  return paths.length;
}

/**
 * Recursively calculate the 'cost' of a hierarchy of maildir folders.
 * This is the figure used for progress updates.
 * For maildir, cost is 1 per message.
 *
 * @param {string} srcPath - Path of root dir containing maildirs.
 * @returns {Promise<number>} - calculated conversion cost.
 */
async function calcMaildirCost(srcPath) {
  let cost = 0;
  for (const path of await IOUtils.getChildren(srcPath)) {
    const stat = await IOUtils.stat(path);
    if (stat.type === "directory") {
      const name = PathUtils.filename(path);
      if (isSBD(name)) {
        // Recurse into subfolder.
        cost += await calcMaildirCost(path);
      } else if (await isMaildir(path)) {
        // Looks like a maildir. Cost is number of messages.
        cost += await countMaildirMsgs(path);
      }
    }
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
 * @param {string} srcPath - Path of root dir containing maildirs.
 * @returns {Promise<number>} - calculated conversion cost.
 */
async function calcMBoxCost(srcPath) {
  let cost = 0;
  for (const path of await IOUtils.getChildren(srcPath)) {
    const stat = await IOUtils.stat(path);
    const name = PathUtils.filename(path);
    if (stat.type === "directory") {
      if (isSBD(name)) {
        // Recurse into .sbd subfolder.
        cost += await calcMBoxCost(path);
      }
    } else if (isMBoxName(name)) {
      cost += stat.size;
    }
  }
  return cost;
}

/**
 * Recursively convert a tree of mbox-based folders to maildirs.
 *
 * @param {string} srcPath - Root path containing mboxes.
 * @param {string} destPath - Where to create destination root.
 * @param {function(integer):void} progressFn - Function to be invoked regularly
 *   with progress updates. Takes param specifying numbers of "units" processed
 *   since last update.
 */
async function convertTreeMBoxToMaildir(srcPath, destPath, progressFn) {
  await IOUtils.makeDirectory(destPath);

  for (const path of await IOUtils.getChildren(srcPath)) {
    const name = PathUtils.filename(path);
    const dest = PathUtils.join(destPath, name);
    const stat = await IOUtils.stat(path);
    if (stat.type === "directory") {
      if (isSBD(name)) {
        // Recurse into .sbd subfolder.
        await convertTreeMBoxToMaildir(path, dest, progressFn);
      }
    } else if (isFileToCopy(name)) {
      await IOUtils.copy(path, dest);
    } else if (isMBoxName(name)) {
      // It's an mbox. Convert it.
      await mboxToMaildir(path, dest, progressFn);
    }
  }
}

/**
 * Recursively convert a tree of maildir-based folders to mbox.
 *
 * @param {string} srcPath - Root path containing maildirs.
 * @param {string} destPath - Where to create destination root.
 * @param {function(integer):void} progressFn - Function to be invoked regularly
 *   with progress updates. Takes param specifying numbers of "units" processed
 *   since last update.
 */
async function convertTreeMaildirToMBox(srcPath, destPath, progressFn) {
  await IOUtils.makeDirectory(destPath);

  for (const path of await IOUtils.getChildren(srcPath)) {
    const name = PathUtils.filename(path);
    const dest = PathUtils.join(destPath, name);
    const stat = await IOUtils.stat(path);
    if (stat.type === "directory") {
      if (isSBD(name)) {
        // Recurse into .sbd subfolder.
        await convertTreeMaildirToMBox(path, dest, progressFn);
      } else if (await isMaildir(path)) {
        // It's a maildir - convert it.
        await maildirToMBox(path, dest, progressFn);
      }
    } else if (isFileToCopy(name)) {
      await IOUtils.copy(path, dest);
    }
  }
}

// propagate unhandled rejections to the error handler on the main thread
self.addEventListener("unhandledrejection", function (error) {
  throw error.reason;
});

self.addEventListener("message", function (e) {
  // Unpack the request params from the main thread.
  const srcType = e.data.srcType;
  const destType = e.data.destType;
  const srcRoot = e.data.srcRoot;
  const destRoot = e.data.destRoot;
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
  costFn(srcRoot).then(totalCost => {
    let v = 0;
    const progressFn = function (n) {
      v += n;
      self.postMessage({ msg: "progress", val: v, total: totalCost });
    };
    convertFn(srcRoot, destRoot, progressFn).then(() => {
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
  });
});
