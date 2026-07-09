# process-reader

`process-reader` is a small `no_std` Rust crate for reading raw bytes from another Linux or Android process.

It is designed for crash-reporting and minidump-writing code that needs to inspect process memory without depending on `std`. The crate copies bytes into a caller-provided buffer; it does not interpret the memory it reads.

## Platform support

This crate supports Linux and Android only. Other operating systems fail at compile time.

The intended Android targets are contemporary Android systems. Very old Android releases are not part of the supported configuration.

## Reading memory

The main type is `ProcessReader`:

```rust
use process_reader::ProcessReader;

fn read_some_memory(
    pid: libc::pid_t,
    address: usize,
) -> Result<usize, process_reader::ReadError> {
    let reader = ProcessReader::new(pid);

    let mut bytes = [0u8; 16];
    let bytes_read = reader.read_at(address, &mut bytes)?;

    // Only this prefix was read by the call. It may be shorter than the buffer.
    let _bytes = &bytes[..bytes_read];

    Ok(bytes_read)
}
```

`read_at(address, buf)` attempts to read bytes from `address` in the target process and returns the number of bytes copied. The returned length is in the range `0..=buf.len()`. The address is a virtual address in the target process, not in the calling process.

A successful read may be shorter than `buf.len()`. Short successful reads are returned as `Ok(n)`, not as errors, so callers should only interpret `buf[..n]` as bytes read by the call.

Passing an empty buffer succeeds immediately, returns `Ok(0)`, and does not perform a system call.

## Strategies

`ProcessReader` supports three Linux/Android process-memory mechanisms:

| Constructor | Strategy |
| --- | --- |
| `ProcessReader::new(pid)` | Automatically choose a strategy on the first non-empty read request |
| `ProcessReader::for_virtual_mem(pid)` | Use only `process_vm_readv(2)` |
| `ProcessReader::for_file(pid)` | Use only `/proc/<pid>/mem` |
| `ProcessReader::for_ptrace(pid)` | Use only `ptrace(PTRACE_PEEKDATA)` |

`ProcessReader::new(pid)` tries strategies in this order:

1. `process_vm_readv(2)`
2. `/proc/<pid>/mem`
3. `ptrace(PTRACE_PEEKDATA)`

The first strategy that returns `Ok(_)` for a non-empty read request is cached by that reader. A successful read can be shorter than the requested buffer; a short successful read still selects the strategy. Later reads use the cached strategy directly and do not fall back to another strategy if the cached strategy fails for a different address.

To force a specific mechanism, use one of the `for_*` constructors.

### Strategy-specific read lengths

The public API allows any strategy to return a short successful read. The current implementation has these strategy-specific behaviors:

- `process_vm_readv(2)` returns the byte count reported by `process_vm_readv`, which may be smaller than the requested buffer.
- `/proc/<pid>/mem` attempts to fill the whole buffer. On success it returns `Ok(buf.len())`; if it cannot fill the buffer, it returns an error.
- `ptrace(PTRACE_PEEKDATA)` attempts to fill the whole buffer. On success it returns `Ok(buf.len())`; if it cannot fill the buffer, it returns an error.

## PID invariant

All constructors require a non-negative process ID. Passing `pid < 0` is considered a caller logic error and will panic.

## Ptrace behavior

`ProcessReader::for_ptrace(pid)` only performs `PTRACE_PEEKDATA` reads.

It does not attach to the target, seize it, wait for it to stop, resume it, or detach from it. The caller must arrange any required ptrace relationship and target stopped state before reading.

The requested address does not need to be word-aligned. The implementation performs aligned word reads internally and copies out the requested byte range.

## Errors

All read failures use `ReadError`.

Short successful reads are not errors. They are returned as `Ok(n)` from `read_at`, where `n` is the number of bytes copied.

When a `ReadError` represents one failed strategy, `ReadError::source()` returns that strategy's lower-level error.

For a reader created with `ProcessReader::new(pid)`, the first read can fail because every strategy failed. That is an aggregate failure rather than a single error chain, so `ReadError::source()` returns `None`. Use the strategy-specific accessors to inspect the individual failures:

```rust
fn inspect_error(error: &process_reader::ReadError) {
    if let Some(error) = error.virtual_mem_error() {
        let _ = error;
    }

    if let Some(error) = error.file_error() {
        let _ = error;
    }

    if let Some(error) = error.ptrace_error() {
        let _ = error;
    }
}
```

The destination buffer may be partially overwritten when a read fails. The error does not report how many bytes were copied before the failure, so callers should not rely on the contents of the buffer after an error.

The crate does not provide snapshot consistency. If the target process mutates memory while it is being read, the caller may observe a mixture of old and new bytes.

## `no_std`

The crate is `#![no_std]`. It depends on `libc` with default features disabled.

## Optional features

### `serde`

Enables `Serialize` and `Deserialize` implementations for `ReadError`.

```toml
[dependencies]
process-reader = { version = "0.0.0", features = ["serde"] }
```

## License

MIT
