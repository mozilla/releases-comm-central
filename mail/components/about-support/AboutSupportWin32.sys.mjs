/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// JS ctypes are needed to get at the data we need
import { ctypes } from "resource://gre/modules/ctypes.sys.mjs";

var BOOL = ctypes.int32_t;
var DRIVE_UNKNOWN = 0;
var DRIVE_NETWORK = 4;

export var AboutSupportPlatform = {
  /**
   * Given an nsIFile, gets the file system type. The type is returned as a
   * string. Possible values are "network", "local", "unknown" and null.
   */
  getFileSystemType(aFile) {
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

      // Returns the last error.
      const GetLastError = kernel32.declare(
        "GetLastError",
        ctypes.winapi_abi,
        ctypes.uint32_t // return type: the last error
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
            GetLastError()
        );
      }

      // Returns the type of the drive.
      const GetDriveType = kernel32.declare(
        "GetDriveTypeW",
        ctypes.winapi_abi,
        ctypes.uint32_t, // return type: the drive type
        ctypes.char16_t.ptr // in: lpRootPathName
      );
      const type = GetDriveType(volumePath);
      // http://msdn.microsoft.com/en-us/library/aa364939
      if (type == DRIVE_UNKNOWN) {
        return "unknown";
      } else if (type == DRIVE_NETWORK) {
        return "network";
      }
      return "local";
    } finally {
      kernel32.close();
    }
  },
};
