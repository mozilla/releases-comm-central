#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

from taskgraph.transforms.base import TransformSequence

from gecko_taskgraph.util.signed_artifacts import is_notarization_kind

transforms = TransformSequence()


def check_notarization(dependencies):
    """
    Determine whether a signing job is the last step of a notarization
    by looking at its dependencies.
    """
    for dep in dependencies:
        if is_notarization_kind(dep):
            return True


@transforms.add
def remove_widevine(config, jobs):
    """
    Remove references to widevine signing.

    This is to avoid adding special cases for handling signed artifacts
    in mozilla-central code. Artifact signature formats are determined in
    gecko_taskgraph.util.signed_artifacts. There's no override mechanism so we
    remove the gcp_prod_autograph_widevine format here.
    """
    for job in jobs:
        task = job["task"]
        payload = task["payload"]

        widevine_scope = (
            "project:comm:thunderbird:releng:signing:format:gcp_prod_autograph_widevine"
        )
        if widevine_scope in task["scopes"]:
            task["scopes"].remove(widevine_scope)
        if "upstreamArtifacts" in payload:
            for artifact in payload["upstreamArtifacts"]:
                if "gcp_prod_autograph_widevine" in artifact.get("formats", []):
                    artifact["formats"].remove("gcp_prod_autograph_widevine")

        yield job


@transforms.add
def no_sign_langpacks(config, jobs):
    """
    Remove langpacks from signing jobs after they are automatically added.
    """
    for job in jobs:
        task = job["task"]
        payload = task["payload"]

        if "upstreamArtifacts" in payload:
            for artifact in payload["upstreamArtifacts"]:
                if "autograph_langpack" in artifact.get("formats", []):
                    artifact["formats"].remove("autograph_langpack")

                # Make sure that there are no .xpi files in the artifact list
                if all([p.endswith("target.langpack.xpi") for p in artifact["paths"]]):
                    payload["upstreamArtifacts"].remove(artifact)

        yield job


@transforms.add
def check_for_no_formats(config, jobs):
    """
    Check for signed artifacts without signature formats and remove them to
    avoid scriptworker errors.
    Signing jobs that use macOS notarization do not have formats, so keep
    those.
    """
    for job in jobs:
        if not check_notarization(job["dependencies"]):
            task = job["task"]
            payload = task["payload"]

            if "upstreamArtifacts" in payload:
                for artifact in payload["upstreamArtifacts"]:
                    if "formats" in artifact and not artifact["formats"]:
                        for remove_path in artifact["paths"]:
                            job["release-artifacts"].remove(remove_path)

                        payload["upstreamArtifacts"].remove(artifact)
        yield job
