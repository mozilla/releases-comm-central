#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.


import os

from gecko_taskgraph.util.verify import documentation_paths

from . import COMM

documentation_paths.add(os.path.join(COMM, "taskcluster", "docs"))
