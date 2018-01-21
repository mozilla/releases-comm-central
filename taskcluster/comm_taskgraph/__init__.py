from __future__ import absolute_import, print_function, unicode_literals

import os
from taskgraph.util.yaml import load_yaml
from taskgraph.util.python_path import find_object


def _get_aliases(kind, job):
    aliases = {job['name']}

    if kind == 'toolchain':
        if job['run'].get('toolchain-alias'):
            aliases.add(job['run'].get('toolchain-alias'))

    return aliases


def _get_loader(path, config):
    try:
        loader = config['loader']
    except KeyError:
        raise KeyError("{!r} does not define `loader`".format(path))
    return find_object(loader)


def reference_loader(kind, path, config, params, loaded_tasks):
    """
    Loads selected jobs from a different taskgraph hierarchy.

    This loads jobs of the given kind from the taskgraph rooted at `base-path`,
    and includes all the jobs with names or aliaes matching the names in the
    `jobs` key.
    """
    base_path = config.pop('base-path')
    sub_path = os.path.join(base_path, kind)
    sub_config = load_yaml(sub_path, "kind.yml")
    loader = _get_loader(sub_path, sub_config)
    inputs = loader(kind, sub_path, sub_config, params, loaded_tasks)

    jobs = set(config.pop('jobs'))

    config.update(sub_config)

    return (job for job in inputs if (_get_aliases(kind, job) & jobs))
