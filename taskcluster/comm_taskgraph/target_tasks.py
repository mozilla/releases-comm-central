#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import six

from taskgraph.target_tasks import (
    _target_task,
    filter_out_shipping_phase,
    standard_filter,
)


@_target_task("comm_searchfox_index")
def target_tasks_searchfox(full_task_graph, parameters, graph_config):
    """Select tasks required for indexing Thunderbird for Searchfox web site each day"""
    return [
        "searchfox-linux64-searchfox/debug",
        "searchfox-macosx64-searchfox/debug",
        "searchfox-win64-searchfox/debug",
    ]


@_target_task("comm_central_tasks")
def target_tasks_default(full_task_graph, parameters, graph_config):
    """Target the tasks which have indicated they should be run on this project
    via the `run_on_projects` attributes."""
    return [
        l
        for l, t in six.iteritems(full_task_graph.tasks)
        if standard_filter(t, parameters) and filter_out_shipping_phase(t, parameters)
    ]
