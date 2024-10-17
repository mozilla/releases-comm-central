# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Set up variables for Deb, Flatpak, and Snap packages
"""
import json

from taskgraph.transforms.base import TransformSequence
from taskgraph.transforms.run import set_label, use_fetches

from comm_taskgraph.util.l10n import read_locales_file

transforms = TransformSequence()

transforms.add(set_label)
transforms.add(use_fetches)


@transforms.add
def set_environment_vars(config, tasks):
    for task in tasks:
        env = task["worker"]["env"]

        pkg_locales_file = task.pop("package-locales-file", None)
        if pkg_locales_file:
            pkg_locales = read_locales_file(pkg_locales_file)
            env["PKG_LOCALES"] = json.dumps(pkg_locales)

        desktop_locales_file = task.pop("desktop-locales-file", None)
        if desktop_locales_file:
            desktop_locales = read_locales_file(desktop_locales_file)
            env["DESKTOP_LOCALES"] = json.dumps(desktop_locales)

        yield task
