#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -vex

# Install the evolve extension
# Mercurial will complain that it can't find the evolve extension - this is
# because we don't have it yet, and we are asking mercurial to go install it
# so mercurial can use it.
hg clone https://repo.mercurial-scm.org/evolve/ "$HOME/.mozbuild/evolve"

# Get pipx
mkdir -p "${HOME}/bin"
wget -O "${HOME}/bin/pipx" https://github.com/pypa/pipx/releases/download/1.4.3/pipx.pyz
chmod +x "${HOME}/bin/pipx"

# Install moz-phab
export PIPX_BIN_DIR=${HOME}/bin
pipx install -v MozPhab==1.5.1
