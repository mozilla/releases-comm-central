mod common;
use common::*;

use std::time::{Duration, Instant};

use happy_eyeballs::{
    AltSvc, ConnectionAttemptHttpVersions, FailureReason, HappyEyeballs, HttpVersion, Id,
    NetworkConfig, Output,
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
        alt_svc: vec![AltSvc {
            host: None,
            port: None,
            http_version: HttpVersion::H3,
        }],
        ..NetworkConfig::default()
    };
    let mut he = HappyEyeballs::new_with_network_config(HOSTNAME, PORT, config).unwrap();

    // Should still send DNS queries as normal
    he.expect(vec![(None, Some(out_send_dns_https(Id::from(0))))], now);
}

#[test]
fn alt_svc_used_immediately() {
    let now = Instant::now();
    let config = NetworkConfig {
        alt_svc: vec![AltSvc {
            host: None,
            port: None,
            http_version: HttpVersion::H3,
        }],
        ..NetworkConfig::default()
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
///   fallback bucket (port  443): V6:H2OrH1, V4:H2OrH1
#[test]
fn alt_svc_with_port() {
    let alt_port: u16 = CUSTOM_PORT;
    let config = NetworkConfig {
        alt_svc: vec![AltSvc {
            host: None,
            port: Some(alt_port),
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
            // Fallback bucket (port 443): V6:H2OrH1, V4:H2OrH1
            out_attempt(
                Id::from(5),
                V6_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H2OrH1,
            ),
            out_attempt(
                Id::from(6),
                V4_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H2OrH1,
            ),
        ],
    );

    // All connection attempts fail -> should report Failed(Connection)
    for id in 3..=5 {
        he.expect(
            vec![(Some(in_connection_result_negative(Id::from(id))), None)],
            now,
        );
    }
    he.expect(
        vec![(
            Some(in_connection_result_negative(Id::from(6))),
            Some(Output::Failed(FailureReason::Connection)),
        )],
        now,
    );
}

/// When the host is an IP address and alt-svc specifies a custom port,
/// endpoints should be attempted at both the alt-svc port and the origin port.
///
/// Expected endpoint order:
///   alt-svc bucket  (port 8443): V4_ADDR:H3
///   fallback bucket (port  443): V4_ADDR:H2OrH1
#[test]
fn ip_host_alt_svc_with_port() {
    let mut now = Instant::now();
    let config = NetworkConfig {
        alt_svc: vec![AltSvc {
            host: None,
            port: Some(CUSTOM_PORT),
            http_version: HttpVersion::H3,
        }],
        ..NetworkConfig::default()
    };
    let mut he =
        HappyEyeballs::new_with_network_config(&V4_ADDR.to_string(), PORT, config).unwrap();

    he.expect(
        vec![
            // Alt-svc bucket (port 8443): H3
            (
                None,
                Some(out_attempt(
                    Id::from(0),
                    V4_ADDR.into(),
                    CUSTOM_PORT,
                    ConnectionAttemptHttpVersions::H3,
                )),
            ),
            (None, Some(out_connection_attempt_delay())),
        ],
        now,
    );

    he.expect_connection_attempts(
        &mut now,
        vec![
            // Fallback bucket (port 443): H2OrH1
            out_attempt(
                Id::from(1),
                V4_ADDR.into(),
                PORT,
                ConnectionAttemptHttpVersions::H2OrH1,
            ),
        ],
    );
}

/// Custom resolution and connection attempt delays should be respected by
/// the state machine instead of the default constants.
#[test]
fn custom_delays() {
    let custom_resolution_delay = Duration::from_millis(10);
    let custom_connection_attempt_delay = Duration::from_millis(50);

    let (mut now, mut he) = setup_with_config(NetworkConfig {
        resolution_delay: custom_resolution_delay,
        connection_attempt_delay: custom_connection_attempt_delay,
        ..NetworkConfig::default()
    });

    he.expect(
        vec![
            (None, Some(out_send_dns_https(Id::from(0)))),
            (None, Some(out_send_dns_aaaa(Id::from(1)))),
            (None, Some(out_send_dns_a(Id::from(2)))),
            (
                Some(in_dns_a_positive(Id::from(2))),
                // Should use the custom resolution delay, not the default 50ms.
                Some(Output::Timer {
                    duration: custom_resolution_delay,
                }),
            ),
        ],
        now,
    );

    now += custom_resolution_delay;

    he.expect(
        vec![
            (None, Some(out_attempt_v4_h1_h2(Id::from(3)))),
            // Should use the custom connection attempt delay, not the default 250ms.
            (
                None,
                Some(Output::Timer {
                    duration: custom_connection_attempt_delay,
                }),
            ),
        ],
        now,
    );
}
