# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os

config = {
    "src_mozconfig": "comm/mail/config/mozconfigs/linux64/enterprise-repack",
    "repack_id": os.environ.get("REPACK_ID"),
}
