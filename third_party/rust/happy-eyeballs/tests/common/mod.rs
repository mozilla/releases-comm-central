#![allow(dead_code)]

use std::{
    collections::HashSet,
    net::{Ipv4Addr, Ipv6Addr, SocketAddr},
    time::Instant,
};

use happy_eyeballs::{
    CONNECTION_ATTEMPT_DELAY, ConnectionAttemptHttpVersions, DnsRecordType, DnsResult, Endpoint,
    HappyEyeballs, HttpVersion, Id, Input, NetworkConfig, Output, RESOLUTION_DELAY, ServiceInfo,
};

pub const HOSTNAME: &str = "example.com";
pub const SVC1: &str = "svc1.example.com.";
pub const PORT: u16 = 443;
pub const CUSTOM_PORT: u16 = 8443;
pub const V6_ADDR: Ipv6Addr = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1);
pub const V6_ADDR_2: Ipv6Addr = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 2);
pub const V6_ADDR_3: Ipv6Addr = Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 3);
pub const V4_ADDR: Ipv4Addr = Ipv4Addr::new(192, 0, 2, 1);
pub const V4_ADDR_2: Ipv4Addr = Ipv4Addr::new(192, 0, 2, 2);
pub const ECH_CONFIG: &[u8] = &[1, 2, 3, 4, 5];

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
        result: DnsResult::Https(Ok(vec![ServiceInfo {
            priority: 1,
            target_name: HOSTNAME.into(),
            alpn_protocols: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
            ipv6_hints: vec![],
            ipv4_hints: vec![],
            ech_config: None,
            port: None,
        }])),
    }
}

pub fn in_dns_https_positive_no_alpn(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![ServiceInfo {
            priority: 1,
            target_name: HOSTNAME.into(),
            alpn_protocols: HashSet::new(),
            ipv6_hints: vec![],
            ipv4_hints: vec![],
            ech_config: None,
            port: None,
        }])),
    }
}

pub fn in_dns_https_positive_v6_hints(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![ServiceInfo {
            priority: 1,
            target_name: HOSTNAME.into(),
            alpn_protocols: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
            ipv6_hints: vec![V6_ADDR],
            ipv4_hints: vec![],
            ech_config: None,
            port: None,
        }])),
    }
}

pub fn in_dns_https_positive_svc1(id: Id) -> Input {
    Input::DnsResult {
        id,
        result: DnsResult::Https(Ok(vec![ServiceInfo {
            priority: 1,
            target_name: SVC1.into(),
            alpn_protocols: HashSet::from([HttpVersion::H3, HttpVersion::H2]),
            ipv6_hints: vec![V6_ADDR_2],
            ipv4_hints: vec![],
            ech_config: None,
            port: None,
        }])),
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
    Input::ConnectionResult { id, result: Ok(()) }
}

pub fn in_connection_result_negative(id: Id) -> Input {
    Input::ConnectionResult {
        id,
        result: Err("connection refused".to_string()),
    }
}

pub fn out_send_dns_https(id: Id) -> Output {
    Output::SendDnsQuery {
        id,
        hostname: HOSTNAME.into(),
        record_type: DnsRecordType::Https,
    }
}

pub fn out_send_dns_aaaa(id: Id) -> Output {
    Output::SendDnsQuery {
        id,
        hostname: HOSTNAME.into(),
        record_type: DnsRecordType::Aaaa,
    }
}

pub fn out_send_dns_svc1(id: Id) -> Output {
    Output::SendDnsQuery {
        id,
        hostname: SVC1.into(),
        record_type: DnsRecordType::Aaaa,
    }
}

pub fn out_send_dns_a(id: Id) -> Output {
    Output::SendDnsQuery {
        id,
        hostname: HOSTNAME.into(),
        record_type: DnsRecordType::A,
    }
}

pub fn out_attempt_v6_h1_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H2OrH1,
            ech_config: None,
        },
    }
}

pub fn out_attempt_v6_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
    }
}

pub fn out_attempt_v6_h3(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
    }
}

pub fn out_attempt_v6_h3_custom_port(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), CUSTOM_PORT),
            protocol: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
    }
}

pub fn out_attempt_v4_h1_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H2OrH1,
            ech_config: None,
        },
    }
}

pub fn out_attempt_v4_h2(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
    }
}

pub fn out_attempt_v4_h3(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), PORT),
            protocol: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
    }
}

pub fn out_attempt_v4_h3_custom_port(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), CUSTOM_PORT),
            protocol: ConnectionAttemptHttpVersions::H3,
            ech_config: None,
        },
    }
}

pub fn out_attempt_v6_h2_custom_port(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V6_ADDR.into(), CUSTOM_PORT),
            protocol: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
    }
}

pub fn out_attempt_v4_h2_custom_port(id: Id) -> Output {
    Output::AttemptConnection {
        id,
        endpoint: Endpoint {
            address: SocketAddr::new(V4_ADDR.into(), CUSTOM_PORT),
            protocol: ConnectionAttemptHttpVersions::H2,
            ech_config: None,
        },
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
