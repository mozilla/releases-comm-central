/// Tests for HTTPS/SVCB DNS record handling including ECH, port SvcParams,
/// multiple ServiceInfo records, and SVC1 target name resolution.
mod common;
use common::*;

use std::{
    collections::HashSet,
    net::{IpAddr, Ipv4Addr, SocketAddr},
};

use happy_eyeballs::{
    AltSvc, ConnectionAttemptHttpVersions, DnsRecordType, DnsResult, Endpoint, HttpVersion,
    HttpVersions, Id, Input, IpPreference, NetworkConfig, Output, ServiceInfo,
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
                        ech_config: Some(ECH_CONFIG.to_vec()),
                        port: None,
                    }])),
                }),
                Some(Output::AttemptConnection {
                    id: Id::from(3),
                    endpoint: Endpoint {
                        address: SocketAddr::new(V6_ADDR.into(), PORT),
                        http_version: ConnectionAttemptHttpVersions::H3,
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
                    result: DnsResult::Https(Ok(vec![ServiceInfo {
                        priority: 1,
                        target_name: HOSTNAME.into(),
                        alpn_http_versions: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
                        ipv6_hints: vec![],
                        ipv4_hints: vec![],
                        ech_config: Some(ECH_CONFIG.to_vec()),
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

    // Connection attempts using custom port: V6:H3, V4:H3, V6:H2, V4:H2, then
    // fallback on port 443.
    he.expect_connection_attempts(
        &mut now,
        vec![
            out_attempt_v4_h3_custom_port(Id::from(4)),
            out_attempt_v6_h2_custom_port(Id::from(5)),
            out_attempt_v4_h2_custom_port(Id::from(6)),
            out_attempt_v6_h3(Id::from(7)),
            out_attempt_v4_h3(Id::from(8)),
            out_attempt_v6_h2(Id::from(9)),
            out_attempt_v4_h2(Id::from(10)),
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
            // Fallback bucket (port 443).
            out_attempt_v6_h3(Id::from(11)),
            out_attempt_v4_h3(Id::from(12)),
            out_attempt_v6_h2(Id::from(13)),
            out_attempt_v4_h2(Id::from(14)),
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
            (
                Some(in_connection_result_negative(Id::from(6))),
                Some(Output::Failed),
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
    // attempted (id=5); the remaining 7 follow in priority order.
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
        ],
    );
}

/// HTTPS record port takes precedence over alt-svc port.
///
/// HTTPS record with port=8443 and H3+H2; alt-svc with port=9443 and H3.
/// Expected order:
///   HTTPS bucket    (port 8443): V6:H3, V4:H3, V6:H2, V4:H2
///   alt-svc bucket  (port 9443): V6:H3, V4:H3
///   fallback bucket (port  443): V6:H3, V4:H3, V6:H2, V4:H2
#[test]
fn https_port_takes_precedence_over_alt_svc_port() {
    const HTTPS_PORT: u16 = 8443;
    const ALT_SVC_PORT: u16 = 9443;

    let config = NetworkConfig {
        http_versions: HttpVersions::default(),
        ip: IpPreference::DualStackPreferV6,
        alt_svc: vec![AltSvc {
            host: None,
            port: Some(ALT_SVC_PORT),
            http_version: HttpVersion::H3,
        }],
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
            // Fallback bucket (port 443)
            out_attempt(
                Id::from(9),
                V6_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H3,
            ),
            out_attempt(
                Id::from(10),
                V4_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H3,
            ),
            out_attempt(
                Id::from(11),
                V6_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H2,
            ),
            out_attempt(
                Id::from(12),
                V4_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H2,
            ),
        ],
    );
}
