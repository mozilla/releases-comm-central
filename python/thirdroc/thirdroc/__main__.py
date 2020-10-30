# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import

import sys

from . import latest_version
from .rnp import rnp_source_update

FUNC_MAP = {
    "latest_version": latest_version,
    "rnp_source_update": rnp_source_update,
}


def main(args):
    _func = args[1]
    if _func in FUNC_MAP:
        FUNC_MAP[_func](*args[2:])
    else:
        raise Exception("Unknown function: {}".format(args[0]))


main(sys.argv)
