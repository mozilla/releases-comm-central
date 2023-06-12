#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

set -xe

cd /builds/worker || exit 1

python3 -m venv --system-site-packages venv
source ./venv/bin/activate
python3 -m pip install -r /builds/worker/requirements.txt
