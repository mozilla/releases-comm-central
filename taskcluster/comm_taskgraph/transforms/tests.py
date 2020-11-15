#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

from taskgraph.util.treeherder import split_symbol, join_symbol, add_suffix
from taskgraph.transforms.base import TransformSequence

transforms = TransformSequence()


def _remove_suffix(text, suffix):
    """
    Removes a suffix from a string.
    """
    if text.endswith(suffix):
        _drop = len(suffix) * -1
        text = text[:_drop]
    return text


@transforms.add
def tests_drop_1proc(config, jobs):
    """
    Remove the -1proc suffix from Treeherder group symbols.
    Restore the -e10s suffix (because some day we will have them!)

    Reverses the effects of bug 1541527. Thunderbird builds are all single
    process.
    """
    for job in jobs:
        test = job["run"]["test"]
        e10s = test["e10s"]

        if not e10s:  # test-name & friends end with '-1proc'
            test["test-name"] = _remove_suffix(test["test-name"], "-1proc")
            test["try-name"] = _remove_suffix(test["try-name"], "-1proc")
            group, symbol = split_symbol(test["treeherder-symbol"])
            if group != "?":
                group = _remove_suffix(group, "-1proc")
            test["treeherder-symbol"] = join_symbol(group, symbol)

            job["label"] = job["label"].replace("-1proc", "")
            job["name"] = _remove_suffix(job["name"], "-1proc")
            job["treeherder"]["symbol"] = test["treeherder-symbol"]
        else:  # e10s in the future
            test["test-name"] = add_suffix(test["test-name"], "-e10s")
            test["try-name"] = add_suffix(test["try-name"], "-e10s")
            group, symbol = split_symbol(test["treeherder-symbol"])
            if group != "?":
                group = add_suffix(group, "-e10s")
            test["treeherder-symbol"] = join_symbol(group, symbol)

            job["label"] += "-e10s"
            job["name"] = add_suffix(job["name"], "-e10s")
            job["treeherder"]["symbol"] = test["treeherder-symbol"]

        yield job
