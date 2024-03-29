#!/bin/bash
set -xe

# Future products supporting Flatpaks will set this accordingly
: PRODUCT                       "${PRODUCT:=thunderbird}"

# Required environment variables
test "$VERSION"
test "$BUILD_NUMBER"
test "$CANDIDATES_DIR"
test "$L10N_CHANGESETS"
test "$FLATPAK_BRANCH"
test "$RELEASE_NOTES_URL"
test "$RAW_FILE_URL"

# Optional environment variables
: WORKSPACE                     "${WORKSPACE:=/home/worker/workspace}"
: ARTIFACTS_DIR                 "${ARTIFACTS_DIR:=/home/worker/artifacts}"

# Populate remaining environment variables
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TARGET_TAR_XZ_FULL_PATH="$ARTIFACTS_DIR/target.flatpak.tar.xz"
SOURCE_DEST="${WORKSPACE}/source"
DISTRIBUTION_DIR="$SOURCE_DEST/distribution"
FREEDESKTOP_VERSION="23.08"
FIREFOX_BASEAPP_CHANNEL="23.08"

# Create alias for ideal curl command
CURL="curl --location --retry 10 --retry-delay 10"

# Get current date
#
# This is used to populate the datetime in org.mozilla.Thunderbird.appdata.xml
DATE=$(date +%Y-%m-%d)
export DATE

# Prepare directories
#
# This command is temporary, there's an upcoming fix in the upstream
# Docker image that we work on top of, from 'freedesktopsdk', that will
# make these two lines go away eventually.
mkdir -p /root /tmp /var/tmp
mkdir -p "$ARTIFACTS_DIR"
rm -rf "$SOURCE_DEST" && mkdir -p "$SOURCE_DEST"

# Ensure a clean slate in the local Flatpak repo
rm -rf ~/.local/share/flatpak/

# Download en-US linux64 (English, 64-bit Linux) Thunderbird binary
$CURL -o "${WORKSPACE}/thunderbird.tar.bz2" \
    "${CANDIDATES_DIR}/${VERSION}-candidates/build${BUILD_NUMBER}/linux-x86_64/en-US/thunderbird-${VERSION}.tar.bz2"

# Download locale information and extract locales to be included in snap
$CURL -o "${WORKSPACE}/onchange-locales" "${RAW_FILE_URL}/mail/locales/onchange-locales"
$CURL -o "${WORKSPACE}/l10n-changesets.json" "${RAW_FILE_URL}/mail/locales/l10n-changesets.json"
locales=$(< "${WORKSPACE}/onchange-locales" sed "s/ja-JP-mac//")

# Fetch langpack extension for each locale
mkdir -p "$DISTRIBUTION_DIR"
mkdir -p "$DISTRIBUTION_DIR/extensions"
for locale in $locales; do
    $CURL -o "$DISTRIBUTION_DIR/extensions/langpack-${locale}@thunderbird.mozilla.org.xpi" \
        "$CANDIDATES_DIR/${VERSION}-candidates/build${BUILD_NUMBER}/linux-x86_64/xpi/${locale}.xpi"
done

# Download artifacts from dependencies and build the .desktop file.
(
source "${SCRIPT_DIR}/venv/bin/activate"
python3 "${SCRIPT_DIR}/build_desktop_file.py" -o "${WORKSPACE}/org.mozilla.Thunderbird.desktop" \
  -t "${SCRIPT_DIR}/org.mozilla.thunderbird.desktop.jinja2" \
  -l "${WORKSPACE}/l10n-central" \
  -L "${WORKSPACE}/l10n-changesets.json" \
  -f "mail/branding/thunderbird/brand.ftl" \
  -f "mail/messenger/flatpak.ftl"
)

# Generate AppData XML from template, add various 
envsubst < "$SCRIPT_DIR/org.mozilla.Thunderbird.appdata.xml.in" > "${WORKSPACE}/org.mozilla.Thunderbird.appdata.xml"
cp -v "$SCRIPT_DIR/distribution.ini" "$WORKSPACE"
cp -v "$SCRIPT_DIR/launch_script.sh" "$WORKSPACE"
cd "${WORKSPACE}"

# Fetch and install Firefox base app (as user, not system-wide)
flatpak remote-add --user --if-not-exists --from flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y flathub org.mozilla.firefox.BaseApp//${FIREFOX_BASEAPP_CHANNEL} --no-deps

# Create build directory and add Firefox base app files
#
# This command is temporary, there's an upcoming fix in the upstream
# Docker image that we work on top of, from 'freedesktopsdk', that will
# make these two lines go away eventually.
mkdir -p build
cp -r ~/.local/share/flatpak/app/org.mozilla.firefox.BaseApp/current/active/files build/files

# Create Flatpak build metadata file for Thunderbird
ARCH=$(flatpak --default-arch)
cat <<EOF > build/metadata
[Application]
name=org.mozilla.Thunderbird
runtime=org.freedesktop.Platform/${ARCH}/${FREEDESKTOP_VERSION}
sdk=org.freedesktop.Sdk/${ARCH}/${FREEDESKTOP_VERSION}
base=app/org.mozilla.firefox.BaseApp/${ARCH}/${FIREFOX_BASEAPP_CHANNEL}
[Extension org.mozilla.Thunderbird.Locale]
directory=share/runtime/langpack
autodelete=true
locale-subset=true
EOF

# Create Flatpak build metadata file for locales
cat <<EOF > build/metadata.locale
[Runtime]
name=org.mozilla.Thunderbird.Locale

[ExtensionOf]
ref=app/org.mozilla.Thunderbird/${ARCH}/${FLATPAK_BRANCH}
EOF

# Install Thunderbird files into appdir
appdir=build/files
install -d "${appdir}/lib/"
(cd "${appdir}/lib/" && tar jxf "${WORKSPACE}/thunderbird.tar.bz2")
install -D -m644 -t "${appdir}/share/appdata" org.mozilla.Thunderbird.appdata.xml
install -D -m644 -t "${appdir}/share/applications" org.mozilla.Thunderbird.desktop
for size in 16 32 48 64 128; do
    install -D -m644 "${appdir}/lib/thunderbird/chrome/icons/default/default${size}.png" "${appdir}/share/icons/hicolor/${size}x${size}/apps/org.mozilla.Thunderbird.png"
done

# Generate AppStream metadata and add screenshots from Flathub
appstream-compose --prefix="${appdir}" --origin=flatpak --basename=org.mozilla.Thunderbird org.mozilla.Thunderbird
appstream-util mirror-screenshots "${appdir}"/share/app-info/xmls/org.mozilla.Thunderbird.xml.gz "https://dl.flathub.org/repo/screenshots/org.mozilla.Thunderbird-${FLATPAK_BRANCH}" build/screenshots "build/screenshots/org.mozilla.Thunderbird-${FLATPAK_BRANCH}"

# Install locales, distribution, and launch_script.sh into appdir
#
# We must install each locale individually, since we're symlinking
# each one.
#
# We put the langpacks in /app/share/locale/$LANG_CODE and symlink that
# directory to where Thunderbird looks them up; this way only the subset
# of locales configured on the user's system are downloaded, instead of
# all locales.
mkdir -p "${appdir}/lib/thunderbird/distribution/extensions"
for locale in $locales; do
    install -D -m644 -t "${appdir}/share/runtime/langpack/${locale%%-*}/" "${DISTRIBUTION_DIR}/extensions/langpack-${locale}@thunderbird.mozilla.org.xpi"
    ln -sf "/app/share/runtime/langpack/${locale%%-*}/langpack-${locale}@thunderbird.mozilla.org.xpi" "${appdir}/lib/thunderbird/distribution/extensions/langpack-${locale}@thunderbird.mozilla.org.xpi"
done
install -D -m644 -t "${appdir}/lib/thunderbird/distribution" distribution.ini
install -D -m755 launch_script.sh "${appdir}/bin/thunderbird"

# Build Flatpak
#
# We use features=devel to enable ptrace, which we need for the crash
# reporter.  The application is still confined in a pid namespace, so
# that won't let us escape the flatpak sandbox.  See bug 1653852.
#
# We use own-name to ensure Thunderbird has access to DBus, as app ID
# (org.mozilla.Thunderbird) does not match bus names
# (org.mozilla.thunderbird, lowercase "t"). The app ID may be updated
# in the future to match the default bus names.
flatpak build-finish build                                      \
        --allow=devel                                           \
        --share=ipc                                             \
        --share=network                                         \
        --socket=pulseaudio                                     \
        --socket=wayland                                        \
        --socket=x11                                            \
        --socket=pcsc                                           \
        --socket=cups                                           \
        --require-version=0.10.3                                \
        --persist=.thunderbird                                  \
        --filesystem=xdg-download:rw                            \
        --filesystem=~/.gnupg                                   \
        --filesystem=xdg-run/gnupg:ro                           \
        --filesystem=xdg-run/speech-dispatcher:ro               \
        --filesystem=/run/.heim_org.h5l.kcm-socket              \
        --device=all                                            \
        --own-name="org.mozilla.thunderbird.*"                  \
        --own-name="org.mozilla.thunderbird_beta.*"             \
        --talk-name="org.gtk.vfs.*"                             \
        --talk-name=org.a11y.Bus                                \
        --system-talk-name=org.freedesktop.NetworkManager       \
        --command=thunderbird

# Export Flatpak build into repo
flatpak build-export --disable-sandbox --no-update-summary --exclude='/share/runtime/langpack/*/*' repo build "$FLATPAK_BRANCH"
flatpak build-export --disable-sandbox --no-update-summary --metadata=metadata.locale --files=files/share/runtime/langpack repo build "$FLATPAK_BRANCH"

# Commit screenshots to repo
ostree commit --repo=repo --canonical-permissions --branch=screenshots/x86_64 build/screenshots
flatpak build-update-repo --generate-static-deltas repo

# Package Flatpak repo as tar
tar cvfJ flatpak.tar.xz repo
mv -- flatpak.tar.xz "$TARGET_TAR_XZ_FULL_PATH"

# Build Flatpak bundle (.flatpak) from repo
flatpak build-bundle "$WORKSPACE"/repo org.mozilla.Thunderbird.flatpak org.mozilla.Thunderbird "$FLATPAK_BRANCH"

# Move bundle to artifacts
mv org.mozilla.Thunderbird.flatpak "$ARTIFACTS_DIR/"
