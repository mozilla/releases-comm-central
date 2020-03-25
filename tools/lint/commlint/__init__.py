# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import os

from mozpack import path as mozpath
from mozlint.pathutils import findobject

TASKCLUSTER_EXCLUDE_PATHS = (
    'comm/editor',
    'comm/suite',
)


def _taskcluster_excludes(root, config):
    if os.environ.get('MOZLINT_NO_SUITE', None):
        # Ignore Seamonkey-only paths when run from Taskcluster
        excludes = [mozpath.join(root, path) for path in TASKCLUSTER_EXCLUDE_PATHS]

        config.setdefault('exclude', [])
        config['exclude'].extend(excludes)


def lint_wrapper(paths, config, **lintargs):
    log = lintargs['log']

    _taskcluster_excludes(lintargs['root'], config)

    payload = findobject(config['wraps'])
    config['payload'] = config['wraps']
    del config['wraps']

    return payload(paths, config, **lintargs)
