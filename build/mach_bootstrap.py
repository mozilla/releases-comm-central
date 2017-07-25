# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import unicode_literals

import os, sys

def bootstrap(topsrcdir, mozilla_dir=None):
    if mozilla_dir is None:
        mozilla_dir = os.path.join(topsrcdir, 'mozilla')

    if not os.path.exists(mozilla_dir):
        # If we can't find `mozilla` as a subdirectory of the `comm` checkout,
        # assume that we are a subdirectory of a mozilla checkout. If we return
        # `None` here, the `mach` entrypoint will keep searching for a build
        # directory.  Since the entry point imports this into `sys.modules`,
        # clean it up, since we aren't the `mach_bootstrap` that `mach` is
        # looking for.
        del sys.modules[__name__]
        return None

    sys.path[0:0] = [mozilla_dir]
    import build.mach_bootstrap
    return build.mach_bootstrap.bootstrap(topsrcdir, mozilla_dir)
