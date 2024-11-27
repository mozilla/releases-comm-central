#!/bin/bash

set -xe

# Thunderbird Snap builds will set this to "thunderbird"
: PRODUCT                       "${PRODUCT:=thunderbird}"

# Required environment variables
test "$VERSION"
test "$BUILD_NUMBER"
test "$CANDIDATES_DIR"
test "$PKG_LOCALES"
test "$DESKTOP_LOCALES"

# Optional environment variables
: WORKSPACE                     "${WORKSPACE:=/home/worker/workspace}"
: ARTIFACTS_DIR                 "${ARTIFACTS_DIR:=/home/worker/artifacts}"
: PUSH_TO_CHANNEL               ""

# Set remaining environment variables
TARGET="target.snap"
TARGET_FULL_PATH="$ARTIFACTS_DIR/$TARGET"
SOURCE_DEST="${WORKSPACE}/source"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DISTRIBUTION_DIR="$SOURCE_DEST/distribution"
CURL="curl --location --retry 10 --retry-delay 10"

# Create necessary directories
rm -rf "$SOURCE_DEST" && mkdir -p "$SOURCE_DEST"
mkdir -p "$ARTIFACTS_DIR"
mkdir -p "$DISTRIBUTION_DIR"
mkdir -p "$DISTRIBUTION_DIR/extensions"

# Download and extract en-US linux64 binary
$CURL -o "${WORKSPACE}/${PRODUCT}.tar.xz" \
    "${CANDIDATES_DIR}/${VERSION}-candidates/build${BUILD_NUMBER}/linux-x86_64/en-US/${PRODUCT}-${VERSION}.tar.xz"
tar -C "$SOURCE_DEST" -xf "${WORKSPACE}/${PRODUCT}.tar.xz" --strip-components=1

# Download L10N XPIs (excluding ja-JP-mac)
readarray -t locales < <(echo "$PKG_LOCALES" | jq -r '.[]')
for locale in "${locales[@]}"; do
    $CURL -o "$SOURCE_DEST/distribution/extensions/langpack-${locale}@${PRODUCT}.mozilla.org.xpi" \
        "$CANDIDATES_DIR/${VERSION}-candidates/build${BUILD_NUMBER}/linux-x86_64/xpi/${locale}.xpi"
done

# Download artifacts from dependencies and build the .desktop file.
(
source "${SCRIPT_DIR}/venv/bin/activate"

python3 /scripts/fetch-content task-artifacts --dest "${WORKSPACE}"

python3 "${SCRIPT_DIR}/build_desktop_file.py"               \
  -o "${WORKSPACE}/org.mozilla.thunderbird.desktop"         \
  -t "${SCRIPT_DIR}/org.mozilla.thunderbird.desktop.jinja2" \
  -l "${WORKSPACE}/l10n-central"                            \
  -L "$DESKTOP_LOCALES"                                     \
  -f "mail/branding/thunderbird/brand.ftl"                  \
  -f "mail/messenger/flatpak.ftl"
)
cp -v "$WORKSPACE/org.mozilla.thunderbird.desktop" "$DISTRIBUTION_DIR"

# Add distribution.ini
cp -v "$SCRIPT_DIR/distribution.ini" "$DISTRIBUTION_DIR"

# Add a group policy file to disable app updates, as those are handled by snapd
cp -v "$SCRIPT_DIR/policies.json" "$DISTRIBUTION_DIR"

# In addition to the packages downloaded below, snapcraft fetches deb packages from ubuntu.com,
# when a snap is built. They may bump packages there and remove the old ones. Updating the
# database allows snapcraft to find the latest packages.
# For more context, see bug 1448239
apt-get update

# Add wrapper script to set TMPDIR appropriate for the snap
cp -v "$SCRIPT_DIR/tmpdir.sh" "$SOURCE_DEST"

# Generate snapcraft manifest
sed -e "s/@VERSION@/${VERSION}/g" -e "s/@BUILD_NUMBER@/${BUILD_NUMBER}/g" "${SCRIPT_DIR}/${PRODUCT}.snapcraft.yaml.in" > "${WORKSPACE}/snapcraft.yaml"
cd "${WORKSPACE}"

# Make sure snapcraft knows we're building for amd64
export CRAFT_ARCH_TRIPLET_BUILD_FOR='amd64'

# Package snap
snapcraft --destructive-mode --verbose

# Move snap to target path in artifact directory
mv -- *.snap "$TARGET_FULL_PATH"

# Generate checksums artifact
cd "$ARTIFACTS_DIR"
size=$(stat --printf="%s" "$TARGET_FULL_PATH")
sha=$(sha512sum "$TARGET_FULL_PATH" | awk '{print $1}')
echo "$sha sha512 $size $TARGET" > "$TARGET.checksums"

# Generate signing manifest artifact
hash=$(sha512sum "$TARGET.checksums" | awk '{print $1}')
cat << EOF > signing_manifest.json
[{"file_to_sign": "$TARGET.checksums", "hash": "$hash"}]
EOF
