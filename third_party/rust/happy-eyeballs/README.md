<!-- cargo-rdme start -->

# Happy Eyeballs v3 Implementation

WORK IN PROGRESS

This crate provides a pure state machine implementation of Happy Eyeballs v3
as specified in [draft-ietf-happy-happyeyeballs-v3-02](https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html).

Happy Eyeballs v3 is an algorithm for improving the performance of dual-stack
applications by racing IPv4 and IPv6 connections while optimizing for modern
network conditions including HTTPS service discovery and QUIC.

## Usage

```rust

let mut he = HappyEyeballs::new("example.com", 443).unwrap();
let now = Instant::now();

// First process outputs from the state machine, e.g. a DNS query to send:
while let Some(output) = he.process_output(now) {
    match output {
        Output::SendDnsQuery { id, hostname, record_type } => {
            // Send DNS query.
        }
        Output::AttemptConnection { id, endpoint } => {
            // Attempt connection.
        }
        _ => {}
    }
}

// Later pass results as input back to the state machine, e.g. a DNS
// response arrives:
he.process_input(Input::DnsResult { id: dns_id.unwrap(), result: dns_result }, Instant::now());
```

For complete example usage, see the tests in [`tests/integration.rs`](tests/integration.rs).

<!-- cargo-rdme end -->
