/// Tests for HTTPS/SVCB DNS record handling including ECH, port SvcParams,
/// multiple ServiceInfo records, and SVC1 target name resolution.
mod common;
use common::*;

use std::{
    collections::HashSet,
    net::{IpAddr, Ipv4Addr, SocketAddr},
};

use happy_eyeballs::{
    AltSvc, CONNECTION_ATTEMPT_DELAY, ConnectionAttemptHttpVersions, ConnectionResult,
    DnsRecordType, DnsResult, EchConfig, Endpoint, FailureReason, HttpVersion, Id, Input,
    NetworkConfig, Output, ServiceInfo,
};

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
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                        ipv6_hints: vec![V6_ADDR],
                        ipv4_hints: vec![],
                        ech_config: Some(ech_config()),
                        port: None,
                    }])),
                }),
                Some(Output::AttemptConnection {
                    id: Id::from(3),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR.into(), PORT),
                        http_version: ConnectionAttemptHttpVersions::H3,
                        ech_config: Some(ech_config()),
                    },
                }),
            ),
        ],
        now,
    );
}

/// When ECH is disabled in the network config, ECH configs from HTTPS records
/// are ignored: endpoints get `ech_config: None` and the origin fallback is
/// not skipped.
///
/// HTTPS record has ECH + H3 ALPN with v6 hints. AAAA positive for origin.
/// With ECH disabled:
///   - HTTPS bucket uses hints: V6:H3 (no ECH)
///   - Origin fallback is NOT skipped: V6:H2OrH1
///
/// <https://github.com/mozilla/happy-eyeballs/issues/20>
#[test]
fn ech_disabled() {
    let (mut now, mut he) = setup_with_config(NetworkConfig {
        ech: false,
        ..NetworkConfig::default()
    });

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_a_negative(Id::from(2))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_resolution_delay()),
            ),
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        // Only H3 in ALPN — fallback bucket uses H2OrH1 by default.
                        alpn_http_versions: HashSet::from([HttpVersion::H3]),
                        ipv6_hints: vec![V6_ADDR],
                        ipv4_hints: vec![],
                        ech_config: Some(ech_config()),
                        port: None,
                    }])),
                }),
                // HTTPS bucket: V6:H3, but ECH stripped.
                Some(Output::AttemptConnection {
                    id: Id::from(3),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR.into(), PORT),
                        http_version: ConnectionAttemptHttpVersions::H3,
                        ech_config: None,
                    },
                }),
            ),
        ],
        now,
    );

    // Origin fallback is NOT skipped despite HTTPS record having ECH.
    he.expect_connection_attempts(
        &mut now,
        vec![Output::AttemptConnection {
            id: Id::from(4),
            endpoint: Endpoint {
                address: SocketAddr::new(V6_ADDR.into(), PORT),
                http_version: ConnectionAttemptHttpVersions::H2OrH1,
                ech_config: None,
            },
        }],
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
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: Some(ech_config()),
                        port: None,
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
                        http_version: ConnectionAttemptHttpVersions::H3,
                        ech_config: Some(ech_config()),
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
                Some(Output::AttemptConnection {
                    id: Id::from(4),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR_2.into(), PORT),
                        http_version: ConnectionAttemptHttpVersions::H3,
                        ech_config: None,
                    },
                }),
            ),
        ],
        now,
    );
}

/// Two HTTPS ServiceInfo records where only the first has ECH config ("partial ECH").
/// When any ServiceInfo has ECH, those without ECH are skipped.
/// The origin fallback is also skipped.
///
/// ```dns
/// test.partial_ech.org  HTTPS  1 svc1.example.com. alpn="h3" port=9443 ech="..."
/// test.partial_ech.org  HTTPS  2 svc2.example.com. alpn="h2" port=10443
/// ```
///
/// HOSTNAME resolves AAAA to V6_ADDR and A to V4_ADDR.
/// SVC1 resolves A to V4_ADDR_2. SVC2 DNS is never queried (no ECH).
///
/// Only the ECH-enabled ServiceInfo produces connection attempts:
///
///   priority-1 bucket (SVC1, port 9443, ech): V4_2:H3, V4_2:H2
///   priority-2 bucket (SVC2, port 10443):     skipped (no ECH, not even resolved)
///   fallback   bucket (HOSTNAME):             skipped (no ECH)
#[test]
fn partial_ech_two_service_infos() {
    const SVC2: &str = "svc2.example.com.";
    const SVC1_PORT: u16 = 9443;
    const SVC2_PORT: u16 = 10443;

    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![
                        ServiceInfo {
                            priority: 1,
                            target_name: SVC1.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H3]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: Some(ech_config()),
                            port: Some(SVC1_PORT),
                        },
                        ServiceInfo {
                            priority: 2,
                            target_name: SVC2.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H2]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: None,
                            port: Some(SVC2_PORT),
                        },
                    ])),
                }),
                // Only SVC1 gets DNS queries — SVC2 is skipped (no ECH)
                Some(Output::SendDnsQuery {
                    id: Id::from(3),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::Aaaa,
                }),
            ),
            (
                None,
                Some(Output::SendDnsQuery {
                    id: Id::from(4),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::A,
                }),
            ),
            (None, Some(out_resolution_delay())),
            // HOSTNAME AAAA positive -> move-on criteria met, but SVC1 has no
            // addresses yet and ECH filtering skips fallback -> no attempt yet.
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_resolution_delay()),
            ),
            // SVC1 AAAA negative
            (
                Some(in_dns_aaaa_negative(Id::from(3))),
                Some(out_resolution_delay()),
            ),
            // SVC1 A positive -> SVC1 bucket now has addresses, first attempt
            (
                Some(Input::DnsResult {
                    id: Id::from(4),
                    result: DnsResult::A(Ok(vec![V4_ADDR_2])),
                }),
                Some(Output::AttemptConnection {
                    id: Id::from(5),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V4_ADDR_2.into(), SVC1_PORT),
                        http_version: ConnectionAttemptHttpVersions::H3,
                        ech_config: Some(ech_config()),
                    },
                }),
            ),
        ],
        now,
    );

    now += CONNECTION_ATTEMPT_DELAY;
    he.expect(
        vec![(
            None,
            Some(Output::AttemptConnection {
                id: Id::from(6),
                endpoint: Endpoint {
                    address: SocketAddr::new(V4_ADDR_2.into(), SVC1_PORT),
                    http_version: ConnectionAttemptHttpVersions::H2,
                    ech_config: Some(ech_config()),
                },
            }),
        )],
        now,
    );

    now += CONNECTION_ATTEMPT_DELAY;
    he.expect(vec![(None, None)], now);
}

/// Both ServiceInfo records have ECH. The origin fallback is still skipped
/// because it has no ECH config.
///
/// ```dns
/// example.com  HTTPS  1 svc1.example.com. alpn="h3" port=9443 ech="..."
/// example.com  HTTPS  2 svc2.example.com. alpn="h2" port=10443 ech="..."
/// ```
///
/// HOSTNAME resolves AAAA to V6_ADDR and A to V4_ADDR.
/// SVC1 resolves A to V4_ADDR_2. SVC2 resolves A to V4_ADDR.
///
///   priority-1 bucket (SVC1, port 9443, ech):  V4_2:H3, V4_2:H2
///   priority-2 bucket (SVC2, port 10443, ech): V4:H3, V4:H2
///   fallback   bucket (HOSTNAME):              skipped (no ECH)
#[test]
fn both_service_infos_have_ech_no_origin_fallback() {
    const SVC2: &str = "svc2.example.com.";
    const SVC1_PORT: u16 = 9443;
    const SVC2_PORT: u16 = 10443;

    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![
                        ServiceInfo {
                            priority: 1,
                            target_name: SVC1.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H3]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: Some(ech_config()),
                            port: Some(SVC1_PORT),
                        },
                        ServiceInfo {
                            priority: 2,
                            target_name: SVC2.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H2]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: Some(ech_config()),
                            port: Some(SVC2_PORT),
                        },
                    ])),
                }),
                // Both SVC1 and SVC2 get DNS queries (both have ECH)
                Some(Output::SendDnsQuery {
                    id: Id::from(3),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::Aaaa,
                }),
            ),
            (
                None,
                Some(Output::SendDnsQuery {
                    id: Id::from(4),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::A,
                }),
            ),
            (
                None,
                Some(Output::SendDnsQuery {
                    id: Id::from(5),
                    hostname: SVC2.into(),
                    record_type: DnsRecordType::Aaaa,
                }),
            ),
            (
                None,
                Some(Output::SendDnsQuery {
                    id: Id::from(6),
                    hostname: SVC2.into(),
                    record_type: DnsRecordType::A,
                }),
            ),
            (None, Some(out_resolution_delay())),
            // HOSTNAME AAAA/A positive — but fallback will be skipped (no ECH)
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_resolution_delay()),
            ),
            // SVC1 AAAA negative
            (
                Some(in_dns_aaaa_negative(Id::from(3))),
                Some(out_resolution_delay()),
            ),
            // SVC1 A positive -> first attempt from SVC1 bucket
            (
                Some(Input::DnsResult {
                    id: Id::from(4),
                    result: DnsResult::A(Ok(vec![V4_ADDR_2])),
                }),
                Some(Output::AttemptConnection {
                    id: Id::from(7),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V4_ADDR_2.into(), SVC1_PORT),
                        http_version: ConnectionAttemptHttpVersions::H3,
                        ech_config: Some(ech_config()),
                    },
                }),
            ),
            (None, Some(out_connection_attempt_delay())),
            // SVC2 AAAA negative
            (
                Some(in_dns_aaaa_negative(Id::from(5))),
                Some(out_connection_attempt_delay()),
            ),
            // SVC2 A positive
            (
                Some(Input::DnsResult {
                    id: Id::from(6),
                    result: DnsResult::A(Ok(vec![V4_ADDR])),
                }),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    // Both SVC1 and SVC2 produce attempts (both have ECH).
    // Origin fallback is skipped — no ECH on the origin.
    he.expect_connection_attempts(
        &mut now,
        vec![
            // priority=1 (SVC1, port 9443, ech)
            Output::AttemptConnection {
                id: Id::from(8),
                endpoint: Endpoint {
                    address: SocketAddr::new(V4_ADDR_2.into(), SVC1_PORT),
                    http_version: ConnectionAttemptHttpVersions::H2,
                    ech_config: Some(ech_config()),
                },
            },
            // priority=2 (SVC2, port 10443, ech)
            Output::AttemptConnection {
                id: Id::from(9),
                endpoint: Endpoint {
                    address: SocketAddr::new(V4_ADDR.into(), SVC2_PORT),
                    http_version: ConnectionAttemptHttpVersions::H3,
                    ech_config: Some(ech_config()),
                },
            },
            Output::AttemptConnection {
                id: Id::from(10),
                endpoint: Endpoint {
                    address: SocketAddr::new(V4_ADDR.into(), SVC2_PORT),
                    http_version: ConnectionAttemptHttpVersions::H2,
                    ech_config: Some(ech_config()),
                },
            },
        ],
    );
}

/// Partial ECH with an alt-svc record on the origin. Both alt-svc and origin
/// fallback are skipped because they carry no ECH config.
///
/// ```dns
/// example.com  HTTPS  1 svc1.example.com. alpn="h3" port=9443 ech="..."
/// example.com  HTTPS  2 svc2.example.com. alpn="h2" port=10443
/// ```
/// Alt-svc: h3 on port 8443
///
/// HOSTNAME resolves AAAA to V6_ADDR and A to V4_ADDR.
/// SVC1 resolves A to V4_ADDR_2.
///
///   priority-1 bucket (SVC1, port 9443, ech): V4_2:H3, V4_2:H2
///   priority-2 bucket (SVC2, port 10443):     skipped (no ECH, not resolved)
///   alt-svc    bucket (port 8443):            skipped (no ECH)
///   fallback   bucket (HOSTNAME, port 443):   skipped (no ECH)
#[test]
fn partial_ech_with_alt_svc() {
    const SVC2: &str = "svc2.example.com.";
    const SVC1_PORT: u16 = 9443;
    const SVC2_PORT: u16 = 10443;
    const ALT_SVC_PORT: u16 = 8443;

    let config = NetworkConfig {
        alt_svc: vec![AltSvc {
            host: None,
            port: Some(ALT_SVC_PORT),
            http_version: HttpVersion::H3,
        }],
        ..NetworkConfig::default()
    };
    let (mut now, mut he) = setup_with_config(config);

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![
                        ServiceInfo {
                            priority: 1,
                            target_name: SVC1.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H3]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: Some(ech_config()),
                            port: Some(SVC1_PORT),
                        },
                        ServiceInfo {
                            priority: 2,
                            target_name: SVC2.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H2]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: None,
                            port: Some(SVC2_PORT),
                        },
                    ])),
                }),
                // Only SVC1 gets DNS queries — SVC2 skipped (no ECH)
                Some(Output::SendDnsQuery {
                    id: Id::from(3),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::Aaaa,
                }),
            ),
            (
                None,
                Some(Output::SendDnsQuery {
                    id: Id::from(4),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::A,
                }),
            ),
            (None, Some(out_resolution_delay())),
            // HOSTNAME AAAA/A positive
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_resolution_delay()),
            ),
            // SVC1 AAAA negative
            (
                Some(in_dns_aaaa_negative(Id::from(3))),
                Some(out_resolution_delay()),
            ),
            // SVC1 A positive -> first attempt from SVC1 bucket
            (
                Some(Input::DnsResult {
                    id: Id::from(4),
                    result: DnsResult::A(Ok(vec![V4_ADDR_2])),
                }),
                Some(Output::AttemptConnection {
                    id: Id::from(5),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V4_ADDR_2.into(), SVC1_PORT),
                        http_version: ConnectionAttemptHttpVersions::H3,
                        ech_config: Some(ech_config()),
                    },
                }),
            ),
        ],
        now,
    );

    // Only SVC1 (with ECH). Alt-svc, SVC2, and fallback all skipped.
    now += CONNECTION_ATTEMPT_DELAY;
    he.expect(
        vec![(
            None,
            Some(Output::AttemptConnection {
                id: Id::from(6),
                endpoint: Endpoint {
                    address: SocketAddr::new(V4_ADDR_2.into(), SVC1_PORT),
                    http_version: ConnectionAttemptHttpVersions::H2,
                    ech_config: Some(ech_config()),
                },
            }),
        )],
        now,
    );

    now += CONNECTION_ATTEMPT_DELAY;
    he.expect(vec![(None, None)], now);
}

mod https_port_svcparam_overrides_port_for {
    use super::*;

    fn check(ipv4_hints: Vec<Ipv4Addr>) {
        let (now, mut he) = setup(); // constructed with PORT (443)

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
                // HTTPS record carries port=8443; the connection attempt must use
                // 8443, not the authority port 443. IPv6 is preferred.
                (
                    Some(Input::DnsResult {
                        id: Id::from(0),
                        result: DnsResult::Https(Ok(vec![ServiceInfo {
                            priority: 1,
                            target_name: HOSTNAME.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                            ipv6_hints: vec![V6_ADDR],
                            ipv4_hints,
                            ech_config: None,
                            port: Some(CUSTOM_PORT),
                        }])),
                    }),
                    Some(out_attempt_v6_h3_custom_port(Id::from(3))),
                ),
            ],
            now,
        );
    }

    #[test]
    fn v6_hints() {
        check(vec![]);
    }

    /// HTTPS record with both IPv4 and IPv6 hints and a `port` SvcParam: both
    /// families use the overridden port.
    #[test]
    fn v4_and_v6_hints() {
        check(vec![V4_ADDR]);
    }
}

#[test]
fn https_port_svcparam_applies_to_resolved_a_and_aaaa() {
    let (now, mut he) = setup(); // constructed with PORT (443)

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            // HTTPS record with port=8443, no hints
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: None,
                        port: Some(CUSTOM_PORT),
                    }])),
                }),
                Some(out_resolution_delay()),
            ),
            // Positive AAAA: connection attempt must use port 8443, not 443
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h3_custom_port(Id::from(3))),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
            // Positive A: connection attempt must use port 8443, not 443
            (
                Some(in_connection_result_negative(Id::from(3))),
                Some(out_attempt_v4_h3_custom_port(Id::from(4))),
            ),
        ],
        now,
    );
}

#[test]
fn https_port_svcparam_applies_but_fallbacks_follow() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            // HTTPS record with port=8443, no hints
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: None,
                        port: Some(CUSTOM_PORT),
                    }])),
                }),
                Some(out_resolution_delay()),
            ),
            // Positive AAAA: connection attempt must use port 8443, not 443
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(Output::AttemptConnection {
                    id: Id::from(3),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR.into(), CUSTOM_PORT),
                        http_version: ConnectionAttemptHttpVersions::H3,
                        ech_config: None,
                    },
                }),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    // Connection attempts using custom port: V4:H3, V6:H2, V4:H2, then
    // fallback on port 443 with default HTTP versions (H2OrH1).
    he.expect_connection_attempts(
        &mut now,
        vec![
            out_attempt_v4_h3_custom_port(Id::from(4)),
            out_attempt_v6_h2_custom_port(Id::from(5)),
            out_attempt_v4_h2_custom_port(Id::from(6)),
            out_attempt_v6_h1_h2(Id::from(7)),
            out_attempt_v4_h1_h2(Id::from(8)),
        ],
    );
}

/// Two HTTPS ServiceInfo records with different priorities and `port` SvcParams.
///
/// ```dns
/// example.com  HTTPS  1 . alpn="h2,h3" port=20007
/// example.com  HTTPS  2 . alpn="h2,h3" port=20008
/// ```
///
/// Connection attempts are grouped by port in priority order, then the
/// authority port as a final fallback:
///
///   priority-1 bucket (port 20007): V6:H3, V4:H3, V6:H2, V4:H2
///   priority-2 bucket (port 20008): V6:H3, V4:H3, V6:H2, V4:H2
///   fallback   bucket (port   443): V6:H3, V4:H3, V6:H2, V4:H2
#[test]
fn https_two_service_infos_with_different_ports() {
    const PORT_1: u16 = 20007;
    const PORT_2: u16 = 20008;
    let (mut now, mut he) = setup(); // PORT = 443

    let attempt =
        |id: u64, addr: IpAddr, port: u16, http_version: ConnectionAttemptHttpVersions| {
            Output::AttemptConnection {
                id: Id::from(id),
                endpoint: Endpoint {
                    address: SocketAddr::new(addr, port),
                    http_version,
                    ech_config: None,
                },
            }
        };

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            // Two ServiceInfo records; the lower priority number wins first.
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![
                        ServiceInfo {
                            priority: 1,
                            target_name: HOSTNAME.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: None,
                            port: Some(PORT_1),
                        },
                        ServiceInfo {
                            priority: 2,
                            target_name: HOSTNAME.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: None,
                            port: Some(PORT_2),
                        },
                    ])),
                }),
                Some(out_resolution_delay()),
            ),
            // AAAA arrives; move-on criteria met. First bucket is PORT_1.
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(attempt(
                    3,
                    V6_ADDR.into(),
                    PORT_1,
                    ConnectionAttemptHttpVersions::H3,
                )),
            ),
            (None, Some(out_connection_attempt_delay())),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    he.expect_connection_attempts(
        &mut now,
        vec![
            // Priority-1 bucket (port 20007): V4:H3, V6:H2, V4:H2.
            attempt(4, V4_ADDR.into(), PORT_1, ConnectionAttemptHttpVersions::H3),
            attempt(5, V6_ADDR.into(), PORT_1, ConnectionAttemptHttpVersions::H2),
            attempt(6, V4_ADDR.into(), PORT_1, ConnectionAttemptHttpVersions::H2),
            // Priority-2 bucket (port 20008).
            attempt(7, V6_ADDR.into(), PORT_2, ConnectionAttemptHttpVersions::H3),
            attempt(8, V4_ADDR.into(), PORT_2, ConnectionAttemptHttpVersions::H3),
            attempt(9, V6_ADDR.into(), PORT_2, ConnectionAttemptHttpVersions::H2),
            attempt(
                10,
                V4_ADDR.into(),
                PORT_2,
                ConnectionAttemptHttpVersions::H2,
            ),
            // Fallback bucket (port 443) uses default HTTP versions.
            out_attempt_v6_h1_h2(Id::from(11)),
            out_attempt_v4_h1_h2(Id::from(12)),
        ],
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
                Some(in_dns_https_positive(Id::from(0))),
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
            // Fallback bucket with default HTTP versions (H2OrH1).
            (
                Some(in_connection_result_negative(Id::from(6))),
                Some(out_attempt_v6_h1_h2(Id::from(7))),
            ),
            (
                Some(in_connection_result_negative(Id::from(7))),
                Some(out_attempt_v4_h1_h2(Id::from(8))),
            ),
            (
                Some(in_connection_result_negative(Id::from(8))),
                Some(Output::Failed(FailureReason::Connection)),
            ),
        ],
        now,
    );
}

#[test]
fn https_svc1_addresses_trigger_additional_attempts() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![
                        ServiceInfo {
                            priority: 1,
                            target_name: HOSTNAME.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H2, HttpVersion::H3]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: None,
                            port: None,
                        },
                        ServiceInfo {
                            priority: 2,
                            target_name: SVC1.into(),
                            alpn_http_versions: HashSet::from([HttpVersion::H2, HttpVersion::H3]),
                            ipv6_hints: vec![],
                            ipv4_hints: vec![],
                            ech_config: None,
                            port: None,
                        },
                    ])),
                }),
                Some(Output::SendDnsQuery {
                    id: Id::from(3),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::Aaaa,
                }),
            ),
            (
                None,
                Some(Output::SendDnsQuery {
                    id: Id::from(4),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::A,
                }),
            ),
            (None, Some(out_resolution_delay())),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt_v6_h3(Id::from(5))),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
            (
                Some(Input::DnsResult {
                    id: Id::from(3),
                    result: DnsResult::Aaaa(Ok(vec![V6_ADDR_2])),
                }),
                Some(out_connection_attempt_delay()),
            ),
            (
                Some(Input::DnsResult {
                    id: Id::from(4),
                    result: DnsResult::A(Ok(vec![V4_ADDR_2])),
                }),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    let attempt = |id: u64, addr: IpAddr, http_version: ConnectionAttemptHttpVersions| {
        Output::AttemptConnection {
            id: Id::from(id),
            endpoint: Endpoint {
                address: SocketAddr::new(addr, PORT),
                http_version,
                ech_config: None,
            },
        }
    };

    // Addresses respect HTTPS record priority: P1 (HOSTNAME, priority=1) endpoints
    // come before P2 (SVC1, priority=2) endpoints.  V6_ADDR:H3 was already
    // attempted (id=5); the remaining follow in priority order, then fallback.
    he.expect_connection_attempts(
        &mut now,
        vec![
            attempt(6, V4_ADDR.into(), ConnectionAttemptHttpVersions::H3), // priority=1
            attempt(7, V6_ADDR.into(), ConnectionAttemptHttpVersions::H2), // priority=1
            attempt(8, V4_ADDR.into(), ConnectionAttemptHttpVersions::H2), // priority=1
            attempt(9, V6_ADDR_2.into(), ConnectionAttemptHttpVersions::H3), // priority=2
            attempt(10, V4_ADDR_2.into(), ConnectionAttemptHttpVersions::H3), // priority=2
            attempt(11, V6_ADDR_2.into(), ConnectionAttemptHttpVersions::H2), // priority=2
            attempt(12, V4_ADDR_2.into(), ConnectionAttemptHttpVersions::H2), // priority=2
            // Fallback bucket with default HTTP versions (H2OrH1).
            attempt(13, V6_ADDR.into(), ConnectionAttemptHttpVersions::H2OrH1),
            attempt(14, V4_ADDR.into(), ConnectionAttemptHttpVersions::H2OrH1),
        ],
    );
}

/// HTTPS record port takes precedence over alt-svc port.
///
/// HTTPS record with port=8443 and H3+H2; alt-svc with port=9443 and H3.
/// Expected order:
///   HTTPS bucket    (port 8443): V6:H3, V4:H3, V6:H2, V4:H2
///   alt-svc bucket  (port 9443): V6:H3, V4:H3
///   fallback bucket (port  443): V6:H2OrH1, V4:H2OrH1
#[test]
fn https_port_takes_precedence_over_alt_svc_port() {
    const HTTPS_PORT: u16 = 8443;
    const ALT_SVC_PORT: u16 = 9443;

    let config = NetworkConfig {
        alt_svc: vec![AltSvc {
            host: None,
            port: Some(ALT_SVC_PORT),
            http_version: HttpVersion::H3,
        }],
        ..NetworkConfig::default()
    };
    let (mut now, mut he) = setup_with_config(config);

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            // HTTPS record with port=8443
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: None,
                        port: Some(HTTPS_PORT),
                    }])),
                }),
                Some(out_resolution_delay()),
            ),
            // AAAA arrives; HTTPS bucket first (port 8443)
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt(
                    Id::from(3),
                    V6_ADDR.into(),
                    HTTPS_PORT,
                    ConnectionAttemptHttpVersions::H3,
                )),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    he.expect_connection_attempts(
        &mut now,
        vec![
            // HTTPS bucket (port 8443)
            out_attempt(
                Id::from(4),
                V4_ADDR.into(),
                HTTPS_PORT,
                ConnectionAttemptHttpVersions::H3,
            ),
            out_attempt(
                Id::from(5),
                V6_ADDR.into(),
                HTTPS_PORT,
                ConnectionAttemptHttpVersions::H2,
            ),
            out_attempt(
                Id::from(6),
                V4_ADDR.into(),
                HTTPS_PORT,
                ConnectionAttemptHttpVersions::H2,
            ),
            // Alt-svc bucket (port 9443)
            out_attempt(
                Id::from(7),
                V6_ADDR.into(),
                ALT_SVC_PORT,
                ConnectionAttemptHttpVersions::H3,
            ),
            out_attempt(
                Id::from(8),
                V4_ADDR.into(),
                ALT_SVC_PORT,
                ConnectionAttemptHttpVersions::H3,
            ),
            // Fallback bucket (port 443) uses default versions only.
            out_attempt(
                Id::from(9),
                V6_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H2OrH1,
            ),
            out_attempt(
                Id::from(10),
                V4_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H2OrH1,
            ),
        ],
    );
}

/// HTTPS record redirects to a different target name (no IP hints). Addresses
/// resolved for that target name are used in connection attempts, with higher
/// priority than the origin fallback.
///
/// ```dns
/// example.com          HTTPS  1  svc1.example.com.  alpn="h3"
/// svc1.example.com.    AAAA   2001:db8::2
/// svc1.example.com.    A      192.0.2.2
/// example.com          AAAA   2001:db8::1
/// example.com          A      192.0.2.1
/// ```
///
/// Expected connection attempts:
///   SVC1 bucket (priority 1): V6_ADDR_2:H3, V4_ADDR_2:H3
///   fallback bucket (origin): V6:H2OrH1,    V4:H2OrH1
///
/// <https://github.com/mozilla/happy-eyeballs/issues/10>
#[test]
fn target_name_redirect_addresses_used_in_connection_attempts() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            // HTTPS response redirects to SVC1 (different target name, no hints)
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: SVC1.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H3]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: None,
                        port: None,
                    }])),
                }),
                // Follow-up DNS for the redirected target name
                Some(Output::SendDnsQuery {
                    id: Id::from(3),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::Aaaa,
                }),
            ),
            (
                None,
                Some(Output::SendDnsQuery {
                    id: Id::from(4),
                    hostname: SVC1.into(),
                    record_type: DnsRecordType::A,
                }),
            ),
            (None, Some(out_resolution_delay())),
            // SVC1 AAAA positive → move-on criteria met, first attempt uses
            // the redirected target name's resolved address.
            (
                Some(Input::DnsResult {
                    id: Id::from(3),
                    result: DnsResult::Aaaa(Ok(vec![V6_ADDR_2])),
                }),
                Some(Output::AttemptConnection {
                    id: Id::from(5),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR_2.into(), PORT),
                        http_version: ConnectionAttemptHttpVersions::H3,
                        ech_config: None,
                    },
                }),
            ),
            (None, Some(out_connection_attempt_delay())),
            // Remaining DNS arrives while first attempt is in progress
            (
                Some(Input::DnsResult {
                    id: Id::from(4),
                    result: DnsResult::A(Ok(vec![V4_ADDR_2])),
                }),
                Some(out_connection_attempt_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_connection_attempt_delay()),
            ),
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_connection_attempt_delay()),
            ),
        ],
        now,
    );

    // Remaining attempts: SVC1's V4 address, then origin fallback.
    // SVC1 (priority 1) addresses come before the origin fallback.
    he.expect_connection_attempts(
        &mut now,
        vec![
            // SVC1 bucket (priority 1)
            Output::AttemptConnection {
                id: Id::from(6),
                endpoint: Endpoint {
                    address: SocketAddr::new(V4_ADDR_2.into(), PORT),
                    http_version: ConnectionAttemptHttpVersions::H3,
                    ech_config: None,
                },
            },
            // fallback bucket (origin)
            out_attempt_v6_h1_h2(Id::from(7)),
            out_attempt_v4_h1_h2(Id::from(8)),
        ],
    );
}

/// HTTPS record with `alpn="h3"` and `port=8443`. The HTTPS bucket should use
/// H3 at port 8443, but the fallback bucket (origin domain, authority port)
/// must use the default HTTP versions (H2OrH1), not H3 which came from the
/// HTTPS record.
///
/// ```dns
/// example.com  HTTPS  1 . alpn="h3" port=8443
/// example.com  A      192.0.2.1
/// ```
///
/// Expected connection attempts:
///   HTTPS bucket (port 8443): V4:H3
///   fallback bucket (port 443): V4:H2OrH1
#[test]
fn https_fallback_uses_default_http_versions() {
    let (mut now, mut he) = setup();

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            // HTTPS record with port=8443, alpn=h3 only
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H3]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: None,
                        port: Some(CUSTOM_PORT),
                    }])),
                }),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_negative(Id::from(1))),
                Some(out_resolution_delay()),
            ),
            // Positive A: connection attempt uses port 8443 with H3 from HTTPS record
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(out_attempt_v4_h3_custom_port(Id::from(3))),
            ),
            (None, Some(out_connection_attempt_delay())),
        ],
        now,
    );

    // Fallback on port 443 must use default H2OrH1, NOT H3.
    he.expect_connection_attempts(&mut now, vec![out_attempt_v4_h1_h2(Id::from(4))]);
}

/// When a connection attempt fails with `EchRetry`, the state machine should
/// emit a new connection attempt to the same endpoint with the new ECH config.
///
/// Setup:
///   HTTPS record with ECH config, AAAA positive.
///   First connection attempt uses original ECH config.
///   Server rejects ECH and provides retry_configs.
///   State machine emits a new attempt with updated ECH config.
#[test]
fn ech_retry_same_endpoint() {
    let (now, mut he) = setup();

    let new_ech_config = EchConfig::new(vec![10, 20, 30, 40, 50]);

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H2]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: Some(ech_config()),
                        port: None,
                    }])),
                }),
                Some(out_resolution_delay()),
            ),
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                // First connection attempt with original ECH config.
                Some(Output::AttemptConnection {
                    id: Id::from(3),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR.into(), PORT),
                        http_version: ConnectionAttemptHttpVersions::H2,
                        ech_config: Some(ech_config()),
                    },
                }),
            ),
            (None, Some(out_connection_attempt_delay())),
            // Server rejects ECH and provides retry_configs.
            (
                Some(Input::ConnectionResult {
                    id: Id::from(3),
                    result: ConnectionResult::EchRetry(new_ech_config.clone()),
                }),
                // State machine emits a new attempt with the new ECH config
                // immediately (no delay — this is a server-initiated retry,
                // not a new candidate).
                Some(Output::AttemptConnection {
                    id: Id::from(4),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR.into(), PORT),
                        http_version: ConnectionAttemptHttpVersions::H2,
                        ech_config: Some(new_ech_config.clone()),
                    },
                }),
            ),
        ],
        now,
    );
}

/// Per RFC 9849 Section 6.1.6:
///
/// > Clients SHOULD NOT accept "retry_config" in response to a connection
/// > initiated in response to a "retry_config".
///
/// The state machine must ignore `EchRetry` on an ECH-retried attempt and
/// treat it as a plain failure, then fall through to remaining endpoints.
#[test]
fn ech_retry_no_infinite_loop() {
    let (now, mut he) = setup();

    let retry_ech_config = EchConfig::new(vec![10, 20, 30, 40, 50]);
    let retry_ech_config_2 = EchConfig::new(vec![60, 70, 80]);

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(Input::DnsResult {
                    id: Id::from(0),
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H2]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: Some(ech_config()),
                        port: None,
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
                        http_version: ConnectionAttemptHttpVersions::H2,
                        ech_config: Some(ech_config()),
                    },
                }),
            ),
            (None, Some(out_connection_attempt_delay())),
            // First EchRetry: accepted, new attempt emitted.
            (
                Some(Input::ConnectionResult {
                    id: Id::from(3),
                    result: ConnectionResult::EchRetry(retry_ech_config.clone()),
                }),
                Some(Output::AttemptConnection {
                    id: Id::from(4),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR.into(), PORT),
                        http_version: ConnectionAttemptHttpVersions::H2,
                        ech_config: Some(retry_ech_config.clone()),
                    },
                }),
            ),
            (None, Some(out_connection_attempt_delay())),
            // Second EchRetry on the retried attempt: ignored, treated as
            // failure. A record still pending, so resolution delay.
            (
                Some(Input::ConnectionResult {
                    id: Id::from(4),
                    result: ConnectionResult::EchRetry(retry_ech_config_2),
                }),
                Some(out_resolution_delay()),
            ),
            // A record arrives, next endpoint attempted (V4, original ECH
            // from DNS).
            (
                Some(in_dns_a_positive(Id::from(2))),
                Some(Output::AttemptConnection {
                    id: Id::from(5),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V4_ADDR.into(), PORT),
                        http_version: ConnectionAttemptHttpVersions::H2,
                        ech_config: Some(ech_config()),
                    },
                }),
            ),
        ],
        now,
    );
}
