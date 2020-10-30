#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import os.path
import six
import subprocess

from mozbuild.util import memoize
from mozpack import path as mozpath

import logging

logger = logging.getLogger(__name__)


def is_hg_repo(root):
    """
    Check that a path is a Mercurial checkout.
    :param six.text_type root: Repository root path
    :return boolean:
    """
    dot_hg = mozpath.join(root, ".hg")
    if os.path.exists(root) and os.path.exists(dot_hg):
        return True
    return False


@memoize
def get_last_modified_revision(root, paths):
    """
    Get the most recent Mercurial revision with changes to paths.
    :param six.text_type root: Repository root path
    :param frozenset(six.text_type) paths: Paths relative to root to check
    :return six.text_type: Most recent revision with changes to paths
    """
    logger.info("get_last_modified_revision called")
    root = mozpath.abspath(root)
    if not is_hg_repo(root):
        raise Exception("Not a valid Mercurial repo: {}", root)

    if not all(map(lambda p: os.path.exists(mozpath.join(root, p)), paths)):
        # If any of the paths do not exist, Mercurial will throw an error.
        paths_repr = ", ".join(paths)
        raise Exception("Invalid paths specified: {}".format(paths_repr))

    command = ["hg", "-R", root, "log", "--limit=1", "--template={node}"] + list(paths)
    return six.text_type(subprocess.check_output(command, cwd=root))
