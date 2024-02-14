#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Arguments: $1 - path to the requirements file
# Arguments: $2 - name of virtualenv to create under /builds/worker/venvs
#
# The script will be create the environment and install from the
# requirements file.
# It's up to the image itself to figure out how to use it.
set -xe

VENV_DIR=${VENV_DIR:-"/builds/worker/venvs"}
VENV_NAME=${2:-"venv"}

# Ensure venvs directory exists
mkdir -p "$VENV_DIR" && cd "$VENV_DIR"

# Create Python virtual environment and install dependencies
python3 -m venv --system-site-packages "$VENV_NAME"
source "./$VENV_NAME/bin/activate"
python3 -m pip install -r "$1"
