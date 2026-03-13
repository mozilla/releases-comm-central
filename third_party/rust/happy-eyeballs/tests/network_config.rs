/// Tests for network configuration options: IP literal hosts, and alt-svc.
mod common;
use common::*;

use std::time::Instant;

use happy_eyeballs::{
    AltSvc, ConnectionAttemptHttpVersions, HappyEyeballs, HttpVersion, HttpVersions, Id,
    IpPreference, NetworkConfig,
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
            http_version: HttpVersion::H3,
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
            http_version: HttpVersion::H3,
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

/// Alt-svc with a custom port: connections are attempted at both the alt-svc
/// port and the origin port.
///
/// No HTTPS records in this scenario. Alt-svc says H3 on port 8443.
/// Expected endpoint order:
///   alt-svc bucket  (port 8443): V6:H3, V4:H3
///   fallback bucket (port  443): V6:H3, V4:H3, V6:H2OrH1, V4:H2OrH1
#[test]
fn alt_svc_with_port() {
    let alt_port: u16 = CUSTOM_PORT;
    let config = NetworkConfig {
        http_versions: HttpVersions::default(),
        ip: IpPreference::DualStackPreferV6,
        alt_svc: vec![AltSvc {
            host: None,
            port: Some(alt_port),
            http_version: HttpVersion::H3,
        }],
    };
    let (mut now, mut he) = setup_with_config(config);

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_https_negative(Id::from(0))),
                Some(out_resolution_delay()),
            ),
            // AAAA arrives, move-on met. First endpoint: alt-svc port V6:H3
            (
                Some(in_dns_aaaa_positive(Id::from(1))),
                Some(out_attempt(
                    Id::from(3),
                    V6_ADDR.into(),
                    alt_port,
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
            // Alt-svc bucket (port 8443): V4:H3
            out_attempt(
                Id::from(4),
                V4_ADDR.into(),
                alt_port,
                ConnectionAttemptHttpVersions::H3,
            ),
            // Fallback bucket (port 443): V6:H3, V4:H3, V6:H2OrH1, V4:H2OrH1
            out_attempt(
                Id::from(5),
                V6_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H3,
            ),
            out_attempt(
                Id::from(6),
                V4_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H3,
            ),
            out_attempt(
                Id::from(7),
                V6_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H2OrH1,
            ),
            out_attempt(
                Id::from(8),
                V4_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H2OrH1,
            ),
        ],
    );
}
