# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os

from taskgraph.util.python_path import find_object
from taskgraph.util.schema import resolve_keyed_by
from taskgraph.util.yaml import load_yaml

logger = logging.getLogger(__name__)


def _get_aliases(kind, task, project):
    aliases = {task["name"]}

    if kind == "toolchain":
        if task["run"].get("toolchain-alias"):
            resolve_keyed_by(
                task["run"],
                "toolchain-alias",
                item_name=f"{kind}-{task['name']}",
                project=project,
            )
            aliaslist = task["run"].get("toolchain-alias")
            if aliaslist is not None:
                if isinstance(aliaslist, str):
                    aliaslist = [aliaslist]
                for alias in aliaslist:
                    aliases.add(alias)

    return aliases


def _expand_aliases(kind, inputs, project):
    """Given the list of all "reference-tasks" pulled in from upstream, return a
    set with all task names and aliases.
    For example "linux64-clang" is an alias of "linux64-clang-13", and both
    of those names will be included in the returned set."""
    rv = set()
    for input_task in inputs:
        for alias in _get_aliases(kind, input_task, project):
            rv.add(alias)
    return rv


def _get_loader(path, config):
    try:
        _loader = config["loader"]
    except KeyError:
        raise KeyError("{!r} does not define `loader`".format(path))
    return find_object(_loader)


def loader(kind, path, config, params, loaded_tasks):
    """
    Loads selected tasks from a different taskgraph hierarchy.

    This loads tasks of the given kind from the taskgraph rooted at `base-path`,
    and includes all the tasks with names or aliases matching the names in the
    `tasks` key.
    """
    base_path = config.pop("reference-base-path")
    sub_path = os.path.join(base_path, kind)

    logger.debug("Reference loader: load tasks from {}".format(sub_path))
    sub_config = load_yaml(sub_path, "kind.yml")
    _loader = _get_loader(sub_path, sub_config)
    inputs = _loader(kind, sub_path, sub_config, params, loaded_tasks)

    tasks = config.pop("reference-tasks", None)

    config.update(sub_config)
    project = params["project"]

    if tasks is not None:
        tasks = set(tasks)

        found_reference_tasks = [
            task for task in inputs if (_get_aliases(kind, task, project) & tasks)
        ]

        # Check for tasks listed as a reference task in Thunderbird's config
        # that do not exist in upstream.
        reference_alias_names = _expand_aliases(kind, found_reference_tasks, project)
        if reference_alias_names >= tasks:
            return found_reference_tasks
        else:
            missing_tasks = tasks - reference_alias_names
            raise Exception(
                "Reference tasks not found in kind {}: {}".format(kind, ", ".join(missing_tasks))
            )
    else:
        return inputs
