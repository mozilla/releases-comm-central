#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -x -e -v

_TARGET_OS="$1"

# Environment variables that are set by Taskcluster.
GECKO_PATH=${GECKO_PATH:-"/builds/worker/checkouts/gecko"}
MOZ_FETCHES_DIR=${MOZ_FETCHES_DIR:-"/builds/worker/workspace/fetches"}
UPLOAD_DIR=${UPLOAD_DIR:-"/builds/worker/artifacts"}
WORKSPACE=${WORKSPACE:-"${HOME}/workspace"}

cd "$WORKSPACE"
if [[ ! -d build ]]; then
  mkdir build
fi
for _d in build/libgpg-error build/libgcrypt build/libotr build/build_prefix; do
  if [[ -e "${_d}" ]]; then
    rm -rf "${_d}"
  fi
done
BUILD="${WORKSPACE}/build"

COMPRESS_EXT=xz

_INSTDIR="build_prefix"
_PREFIX="${BUILD}/${_INSTDIR}"

_ARTIFACT_STAGEDIR="${BUILD}/libotr_stage"

THIRD_PARTY_SRC="${GECKO_PATH}/comm/third_party"

GPG_ERROR_SRC="${BUILD}/libgpg-error"
GCRYPT_SRC="${BUILD}/libgcrypt"
OTR_SRC="${BUILD}/libotr"

# Set environment variables needed for all dependencies
_BASE_CONFIGURE="--build=x86_64-pc-linux --prefix=${_PREFIX} --disable-silent-rules"

_OS_CONFIGURE_FLAGS="" # May be overridden per target OS
_BASE_MAKE_FLAGS="-j$(nproc)"
_OS_MAKE_FLAGS="" # May be overridden per target OS

# Download the macOS SDK when building for macOS
if [[ -n "$TOOLTOOL_MANIFEST" ]]; then
    source "${GECKO_PATH}/taskcluster/scripts/misc/tooltool-download.sh"
fi

function clang_cfg() {
    # autotools and friends seem to work better with Clang if the compiler
    # is named <target>-clang. This applies to macOS only. It does not seem
    # necessary when building for Linux.
    local _i _clang_cfg_dir _clang_dir

    _clang_cfg_dir="${THIRD_PARTY_SRC}/clang"
    _clang_dir="${MOZ_FETCHES_DIR}/clang/bin"

    cp -a ${_clang_cfg_dir}/*.cfg "${_clang_dir}"
    for _i in x86_64-apple-darwin aarch64-apple-darwin aarch64-linux-gnu; do
      ln -s clang "${_clang_dir}/${_i}-clang"
    done
    return 0
}

function copy_sources() {
    # The checkout directory should be treated readonly
    local _pkg
    cd "${BUILD}"
    for _pkg in libgpg-error libgcrypt libotr; do
        cp -a "${THIRD_PARTY_SRC}/${_pkg}" .
    done
}

function build_libgpg-error() {
    echo "Building libgpg-error"
    cd "${GPG_ERROR_SRC}"

    ./configure ${_CONFIGURE_FLAGS} ${_CONF_STATIC} \
        --disable-tests --disable-doc --with-pic

    make ${_MAKE_FLAGS} -C src code-to-errno.h
    make ${_MAKE_FLAGS} -C src code-from-errno.h
    make ${_MAKE_FLAGS} -C src gpg-error.h
    make ${_MAKE_FLAGS} -C src libgpg-error.la

    make -C src install-nodist_includeHEADERS install-pkgconfigDATA \
        install-m4dataDATA install-binSCRIPTS install-libLTLIBRARIES
    return $?
}

function build_libgcrypt() {
    echo "Building libgcrypt"
    cd "${GCRYPT_SRC}"
    ./configure ${_CONFIGURE_FLAGS} ${_CONF_STATIC} \
        --disable-doc --with-pic "${_GCRYPT_CONF_FLAGS}" \
        --with-libgpg-error-prefix="${_PREFIX}"

    make ${_MAKE_FLAGS} -C cipher libcipher.la
    make ${_MAKE_FLAGS} -C random librandom.la
    make ${_MAKE_FLAGS} -C mpi libmpi.la
    make ${_MAKE_FLAGS} -C compat libcompat.la

    make ${_MAKE_FLAGS} -C src libgcrypt.la

    make -C src install-nodist_includeHEADERS \
        install-m4dataDATA install-binSCRIPTS install-libLTLIBRARIES
    return $?
}

function build_libotr() {
    local _f

    echo "Building libotr"
    cd "${OTR_SRC}"

    aclocal -I "${_PREFIX}/share/aclocal"
    autoconf
    automake

    CFLAGS="${CFLAGS_otr} ${CFLAGS}"
    LDFLAGS="${LDFLAGS_otr} ${LDFLAGS}"

    ./configure ${_CONFIGURE_FLAGS} --enable-shared --with-pic \
        --with-libgcrypt-prefix="${_PREFIX}"

    make ${_MAKE_FLAGS} -C src

    case "${_TARGET_OS}" in
        win*)
            cd src
            "${CC}" -shared ${LDFLAGS} -o libotr-5.dll \
                *.o -lws2_32 -lssp -lgcrypt -lgpg-error
            cp libotr-5.dll "${_PREFIX}/bin"
            ;;
        *)
            make ${_MAKE_FLAGS} -C src install-libLTLIBRARIES
            ;;
    esac

    return $?
}

function package_libotr_artifact() {
    local _f

    cd ${BUILD}
    rm -rf "${_ARTIFACT_STAGEDIR}"

    mkdir ${_ARTIFACT_STAGEDIR}

    for _f in ${_TARGET_LIBS}; do
        install "${_INSTDIR}/${_f}" ${_ARTIFACT_STAGEDIR}
    done
    case "${_TARGET_OS}" in
        win*)
            install "${_LIBDIR}/libssp-0.dll" ${_ARTIFACT_STAGEDIR}
            ;;
    esac

    rm -rf ${UPLOAD_DIR} && mkdir -p "${UPLOAD_DIR}"
    TARFILE="${UPLOAD_DIR}/libotr.tar.${COMPRESS_EXT}"
    tar -acf "${TARFILE}" -C ${_ARTIFACT_STAGEDIR} .

    return 0
}

# variables specific to an arch, but apply to all dependencies
case "${_TARGET_OS}" in
    win32)
        export PATH="${MOZ_FETCHES_DIR}/mingw32/bin:$PATH"
        export _TARGET_TRIPLE="i686-w64-mingw32"
        export CC="${_TARGET_TRIPLE}-gcc"
        _LIBDIR="/usr/lib/gcc/${_TARGET_TRIPLE}/8.3-win32"
        export LDFLAGS="-L${_LIBDIR}"
        _OS_CONFIGURE_FLAGS="--host=${_TARGET_TRIPLE} --target=${_TARGET_TRIPLE}"
        _CONF_STATIC=""

        LDFLAGS_otr="-Wl,-no-undefined,-L${_PREFIX}/lib,-lgcrypt,-lgpg-error,-lssp"
        _TARGET_LIBS="bin/libotr-5.dll bin/libgcrypt-20.dll bin/libgpg-error-0.dll"
        ;;
    win64)
        export PATH="${MOZ_FETCHES_DIR}/mingw32/bin:$PATH"
        export _TARGET_TRIPLE="x86_64-w64-mingw32"
        export CC="${_TARGET_TRIPLE}-gcc"
        _LIBDIR="/usr/lib/gcc/${_TARGET_TRIPLE}/8.3-win32"
        export LDFLAGS="-L${_LIBDIR}"
        _OS_CONFIGURE_FLAGS="--host=${_TARGET_TRIPLE} --target=${_TARGET_TRIPLE}"
        _CONF_STATIC=""

        LDFLAGS_otr="-Wl,-no-undefined,-L${_PREFIX}/lib,-lgcrypt,-lgpg-error,-lssp"
        _TARGET_LIBS="bin/libotr-5.dll bin/libgcrypt-20.dll bin/libgpg-error6-0.dll"
        ;;
    macosx64)
        for _t in cctools/bin clang/bin binutils/bin; do
            PATH="${MOZ_FETCHES_DIR}/${_t}:$PATH"
        done
        export PATH

        export _TARGET_TRIPLE="x86_64-apple-darwin"
        export MACOS_SDK_DIR="${MOZ_FETCHES_DIR}/MacOSX10.12.sdk"
        export CROSS_PRIVATE_FRAMEWORKS="${MACOS_SDK_DIR}/System/Library/PrivateFrameworks"
        export CROSS_SYSROOT="${MACOS_SDK_DIR}"

        export CC="${_TARGET_TRIPLE}-clang"
        export LD="${_TARGET_TRIPLE}-ld"
        export CFLAGS="-isysroot ${CROSS_SYSROOT}"
        export LDFLAGS="-isysroot ${CROSS_SYSROOT}"
        export DSYMUTIL="${MOZ_FETCHES_DIR}/llvm-dsymutil/llvm-dsymutil"

        _OS_CONFIGURE_FLAGS="--host=${_TARGET_TRIPLE} --target=${_TARGET_TRIPLE}"
        _CONF_STATIC="--enable-static --disable-shared"

        LDFLAGS_otr="-shared"

        _TARGET_LIBS="lib/libotr.5.dylib"
        ;;
    macosx64-aarch64)
        for _t in cctools/bin clang/bin binutils/bin; do
            PATH="${MOZ_FETCHES_DIR}/${_t}:$PATH"
        done
        export PATH

        export _TARGET_TRIPLE="aarch64-apple-darwin"
        export MACOS_SDK_DIR="${MOZ_FETCHES_DIR}/MacOSX11.0.sdk"
        export CROSS_PRIVATE_FRAMEWORKS="${MACOS_SDK_DIR}/System/Library/PrivateFrameworks"
        export CROSS_SYSROOT="${MACOS_SDK_DIR}"

        export CC="${_TARGET_TRIPLE}-clang"
        export LD="${_TARGET_TRIPLE}-ld"
        export CFLAGS="-isysroot ${CROSS_SYSROOT}"
        export LDFLAGS="-isysroot ${CROSS_SYSROOT}"
        export DSYMUTIL="${MOZ_FETCHES_DIR}/llvm-dsymutil/llvm-dsymutil"

        _OS_CONFIGURE_FLAGS="--host=${_TARGET_TRIPLE} --target=${_TARGET_TRIPLE}"
        _GCRYPT_CONF_FLAGS="--disable-asm"
        _CONF_STATIC="--enable-static --disable-shared"

        LDFLAGS_otr="-shared"

        _TARGET_LIBS="lib/libotr.5.dylib"
        ;;
    linux32)
        for _t in clang/bin binutils/bin; do
            PATH="${MOZ_FETCHES_DIR}/${_t}:$PATH"
        done
        export PATH

        export _TARGET_TRIPLE="i686-pc-linux"
        export CC="clang"
        export CFLAGS="--target=${_TARGET_TRIPLE} -m32 -march=pentium-m -msse -msse2 -mfpmath=sse"
        export CCASFLAGS="--target=${_TARGET_TRIPLE} -m32 -march=pentium-m -msse -msse2 -mfpmath=sse"
        export LDFLAGS="--target=${_TARGET_TRIPLE} -m32 -march=pentium-m -msse -msse2 -mfpmath=sse"

        export AR=llvm-ar
        export RANLIB=llvm-ranlib
        export NM=llvm-nm
        export LD=ld.lld
        export STRIP=llvm-strip

        CFLAGS_otr="-Wl,-Bstatic,-L${_PREFIX}/lib,-lgcrypt,-L${_PREFIX}/lib,-lgpg-error,-Bdynamic"
        LDFLAGS_otr="-Wl,-Bstatic,-L${_PREFIX}/lib,-lgcrypt,-L${_PREFIX}/lib,-lgpg-error,-Bdynamic"

        _OS_CONFIGURE_FLAGS="--host=${_TARGET_TRIPLE} --target=${_TARGET_TRIPLE}"
        _CONF_STATIC="--enable-static --disable-shared"
        _TARGET_LIBS='lib/libotr.so.5'
        ;;
    linux64)
        for _t in clang/bin binutils/bin; do
            PATH="${MOZ_FETCHES_DIR}/${_t}:$PATH"
        done
        export PATH

        export _TARGET_TRIPLE="x86_64-pc-linux"
        export CC="clang"
        export AR=llvm-ar
        export RANLIB=llvm-ranlib
        export NM=llvm-nm
        export LD=ld.lld
        export STRIP=llvm-strip

        CFLAGS_otr="-Wl,-Bstatic,-L${_PREFIX}/lib,-lgcrypt,-L${_PREFIX}/lib,-lgpg-error,-Bdynamic"
        LDFLAGS_otr="-Wl,-Bstatic,-L${_PREFIX}/lib,-lgcrypt,-L${_PREFIX}/lib,-lgpg-error,-Bdynamic"

        _OS_CONFIGURE_FLAGS="--host=${_TARGET_TRIPLE} --target=${_TARGET_TRIPLE}"
        _CONF_STATIC="--enable-static --disable-shared"
        _TARGET_LIBS='lib/libotr.so.5'
        ;;
    linux-aarch64)
        for _t in clang/bin binutils/bin; do
            PATH="${MOZ_FETCHES_DIR}/${_t}:$PATH"
        done
        export PATH

        export _TARGET_TRIPLE="aarch64-pc-linux"
        export CC="aarch64-linux-gnu-clang"
        export AR=llvm-ar
        export RANLIB=llvm-ranlib
        export NM=llvm-nm
        export LD=ld.lld
        export STRIP=llvm-strip

        CFLAGS_otr="-Wl,-Bstatic,-L${_PREFIX}/lib,-lgcrypt,-L${_PREFIX}/lib,-lgpg-error,-Bdynamic"
        LDFLAGS_otr="-Wl,-Bstatic,-L${_PREFIX}/lib,-lgcrypt,-L${_PREFIX}/lib,-lgpg-error,-Bdynamic"

        _OS_CONFIGURE_FLAGS="--host=${_TARGET_TRIPLE} --target=${_TARGET_TRIPLE}"
        _CONF_STATIC="--enable-static --disable-shared"
        _TARGET_LIBS='lib/libotr.so.5'
        ;;
    *)
        echo "Invalid target platform: ${_TARGET_OS}"
        exit 1
        ;;
esac

_CONFIGURE_FLAGS="${_BASE_CONFIGURE} ${_OS_CONFIGURE_FLAGS}"
_MAKE_FLAGS="${_BASE_MAKE_FLAGS} ${_OS_MAKE_FLAGS}"

# Basic dependency structure.
# Build block, followed by packaging block.
# Each step in a block depends on the previous completing successfully.
# The packaging block depends on the build block's success.
{
    copy_sources &&
        clang_cfg &&
        build_libgpg-error &&
        build_libgcrypt &&
        build_libotr
} && {
    package_libotr_artifact
} && exit 0

# Ideally, the "exit 0" above ran after the packaging block ran successfully.
# In case it didn't, error out here so CI catches it.
exit 1
