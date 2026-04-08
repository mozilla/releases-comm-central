# The option `Z` is only accepted on the nightly compiler
# so changing to nightly toolchain by `rustup default nightly` is required.

# See: https://github.com/rust-lang/rust/issues/39699 for more sanitizer support.

toolchain=$(rustup default)
echo "\nUse Rust toolchain: $toolchain"

if [[ $toolchain != nightly* ]]; then
    echo "The sanitizer is only available on Rust Nightly only. Skip."
    exit
fi

# Bail out once getting an error.
set -e

# Determine the target triple for the current platform.
# This is needed for -Zbuild-std which requires an explicit target.
TARGET=$(rustc -vV | grep host | cut -d' ' -f2)
echo "Target: $TARGET"

# Accept sanitizers as command line arguments.
# Usage: ./run_sanitizers.sh [address] [thread]
# Default: Run all sanitizers (address and thread)
# For public CI: ./run_sanitizers.sh address (ASan only)
# For maintainer CI: ./run_sanitizers.sh address thread (or no args for all)
# Ideally, sanitizers should be ("address" "leak" "memory" "thread") but
# - `memory`: It doesn't works with target x86_64-apple-darwin
# - `leak`: Get some errors that are out of our control. See:
#   https://github.com/mozilla/cubeb-coreaudio-rs/issues/45#issuecomment-591642931
if [ $# -eq 0 ]; then
    # Default: Run all available sanitizers
    sanitizers=("address" "thread")
else
    # Use provided arguments
    sanitizers=("$@")
fi

echo "Running sanitizers: ${sanitizers[*]}"

for san in "${sanitizers[@]}"
do
    San="$(tr '[:lower:]' '[:upper:]' <<< ${san:0:1})${san:1}"
    echo "\n\nRun ${San}Sanitizer\n------------------------------"
    # Clean build artifacts between sanitizer runs to avoid ABI mismatch.
    # Different sanitizers modify the ABI differently, so crates compiled for one
    # sanitizer cannot be reused with another.
    cargo clean
    # Use -Zbuild-std to rebuild std with sanitizer support.
    # RUSTFLAGS applies sanitizer to target code and -Zbuild-std's std rebuild.
    # CARGO_HOST_RUSTFLAGS="" prevents sanitizer from applying to build scripts
    # and proc-macros (they run on host and link against host's non-sanitized std).
    export RUSTFLAGS="-Zsanitizer=${san}"
    # ThreadSanitizer needs -Cunsafe-allow-abi-mismatch=sanitizer to work around
    # a Rust bug where ABI check incorrectly fires even with -Zbuild-std.
    # See: https://github.com/rust-lang/rust/issues/146465
    if [[ "${san}" == "thread" ]]; then
        export RUSTFLAGS="${RUSTFLAGS} -Cunsafe-allow-abi-mismatch=sanitizer"
        # TSan false-positive tests: these trigger races in CoreAudio's
        # internal synchronization that TSan cannot observe. They are
        # skipped in pass 1 and re-run with annotations in pass 2.
        tsan_false_positive_tests=(
            "test_ops_duplex_voice_stream_set_input_processing_params"
        )
        tsan_skip_flags=""
        for t in "${tsan_false_positive_tests[@]}"; do
            tsan_skip_flags="${tsan_skip_flags} --skip ${t}"
        done
        export TSAN_SKIP_FLAGS="${tsan_skip_flags}"
    fi
    export CARGO_HOST_RUSTFLAGS=""
    # Set SANITIZER_BUILD so run_tests.sh can detect sanitizer mode.
    export SANITIZER_BUILD=1
    cargo_test_flags="-Z build-std --target ${TARGET}"
    # Pass 1: Run all tests (TSan false-positive tests are skipped via
    # TSAN_SKIP_FLAGS, picked up by run_tests.sh).
    sh run_tests.sh "${cargo_test_flags}"
    # Pass 2 (TSan only): Re-run false-positive tests with annotations
    # enabled so TSan can see CoreAudio's internal synchronization.
    if [[ "${san}" == "thread" ]]; then
        echo "\n\nRe-running TSan false-positive tests with annotations\n------------------------------"
        cargo_test_flags_annotated="${cargo_test_flags} --features tsan-annotations"
        for t in "${tsan_false_positive_tests[@]}"; do
            echo "Running ${t} with tsan-annotations..."
            cargo test --verbose --lib --tests ${cargo_test_flags_annotated} -- ${t}
        done
        unset TSAN_SKIP_FLAGS
    fi
    unset RUSTFLAGS
    unset CARGO_HOST_RUSTFLAGS
    unset SANITIZER_BUILD
done
