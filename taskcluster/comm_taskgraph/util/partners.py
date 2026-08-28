# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from gecko_taskgraph.util.partners import (
    get_enterprise_partner_configs,
    get_enterprise_partner_subset,
)


def get_release_partners(parameters):
    if parameters["project"] not in ("enterprise-thunderbird", "enterprise-firefox-try"):
        return []
    return get_enterprise_partner_subset(parameters)


def get_release_partner_config(parameters, graph_config):
    if parameters["project"] not in ("enterprise-thunderbird", "enterprise-firefox-try"):
        return {}
    return get_enterprise_partner_configs(parameters, graph_config)
