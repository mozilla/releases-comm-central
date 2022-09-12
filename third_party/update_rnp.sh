#!/bin/bash
# This script is in the public domain.
# Script to update the in-tree copy of rnp from github
# Run this within the comm/third_party directory of the source tree.

set -eE
trap 'catch_err $? $LINENO' ERR

function catch_err() {
  echo "Error! $1 at $2"
  echo "Reverting changes."
  hg revert -C rnp/. README.rnp
  # Remove any added files
  hg purge rnp/.
}


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
export PYTHONPATH="../python/thirdroc/"
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

# Cleanup rnp checkout
rm -rf ${RNPgit}/{.git,.github,.cirrus.yml,.clang-format,.gitignore}
rm -rf ${RNPgit}/{_config.yml,docker.sh,ci,cmake,git-hooks,travis.sh,vcpkg.txt}
rm -rf ${RNPgit}/{Brewfile,CMakeLists.txt,CMakeSettings.json}

# Do the switch
rm -rf rnp
mv "${RNPgit}" rnp
# Build version.h
$THIRDROC rnp_source_update rnp/ \
  "${LATEST_VERSION}" \
  "${REVISION}" \
  "${TIMESTAMP}"

# Restore moz.build
hg revert rnp/moz.build rnp/module.ver rnp/rnp.symbols rnp/src/lib/rnp/rnp_export.h \
  rnp/src/rnp/moz.build  rnp/src/rnpkeys/moz.build

# Reapply Thunderbird patch to disable obsolete ciphers
PATCH_FILES=("patches/rnp/disable_obsolete_ciphers.patch" \
             "patches/rnp/bug_1763641.patch" \
             "patches/rnp/bug_1768424.patch")
for PATCH_FILE in "${PATCH_FILES[@]}"; do
  patch -p2 -i "${PATCH_FILE}" -N -r "${MY_TEMP_DIR}/${PATCH_FILE}.rej"
done

# Patch sometimes creates backup files that are not wanted.
find rnp -name '*.orig' -exec rm -f '{}' \;

rm -rf "${MY_TEMP_DIR}"
hg addremove rnp

echo ""
echo "RNP source has been updated. Don't forget to commit the changes"
echo "after reviewing the differences."
