# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging

from taskgraph.transforms.base import TransformSequence

logger = logging.getLogger(__name__)

transforms = TransformSequence()


@transforms.add
def add_langpack_fetches(config, jobs):
    """Adds the fetch configuration for the langpacks. This is done here
    because Thunderbird langpacks are not signed and therefore not found as
    artifacts of "shippable-l10n-signing" like they are for Firefox. Need to
    use "shippable-l10n".
    """

    def depends_filter(dep_task):
        return (
            dep_task.kind == "shippable-l10n"
            and dep_task.attributes["build_platform"] == "linux64-shippable"
            and dep_task.attributes["build_type"] == "opt"
        )

    for job in jobs:
        dependencies = job.get("dependencies", {})
        fetches = job.setdefault("fetches", {})

        # The keys are unique, like `shippable-l10n-linux64-shippable-1/opt`, so we
        # can't ask for the tasks directly, we must filter for them.
        for t in filter(depends_filter, config.kind_dependencies_tasks.values()):
            dependencies.update({t.label: t.label})

            fetches.update(
                {
                    t.label: [
                        {
                            "artifact": f"{loc}/target.langpack.xpi",
                            "extract": False,
                            # Otherwise we can't disambiguate locales!
                            "dest": f"distribution/extensions/{loc}",
                        }
                        for loc in t.attributes["chunk_locales"]
                    ]
                }
            )

        yield job
