# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import imp, os, sys

old_bytecode = sys.dont_write_bytecode
sys.dont_write_bytecode = True

ycm_module = imp.load_source("_ycm_extra_conf", os.path.join("mozilla", ".ycm_extra_conf.py"))

sys.dont_write_bytecode = old_bytecode

# Expose the FlagsForFile function from mozilla/.ycm_extra_conf.py
FlagsForFile = ycm_module.FlagsForFile
