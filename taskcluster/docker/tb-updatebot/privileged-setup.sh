#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -vex

export DEBIAN_FRONTEND=noninteractive

# Update apt-get lists
apt-get update -y

# Install dependencies
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    openssh-client \
    python3-aiohttp \
    python3-async-timeout \
    python3-full \
    wget

mkdir -p /builds/worker/.mozbuild
chown -R worker:worker /builds/worker/

# Check out source code
cd /builds/worker/

rm -rf /setup
