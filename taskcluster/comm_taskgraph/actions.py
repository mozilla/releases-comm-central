#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

from taskgraph.actions.registry import register_callback_action
from taskgraph.actions.util import (
    create_tasks,
    fetch_graph_and_labels,
)
from taskgraph.util.attributes import RELEASE_PROMOTION_PROJECTS


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
    to_run = [
        label
        for label, entry in full_task_graph.tasks.items()
        if "l10n-bump" in entry.kind
    ]
    create_tasks(
        graph_config,
        to_run,
        full_task_graph,
        label_to_taskid,
        parameters,
        decision_task_id,
    )
