#!/bin/sh -e

BINARY=$1
shift

# Cargo doesn't expose the target triple to the runner, so derive it from the
# binary path (.../target/<triple>/...).
TARGET=$(printf '%s' "$BINARY" | sed -E 's#(.*/)?target/([^/]+)/.*#\2#')

# Make sure to run the following to copy the test helper binary over.
# cargo run --target "$TARGET" --bin test
adb push "$BINARY" "/data/local/$BINARY"
adb shell "chmod 777 /data/local/$BINARY && env RUST_BACKTRACE='$RUST_BACKTRACE' TEST_HELPER=/data/local/target/$TARGET/debug/test /data/local/$BINARY" "$@"
