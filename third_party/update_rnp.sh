#!/bin/bash
# This script is in the public domain.
# Script to update the in-tree copy of rnp from github
# Run this within the comm/third_party directory of the source tree.

set -e

if [[ ! -f rnp/moz.build ]]; then
  echo "Missing rnp directory in current path."
  exit 1
fi
if [[ ! -f ../../mach ]]; then
  echo "Cannot find mach at ../../mach"
  exit 1
fi
if [[ -n "$1" ]]; then
  CHECKOUT_REV="$1"
fi
THIRDROC="../../mach python -m thirdroc"

MY_TEMP_DIR=$(mktemp -d -t rnp_update.XXXXXX) || exit 1

RNPgit="${MY_TEMP_DIR}/rnp"
git clone https://github.com/rnpgp/rnp "${RNPgit}"
if [[ -n "${CHECKOUT_REV}" ]]; then
  git -C "${RNPgit}" checkout "${CHECKOUT_REV}"
fi

# Get the latest release from the list of tags
TAGLIST=$(git -C "${RNPgit}" tag --list v[0-9]*)

LATEST_VERSION=$($THIRDROC latest_version $TAGLIST)
REVISION=$(git -C "${RNPgit}" rev-parse --verify HEAD)
TIMESTAMP=$(git -C "${RNPgit}" show -s --format=%ct)

BUGREPORT="https://bugzilla.mozilla.org/enter_bug.cgi?product=Thunderbird"

# Update the README.rnp file
# Make a copy in /tmp since macOS sed does not have -i

# Cleanup rnp checkout
rm -rf ${RNPgit}/{.git,.github,.cirrus.yml,.clang-format,.gitignore}
rm -rf ${RNPgit}/{_config.yml,docker.sh,ci,cmake,git-hooks,travis.sh}
rm -rf ${RNPgit}/{Brewfile,CMakeLists.txt}

# Do the switch
rm -rf rnp
mv "${RNPgit}" rnp
# Build version.h/config.h.in
$THIRDROC rnp_source_update rnp/ \
  "${LATEST_VERSION}" \
  "${REVISION}" \
  "${TIMESTAMP}" \
  "${BUGREPORT}"

# Restore moz.build
hg revert rnp/moz.build rnp/Makefile.in rnp/module.ver rnp/rnp.symbols

rm -rf "${MY_TEMP_DIR}"
hg addremove rnp

echo ""
echo "RNP source has been updated. Don't forget to commit the changes"
echo "after reviewing the differences."
