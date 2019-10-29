#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

from taskgraph.transforms.base import TransformSequence

transforms = TransformSequence()


@transforms.add
def remove_widevine(config, jobs):
    """
    Remove references to widevine signing.

    This is to avoid adding special cases for handling signed artifacts
    in mozilla-central code. Artifact signature formats are determined in
    taskgraph.util.signed_artifacts. There's no override mechanism so we
    remove the autograph_widevine format here.
    """
    for job in jobs:
        task = job['task']
        payload = task['payload']

        widevine_scope = 'project:comm:thunderbird:releng:signing:format' \
                         ':autograph_widevine'
        if widevine_scope in task['scopes']:
            task['scopes'].remove(widevine_scope)
        if 'upstreamArtifacts' in payload:
            for artifact in payload['upstreamArtifacts']:
                if 'autograph_widevine' in artifact.get('formats', []):
                    artifact['formats'].remove('autograph_widevine')

        yield job


@transforms.add
def no_sign_langpacks(config, jobs):
    """
    Remove langpacks from signing jobs after they are automatically added.
    """
    for job in jobs:
        task = job['task']
        payload = task['payload']

        if 'upstreamArtifacts' in payload:
            for artifact in payload['upstreamArtifacts']:
                if 'autograph_langpack' in artifact.get('formats', []):
                    artifact['formats'].remove('autograph_langpack')

                if 'formats' in artifact:
                    if not artifact['formats']:  # length zero list is False
                        for remove_path in artifact['paths']:
                            job['release-artifacts'].remove(remove_path)

                        payload['upstreamArtifacts'].remove(artifact)

        yield job
