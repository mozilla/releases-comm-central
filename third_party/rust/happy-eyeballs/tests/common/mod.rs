#![allow(dead_code)]

use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    time::Instant,
};

use happy_eyeballs::{
    CONNECTION_ATTEMPT_DELAY, ConnectionAttemptHttpVersions, ConnectionResult, DnsRecordType,
    DnsResult, EchConfig, Endpoint, HappyEyeballs, HttpVersion, Id, Input, NetworkConfig, Output,
    RESOLUTION_DELAY, ServiceInfo,
};

pub const HOSTNAME: &str = "example.com";
pub const SVC1: &str = "svc1.example.com.";
pub const SVC2: &str = "svc2.example.com.";
pub const PORT: u16 = 443;
pub const CUSTOM_PORT: u16 = 8443;
pub const V6_ADDR: Ipv6Addr = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1);
pub const V6_ADDR_2: Ipv6Addr = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 2);
pub const V6_ADDR_3: Ipv6Addr = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 3);
pub const V4_ADDR: Ipv4Addr = Ipv4Addr::new(192, 0, 2, 1);
pub const V4_ADDR_2: Ipv4Addr = Ipv4Addr::new(192, 0, 2, 2);
pub const ECH_CONFIG_BYTES: &[u8] = &[1, 2, 3, 4, 5];

pub fn ech_config() -> EchConfig {
    EchConfig::new(ECH_CONFIG_BYTES.to_vec())
}

/// Build a [`ServiceInfo`] from the fields tests usually vary: priority, target
/// name, and ALPN versions. The remaining fields (hints, ECH, port) default to
/// empty/none; set them with the chainable [`ServiceInfoExt`] methods, e.g.
/// `service_info(1, SVC1, &[HttpVersion::H3]).ech().port(8443)`.
pub fn service_info(priority: u16, target_name: &str, alpns: &[HttpVersion]) -> ServiceInfo {
    ServiceInfo {
        priority,
        target_name: target_name.into(),
        alpn_http_versions: alpns.iter().copied().collect(),
        ipv6_hints: vec![],
        ipv4_hints: vec![],
        ech_config: None,
        port: None,
    }
}

/// Chainable setters for the non-default [`ServiceInfo`] fields, so tests can
/// build records without spelling out the defaults, e.g.
/// `service_info(1, SVC1, &[HttpVersion::H3]).ech().port(9443)`.
pub trait ServiceInfoExt {
    /// Attach the default test ECH config ([`ech_config`]).
    fn ech(self) -> Self;
    /// Attach a specific ECH config.
    fn ech_with(self, ech: EchConfig) -> Self;
    fn port(self, port: u16) -> Self;
    fn ipv6_hints(self, hints: Vec<Ipv6Addr>) -> Self;
    fn ipv4_hints(self, hints: Vec<Ipv4Addr>) -> Self;
}

impl ServiceInfoExt for ServiceInfo {
    fn ech(mut self) -> Self {
        self.ech_config = Some(ech_config());
        self
    }
    fn ech_with(mut self, ech: EchConfig) -> Self {
        self.ech_config = Some(ech);
        self
    }
    fn port(mut self, port: u16) -> Self {
        self.port = Some(port);
        self
    }
    fn ipv6_hints(mut self, hints: Vec<Ipv6Addr>) -> Self {
        self.ipv6_hints = hints;
        self
    }
    fn ipv4_hints(mut self, hints: Vec<Ipv4Addr>) -> Self {
        self.ipv4_hints = hints;
        self
    }
}

pub trait HappyEyeballsExt {
    fn expect(&mut self, input_output: Vec<(Option<Input>, Option<Output>)>, now: Instant);
    fn expect_connection_attempts(&mut self, now: &mut Instant, connections: Vec<Output>);
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

    fn expect_connection_attempts(&mut self, now: &mut Instant, connections: Vec<Output>) {
        for conn in connections {
            *now += CONNECTION_ATTEMPT_DELAY;
            self.expect(
                vec![
                    (None, Some(conn)),
                    (None, Some(out_connection_attempt_delay())),
                ],
                *now,
            );
        }
        *now += CONNECTION_ATTEMPT_DELAY;
        self.expect(vec![(None, None)], *now);
    }
}

pub fn in_dns_https_positive(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![service_info(
            1,
            HOSTNAME,
            &[HttpVersion::H3, HttpVersion::H2],
        )])),
    }
}

pub fn in_dns_https_positive_ech(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![
            service_info(1, HOSTNAME, &[HttpVersion::H3, HttpVersion::H2]).ech(),
        ])),
    }
}

pub fn in_dns_https_positive_no_alpn(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![service_info(1, HOSTNAME, &[])])),
    }
}

fn in_dns_https_with_hints(id: Id, ipv4_hints: Vec<Ipv4Addr>, ipv6_hints: Vec<Ipv6Addr>) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![
            service_info(1, HOSTNAME, &[HttpVersion::H3, HttpVersion::H2])
                .ipv4_hints(ipv4_hints)
                .ipv6_hints(ipv6_hints),
        ])),
    }
}

pub fn in_dns_https_positive_v6_hints(id: Id) -> Input {
    in_dns_https_with_hints(id, vec![], vec![V6_ADDR])
}

pub fn in_dns_https_positive_v4_hints(id: Id) -> Input {
    in_dns_https_with_hints(id, vec![V4_ADDR], vec![])
}

pub fn in_dns_https_positive_v4_and_v6_hints(id: Id) -> Input {
    in_dns_https_with_hints(id, vec![V4_ADDR], vec![V6_ADDR])
}

pub fn in_dns_https_positive_svc1(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![
            service_info(1, SVC1, &[HttpVersion::H3, HttpVersion::H2]).ipv6_hints(vec![V6_ADDR_2]),
        ])),
    }
}

pub fn in_dns_https_negative(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Err(())),
    }
}

pub fn in_dns_aaaa_positive(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Aaaa(Ok(vec![V6_ADDR])),
    }
}

pub fn in_dns_a_positive(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::A(Ok(vec![V4_ADDR])),
    }
}

pub fn in_dns_aaaa_negative(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Aaaa(Err(())),
    }
}

pub fn in_dns_a_negative(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::A(Err(())),
    }
}

pub fn in_connection_result_positive(id: Id) -> Input {
    Input::ConnectionResult {
        id,
        result: ConnectionResult::Success,
    }
}

pub fn in_connection_result_negative(id: Id) -> Input {
    Input::ConnectionResult {
        id,
        result: ConnectionResult::Failure("connection refused".to_string()),
    }
}

pub fn in_connection_result_ech_retry(id: Id) -> Input {
    Input::ConnectionResult {
        id,
        result: ConnectionResult::EchRetry(ech_config()),
    }
}

pub fn out_send_dns(id: Id, hostname: &str, record_type: DnsRecordType) -> Output {
    Output::SendDnsQuery {
        id,
        hostname: hostname.into(),
        record_type,
    }
}

pub fn out_send_dns_https(id: Id) -> Output {
    out_send_dns(id, HOSTNAME, DnsRecordType::Https)
}

pub fn out_send_dns_aaaa(id: Id) -> Output {
    out_send_dns(id, HOSTNAME, DnsRecordType::Aaaa)
}

pub fn out_send_dns_svc1(id: Id) -> Output {
    out_send_dns(id, SVC1, DnsRecordType::Aaaa)
}

pub fn out_send_dns_a(id: Id) -> Output {
    out_send_dns(id, HOSTNAME, DnsRecordType::A)
}

pub fn out_attempt_v6_h1_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), PORT),
            http_version: ConnectionAttemptHttpVersions::H2OrH1,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt_v6_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), PORT),
            http_version: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt_v6_h3(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), PORT),
            http_version: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt_v6_h3_custom_port(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), CUSTOM_PORT),
            http_version: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt_v4_h1_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), PORT),
            http_version: ConnectionAttemptHttpVersions::H2OrH1,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt_v4_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), PORT),
            http_version: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt_v4_h3(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), PORT),
            http_version: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt_v4_h3_custom_port(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), CUSTOM_PORT),
            http_version: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt_v6_h2_custom_port(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), CUSTOM_PORT),
            http_version: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt_v4_h2_custom_port(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), CUSTOM_PORT),
            http_version: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_attempt(
    id: Id,
    addr: IpAddr,
    port: u16,
    http_version: ConnectionAttemptHttpVersions,
) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(addr, port),
            http_version,
            ech_config: None,
        },
        is_ech_retry: false,
    }
}

pub fn out_resolution_delay() -> Output {
    Output::Timer {
        duration: RESOLUTION_DELAY,
    }
}

pub fn out_connection_attempt_delay() -> Output {
    Output::Timer {
        duration: CONNECTION_ATTEMPT_DELAY,
    }
}

pub fn setup() -> (Instant, HappyEyeballs) {
    setup_with_config(NetworkConfig::default())
}

pub fn setup_with_config(config: NetworkConfig) -> (Instant, HappyEyeballs) {
    let _ = env_logger::builder().is_test(true).try_init();
    let now = Instant::now();
    let he = HappyEyeballs::new_with_network_config(HOSTNAME, PORT, config).unwrap();
    (now, he)
}

/// Assert that the next output is a DNS query for `hostname`/`record_type` with `id`.
pub fn expect_query(
    he: &mut HappyEyeballs,
    now: Instant,
    id: u64,
    hostname: &str,
    rt: DnsRecordType,
) {
    assert_eq!(
        he.process_output(now),
        Some(out_send_dns(Id::from(id), hostname, rt))
    );
}

/// Assert the standard opening burst of DNS queries: HTTPS, AAAA, then A for the
/// default `HOSTNAME` with ids 0, 1, 2.
pub fn expect_initial_dns_queries(he: &mut HappyEyeballs, now: Instant) {
    expect_query(he, now, 0, HOSTNAME, DnsRecordType::Https);
    expect_query(he, now, 1, HOSTNAME, DnsRecordType::Aaaa);
    expect_query(he, now, 2, HOSTNAME, DnsRecordType::A);
}
