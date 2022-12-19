# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


def test(mod, path, entity=None):
    # ignore anything but Thunderbird
    if mod not in (
        "netwerk",
        "dom",
        "toolkit",
        "security/manager",
        "devtools/shared",
        "devtools/client",
        "mail",
        "chat",
        "extensions/spellcheck",
        "mail/branding/thunderbird",
    ):
        return "ignore"

    # ignore dictionaries
    if mod == "extensions/spellcheck":
        return "ignore"

    return "error"
