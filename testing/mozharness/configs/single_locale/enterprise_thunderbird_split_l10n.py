# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

config = {
    # Source path
    "app_name": "comm/mail",
    "mozconfig_variant": "l10n-mozconfig-enterprise",
    "git_repository": "https://github.com/mozilla-l10n/firefox-l10n",
    "comm_git_repository": "https://github.com/thunderbird/thunderbird-l10n",
    "locales_dir": "comm/mail/locales",
    "ignore_locales": ["en-US"],
    "bootstrap_env": {
        "NO_MERCURIAL_SETUP_CHECK": "1",
        "MOZ_OBJDIR": "%(abs_obj_dir)s",
        "DIST": "%(abs_obj_dir)s",
        "L10NBASEDIR": "../../l10n",
    },
}
