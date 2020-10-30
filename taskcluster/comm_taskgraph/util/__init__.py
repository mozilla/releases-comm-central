#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.


def strip_comm_prefix(relpath):
    """
    Returns relpath with 'comm/' prefix removed.
    :param string relpath: relative path
    :return string: stripped path
    """
    if relpath[:5] == "comm/":
        return relpath[5:]
    else:
        return relpath
