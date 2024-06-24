# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os

# Paths are relative to mozilla-central
config = {
    "package-name": "thunderbird",
    "installer-tag": "comm/mail/installer/windows/app.tag",
    "sfx-stub": "comm/other-licenses/7zstub/thunderbird/7zSD.sfx",
    "stub-installer-tag": "",
    "deb-templates": "comm/mail/installer/linux/app/debian",
    "deb-l10n-templates": "comm/mail/installer/linux/langpack/debian",
    "wsx-stub": "comm/mail/installer/windows/msi/installer.wxs",
    "fetch-dir": os.environ.get("MOZ_FETCHES_DIR"),
}
