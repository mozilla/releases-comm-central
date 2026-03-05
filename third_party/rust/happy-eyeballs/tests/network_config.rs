/// Tests for network configuration options: IP literal hosts, and alt-svc.
mod common;
use common::*;

use std::time::Instant;

use happy_eyeballs::{
    AltSvc, HappyEyeballs, HttpVersion, HttpVersions, Id, IpPreference, NetworkConfig,
};

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
