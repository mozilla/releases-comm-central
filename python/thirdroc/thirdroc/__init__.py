# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import print_function, absolute_import

import re
from distutils.version import StrictVersion

VTAG_RE = re.compile(r"^v\d+\.\d+\.\d+$")


def tag2version(tag):
    """
    Convert a tag of form v0.0.0 to a version string
    :param string tag:
    :return string:
    """
    if VTAG_RE.match(tag):
        return tag[1:]
    else:
        raise Exception("Invalid tag {}".format(tag))


def get_latest_version(*versions):
    """
    Given a list of versions (that must parse with distutils.version.StrictVersion,
    return the latest/newest version.
    :param list versions:
    :return StrictVersion:
    """
    version_list = [StrictVersion(tag2version(v)) for v in versions]
    version_list.sort()
    return version_list[-1]


def latest_version(*versions):
    print(get_latest_version(*versions))
