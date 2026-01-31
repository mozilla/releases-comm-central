# Bail out once getting an error.
set -e

# Optional argument: extra cargo flags (e.g., "-Z build-std --target <target>" for sanitizer builds)
CARGO_TEST_FLAGS="${1:-}"

echo "\n\nTest suite for cubeb-coreaudio\n========================================"

if [[ -z "${RUST_BACKTRACE}" ]]; then
    # Display backtrace for debugging
    export RUST_BACKTRACE=1
fi
echo "RUST_BACKTRACE is set to ${RUST_BACKTRACE}\n"

export MACOSX_DEPLOYMENT_TARGET="10.15"

if [[ -n "${CARGO_TEST_FLAGS}" ]]; then
    echo "CARGO_TEST_FLAGS: ${CARGO_TEST_FLAGS}\n"
fi

if [[ -n "${RUSTFLAGS}" ]]; then
    echo "RUSTFLAGS: ${RUSTFLAGS}\n"
fi

if [[ -n "${SANITIZER_BUILD}" ]]; then
    echo "SANITIZER_BUILD: enabled\n"
fi

# Detect if running with sanitizer (via SANITIZER_BUILD flag, CARGO_TEST_FLAGS, or RUSTFLAGS).
SANITIZER_ENABLED=""
if [[ -n "${SANITIZER_BUILD}" ]] || [[ "${CARGO_TEST_FLAGS}" == *"-Zsanitizer"* ]] || [[ "${RUSTFLAGS}" == *"-Zsanitizer"* ]]; then
    SANITIZER_ENABLED="1"
fi

# Skip certain tests when running with sanitizer flags.
EXTRA_TEST_FLAGS=""
SKIP_TEST_FLAGS=""
if [[ -n "${SANITIZER_ENABLED}" ]]; then
    # Skip doc tests when running with sanitizer flags.
    # Doc tests run via rustdoc which doesn't receive target-specific rustflags,
    # causing ABI mismatch with std compiled with sanitizer.
    EXTRA_TEST_FLAGS="--lib --tests"
    echo "Skipping doc tests (incompatible with sanitizers)\n"
    # Skip #[should_panic] tests - sanitizers cause SIGABRT instead of caught panic
    # when unwinding through FFI callbacks (dispatch queues) in run_serially_forward_panics.
    # Future: Once #[cfg(sanitize)] stabilizes (https://github.com/rust-lang/rust/issues/39699),
    # we could modify run_serially_forward_panics to use a simple mutex instead of dispatch
    # queues under sanitizers, allowing these tests to run.
    SKIP_TEST_FLAGS="--skip test_panic_"
    echo "Skipping #[should_panic] tests (incompatible with sanitizers)\n"
fi

# Run tests in the sub crate
# Run the tests by `cargo * -p <SUB_CRATE>` if it's possible. By doing so, the duplicate compiling
# between this crate and the <SUB_CRATE> can be saved. The compiling for <SUB_CRATE> can be reused
# when running `cargo *` with this crate.
# -------------------------------------------------------------------------------------------------
SUB_CRATE="coreaudio-sys-utils"

# Skip format/clippy checks when running with sanitizer flags.
# They don't benefit from sanitizers and would cause ABI mismatch by compiling
# dependencies without sanitizer flags (which then get cached and reused).
if [[ -z "${SANITIZER_ENABLED}" ]]; then
    # Format check
    # `cargo fmt -p *` is only usable in workspaces, so a workaround is to enter to the sub crate
    # and then exit from it.
    cd $SUB_CRATE
    cargo fmt --all -- --check
    cd ..

    # Lints check
    cargo clippy -p $SUB_CRATE -- -D warnings
fi

# Regular Tests
cargo test -p $SUB_CRATE ${EXTRA_TEST_FLAGS} ${CARGO_TEST_FLAGS} -- ${SKIP_TEST_FLAGS}

# Run tests in the main crate
# -------------------------------------------------------------------------------------------------
# Skip format/clippy checks when running with sanitizer flags.
if [[ -z "${SANITIZER_ENABLED}" ]]; then
    # Format check
    cargo fmt --all -- --check

    # Lints check
    cargo clippy -- -D warnings
fi

# Regular Tests
cargo test --verbose ${EXTRA_TEST_FLAGS} ${CARGO_TEST_FLAGS} -- ${SKIP_TEST_FLAGS}

# Timing sensitive tests must run serially so they cannot be impacted by other tasks on the queue
cargo test test_ops_timing_sensitive ${CARGO_TEST_FLAGS} -- --ignored --test-threads=1

# Parallel Tests
cargo test test_parallel ${CARGO_TEST_FLAGS} -- --ignored --nocapture --test-threads=1

# Device-changed Tests
sh run_device_tests.sh "${CARGO_TEST_FLAGS}"

# Manual Tests
# cargo test test_switch_output_device ${CARGO_TEST_FLAGS} -- --ignored --nocapture
# cargo test test_device_collection_change ${CARGO_TEST_FLAGS} -- --ignored --nocapture
# cargo test test_stream_tester ${CARGO_TEST_FLAGS} -- --ignored --nocapture