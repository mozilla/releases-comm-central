#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

import os
import sys

HERE = os.path.dirname(__file__)
EXT_PATH = os.path.abspath(os.path.join(HERE, "..", ".."))

sys.path.insert(0, EXT_PATH)
