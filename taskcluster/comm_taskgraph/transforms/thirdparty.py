#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, unicode_literals

from six import text_type

import os
import logging
from voluptuous import (
    Optional,
    Required,
)
from mozpack import path as mozpath
import taskgraph
from taskgraph.transforms.base import (
    TransformSequence,
)
from taskgraph.util.schema import (
    Schema,
)
from taskgraph.util.cached_tasks import (
    add_optimization,
)
from taskgraph.util.templates import (
    merge_to
)
from taskgraph.transforms.task import (
    task_description_schema,
)
from comm_taskgraph.util import strip_comm_prefix
from comm_taskgraph.util.hg import get_last_modified_revision
from taskgraph import GECKO
from .. import COMM, COMM_SCRIPTS

logger = logging.getLogger(__name__)

CACHE_TYPE = 'thirdparty.v1'

SCHEMA = Schema({
    # Name of the task.
    Required('name'): text_type,

    # Relative path (from config.path) to the file the task was defined
    # in.
    Optional('job-from'): text_type,

    # Description of the task.
    Required('description'): text_type,

    Optional('treeherder'): task_description_schema['treeherder'],
    Optional('index'): task_description_schema['index'],
    Optional('run-on-projects'): task_description_schema['run-on-projects'],
    Optional('worker'): dict,

    # A description of how to run this job.
    Optional('run'): dict,
    Required('thirdparty'): {
        Required('artifact'): text_type,
        Required('script'): text_type,
        Optional('args'): [text_type]
    },
    Optional('toolchain'): [text_type],
    Required('when'): {
        Required('files-changed'): [text_type],
    },
})

transforms = TransformSequence()
transforms.add_validate(SCHEMA)


def make_base_task(config, name, job, script, command):
    """
    Common config for thirdparty build tasks
    """
    if config.params['level'] == '3':
        expires = '1 year'
    else:
        expires = '28 days'

    # To be consistent with how files-changed is used elsewhere, the
    # path must be relative to GECKO,
    script_rel = mozpath.relpath(script, GECKO)

    return {
        'attributes': {},
        'name': name,
        'description': job['description'],
        'expires-after': expires,
        'label': 'thirdparty-%s' % name,
        'run-on-projects': [],
        'index': {
            'job-name': name,
        },
        'treeherder': {
            'kind': 'build',
            'tier': 1,
        },
        'run': {
            'using': 'run-task',
            'checkout': True,
            'comm-checkout': True,
            'command': command,
            'sparse-profile': 'toolchain-build',
        },
        'worker-type': 'b-linux',
        'worker': {
            'chain-of-trust': True,
            'env': {
                'WORKSPACE': '/builds/worker/workspace',
                'UPLOAD_DIR': '/builds/worker/artifacts',
            },
            'max-run-time': 900,
        },
        'fetches': {},
        'when': {
            'files-changed': [
                script_rel,
                config.path,
            ]
        }
    }


@transforms.add
def process_thirdparty_build(config, jobs):
    """
    Set up a thirdparty library build, caching the built artifacts.
    """
    for job in jobs:
        name = job['name']
        thirdparty = job['thirdparty']

        artifact_name = thirdparty['artifact']

        script = os.path.join(COMM_SCRIPTS, thirdparty['script'])
        args = thirdparty.get('args', [])

        command = [script] + args

        task = make_base_task(config, name, job, script, command)
        merge_to(job['index'], task['index'])
        merge_to(job['treeherder'], task['treeherder'])
        merge_to(job['worker'], task['worker'])

        if 'run' in job:
            merge_to(job['run'], task['run'])
        if 'when' in job:
            merge_to(job['when'], task['when'])
        if 'toolchain' in job:
            task['fetches']['toolchain'] = job['toolchain']

        when = task.pop('when')
        if 'when' in job:
            merge_to(job['when'], when)

        # The files-changed optimization is not actually used because it
        # conflicts with the indexing optimization, but the same list of files
        # is used to look up the revision with the most recent changes in
        # order to calculate a hash for the index.
        files_changed = when['files-changed']

        task['worker'].setdefault('artifacts', []).append({
            'name': 'public/build',
            'path': '/builds/worker/artifacts',
            'type': 'directory',
        })

        if not taskgraph.fast:
            project = config.params['project']

            # Get the most recent revision with changes. files-changed paths
            # are relative to GECKO, so strip 'comm/' off first.
            files_changed = frozenset(map(lambda p: strip_comm_prefix(p), files_changed))
            last_changed_rev = get_last_modified_revision(COMM, files_changed)
            logger.info("Using artifact from rev {}.".format(last_changed_rev))

            cache_name = task['label'].replace('{}-'.format(config.kind), '', 1)

            # This adds the level to the index path automatically.
            add_optimization(
                config,
                task,
                cache_type=CACHE_TYPE,
                cache_name=cache_name,
                # Digest is based on the repo name and revision
                digest_data=command + [project, last_changed_rev, artifact_name],
            )

        yield task
