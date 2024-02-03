#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

set -xe

# Check if scripts directory exists
cd /scripts || exit 1

# Create Python virtual environment and install dependencies
python -m venv --system-site-packages venv
source ./venv/bin/activate
python -m pip install -r fluent_requirements.txt
