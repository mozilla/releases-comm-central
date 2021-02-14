# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import os
import logging

from taskgraph.util.yaml import load_yaml
from taskgraph.util.python_path import find_object
from six import text_type

logger = logging.getLogger(__name__)


def _get_aliases(kind, job):
    aliases = {job["name"]}

    if kind == "toolchain":
        if job["run"].get("toolchain-alias"):
            aliaslist = job["run"].get("toolchain-alias")
            if isinstance(aliaslist, text_type):
                aliaslist = [aliaslist]
            for alias in aliaslist:
                aliases.add(alias)

    return aliases


def _get_loader(path, config):
    try:
        _loader = config["loader"]
    except KeyError:
        raise KeyError("{!r} does not define `loader`".format(path))
    return find_object(_loader)


def loader(kind, path, config, params, loaded_tasks):
    """
    Loads selected jobs from a different taskgraph hierarchy.

    This loads jobs of the given kind from the taskgraph rooted at `base-path`,
    and includes all the jobs with names or aliaes matching the names in the
    `jobs` key.
    """
    base_path = config.pop("base-path")
    sub_path = os.path.join(base_path, kind)

    logger.debug("Reference loader: load tasks from {}".format(sub_path))
    sub_config = load_yaml(sub_path, "kind.yml")
    _loader = _get_loader(sub_path, sub_config)
    inputs = _loader(kind, sub_path, sub_config, params, loaded_tasks)

    jobs = config.pop("jobs", None)

    config.update(sub_config)

    if jobs is not None:
        jobs = set(jobs)
        return (job for job in inputs if (_get_aliases(kind, job) & jobs))
    else:
        return inputs
