# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Resolve document-relative paths without following the staging symlinks.

The docs are built from a staging tree of symlinks pointing back into the
source tree. ``BuildEnvironment.relfn2path`` normalises paths with
``Path.resolve()``, which follows those symlinks and lands outside the Sphinx
source directory, so myst-parser reports every markdown link to another
document as an unknown source document. Normalise the path textually instead,
which keeps ``..`` handling but stays inside the staging tree.
"""

import os
from pathlib import Path

from sphinx.environment import BuildEnvironment


def relfn2path(self, filename, docname=None):
    file_name = Path(filename)
    if file_name.parts[:1] in {("/",), ("\\",)}:
        abs_fn = self.srcdir.joinpath(*file_name.parts[1:])
    else:
        if not docname:
            if not self.docname:
                raise KeyError("docname")
            docname = self.docname
        doc_dir = self.doc2path(docname, base=False).parent
        abs_fn = self.srcdir.joinpath(doc_dir, file_name)

    abs_fn = Path(os.path.normpath(abs_fn))
    rel_fn = Path(os.path.relpath(abs_fn, self.srcdir))
    return rel_fn.as_posix(), os.fspath(abs_fn)


def setup(app):
    BuildEnvironment.relfn2path = relfn2path
    return {
        "version": "1.0",
        "parallel_read_safe": True,
        "parallel_write_safe": True,
    }
