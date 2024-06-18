# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from pathlib import Path

from .l10n_merge import COMM_STRINGS_QUARANTINE, COMM_STRINGS_QUARANTINE_PUSH

TB_XC_NOTIFICATION_TMPL = """\
**Thunderbird L10n Cross Channel**

Changes pushed to `comm-strings-quarantine`: {rev_url}
"""


def get_thunderbird_xc_config(topsrcdir, strings_path):
    assert isinstance(topsrcdir, Path)
    assert isinstance(strings_path, Path)
    return {
        "strings": {
            "path": strings_path,
            "url": COMM_STRINGS_QUARANTINE,
            "heads": {"default": "default"},
            "update_on_pull": True,
            "push_url": COMM_STRINGS_QUARANTINE_PUSH,
        },
        "source": {
            "comm-central": {
                "path": topsrcdir / "comm",
                "url": "https://hg.mozilla.org/comm-unified/",
                "heads": {
                    # This list of repositories is ordered, starting with the
                    # one with the most recent content (central) to the oldest
                    # (ESR). In case two ESR versions are supported, the oldest
                    # ESR goes last (e.g. esr102 goes after esr115).
                    "comm": "comm-central",
                    "comm-beta": "releases/comm-beta",
                    "comm-release": "releases/comm-release",
                    "comm-esr128": "releases/comm-esr128",
                    "comm-esr115": "releases/comm-esr115",
                },
                "config_files": [
                    "comm/calendar/locales/l10n.toml",
                    "comm/mail/locales/l10n.toml",
                    "comm/suite/locales/l10n.toml",
                ],
            },
        },
    }
