/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ctypes } = ChromeUtils.import("resource://gre/modules/ctypes.jsm");
const { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");

var OS = Services.appinfo.OS.toLowerCase();

// type defs

var FILE = ctypes.StructType("FILE");
var fname_t = ctypes.char.ptr;
var wchar_t = ctypes.char16_t;

// Set the abi and path to CLib based on the OS.
var libcAbi, libcPath;
var strdup = "strdup";
var fopen = "fopen";

switch (OS) {
  case "win32":
  case "winnt":
    libcAbi = ctypes.winapi_abi;
    libcPath = ctypes.libraryName("msvcrt");
    strdup = "_strdup";
    fopen = "_wfopen";
    fname_t = wchar_t.ptr;
    break;
  case "darwin":
  case "dragonfly":
  case "freebsd":
  case "netbsd":
  case "openbsd":
    libcAbi = ctypes.default_abi;
    libcPath = ctypes.libraryName("c");
    break;
  case "linux":
    libcAbi = ctypes.default_abi;
    libcPath = "libc.so.6";
    break;
  default:
    throw new Error("Unknown OS");
}

var libc = ctypes.open(libcPath);

var CLib = {
  FILE,
  memcmp: libc.declare(
    "memcmp",
    libcAbi,
    ctypes.int,
    ctypes.void_t.ptr,
    ctypes.void_t.ptr,
    ctypes.size_t
  ),
  free: libc.declare("free", libcAbi, ctypes.void_t, ctypes.void_t.ptr),
  strdup: libc.declare(strdup, libcAbi, ctypes.char.ptr, ctypes.char.ptr),
  fclose: libc.declare("fclose", libcAbi, ctypes.int, FILE.ptr),
  fopen: libc.declare(fopen, libcAbi, FILE.ptr, fname_t, fname_t),
};

// exports

const EXPORTED_SYMBOLS = ["CLib"];
