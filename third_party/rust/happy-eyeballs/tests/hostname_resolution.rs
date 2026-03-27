/// > 4. Hostname Resolution
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4>
mod common;
use common::*;

use std::{net::SocketAddr, time::Duration};

use happy_eyeballs::{
    CONNECTION_ATTEMPT_DELAY, ConnectionAttemptHttpVersions, DnsRecordType, DnsResult, Endpoint,
    HttpVersions, Id, Input, IpPreference, NetworkConfig, Output, RESOLUTION_DELAY,
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
                ..NetworkConfig::default()
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
                ..NetworkConfig::default()
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
                ..NetworkConfig::default()
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
                ..NetworkConfig::default()
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
                ..NetworkConfig::default()
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
                ..NetworkConfig::default()
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

/// HTTPS IP hints should count as positive address answers for the
/// resolution delay timeout path (`move_on_with_timeout`).
///
/// Scenario: only HTTPS with v6 hints has arrived, AAAA and A are still
/// in-progress. After the resolution delay we should move on.
///
/// <https://github.com/mozilla/happy-eyeballs/issues/39>
#[test]
fn https_hints_move_on_with_timeout() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_v6_hints(Id::from(0))),
                Some(out_resolution_delay()),
            ),
        ],
        now,
    );

    now += RESOLUTION_DELAY;

    he.expect(vec![(None, Some(out_attempt_v6_h3(Id::from(3))))], now);
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

/// On a single-stack network, the state machine should skip querying the
/// disabled address family. IPv4-only skips AAAA, IPv6-only skips A.
#[test]
fn single_stack_skips_disabled_address_family() {
    struct Case {
        ip: IpPreference,
        expected_dns_query: Output,
        dns_response: Input,
        expected_connection: Output,
    }

    let cases = vec![
        Case {
            ip: IpPreference::Ipv4Only,
            expected_dns_query: out_send_dns_a(Id::from(1)),
            dns_response: in_dns_a_positive(Id::from(1)),
            expected_connection: out_attempt_v4_h1_h2(Id::from(2)),
        },
        Case {
            ip: IpPreference::Ipv6Only,
            expected_dns_query: out_send_dns_aaaa(Id::from(1)),
            dns_response: in_dns_aaaa_positive(Id::from(1)),
            expected_connection: out_attempt_v6_h1_h2(Id::from(2)),
        },
    ];

    for case in cases {
        let (now, mut he) = setup_with_config(NetworkConfig {
            ip: case.ip,
            ..NetworkConfig::default()
        });

        he.expect(
            vec![
                (None, Some(out_send_dns_https(Id::from(0)))),
                // Should skip the disabled address family query.
                (None, Some(case.expected_dns_query)),
                (
                    Some(in_dns_https_negative(Id::from(0))),
                    Some(out_resolution_delay()),
                ),
                (Some(case.dns_response), Some(case.expected_connection)),
            ],
            now,
        );
    }
}

/// On a single-stack network, target-name follow-up queries must also skip
/// the disabled address family.
///
/// <https://github.com/mozilla/happy-eyeballs/issues/38>
#[test]
fn single_stack_target_name_skips_disabled_address_family() {
    struct Case {
        ip: IpPreference,
        /// The only address-family query sent for the origin domain.
        origin_dns_query: Output,
        /// The only address-family query sent for the target name.
        target_name_dns_query: Output,
    }

    let cases = vec![
        Case {
            ip: IpPreference::Ipv6Only,
            origin_dns_query: out_send_dns_aaaa(Id::from(1)),
            target_name_dns_query: out_send_dns_svc1(Id::from(2)),
        },
        Case {
            ip: IpPreference::Ipv4Only,
            origin_dns_query: out_send_dns_a(Id::from(1)),
            target_name_dns_query: Output::SendDnsQuery {
                id: Id::from(2),
                hostname: SVC1.into(),
                record_type: DnsRecordType::A,
            },
        },
    ];

    for case in cases {
        let (now, mut he) = setup_with_config(NetworkConfig {
            ip: case.ip,
            ..NetworkConfig::default()
        });

        he.expect(
            vec![
                (None, Some(out_send_dns_https(Id::from(0)))),
                (None, Some(case.origin_dns_query)),
                (
                    Some(in_dns_https_positive_svc1(Id::from(0))),
                    Some(case.target_name_dns_query),
                ),
                // No query for the disabled address family should appear,
                // only the resolution delay.
                (None, Some(out_resolution_delay())),
            ],
            now,
        );
    }
}
