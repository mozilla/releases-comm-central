/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { ctypes } from "resource://gre/modules/ctypes.sys.mjs";

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

// See Bug 903946
function avoidUncaughtExceptionInExternalProtocolService() {
  try {
    Services.prefs.setCharPref(
      "helpers.private_mime_types_file",
      Services.prefs.getCharPref("helpers.global_mime_types_file")
    );
  } catch (ex) {}
  try {
    Services.prefs.setCharPref(
      "helpers.private_mailcap_file",
      Services.prefs.getCharPref("helpers.global_mailcap_file")
    );
  } catch (ex) {}
}
avoidUncaughtExceptionInExternalProtocolService();

export var mailTestUtils = {
  // Loads a file to a string
  // If aCharset is specified, treats the file as being of that charset
  loadFileToString(aFile, aCharset) {
    var data = "";
    var fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
      Ci.nsIFileInputStream
    );
    fstream.init(aFile, -1, 0, 0);

    if (aCharset) {
      var cstream = Cc[
        "@mozilla.org/intl/converter-input-stream;1"
      ].createInstance(Ci.nsIConverterInputStream);
      cstream.init(fstream, aCharset, 4096, 0x0000);
      const str = {};
      while (cstream.readString(4096, str) != 0) {
        data += str.value;
      }

      cstream.close();
    } else {
      var sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );

      sstream.init(fstream);

      let str = sstream.read(4096);
      while (str.length > 0) {
        data += str;
        str = sstream.read(4096);
      }

      sstream.close();
    }

    fstream.close();

    return data;
  },

  // Loads a message to a string
  // If aCharset is specified, treats the file as being of that charset
  loadMessageToString(aFolder, aMsgHdr, aCharset) {
    var data = "";
    let bytesLeft = aMsgHdr.messageSize;
    const stream = aFolder.getLocalMsgStream(aMsgHdr);
    if (aCharset) {
      const cstream = Cc[
        "@mozilla.org/intl/converter-input-stream;1"
      ].createInstance(Ci.nsIConverterInputStream);
      cstream.init(stream, aCharset, 4096, 0x0000);
      const str = {};
      let bytesToRead = Math.min(bytesLeft, 4096);
      while (cstream.readString(bytesToRead, str) != 0) {
        data += str.value;
        bytesLeft -= bytesToRead;
        if (bytesLeft <= 0) {
          break;
        }
        bytesToRead = Math.min(bytesLeft, 4096);
      }
      cstream.close();
    } else {
      var sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );

      sstream.init(stream);

      let bytesToRead = Math.min(bytesLeft, 4096);
      var str = sstream.read(bytesToRead);
      bytesLeft -= str.length;
      while (str.length > 0) {
        data += str;
        if (bytesLeft <= 0) {
          break;
        }
        bytesToRead = Math.min(bytesLeft, 4096);
        str = sstream.read(bytesToRead);
        bytesLeft -= str.length;
      }
      sstream.close();
    }
    stream.close();

    return data;
  },

  // Loads a message to a UTF-16 string.
  loadMessageToUTF16String(folder, msgHdr, charset) {
    const str = this.loadMessageToString(folder, msgHdr, charset);
    const arr = new Uint8Array(Array.from(str, x => x.charCodeAt(0)));
    return new TextDecoder().decode(arr);
  },

  // Gets the first message header in a folder.
  firstMsgHdr(folder) {
    const enumerator = folder.msgDatabase.enumerateMessages();
    const first = enumerator[Symbol.iterator]().next();
    return first.done ? null : first.value;
  },

  // Gets message header number N (0 based index) in a folder.
  getMsgHdrN(folder, n) {
    let i = 0;
    for (const next of folder.msgDatabase.enumerateMessages()) {
      if (i == n) {
        return next;
      }
      i++;
    }
    return null;
  },

  /**
   * Returns the file system a particular file is on.
   * Currently supported on Windows only.
   *
   * @param {nsIFile} aFile - The file to get the file system for.
   * @returns {string} The file system a particular file is on, or 'null'
   *   if not on Windows.
   */
  get_file_system(aFile) {
    if (!("@mozilla.org/windows-registry-key;1" in Cc)) {
      dump("get_file_system() is supported on Windows only.\n");
      return null;
    }

    // Win32 type and other constants.
    const BOOL = ctypes.int32_t;
    const MAX_PATH = 260;

    const kernel32 = ctypes.open("kernel32.dll");

    try {
      // Returns the path of the volume a file is on.
      const GetVolumePathName = kernel32.declare(
        "GetVolumePathNameW",
        ctypes.winapi_abi,
        BOOL, // return type: 1 indicates success, 0 failure
        ctypes.char16_t.ptr, // in: lpszFileName
        ctypes.char16_t.ptr, // out: lpszVolumePathName
        ctypes.uint32_t // in: cchBufferLength
      );

      const filePath = aFile.path;
      // The volume path should be at most 1 greater than than the length of the
      // path -- add 1 for a trailing backslash if necessary, and 1 for the
      // terminating null character. Note that the parentheses around the type are
      // necessary for new to apply correctly.
      const volumePath = new (ctypes.char16_t.array(filePath.length + 2))();

      if (!GetVolumePathName(filePath, volumePath, volumePath.length)) {
        throw new Error(
          "Unable to get volume path for " +
            filePath +
            ", error " +
            ctypes.winLastError
        );
      }

      // Returns information about the file system for the given volume path. We just need
      // the file system name.
      const GetVolumeInformation = kernel32.declare(
        "GetVolumeInformationW",
        ctypes.winapi_abi,
        BOOL, // return type: 1 indicates success, 0 failure
        ctypes.char16_t.ptr, // in, optional: lpRootPathName
        ctypes.char16_t.ptr, // out: lpVolumeNameBuffer
        ctypes.uint32_t, // in: nVolumeNameSize
        ctypes.uint32_t.ptr, // out, optional: lpVolumeSerialNumber
        ctypes.uint32_t.ptr, // out, optional: lpMaximumComponentLength
        ctypes.uint32_t.ptr, // out, optional: lpFileSystemFlags
        ctypes.char16_t.ptr, // out: lpFileSystemNameBuffer
        ctypes.uint32_t // in: nFileSystemNameSize
      );

      // We're only interested in the name of the file system.
      const fsName = new (ctypes.char16_t.array(MAX_PATH + 1))();

      if (
        !GetVolumeInformation(
          volumePath,
          null,
          0,
          null,
          null,
          null,
          fsName,
          fsName.length
        )
      ) {
        throw new Error(
          "Unable to get volume information for " +
            volumePath.readString() +
            ", error " +
            ctypes.winLastError
        );
      }

      return fsName.readString();
    } finally {
      kernel32.close();
    }
  },

  /**
   * Try marking a region of a file as sparse, so that zeros don't consume
   * significant amounts of disk space.  This is a platform-dependent routine and
   * is not supported on all platforms. The current status of this function is:
   * - Windows: Supported, but only on NTFS volumes.
   * - Mac: Not supported.
   * - Linux: As long as you seek to a position before writing, happens automatically
   *   on most file systems, so this function is a no-op.
   *
   * @param {nsIFile} aFile - The file to mark as sparse.
   * @param {integer} aRegionStart - The start position of the sparse region,
   *   in bytes.
   * @param {integer} aRegionBytes - The number of bytes to mark as sparse.
   * @returns {boolean} Whether the OS and file system supports marking files as
   *   sparse. If this is true, then the file has been marked as sparse.
   *   If this isfalse, then the underlying system doesn't support marking files as
   *   sparse. If an exception is thrown, then the system does support marking
   *   files as sparse, but an error occurred while doing so.
   */
  mark_file_region_sparse(aFile, aRegionStart, aRegionBytes) {
    const fileSystem = this.get_file_system(aFile);
    dump(
      "[mark_file_region_sparse()] File system = " +
        (fileSystem || "(unknown)") +
        ", file region = at " +
        this.toMiBString(aRegionStart) +
        " for " +
        this.toMiBString(aRegionBytes) +
        "\n"
    );

    if ("@mozilla.org/windows-registry-key;1" in Cc) {
      // On Windows, check whether the drive is NTFS. If it is, proceed.
      // If it isn't, then bail out now, because in all probability it is
      // FAT32, which doesn't support sparse files.
      if (fileSystem != "NTFS") {
        return false;
      }

      // Win32 type and other constants.
      const BOOL = ctypes.int32_t;
      const HANDLE = ctypes.voidptr_t;
      // A BOOLEAN (= BYTE = unsigned char) is distinct from a BOOL.
      // http://blogs.msdn.com/b/oldnewthing/archive/2004/12/22/329884.aspx
      const BOOLEAN = ctypes.unsigned_char;
      const FILE_SET_SPARSE_BUFFER = new ctypes.StructType(
        "FILE_SET_SPARSE_BUFFER",
        [{ SetSparse: BOOLEAN }]
      );
      // LARGE_INTEGER is actually a type union. We'll use the int64 representation
      const LARGE_INTEGER = ctypes.int64_t;
      const FILE_ZERO_DATA_INFORMATION = new ctypes.StructType(
        "FILE_ZERO_DATA_INFORMATION",
        [{ FileOffset: LARGE_INTEGER }, { BeyondFinalZero: LARGE_INTEGER }]
      );

      const GENERIC_WRITE = 0x40000000;
      const OPEN_ALWAYS = 4;
      const FILE_ATTRIBUTE_NORMAL = 0x80;
      const INVALID_HANDLE_VALUE = new ctypes.Int64(-1);
      const FSCTL_SET_SPARSE = 0x900c4;
      const FSCTL_SET_ZERO_DATA = 0x980c8;
      const FILE_BEGIN = 0;

      const kernel32 = ctypes.open("kernel32.dll");

      try {
        const CreateFile = kernel32.declare(
          "CreateFileW",
          ctypes.winapi_abi,
          HANDLE, // return type: handle to the file
          ctypes.char16_t.ptr, // in: lpFileName
          ctypes.uint32_t, // in: dwDesiredAccess
          ctypes.uint32_t, // in: dwShareMode
          ctypes.voidptr_t, // in, optional: lpSecurityAttributes (note that
          // we're cheating here by not declaring a
          // SECURITY_ATTRIBUTES structure -- that's because
          // we're going to pass in null anyway)
          ctypes.uint32_t, // in: dwCreationDisposition
          ctypes.uint32_t, // in: dwFlagsAndAttributes
          HANDLE // in, optional: hTemplateFile
        );

        const filePath = aFile.path;
        const hFile = CreateFile(
          filePath,
          GENERIC_WRITE,
          0,
          null,
          OPEN_ALWAYS,
          FILE_ATTRIBUTE_NORMAL,
          null
        );
        const hFileInt = ctypes.cast(hFile, ctypes.intptr_t);
        if (ctypes.Int64.compare(hFileInt.value, INVALID_HANDLE_VALUE) == 0) {
          throw new Error(
            "CreateFile failed for " +
              filePath +
              ", error " +
              ctypes.winLastError
          );
        }

        try {
          const DeviceIoControl = kernel32.declare(
            "DeviceIoControl",
            ctypes.winapi_abi,
            BOOL, // return type: 1 indicates success, 0 failure
            HANDLE, // in: hDevice
            ctypes.uint32_t, // in: dwIoControlCode
            ctypes.voidptr_t, // in, optional: lpInBuffer
            ctypes.uint32_t, // in: nInBufferSize
            ctypes.voidptr_t, // out, optional: lpOutBuffer
            ctypes.uint32_t, // in: nOutBufferSize
            ctypes.uint32_t.ptr, // out, optional: lpBytesReturned
            ctypes.voidptr_t // inout, optional: lpOverlapped (again, we're
            // cheating here by not having this as an
            // OVERLAPPED structure
          );
          // bytesReturned needs to be passed in, even though it's meaningless
          const bytesReturned = new ctypes.uint32_t();
          const sparseBuffer = new FILE_SET_SPARSE_BUFFER();
          sparseBuffer.SetSparse = 1;

          // Mark the file as sparse
          if (
            !DeviceIoControl(
              hFile,
              FSCTL_SET_SPARSE,
              sparseBuffer.address(),
              FILE_SET_SPARSE_BUFFER.size,
              null,
              0,
              bytesReturned.address(),
              null
            )
          ) {
            throw new Error(
              "Unable to mark file as sparse, error " + ctypes.winLastError
            );
          }

          const zdInfo = new FILE_ZERO_DATA_INFORMATION();
          zdInfo.FileOffset = aRegionStart;
          const regionEnd = aRegionStart + aRegionBytes;
          zdInfo.BeyondFinalZero = regionEnd;
          // Mark the region as a sparse region
          if (
            !DeviceIoControl(
              hFile,
              FSCTL_SET_ZERO_DATA,
              zdInfo.address(),
              FILE_ZERO_DATA_INFORMATION.size,
              null,
              0,
              bytesReturned.address(),
              null
            )
          ) {
            throw new Error(
              "Unable to mark region as zero, error " + ctypes.winLastError
            );
          }

          // Move to past the sparse region and mark it as the end of the file. The
          // above DeviceIoControl call is useless unless followed by this.
          const SetFilePointerEx = kernel32.declare(
            "SetFilePointerEx",
            ctypes.winapi_abi,
            BOOL, // return type: 1 indicates success, 0 failure
            HANDLE, // in: hFile
            LARGE_INTEGER, // in: liDistanceToMove
            LARGE_INTEGER.ptr, // out, optional: lpNewFilePointer
            ctypes.uint32_t // in: dwMoveMethod
          );
          if (!SetFilePointerEx(hFile, regionEnd, null, FILE_BEGIN)) {
            throw new Error(
              "Unable to set file pointer to end, error " + ctypes.winLastError
            );
          }

          const SetEndOfFile = kernel32.declare(
            "SetEndOfFile",
            ctypes.winapi_abi,
            BOOL, // return type: 1 indicates success, 0 failure
            HANDLE // in: hFile
          );
          if (!SetEndOfFile(hFile)) {
            throw new Error(
              "Unable to set end of file, error " + ctypes.winLastError
            );
          }

          return true;
        } finally {
          const CloseHandle = kernel32.declare(
            "CloseHandle",
            ctypes.winapi_abi,
            BOOL, // return type: 1 indicates success, 0 failure
            HANDLE // in: hObject
          );
          CloseHandle(hFile);
        }
      } finally {
        kernel32.close();
      }
    } else if ("nsILocalFileMac" in Ci) {
      // Macs don't support marking files as sparse.
      return false;
    } else {
      // Assuming Unix here. Unix file systems generally automatically sparsify
      // files.
      return true;
    }
  },

  /**
   * Converts a size in bytes into its mebibytes string representation.
   * NB: 1 MiB = 1024 * 1024 = 1048576 B.
   *
   * @param {integer} aSize - The size in bytes.
   * @returns {string} A string representing the size in mebibytes.
   */
  toMiBString(aSize) {
    return aSize / 1048576 + " MiB";
  },

  /**
   * A variant of do_timeout that accepts an actual function instead of
   *  requiring you to pass a string to evaluate.  If the function throws an
   *  exception when invoked, we will use do_throw to ensure that the test fails.
   *
   * @param {integer} aDelayInMS - The number of milliseconds to wait before firing the timer.
   * @param {Function} aFunc - The function to invoke when the timer fires.
   * @param {object} [aFuncThis] - Optional 'this' pointer to use.
   * @param {*[]} aFuncArgs - Optional list of arguments to pass to the function.
   */
  _timer: null,
  do_timeout_function(aDelayInMS, aFunc, aFuncThis, aFuncArgs) {
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    const wrappedFunc = function () {
      try {
        aFunc.apply(aFuncThis, aFuncArgs);
      } catch (ex) {
        // we want to make sure that if the thing we call throws an exception,
        //  that this terminates the test.
        do_throw(ex);
      }
    };
    this._timer.initWithCallback(
      wrappedFunc,
      aDelayInMS,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
  },

  /**
   * Ensure the given nsIMsgFolder's database is up-to-date, calling the provided
   *  callback once the folder has been loaded.  (This may be instantly or
   *  after a re-parse.)
   *
   * @param {nsIMsgFolder} aFolder - The nsIMsgFolder whose database you want
   *   to ensure is up-to-date.
   * @param {Function} aCallback - The callback function to invoke once the
   *   folder has been loaded.
   * @param {object} aCallbackThis - The 'this' to use when calling the callback.
   *   Pass null if your callback does not rely on 'this'.
   * @param {*[]} aCallbackArgs - A list of arguments to pass to the callback
   *  via apply. If you provide [1,2,3], we will effectively call:
   *  aCallbackThis.aCallback(1,2,3);
   * @param {boolean} [aSomeoneElseWillTriggerTheUpdate=false] If this is true,
   *  we do not trigger the updateFolder call and it is assumed someone else is
   *  taking care of that.
   */
  updateFolderAndNotify(
    aFolder,
    aCallback,
    aCallbackThis,
    aCallbackArgs,
    aSomeoneElseWillTriggerTheUpdate = false
  ) {
    // register for the folder loaded notification ahead of time... even though
    //  we may not need it...
    const folderListener = {
      onFolderEvent(aEventFolder, aEvent) {
        if (aEvent == "FolderLoaded" && aFolder.URI == aEventFolder.URI) {
          MailServices.mailSession.RemoveFolderListener(this);
          aCallback.apply(aCallbackThis, aCallbackArgs);
        }
      },
    };

    MailServices.mailSession.AddFolderListener(
      folderListener,
      Ci.nsIFolderListener.event
    );

    if (!aSomeoneElseWillTriggerTheUpdate) {
      aFolder.updateFolder(null);
    }
  },

  /**
   * For when you want to compare elements non-strictly.
   */
  non_strict_index_of(aArray, aElem) {
    for (const [i, elem] of aArray.entries()) {
      if (elem == aElem) {
        return i;
      }
    }
    return -1;
  },

  /**
   * Click on a particular cell in a tree. `window` is not defined here in this
   * file, so we can't provide it as a default argument. Similarly, we pass in
   * `EventUtils` as an argument because importing it here does not work
   * because `window` is not defined.
   *
   * @param {object} EventUtils - The EventUtils object.
   * @param {Window} win - The window the tree is in.
   * @param {Element} tree - The tree element.
   * @param {number} row - The tree row to click on.
   * @param {number} column - The tree column to click on.
   * @param {object} event - The mouse event to synthesize, e.g. `{ clickCount: 2 }`.
   */
  treeClick(EventUtils, win, tree, row, column, event) {
    const coords = tree.getCoordsForCellItem(row, tree.columns[column], "cell");
    const treeChildren = tree.lastElementChild;
    EventUtils.synthesizeMouse(
      treeChildren,
      coords.x + coords.width / 2,
      coords.y + coords.height / 2,
      event,
      win
    );
  },

  /**
   * For waiting until an element exists in a given document. Pass in the
   * `MutationObserver` as an argument because importing it here does not work
   * because `window` is not defined here.
   *
   * @param {object} MutationObserver - The MutationObserver object.
   * @param {Document} doc - Document that contains the elements.
   * @param {string} observedNodeId - Id of the element to observe.
   * @param {string} awaitedNodeId - Id of the element that will soon exist.
   * @returns {Promise.<undefined>} - A promise fulfilled when the element exists.
   */
  awaitElementExistence(MutationObserver, doc, observedNodeId, awaitedNodeId) {
    return new Promise(resolve => {
      const outerObserver = new MutationObserver((mutationsList, observer) => {
        for (const mutation of mutationsList) {
          if (mutation.type == "childList" && mutation.addedNodes.length) {
            const element = doc.getElementById(awaitedNodeId);

            if (element) {
              observer.disconnect();
              resolve();
              return;
            }
          }
        }
      });

      const nodeToObserve = doc.getElementById(observedNodeId);
      outerObserver.observe(nodeToObserve, { childList: true });
    });
  },
};
