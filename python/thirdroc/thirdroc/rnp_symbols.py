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

The header file is run through Clang's preprocessor so that functions within #ifdef #endif blocks
are handled correctly. Currently RNP_EXPERIMENTAL_PQC and RNP_EXPERIMENTAL_CRYPTO_REFRESH
are filtered out. (Clang is run with -DRNP_EXPORT so that the 'RNP_API' macro is not expanded.)

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
import pathlib
import re
import subprocess

HERE = os.path.dirname(__file__)
TOPSRCDIR = os.path.abspath(os.path.join(HERE, "../../../../"))
THIRD_SRCDIR = os.path.join(TOPSRCDIR, "comm/third_party")
HEADER_FILE_REL = "rnp/include/rnp/rnp.h"
HEADER_FILE = os.path.join(THIRD_SRCDIR, HEADER_FILE_REL)
SYMBOLS_FILE_REL = "rnp/rnp.symbols"
SYMBOLS_FILE = os.path.join(THIRD_SRCDIR, SYMBOLS_FILE_REL)

FUNC_DECL_RE = re.compile(r"^RNP_API\s+.*?([a-zA-Z0-9_]+)\(.*$")


def preprocess_header(header_file):
    """Execute clang preprocessor on the header file and yield each line."""
    cmd = ["clang", "-E", "-DRNP_EXPORT", header_file]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True)
    for line in proc.stdout:
        yield line.rstrip()


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
    for line in preprocess_header(filearg):
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
        type=pathlib.Path,
        nargs="?",
        help=f"input path to rnp.h header file (default: {HEADER_FILE_REL})",
    )
    parser.add_argument(
        "symbols_file",
        default=SYMBOLS_FILE,
        type=pathlib.Path,
        nargs="?",
        help=f"output path to symbols file (default: {SYMBOLS_FILE_REL})",
    )

    args = parser.parse_args()

    with args.symbols_file.open("w") as out_fp:
        for symbol in sorted(list(extract_func_defs(args.header_file))):
            out_fp.write(f"{symbol}\n")
