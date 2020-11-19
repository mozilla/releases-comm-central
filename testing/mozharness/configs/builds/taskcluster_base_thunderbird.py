# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

config = {
    "stage_product": "thunderbird",
    "stage_username": "tbirdbld",
    "stage_ssh_key": "tbirdbld_rsa",
    "app_name": "comm/mail",
    # Thunderbird doesn't compile under pgo
    "pgo_platforms": [],
}
