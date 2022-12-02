#!/bin/bash

set -e

# Run the Firefox setup script
source "$HOME/checkouts/gecko/taskcluster/scripts/misc/source-test-clang-setup.sh"

# Append comm/.clang-format-ignore contents to $topsrcdir/.clang-format-ignore
sed -e 's%^\([a-z]\)%comm/\1%' comm/.clang-format-ignore >> .clang-format-ignore

# Update mozconfig file with Thunderbird build options
cat <<EOT >> "$MOZCONFIG"
ac_add_options --enable-project=comm/mail
EOT

# Run mach clang-format
# shellcheck disable=SC2068
./mach --log-no-times clang-format --output "$HOME/clang-format.json" --format json -p $@
# shellcheck disable=SC2068
./mach --log-no-times clang-format --output "$HOME/clang-format.diff" --format diff -p $@

# Exit with an error code if clang-format.diff contains a proper diff.
# Needed because mach clang-format will exit 0 regardless of outcome.
# If no formatting is needed, clang-format.diff will have a single \n,
# so check for a file size > 1 byte.
DIFF_SIZE=$(stat -c %s "$HOME/clang-format.diff")
if [[ "$DIFF_SIZE" -gt 1 ]]; then
  echo "Exiting with error status. DIFF_SIZE is $DIFF_SIZE."
  exit 1
else
  exit 0
fi
