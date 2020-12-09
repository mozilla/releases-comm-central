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
  python3 rnp_symbols.py

Output will be on stdout, this is to give the developer the opportunity to compare the old and
new versions and check for accuracy.
"""

from __future__ import absolute_import, print_function

import sys
import os
import re

HERE = os.path.dirname(__file__)
TOPSRCDIR = os.path.abspath(os.path.join(HERE, "../../../../"))
RNPSRCDIR = os.path.join(TOPSRCDIR, "comm/third_party/rnp")


FUNC_DECL_RE = re.compile(r"^RNP_API\s+.*?([a-zA-Z0-9_]+)\(.*$")


def get_func_name(line):
    """
    Extract the function name from a RNP_API function declaration.
    Examples:
    RNP_API rnp_result_t rnp_enable_debug(const char *file);

    RNP_API rnp_result_t rnp_ffi_create(rnp_ffi_t * ffi,
    """
    m = FUNC_DECL_RE.match(line)
    return m.group(1)


def extract_func_defs(filename):
    """
    Look for RNP_API in the header file to find the names of the symbols that should be exported
    """
    with open(filename) as fp:
        for line in fp:
            if line.startswith("RNP_API"):
                func_name = get_func_name(line)
                yield func_name


if __name__ == "__main__":
    if len(sys.argv) > 1:
        FILENAME = sys.argv[1]
    else:
        FILENAME = os.path.join(RNPSRCDIR, "include/rnp/rnp.h")

    for f in sorted(list(extract_func_defs(FILENAME))):
        print(f)
