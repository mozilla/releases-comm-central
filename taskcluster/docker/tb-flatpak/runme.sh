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
test "$MANIFEST_URL"

# Optional environment variables
: WORKSPACE                     "${WORKSPACE:=/home/worker/workspace}"
: ARTIFACTS_DIR                 "${ARTIFACTS_DIR:=/home/worker/artifacts}"

# This is used to populate the datetime in org.mozilla.Thunderbird.appdata.xml
DATE=$(date +%Y-%m-%d)
export DATE

SCRIPT_DIRECTORY="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TARGET_TAR_XZ_FULL_PATH="$ARTIFACTS_DIR/target.flatpak.tar.xz"
SOURCE_DEST="${WORKSPACE}/source"
FREEDESKTOP_VERSION="22.08"
FIREFOX_BASEAPP_CHANNEL="22.08"


# XXX: these commands are temporarily, there's an upcoming fix in the upstream Docker image
# that we work on top of, from `freedesktopsdk`, that will make these two lines go away eventually
mkdir -p /root /tmp /var/tmp
mkdir -p "$ARTIFACTS_DIR"
rm -rf "$SOURCE_DEST" && mkdir -p "$SOURCE_DEST"

# XXX ensure we have a clean slate in the local flatpak repo
rm -rf ~/.local/share/flatpak/

CURL="curl --location --retry 10 --retry-delay 10"

# Download en-US linux64 binary
$CURL -o "${WORKSPACE}/thunderbird.tar.bz2" \
    "${CANDIDATES_DIR}/${VERSION}-candidates/build${BUILD_NUMBER}/linux-x86_64/en-US/thunderbird-${VERSION}.tar.bz2"

# Use list of locales to fetch L10N XPIs
$CURL -o "${WORKSPACE}/l10n-changesets.json" "$L10N_CHANGESETS"
locales=$(python3 "$SCRIPT_DIRECTORY/extract_locales_from_l10n_json.py" "${WORKSPACE}/l10n-changesets.json")

# Download artifacts from dependencies and build the .desktop file.
(
source /scripts/venv/bin/activate
python3 /scripts/build-desktop-file.py -o "$WORKSPACE/org.mozilla.Thunderbird.desktop" \
  -t "/scripts/org.mozilla.Thunderbird.desktop.jinja2" \
  -l "$WORKSPACE/l10n-central" \
  -L "$WORKSPACE/l10n-changesets.json" \
  -f "mail/branding/thunderbird/brand.ftl" \
  -f "mail/messenger/flatpak.ftl"
)

DISTRIBUTION_DIR="$SOURCE_DEST/distribution"
mkdir -p "$DISTRIBUTION_DIR"

mkdir -p "$DISTRIBUTION_DIR/extensions"
for locale in $locales; do
    $CURL -o "$DISTRIBUTION_DIR/extensions/langpack-${locale}@thunderbird.mozilla.org.xpi" \
        "$CANDIDATES_DIR/${VERSION}-candidates/build${BUILD_NUMBER}/linux-x86_64/xpi/${locale}.xpi"
done

envsubst < "$SCRIPT_DIRECTORY/org.mozilla.Thunderbird.appdata.xml.in" > "${WORKSPACE}/org.mozilla.Thunderbird.appdata.xml"
cp -v "$SCRIPT_DIRECTORY/distribution.ini" "$WORKSPACE"
cp -v "$SCRIPT_DIRECTORY/launch-script.sh" "$WORKSPACE"
cd "${WORKSPACE}"

flatpak remote-add --user --if-not-exists --from flathub https://dl.flathub.org/repo/flathub.flatpakrepo
# XXX: added --user to `flatpak install` to avoid ambiguity
flatpak install --user -y flathub org.mozilla.firefox.BaseApp//${FIREFOX_BASEAPP_CHANNEL} --no-deps

# XXX: this command is temporarily, there's an upcoming fix in the upstream Docker image
# that we work on top of, from `freedesktopsdk`, that will make these two lines go away eventually
mkdir -p build
cp -r ~/.local/share/flatpak/app/org.mozilla.firefox.BaseApp/current/active/files build/files

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

cat <<EOF > build/metadata.locale
[Runtime]
name=org.mozilla.Thunderbird.Locale

[ExtensionOf]
ref=app/org.mozilla.Thunderbird/${ARCH}/${FLATPAK_BRANCH}
EOF

appdir=build/files
install -d "${appdir}/lib/"
(cd "${appdir}/lib/" && tar jxf "${WORKSPACE}/thunderbird.tar.bz2")
install -D -m644 -t "${appdir}/share/appdata" org.mozilla.Thunderbird.appdata.xml
install -D -m644 -t "${appdir}/share/applications" org.mozilla.Thunderbird.desktop
for size in 16 32 48 64 128; do
    install -D -m644 "${appdir}/lib/thunderbird/chrome/icons/default/default${size}.png" "${appdir}/share/icons/hicolor/${size}x${size}/apps/org.mozilla.Thunderbird.png"
done

appstream-compose --prefix="${appdir}" --origin=flatpak --basename=org.mozilla.Thunderbird org.mozilla.Thunderbird
appstream-util mirror-screenshots "${appdir}"/share/app-info/xmls/org.mozilla.Thunderbird.xml.gz "https://dl.flathub.org/repo/screenshots/org.mozilla.Thunderbird-${FLATPAK_BRANCH}" build/screenshots "build/screenshots/org.mozilla.Thunderbird-${FLATPAK_BRANCH}"

# XXX: we used to `install -D` before which automatically created the components
# of target, now we need to manually do this since we're symlinking
mkdir -p "${appdir}/lib/thunderbird/distribution/extensions"
# XXX: we put the langpacks in /app/share/locale/$LANG_CODE and symlink that
# directory to where Thunderbird looks them up; this way only subset configured
# on user system is downloaded vs all locales
for locale in $locales; do
    install -D -m644 -t "${appdir}/share/runtime/langpack/${locale%%-*}/" "${DISTRIBUTION_DIR}/extensions/langpack-${locale}@thunderbird.mozilla.org.xpi"
    ln -sf "/app/share/runtime/langpack/${locale%%-*}/langpack-${locale}@thunderbird.mozilla.org.xpi" "${appdir}/lib/thunderbird/distribution/extensions/langpack-${locale}@thunderbird.mozilla.org.xpi"
done
install -D -m644 -t "${appdir}/lib/thunderbird/distribution" distribution.ini
install -D -m755 launch-script.sh "${appdir}/bin/thunderbird"

# We use features=devel to enable ptrace, which we need for the crash
# reporter.  The application is still confined in a pid namespace, so
# that won't let us escape the flatpak sandbox.  See bug 1653852.
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
        --device=dri                                            \
        --own-name="org.mozilla.thunderbird.*"                  \
        --own-name="org.mozilla.thunderbird_beta.*"             \
        --talk-name="org.gtk.vfs.*"                             \
        --talk-name=org.a11y.Bus                                \
        --system-talk-name=org.freedesktop.NetworkManager       \
        --command=thunderbird

flatpak build-export --disable-sandbox --no-update-summary --exclude='/share/runtime/langpack/*/*' repo build "$FLATPAK_BRANCH"
flatpak build-export --disable-sandbox --no-update-summary --metadata=metadata.locale --files=files/share/runtime/langpack repo build "$FLATPAK_BRANCH"
ostree commit --repo=repo --canonical-permissions --branch=screenshots/x86_64 build/screenshots
flatpak build-update-repo --generate-static-deltas repo
tar cvfJ flatpak.tar.xz repo

mv -- flatpak.tar.xz "$TARGET_TAR_XZ_FULL_PATH"

flatpak build-bundle "$WORKSPACE"/repo org.mozilla.Thunderbird.flatpak org.mozilla.Thunderbird "$FLATPAK_BRANCH"

mv org.mozilla.Thunderbird.flatpak "$ARTIFACTS_DIR/"
