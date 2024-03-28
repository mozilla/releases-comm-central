#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
from pathlib import Path

from gecko_taskgraph import GECKO
from gecko_taskgraph.actions.registry import register_callback_action
from gecko_taskgraph.actions.util import create_tasks, fetch_graph_and_labels
from gecko_taskgraph.util.attributes import RELEASE_PROMOTION_PROJECTS
from mozversioncontrol import HgRepository

logger = logging.getLogger(__name__)


def is_release_promotion_available(parameters):
    return parameters["project"] in RELEASE_PROMOTION_PROJECTS


@register_callback_action(
    name="l10n-bump",
    title="L10n Bumper Automation",
    symbol="l10n_bump",
    description="L10n bumper action.",
    order=500,
    context=[],
    available=is_release_promotion_available,
)
def l10n_bump_action(parameters, graph_config, _input, task_group_id, task_id):
    """
    Runs the 'l10n_bump' task.
    """
    decision_task_id, full_task_graph, label_to_taskid = fetch_graph_and_labels(
        parameters, graph_config
    )
    to_run = [label for label, entry in full_task_graph.tasks.items() if "l10n-bump" in entry.kind]
    create_tasks(
        graph_config,
        to_run,
        full_task_graph,
        label_to_taskid,
        parameters,
        decision_task_id,
    )


@register_callback_action(
    name="tb-rust-sync",
    title="Vendored Rust Sync",
    symbol="tb_rust_sync",
    description="Sync /comm/third_party/rust with mozilla-central",
    order=120,
    context=[],
    available=lambda p: p["project"] in ("comm-central", "try-comm-central"),
)
def tb_rust_sync_action(parameters, graph_config, _input, task_group_id, task_id):
    """
    Trigger Rust vendored code sync with mozilla-central.
    """
    decision_task_id, full_task_graph, label_to_taskid, _ = fetch_graph_and_labels(
        parameters, graph_config
    )
    remote = "https://hg.mozilla.org/mozilla-central"
    repo = HgRepository(Path(GECKO))
    rev = repo._run("id", "-i", "--template={node}", remote)
    logger.info(f"Setting upstream rev to {rev}")

    def modifier(entry):
        if entry.kind == "repo-update":
            entry.task["payload"]["env"]["GECKO_HEAD_REV"] = rev
        return entry

    to_run = ["repo-update-tb-rust-vendor"]
    create_tasks(
        graph_config,
        to_run,
        full_task_graph,
        label_to_taskid,
        parameters,
        decision_task_id,
        modifier=modifier,
    )
