# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os

from taskgraph.util.python_path import find_object
from taskgraph.util.schema import resolve_keyed_by
from taskgraph.util.yaml import load_yaml

logger = logging.getLogger(__name__)


def _get_aliases(kind, job, project):
    aliases = {job["name"]}

    if kind == "toolchain":
        if job["run"].get("toolchain-alias"):
            resolve_keyed_by(
                job["run"],
                "toolchain-alias",
                item_name=f"{kind}-{job['name']}",
                project=project,
            )
            aliaslist = job["run"].get("toolchain-alias")
            if aliaslist is not None:
                if isinstance(aliaslist, str):
                    aliaslist = [aliaslist]
                for alias in aliaslist:
                    aliases.add(alias)

    return aliases


def _expand_aliases(kind, inputs, project):
    """Given the list of all "reference-jobs" pulled in from upstream, return a
    set with all job names and aliases.
    For example "linux64-clang" is an alias of "linux64-clang-13", and both
    of those names will be included in the returned set."""
    rv = set()
    for input_job in inputs:
        for alias in _get_aliases(kind, input_job, project):
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
    Loads selected jobs from a different taskgraph hierarchy.

    This loads jobs of the given kind from the taskgraph rooted at `base-path`,
    and includes all the jobs with names or aliases matching the names in the
    `jobs` key.
    """
    base_path = config.pop("reference-base-path")
    sub_path = os.path.join(base_path, kind)

    logger.debug("Reference loader: load tasks from {}".format(sub_path))
    sub_config = load_yaml(sub_path, "kind.yml")
    _loader = _get_loader(sub_path, sub_config)
    inputs = _loader(kind, sub_path, sub_config, params, loaded_tasks)

    jobs = config.pop("reference-jobs", None)

    config.update(sub_config)
    project = params["project"]

    if jobs is not None:
        jobs = set(jobs)

        found_reference_jobs = [job for job in inputs if (_get_aliases(kind, job, project) & jobs)]

        # Check for jobs listed as a reference job in Thunderbird's config
        # that do not exist in upstream.
        reference_alias_names = _expand_aliases(kind, found_reference_jobs, project)
        if reference_alias_names >= jobs:
            return found_reference_jobs
        else:
            missing_jobs = jobs - reference_alias_names
            raise Exception(
                "Reference jobs not found in kind {}: {}".format(kind, ", ".join(missing_jobs))
            )
    else:
        return inputs
