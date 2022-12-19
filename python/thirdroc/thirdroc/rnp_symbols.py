#!/usr/bin/python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Parse rnp/rnp.h header file and build a symbols file suitable
for use with mozbuild.

This script is meant to be run when the public C API of librnp adds or removes functions so that
they can be exported by the shared library.

Limitations: The regex that captures the function name is very basic and may need adjusting if
the third_party/rnp/include/rnp/rnp.h format changes too much.
Also note that APIs that are marked deprecated are not checked for.

Dependencies: Only Python 3

Running:
  python3 rnp_symbols.py [-h] [rnp.h path] [rnp.symbols path]

Both file path arguments are optional. By default, the header file will be
read from "comm/third_party/rnp/include/rnp/rnp.h" and the symbols file will
be written to "comm/third_party/rnp/rnp.symbols".

Path arguments are relative to the current working directory, the defaults
will be determined based on the location of this script.

Either path argument can be '-' to use stdin or stdout respectively.
"""

import argparse
import os
import re
import sys

HERE = os.path.dirname(__file__)
TOPSRCDIR = os.path.abspath(os.path.join(HERE, "../../../../"))
THIRD_SRCDIR = os.path.join(TOPSRCDIR, "comm/third_party")
HEADER_FILE_REL = "rnp/include/rnp/rnp.h"
HEADER_FILE = os.path.join(THIRD_SRCDIR, HEADER_FILE_REL)
SYMBOLS_FILE_REL = "rnp/rnp.symbols"
SYMBOLS_FILE = os.path.join(THIRD_SRCDIR, SYMBOLS_FILE_REL)


FUNC_DECL_RE = re.compile(r"^RNP_API\s+.*?([a-zA-Z0-9_]+)\(.*$")


class FileArg:
    """Based on argparse.FileType from the Python standard library.
    Modified to not open the filehandles until the open() method is
    called.
    """

    def __init__(self, mode="r"):
        self._mode = mode
        self._fp = None
        self._file = None

    def __call__(self, string):
        # the special argument "-" means sys.std{in,out}
        if string == "-":
            if "r" in self._mode:
                self._fp = sys.stdin.buffer if "b" in self._mode else sys.stdin
            elif "w" in self._mode:
                self._fp = sys.stdout.buffer if "b" in self._mode else sys.stdout
            else:
                raise ValueError(f"Invalid mode {self._mode} for stdin/stdout")
        else:
            if "r" in self._mode:
                if not os.path.isfile(string):
                    raise ValueError(f"Cannot read file {string}, does not exist.")
            elif "w" in self._mode:
                if not os.access(string, os.W_OK):
                    raise ValueError(f"Cannot write file {string}, permission denied.")
            self._file = string
        return self

    def open(self):
        if self._fp:
            return self._fp
        return open(self._file, self._mode)


def get_func_name(line):
    """
    Extract the function name from a RNP_API function declaration.
    Examples:
    RNP_API rnp_result_t rnp_enable_debug(const char *file);

    RNP_API rnp_result_t rnp_ffi_create(rnp_ffi_t * ffi,
    """
    m = FUNC_DECL_RE.match(line)
    return m.group(1)


def extract_func_defs(filearg):
    """
    Look for RNP_API in the header file to find the names of the symbols that should be exported
    """
    with filearg.open() as fp:
        for line in fp:
            if line.startswith("RNP_API") and "RNP_DEPRECATED" not in line:
                func_name = get_func_name(line)
                yield func_name


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Update rnp.symbols file from rnp.h",
        epilog="To use stdin or stdout pass '-' for the argument.",
    )
    parser.add_argument(
        "header_file",
        default=HEADER_FILE,
        type=FileArg("r"),
        nargs="?",
        help=f"input path to rnp.h header file (default: {HEADER_FILE_REL})",
    )
    parser.add_argument(
        "symbols_file",
        default=SYMBOLS_FILE,
        type=FileArg("w"),
        nargs="?",
        help=f"output path to symbols file (default: {SYMBOLS_FILE_REL})",
    )

    args = parser.parse_args()

    with args.symbols_file.open() as out_fp:
        for symbol in sorted(list(extract_func_defs(args.header_file))):
            out_fp.write(f"{symbol}\n")
