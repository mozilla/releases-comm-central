use std::{
    collections::HashSet,
    net::{Ipv4Addr, Ipv6Addr, SocketAddr},
    time::Instant,
};

use happy_eyeballs::{
    AltSvc, CONNECTION_ATTEMPT_DELAY, ConnectionAttemptHttpVersions, DnsRecordType, DnsResult,
    Endpoint, HappyEyeballs, HttpVersion, HttpVersions, Id, Input, IpPreference, NetworkConfig,
    Output, RESOLUTION_DELAY,
};

const HOSTNAME: &str = "example.com";
const PORT: u16 = 443;
const V6_ADDR: Ipv6Addr = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1);
const V6_ADDR_2: Ipv6Addr = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 2);
const V6_ADDR_3: Ipv6Addr = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 3);
const V4_ADDR: Ipv4Addr = Ipv4Addr::new(192, 0, 2, 1);
const ECH_CONFIG: &[u8] = &[1, 2, 3, 4, 5];

trait HappyEyeballsExt {
    fn expect(&mut self, input_output: Vec<(Option<Input>, Option<Output>)>, now: Instant);
}

impl HappyEyeballsExt for HappyEyeballs {
    fn expect(&mut self, input_output: Vec<(Option<Input>, Option<Output>)>, now: Instant) {
        for (input, expected_output) in input_output {
            if let Some(input) = input {
                self.process_input(input, now);
            }
            let output = self.process_output(now);
            assert_eq!(expected_output, output);
        }
    }
}

fn in_dns_https_positive(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![happy_eyeballs::ServiceInfo {
            priority: 1,
            target_name: HOSTNAME.into(),
            alpn_protocols: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
            ipv6_hints: vec![],
            ipv4_hints: vec![],
            ech_config: None,
        }])),
    }
}

fn in_dns_https_positive_no_alpn(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![happy_eyeballs::ServiceInfo {
            priority: 1,
            target_name: HOSTNAME.into(),
            alpn_protocols: HashSet::new(),
            ipv6_hints: vec![],
            ipv4_hints: vec![],
            ech_config: None,
        }])),
    }
}

fn in_dns_https_positive_h2_h3(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![happy_eyeballs::ServiceInfo {
            priority: 1,
            target_name: HOSTNAME.into(),
            alpn_protocols: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
            ipv6_hints: vec![],
            ipv4_hints: vec![],
            ech_config: None,
        }])),
    }
}

fn in_dns_https_positive_v6_hints(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![happy_eyeballs::ServiceInfo {
            priority: 1,
            target_name: HOSTNAME.into(),
            alpn_protocols: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
            ipv6_hints: vec![Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1)],
            ipv4_hints: vec![],
            ech_config: None,
        }])),
    }
}

fn in_dns_https_positive_svc1(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![happy_eyeballs::ServiceInfo {
            priority: 1,
            target_name: "svc1.example.com.".into(),
            alpn_protocols: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
            ipv6_hints: vec![Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 2)],
            ipv4_hints: vec![],
            ech_config: None,
        }])),
    }
}

fn in_dns_https_negative(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Err(())),
    }
}

fn in_dns_aaaa_positive(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Aaaa(Ok(vec![V6_ADDR])),
    }
}

fn in_dns_a_positive(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::A(Ok(vec![V4_ADDR])),
    }
}

fn in_dns_aaaa_negative(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Aaaa(Err(())),
    }
}

fn in_dns_a_negative(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::A(Err(())),
    }
}

fn in_connection_result_positive(id: Id) -> Input {
    Input::ConnectionResult { id, result: Ok(()) }
}

fn in_connection_result_negative(id: Id) -> Input {
    Input::ConnectionResult {
        id,
        result: Err("connection refused".to_string()),
    }
}

fn out_send_dns_https(id: Id) -> Output {
    Output::SendDnsQuery {
        id,
        hostname: HOSTNAME.into(),
        record_type: DnsRecordType::Https,
    }
}

fn out_send_dns_aaaa(id: Id) -> Output {
    Output::SendDnsQuery {
        id,
        hostname: HOSTNAME.into(),
        record_type: DnsRecordType::Aaaa,
    }
}

fn out_send_dns_svc1(id: Id) -> Output {
    Output::SendDnsQuery {
        id,
        hostname: "svc1.example.com.".into(),
        record_type: DnsRecordType::Aaaa,
    }
}

fn out_send_dns_a(id: Id) -> Output {
    Output::SendDnsQuery {
        id,
        hostname: HOSTNAME.into(),
        record_type: DnsRecordType::A,
    }
}

fn out_attempt_v6_h1_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H2OrH1,
            ech_config: None,
        },
    }
}

fn out_attempt_v6_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
    }
}

fn out_attempt_v6_h3(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
    }
}

fn out_attempt_v4_h1_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H2OrH1,
            ech_config: None,
        },
    }
}

fn out_attempt_v4_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
    }
}

fn out_attempt_v4_h3(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
    }
}

fn out_resolution_delay() -> Output {
    Output::Timer {
        duration: RESOLUTION_DELAY,
    }
}

fn out_connection_attempt_delay() -> Output {
    Output::Timer {
        duration: CONNECTION_ATTEMPT_DELAY,
    }
}

fn setup() -> (Instant, HappyEyeballs) {
    setup_with_config(NetworkConfig::default())
}

fn setup_with_config(config: NetworkConfig) -> (Instant, HappyEyeballs) {
    let _ = env_logger::builder().is_test(true).try_init();

    let now = Instant::now();
    let he = HappyEyeballs::new_with_network_config(HOSTNAME, PORT, config).unwrap();
    (now, he)
}

#[test]
fn initial_state() {
    let (now, mut he) = setup();

    he.expect(vec![(None, Some(out_send_dns_https(Id::from(0))))], now);
}

// TODO: Move to own file?
/// > 4. Hostname Resolution
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4>
#[cfg(test)]
mod section_4_hostname_resolution {
    use std::time::Duration;

    use super::*;

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
                        protocol: ConnectionAttemptHttpVersions::H2OrH1,
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
}

// TODO: Move to own file?
mod section_6_connection_attempts {
    use happy_eyeballs::CONNECTION_ATTEMPT_DELAY;

    use super::*;

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
                        protocol: ConnectionAttemptHttpVersions::H2OrH1,
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
}

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
fn ip_host() {
    let now = Instant::now();
    let mut he = HappyEyeballs::new("[2001:0DB8::1]", PORT).unwrap();

    he.expect(vec![(None, Some(out_attempt_v6_h1_h2(Id::from(0))))], now);
}

#[test]
fn not_url_but_ip() {
    // Neither of these are a valid URL, but they are valid IP addresses.
    HappyEyeballs::new("::1", PORT).unwrap();
    HappyEyeballs::new("127.0.0.1", PORT).unwrap();
}

#[test]
fn alt_svc_construction() {
    let now = Instant::now();
    let config = NetworkConfig {
        http_versions: HttpVersions::default(),
        ip: IpPreference::DualStackPreferV6,
        alt_svc: vec![AltSvc {
            host: None,
            port: None,
            protocol: HttpVersion::H3,
        }],
    };
    let mut he = HappyEyeballs::new_with_network_config(HOSTNAME, PORT, config).unwrap();

    // Should still send DNS queries as normal
    he.expect(vec![(None, Some(out_send_dns_https(Id::from(0))))], now);
}

#[test]
fn ech_config_propagated_to_endpoint() {
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
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![happy_eyeballs::ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_protocols: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                        ipv6_hints: vec![V6_ADDR],
                        ipv4_hints: vec![],
                        ech_config: Some(ECH_CONFIG.to_vec()),
                    }])),
                }),
                Some(Output::AttemptConnection {
                    id: Id::from(3),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR.into(), PORT),
                        protocol: ConnectionAttemptHttpVersions::H3,
                        ech_config: Some(ECH_CONFIG.to_vec()),
                    },
                }),
            ),
        ],
        now,
    );
}

#[test]
fn ech_config_from_https_applies_to_aaaa() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![happy_eyeballs::ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_protocols: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: Some(ECH_CONFIG.to_vec()),
                    }])),
                }),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(Output::AttemptConnection {
                    id: Id::from(3),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR.into(), PORT),
                        protocol: ConnectionAttemptHttpVersions::H3,
                        ech_config: Some(ECH_CONFIG.to_vec()),
                    },
                }),
            ),
        ],
        now,
    );
}

#[test]
fn multiple_target_names() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            // HTTPS response with a different target name
            (
                Some(in_dns_https_positive_svc1(Id::from(0))),
                Some(out_send_dns_svc1(Id::from(3))),
            ),
            // Now we have queries for both "example.com" and "svc1.example.com."
            // Getting a positive AAAA for the main host
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h3(Id::from(4))),
            ),
        ],
        now,
    );
}

#[test]
fn alt_svc_used_immediately() {
    let now = Instant::now();
    let config = NetworkConfig {
        http_versions: HttpVersions::default(),
        ip: IpPreference::DualStackPreferV6,
        alt_svc: vec![AltSvc {
            host: None,
            port: None,
            protocol: HttpVersion::H3,
        }],
    };
    let mut he = HappyEyeballs::new_with_network_config(HOSTNAME, PORT, config).unwrap();

    // Alt-svc with H3 should make H3 available even without HTTPS DNS response
    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_negative(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            // Alt-svc provided H3, so we should attempt H3 connection
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h3(Id::from(3))),
            ),
        ],
        now,
    );
}

/// Website with HTTPS record with `noDefaultAlpn` set.
///
/// See e.g. <adamwoodland.com>.
#[test]
fn no_default_alpn() {
    let (now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_positive_h2_h3(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h3(Id::from(3))),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
            (
                Some(in_connection_result_negative(Id::from(3))),
                Some(out_attempt_v4_h3(Id::from(4))),
            ),
            (
                Some(in_connection_result_negative(Id::from(4))),
                Some(out_attempt_v6_h2(Id::from(5))),
            ),
            (
                Some(in_connection_result_negative(Id::from(5))),
                Some(out_attempt_v4_h2(Id::from(6))),
            ),
            (
                Some(in_connection_result_negative(Id::from(6))),
                Some(Output::Failed),
            ),
        ],
        now,
    );
}
