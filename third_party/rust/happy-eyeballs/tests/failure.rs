mod common;
use common::*;

use happy_eyeballs::{FailureReason, Id, Output};

/// All DNS queries fail. No connections are attempted.
#[test]
fn all_dns_failed() {
    let (now, mut he) = setup();

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
                Some(in_dns_aaaa_negative(Id::from(1))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_a_negative(Id::from(2))),
                Some(Output::Failed(FailureReason::DnsResolution)),
            ),
        ],
        now,
    );
}

/// DNS partially fails (HTTPS and A fail) but AAAA succeeds, then connection fails.
#[test]
fn dns_partial_failure_then_connection_failed() {
    let (now, mut he) = setup();

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
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
            ),
            (
                Some(in_dns_a_negative(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
            (
                Some(in_connection_result_negative(Id::from(3))),
                Some(Output::Failed(FailureReason::Connection)),
            ),
        ],
        now,
    );
}

/// All DNS succeeds but all connection attempts fail.
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
                Some(Output::Failed(FailureReason::Connection)),
            ),
        ],
        now,
    );
}

/// First connection fails, second succeeds. Should not emit `Failed`.
#[test]
fn first_connection_fails_second_succeeds() {
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
                Some(in_connection_result_positive(Id::from(4))),
                Some(Output::Succeeded),
            ),
        ],
        now,
    );
}
