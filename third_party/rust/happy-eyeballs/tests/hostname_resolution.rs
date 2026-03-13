/// > 4. Hostname Resolution
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4>
mod common;
use common::*;

use std::{net::SocketAddr, time::Duration};

use happy_eyeballs::{
    CONNECTION_ATTEMPT_DELAY, ConnectionAttemptHttpVersions, DnsResult, Endpoint, HttpVersions, Id,
    Input, IpPreference, NetworkConfig, Output, RESOLUTION_DELAY,
};

#[test]
fn initial_state() {
    let (now, mut he) = setup();

    he.expect(vec![(None, Some(out_send_dns_https(Id::from(0))))], now);
}

/// > All of the DNS queries SHOULD be made as soon after one another as
/// > possible. The order in which the queries are sent SHOULD be as follows
/// > (omitting any query that doesn't apply based on the logic described
/// > above):
/// >
/// > 1. SVCB or HTTPS query
/// > 2. AAAA query
/// > 3. A query
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.1>
#[test]
fn sendig_dns_queries() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
        ],
        now,
    );
}

/// > Implementations SHOULD NOT wait for all answers to return before
/// > starting the next steps of connection establishment.
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>
#[test]
fn dont_wait_for_all_dns_answers() {
    let (now, mut he) = setup();

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
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h3(Id::from(3))),
            ),
        ],
        now,
    );
}

/// > The client moves onto sorting addresses and establishing
/// > connections once one of the following condition sets is met:
/// >
/// > Either:
/// >
/// > - Some positive (non-empty) address answers have been received AND
/// > - A postive (non-empty) or negative (empty) answer has been
/// >   received for the preferred address family that was queried AND
/// > - SVCB/HTTPS service information has been received (or has received a negative response)
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>
#[test]
fn move_on_non_timeout() {
    #[derive(Debug)]
    struct Case {
        address_family: NetworkConfig,
        positive: Input,
        preferred: Option<Input>,
        expected: Option<Output>,
    }

    let test_cases = vec![
        // V6 preferred, V6 positive, HTTPS positive, expect V6 connection attempt
        Case {
            address_family: NetworkConfig {
                http_versions: HttpVersions::default(),
                ip: IpPreference::DualStackPreferV6,
                alt_svc: Vec::new(),
            },
            positive: in_dns_aaaa_positive(Id::from(1)),
            preferred: None,
            expected: Some(out_attempt_v6_h1_h2(Id::from(3))),
        },
        // V6 preferred, V4 positive, V6 positive, HTTPS positive, expect V6 connection attempt
        Case {
            address_family: NetworkConfig {
                http_versions: HttpVersions::default(),
                ip: IpPreference::DualStackPreferV6,
                alt_svc: Vec::new(),
            },
            positive: in_dns_a_positive(Id::from(2)),
            preferred: Some(in_dns_aaaa_positive(Id::from(1))),
            expected: Some(out_attempt_v6_h1_h2(Id::from(3))),
        },
        // V6 preferred, V6 negative, V4 positive, HTTPS positive, expect V4 connection attempt
        Case {
            address_family: NetworkConfig {
                http_versions: HttpVersions::default(),
                ip: IpPreference::DualStackPreferV6,
                alt_svc: Vec::new(),
            },
            positive: in_dns_a_positive(Id::from(2)),
            preferred: Some(in_dns_aaaa_negative(Id::from(1))),
            expected: Some(out_attempt_v4_h1_h2(Id::from(3))),
        },
        // V4 preferred, V4 positive, HTTPS positive, expect V4 connection attempt
        Case {
            address_family: NetworkConfig {
                http_versions: HttpVersions::default(),
                ip: IpPreference::DualStackPreferV4,
                alt_svc: Vec::new(),
            },
            positive: in_dns_a_positive(Id::from(2)),
            preferred: None,
            expected: Some(out_attempt_v4_h1_h2(Id::from(3))),
        },
        // V4 preferred, V6 positive, V4 positive, HTTPS positive, expect V4 connection attempt
        Case {
            address_family: NetworkConfig {
                http_versions: HttpVersions::default(),
                ip: IpPreference::DualStackPreferV4,
                alt_svc: Vec::new(),
            },
            positive: in_dns_aaaa_positive(Id::from(1)),
            preferred: Some(in_dns_a_positive(Id::from(2))),
            expected: Some(out_attempt_v4_h1_h2(Id::from(3))),
        },
        // V4 preferred, V4 negative, V6 positive, HTTPS positive, expect V6 connection attempt
        Case {
            address_family: NetworkConfig {
                http_versions: HttpVersions::default(),
                ip: IpPreference::DualStackPreferV4,
                alt_svc: Vec::new(),
            },
            positive: in_dns_aaaa_positive(Id::from(1)),
            preferred: Some(in_dns_a_negative(Id::from(2))),
            expected: Some(out_attempt_v6_h1_h2(Id::from(3))),
        },
    ];

    for test_case in test_cases {
        for https in [
            in_dns_https_positive_no_alpn(Id::from(0)),
            in_dns_https_negative(Id::from(0)),
        ] {
            let (now, mut he) = setup_with_config(test_case.address_family.clone());

            he.expect(
                vec![
                    (None, Some(out_send_dns_https(Id::from(0)))),
                    (None, Some(out_send_dns_aaaa(Id::from(1)))),
                    (None, Some(out_send_dns_a(Id::from(2)))),
                    (
                        Some(test_case.positive.clone()),
                        Some(out_resolution_delay()),
                    ),
                    (test_case.preferred.clone(), Some(out_resolution_delay())),
                    (Some(https), test_case.expected.clone()),
                ],
                now,
            );
        }
    }
}

/// > Or:
/// >
/// > - Some positive (non-empty) address answers have been received AND
/// > - A resolution time delay has passed after which other answers have not been received
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>
// TODO: Other combinations
#[test]
fn move_on_timeout() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_resolution_delay()),
            ),
        ],
        now,
    );

    now += RESOLUTION_DELAY;

    he.expect(vec![(None, Some(out_attempt_v4_h1_h2(Id::from(3))))], now);
}

/// > Resolution Delay (Section 4): The time to wait for a AAAA record after
/// > receiving an A record. Recommended to be 50 milliseconds.
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-9>
#[test]
fn resolution_delay_starts_after_other_response() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            // No other response received yet.
            (None, None),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_resolution_delay()),
            ),
        ],
        now,
    );

    now += RESOLUTION_DELAY;

    he.expect(vec![(None, Some(out_attempt_v4_h1_h2(Id::from(3))))], now);
}

/// Start of the Resolution Delay is not the first DNS query is sent, but
/// the first response received.
///
/// > A resolution time delay has passed after which other answers have not been received
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>
#[test]
fn resolution_delay_starts_on_first_response() {
    const RESPONSE_DELAY: Duration = Duration::from_millis(10);
    let (start, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            // No other response received yet.
            (None, None),
        ],
        start,
    );

    // Receive first response, thus activating the resolution delay.
    he.expect(
        vec![(
            Some(in_dns_a_positive(Id::from(2))),
            Some(out_resolution_delay()),
        )],
        start + RESPONSE_DELAY,
    );

    // Resolution delay is off of the response, not the query start (i.e. `start`).
    he.expect(
        vec![(
            None,
            Some(Output::Timer {
                duration: RESPONSE_DELAY,
            }),
        )],
        start + RESOLUTION_DELAY,
    );

    he.expect(
        vec![(None, Some(out_attempt_v4_h1_h2(Id::from(3))))],
        start + RESPONSE_DELAY + RESOLUTION_DELAY,
    );
}

/// > ServiceMode records can contain address hints via ipv6hint and
/// > ipv4hint parameters. When these are received, they SHOULD be
/// > considered as positive non-empty answers for the purpose of the
/// > algorithm when A and AAAA records corresponding to the TargetName
/// > are not available yet.
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2.1>
#[test]
fn https_hints() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_aaaa_negative(Id::from(1))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_a_negative(Id::from(2))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_https_positive_v6_hints(Id::from(0))),
                Some(out_attempt_v6_h3(Id::from(3))),
            ),
        ],
        now,
    );
}

/// > Note that clients are still required to issue A and AAAA queries
/// > for those TargetNames if they haven't yet received those records.
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2.1>
#[test]
fn https_hints_still_query_a_aaaa() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_svc1(Id::from(0))),
                Some(out_send_dns_svc1(Id::from(3))),
            ),
        ],
        now,
    );
}

#[test]
fn https_h3_upgrade_without_hints() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_https_positive(Id::from(0))),
                Some(out_attempt_v6_h3(Id::from(3))),
            ),
        ],
        now,
    );
}

/// A ServiceInfo advertising H3 must not produce an H3 connection attempt
/// when H3 is disabled in the network config.
#[test]
fn https_h3_disabled() {
    let (now, mut he) = setup_with_config(NetworkConfig {
        http_versions: HttpVersions {
            h1: true,
            h2: true,
            h3: false,
        },
        ..NetworkConfig::default()
    });

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_https_positive(Id::from(0))),
                Some(out_attempt_v6_h2(Id::from(3))),
            ),
        ],
        now,
    );
}

#[test]
fn multiple_ips_per_record() {
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
                Some(Input::DnsResult {
                    id: Id::from(1),
                    result: DnsResult::Aaaa(Ok(vec![V6_ADDR, V6_ADDR_2, V6_ADDR_3])),
                }),
                Some(out_attempt_v6_h1_h2(Id::from(3))),
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
}

#[test]
fn dns_failed() {
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
            (Some(in_dns_a_negative(Id::from(2))), Some(Output::Failed)),
        ],
        now,
    );
}
