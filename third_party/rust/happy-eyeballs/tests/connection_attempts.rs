/// > 6. Establishing Connections
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-6>
mod common;
use common::*;

use std::net::SocketAddr;

use happy_eyeballs::{
    CONNECTION_ATTEMPT_DELAY, ConnectionAttemptHttpVersions, DnsResult, Endpoint, Id, Input, Output,
};

#[test]
fn ipv6_blackhole() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h3(Id::from(3))),
            ),
        ],
        now,
    );

    for _ in 0..42 {
        now += CONNECTION_ATTEMPT_DELAY;
        let connection_attempt = he.process_output(now).unwrap().attempt().unwrap();
        if connection_attempt.address.is_ipv4() {
            return;
        }
    }

    panic!("Did not fall back to IPv4.");
}

#[test]
fn connection_attempt_delay() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_no_alpn(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    now += CONNECTION_ATTEMPT_DELAY;

    he.expect(vec![(None, Some(out_attempt_v4_h1_h2(Id::from(4))))], now);
}

#[test]
fn never_try_same_attempt_twice() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_negative(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_a_negative(Id::from(2))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
            ),
        ],
        now,
    );

    now += CONNECTION_ATTEMPT_DELAY;

    he.expect(vec![(None, None)], now);
}

#[test]
fn successful_connection_cancels_others() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_no_alpn(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(Input::DnsResult {
                    id: Id::from(1),
                    result: DnsResult::Aaaa(Ok(vec![V6_ADDR, V6_ADDR_2])),
                }),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    now += CONNECTION_ATTEMPT_DELAY;
    he.expect(
        vec![(
            None,
            Some(Output::AttemptConnection {
                id: Id::from(4),
                endpoint: Endpoint {
                    address: SocketAddr::new(V6_ADDR_2.into(), PORT),
                    http_version: ConnectionAttemptHttpVersions::H2OrH1,
                    ech_config: None,
                },
            }),
        )],
        now,
    );

    now += CONNECTION_ATTEMPT_DELAY;
    he.expect(vec![(None, Some(out_attempt_v4_h1_h2(Id::from(5))))], now);
    he.expect(
        vec![
            (
                Some(in_connection_result_positive(Id::from(3))),
                Some(Output::CancelConnection { id: Id::from(4) }),
            ),
            (None, Some(Output::CancelConnection { id: Id::from(5) })),
            (None, Some(Output::Succeeded)),
        ],
        now,
    );
}

#[test]
fn failed_connection_tries_next_immediately() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_no_alpn(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    he.expect(
        vec![(
            Some(in_connection_result_negative(Id::from(3))),
            Some(out_attempt_v4_h1_h2(Id::from(4))),
        )],
        now,
    );
}

#[test]
fn successful_connection_emits_succeeded() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_no_alpn(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
            ),
            (
                Some(in_connection_result_positive(Id::from(3))),
                Some(Output::Succeeded),
            ),
        ],
        now,
    );
}

#[test]
fn succeeded_keeps_emitting_succeeded() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_no_alpn(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
            ),
            (
                Some(in_connection_result_positive(Id::from(3))),
                Some(Output::Succeeded),
            ),
            // After succeeded, continue to emit Succeeded
            (None, Some(Output::Succeeded)),
            (None, Some(Output::Succeeded)),
        ],
        now,
    );
}

#[test]
fn cancelled_connection_result_ignored() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_no_alpn(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    now += CONNECTION_ATTEMPT_DELAY;

    // Start second connection attempt.
    he.expect(vec![(None, Some(out_attempt_v4_h1_h2(Id::from(4))))], now);

    // First connection succeeds, triggering cancellation of the second.
    he.expect(
        vec![
            (
                Some(in_connection_result_positive(Id::from(3))),
                Some(Output::CancelConnection { id: Id::from(4) }),
            ),
            (None, Some(Output::Succeeded)),
        ],
        now,
    );

    // User reports an error for the already-cancelled connection.
    // This must not panic.
    he.expect(
        vec![(
            Some(in_connection_result_negative(Id::from(4))),
            Some(Output::Succeeded),
        )],
        now,
    );
}

#[test]
fn all_connections_failed() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_no_alpn(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
            (
                Some(in_connection_result_negative(Id::from(3))),
                Some(out_attempt_v4_h1_h2(Id::from(4))),
            ),
            (
                Some(in_connection_result_negative(Id::from(4))),
                Some(Output::Failed),
            ),
        ],
        now,
    );
}
