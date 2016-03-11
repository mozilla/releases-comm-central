# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import print_function, unicode_literals

import imp
import os
import sys


base_dir = os.path.abspath(os.path.dirname(__file__))
sys.path.append(os.path.join(base_dir, 'mozilla', 'python', 'mozbuild'))
from mozbuild.configure import ConfigureSandbox

# We can't just import config_status since configure is shadowed by this file!
f, pathname, desc = imp.find_module('configure',
                                    [os.path.join(base_dir, 'mozilla')])
config_status = imp.load_module('configure', f, pathname, desc).config_status

def main(argv):
    config = {}
    sandbox = ConfigureSandbox(config, os.environ, argv)
    sandbox.run(os.path.join(os.path.dirname(__file__), 'moz.configure'))

    if sandbox._help:
        return 0

    return config_status(config)

if __name__ == '__main__':
    sys.exit(main(sys.argv))
