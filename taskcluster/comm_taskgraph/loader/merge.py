# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from taskgraph.loader.transform import loader as transform_loader

from comm_taskgraph.loader.reference import loader as reference_loader


def loader(kind, path, config, params, loaded_tasks):
    """
    Look up tasks via reference loader at reference-base-path using the list
    reference-tasks-from, followed by tasks-from.

    This loader has been tested with "fetch" tasks successfully. Anything else
    is likely to have bugs.
    """
    # Make a copy of config for reference_loader. Use pop here to remove the
    # fields that aren't used by the transform loader
    reference_config = {
        "kind-dependencies": config.get("kind-dependencies", None),
        "reference-base-path": config.pop("reference-base-path"),
        "reference-tasks": config.pop("reference-tasks", None),
    }
    for task in reference_loader(kind, path, reference_config, params, loaded_tasks):
        yield task

    for task in transform_loader(kind, path, config, params, loaded_tasks):
        yield task
