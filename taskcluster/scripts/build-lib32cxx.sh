#!/bin/bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

set -x -E -v

# This script is for building libc++.a (linux32)

# Environment variables that are set by Taskcluster.
GECKO_PATH=${GECKO_PATH:-"/builds/worker/checkouts/gecko"}
MOZ_FETCHES_DIR=${MOZ_FETCHES_DIR:-"/builds/worker/workspace/fetches"}
UPLOAD_DIR=${UPLOAD_DIR:-"/builds/worker/artifacts"}

cd $GECKO_PATH

if [ -n "$TOOLTOOL_MANIFEST" ]; then
  . taskcluster/scripts/misc/tooltool-download.sh
fi

if [ -d "$MOZ_FETCHES_DIR/binutils/bin" ]; then
  export PATH="$MOZ_FETCHES_DIR/binutils/bin:$PATH"
fi
if [ -d "$MOZ_FETCHES_DIR/gcc/bin" ]; then
  export PATH="$MOZ_FETCHES_DIR/gcc/bin:$PATH"
fi
if [ -d "$MOZ_FETCHES_DIR/clang/bin" ]; then
  export PATH="$MOZ_FETCHES_DIR/clang/bin:$PATH"
fi

PKGDIR="${MOZ_FETCHES_DIR}/pkgdir"

prepare() {
  cd $MOZ_FETCHES_DIR/llvm-project
  mkdir build-libcxxabi build-libcxx
  return 0
}

build() {
  local base_cmake_args="-G Ninja
    -DCMAKE_BUILD_TYPE=Release
    -DCMAKE_INSTALL_PREFIX=$PKGDIR/lib32-libc++
    -DCMAKE_SYSROOT=$MOZ_FETCHES_DIR/sysroot
    -DLLVM_LIBDIR_SUFFIX=32
    -DLLVM_LINK_LLVM_DYLIB=ON
    -DLLVM_ENABLE_RTTI=ON
    -DLLVM_MAIN_SRC_DIR=$MOZ_FETCHES_DIR/llvm-project"

  local abi_cmake_args="-DLIBCXXABI_INCLUDE_TESTS=OFF"
  local cxx_cmake_args="-DPYTHON_EXECUTABLE=/usr/bin/python2.7
    -DLIBCXX_CXX_ABI=libcxxabi
    -DLIBCXX_CXX_ABI_INCLUDE_PATHS=${MOZ_FETCHES_DIR}/llvm-project/libcxxabi/include
    -DLIBCXX_CXX_ABI_LIBRARY_PATH=${PKGDIR}/lib32-libc++/lib32"

  cd "${MOZ_FETCHES_DIR}/llvm-project/build-libcxxabi"
  cmake ../libcxxabi -DCMAKE_C_FLAGS:STRING="-m32 -fPIC" -DCMAKE_CXX_FLAGS:STRING="-m32 -fPIC" \
    ${base_cmake_args} ${abi_cmake_args}
  ninja && ninja install

  cd "${MOZ_FETCHES_DIR}/llvm-project/build-libcxx"
  cmake ../libcxx -DCMAKE_C_FLAGS:STRING="-m32 -fPIC" -DCMAKE_CXX_FLAGS:STRING="-m32 -fPIC" \
    ${base_cmake_args} ${cxx_cmake_args}
  ninja && ninja install

  return 0
}

package() {
  cd "${PKGDIR}"
  mv lib32-libc++ clang # This is so when unpacked, the files overlay the clang toolchain
  rm -rf clang/include

  mkdir -p "${UPLOAD_DIR}"
  tar cfJ "${UPLOAD_DIR}"/lib32cxx.tar.xz clang

  return 0
}

# Basic dependency structure.
# Each step depends on the previous completing successfully.
# The packaging block depends on the build block's success.
{
  prepare &&
    build &&
    package
} && exit 0

# Ideally, the "exit 0" above ran after the packaging block ran successfully.
# In case it didn't, error out here so CI catches it.
exit 1
