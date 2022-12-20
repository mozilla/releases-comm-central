# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Notification utility functions
"""

import os

from taskcluster import Notify, optionsFromEnvironment

TB_BUILD_ADDR = "tb-builds@thunderbird.net"


def email_notification(subject, content, recipients=None):
    # use proxy if configured, otherwise local credentials from env vars
    if recipients is None:
        recipients = [TB_BUILD_ADDR]

    if "TASKCLUSTER_PROXY_URL" in os.environ:
        notify_options = {"rootUrl": os.environ["TASKCLUSTER_PROXY_URL"]}
    else:
        notify_options = optionsFromEnvironment()

    notify = Notify(notify_options)
    for address in recipients:
        notify.email(
            {
                "address": address,
                "subject": subject,
                "content": content,
            }
        )
