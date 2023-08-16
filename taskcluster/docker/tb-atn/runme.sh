#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

set -xe

cd /builds/worker || exit 1

source venv/bin/activate

exec python3 bin/atn_langpack.py
