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
(
  cd "$HOME/.mozbuild/evolve"
  rev=$(hg tags | sort -k 1 -V -r | awk -F: 'NR==2 {print $2}')
  hg up "${rev}"
)

# Make venv
export VENV_DIR="/builds/worker/venvs"
./make_venv.sh "$(realpath ./requirements.txt)" rusty
VENV_DIR="${VENV_DIR}/rusty"

# Symlink in moz-phab
ln -s "$VENV_DIR/bin/moz-phab" "$HOME/bin/moz-phab"

cat - > "$HOME/bin/runme.sh" << _EOF_
#!/bin/bash
cd "$HOME"
source "$VENV_DIR/bin/activate"
exec python3 -m vendor
_EOF_

chmod +x "$HOME/bin/runme.sh"

# Run vendor unit tests
"${VENV_DIR}/bin/pytest" -v --full-trace --color=no
