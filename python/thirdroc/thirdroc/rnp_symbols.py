#!/usr/bin/python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Parse rnp/rnp.h header file and build a symbols file suitable
for use with mozbuild.
"""

from __future__ import absolute_import, print_function

import sys
import os

try:
    import pycparser_fake_libc
    from pycparser import parse_file
    from pycparser.c_ast import Decl
    from pycparserext.ext_c_parser import (
        FuncDeclExt,
        GnuCParser,
    )
except ImportError:
    print(
        "One or more dependencies not found: pycparser, pycparserext, pycparser_fake_libc"
    )
    sys.exit(1)

HERE = os.path.dirname(__file__)
TOPSRCDIR = os.path.abspath(os.path.join(HERE, "../../../../"))
RNPSRCDIR = os.path.join(TOPSRCDIR, "comm/third_party/rnp")


def is_func(obj):
    if isinstance(obj, Decl):
        return isinstance(obj.type, FuncDeclExt)


def extract_func_defs(filename):
    # Note that cpp is used. Provide a path to your own cpp or
    # make sure one exists in PATH.
    rnp_export_path = os.path.join(RNPSRCDIR, "src/lib")
    ast = parse_file(
        filename,
        use_cpp=True,
        cpp_args=[
            "-E",
            "-I{}".format(rnp_export_path),
            "-I{}".format(pycparser_fake_libc.directory),
        ],
        parser=GnuCParser(lex_optimize=False, yacc_optimize=False),
    )

    for node in ast.children():
        decl = node[1]
        if is_func(decl):
            yield decl.name


if __name__ == "__main__":
    if len(sys.argv) > 1:
        FILENAME = sys.argv[1]
    else:
        FILENAME = os.path.join(RNPSRCDIR, "include/rnp/rnp.h")

    for f in sorted(extract_func_defs(FILENAME)):
        print(f)
