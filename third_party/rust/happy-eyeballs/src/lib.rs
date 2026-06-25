//! # Happy Eyeballs v3 Implementation
//!
//! WORK IN PROGRESS
//!
//! This crate provides an implementation of Happy Eyeballs v3 as specified in
//! [draft-ietf-happy-happyeyeballs-v3-02](https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html).
//!
//! It is implemented as a deterministic, pure state machine. The caller drives
//! all I/O and timers. Current time is explicitly provided by the caller. The
//! state machine itself performs no side effects (e.g. network calls or
//! blocking operations).
//!
//! Happy Eyeballs v3 is an algorithm for improving the performance of dual-stack
//! applications by racing IPv4 and IPv6 connections while optimizing for modern
//! network conditions including HTTPS service discovery and QUIC.
//!
//! ## Usage
//!
//! ```rust
//! # use happy_eyeballs::{
//! #     DnsRecordType, DnsResult, HappyEyeballs, Id, Input, Output, TargetName,
//! # };
//! # use std::{net::{Ipv4Addr, Ipv6Addr}, time::Instant};
//!
//! let mut he = HappyEyeballs::new("example.com", 443).unwrap();
//! let now = Instant::now();
//!
//! // First process outputs from the state machine, e.g. a DNS query to send:
//! # let mut dns_id: Option<Id> = None;
//! while let Some(output) = he.process_output(now) {
//!     match output {
//!         Output::SendDnsQuery { id, hostname, record_type } => {
//!             // Send DNS query.
//! #           dns_id = Some(id);
//!         }
//!         Output::AttemptConnection { id, endpoint, is_ech_retry } => {
//!             // Attempt connection.
//!         }
//!         _ => {}
//!     }
//! }
//!
//! // Later pass results as input back to the state machine, e.g. a DNS
//! // response arrives:
//! # let dns_result = DnsResult::Aaaa(Ok(vec![Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 1)]));
//! he.process_input(Input::DnsResult { id: dns_id.unwrap(), result: dns_result }, Instant::now());
//! ```
//!
//! For complete example usage, see the [`tests/`](tests/).

use std::collections::{BTreeMap, HashSet, VecDeque};
use std::fmt::Debug;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::num::NonZeroU32;
use std::time::{Duration, Instant};

use log::trace;
use thiserror::Error;
use url::Host as UrlHost;

mod id;
pub use id::Id;
use id::IdGenerator;

/// > The RECOMMENDED value for the Resolution Delay is 50 milliseconds.
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>
pub const RESOLUTION_DELAY: Duration = Duration::from_millis(50);

/// > Connection Attempt Delay (Section 6): The time to wait between connection
/// > attempts in the absence of RTT data. Recommended to be 250 milliseconds.
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-9>
pub const CONNECTION_ATTEMPT_DELAY: Duration = Duration::from_millis(250);

/// The default multiplier applied to the connection attempt delay after each
/// successive attempt. A value of `1` keeps the delay constant, matching the
/// RFC behavior.
pub const CONNECTION_ATTEMPT_DELAY_MULTIPLIER: NonZeroU32 = NonZeroU32::MIN;

/// Input events to the Happy Eyeballs state machine
#[derive(Debug, Clone, PartialEq)]
pub enum Input {
    /// DNS query result received
    DnsResult { id: Id, result: DnsResult },

    /// Connection attempt result
    ConnectionResult { id: Id, result: ConnectionResult },
}

/// An ECH (Encrypted Client Hello) configuration.
///
/// Wraps the raw bytes of one or more serialised `ECHConfig` structures
/// as defined in [RFC 9849 Section 4].
///
/// [RFC 9849 Section 4]: https://datatracker.ietf.org/doc/html/rfc9849#section-4
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EchConfig(Vec<u8>);

impl EchConfig {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self(bytes)
    }
}

impl AsRef<[u8]> for EchConfig {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Result of a connection attempt.
#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionResult {
    /// Connection succeeded.
    Success,
    /// Connection failed.
    Failure(String),
    /// The server rejected ECH but provided `retry_configs` (per [RFC 9849
    /// Section 6.1.6]). The state machine will schedule a new connection
    /// attempt to the **same endpoint** (address + HTTP version) using the
    /// updated ECH config.
    ///
    /// A retry to a retry will be ignored. See RFC:
    ///
    /// > Clients SHOULD NOT accept "retry_config" in response to a connection
    /// > initiated in response to a "retry_config".
    ///
    /// [RFC 9849 Section 6.1.6]: https://datatracker.ietf.org/doc/html/rfc9849#section-6.1.6
    EchRetry(EchConfig),
}

#[derive(Debug, Clone, PartialEq)]
pub enum DnsResult {
    Https(Result<Vec<ServiceInfo>, ()>),
    Aaaa(Result<Vec<Ipv6Addr>, ()>),
    A(Result<Vec<Ipv4Addr>, ()>),
}

impl DnsResult {
    /// Returns true if this result provides address information, i.e.
    /// non-empty AAAA/A records or HTTPS records with IP hints.
    fn has_addrs(&self) -> bool {
        match self {
            DnsResult::Aaaa(Ok(v)) => !v.is_empty(),
            DnsResult::A(Ok(v)) => !v.is_empty(),
            DnsResult::Https(Ok(infos)) => infos
                .iter()
                .any(|i| !i.ipv4_hints.is_empty() || !i.ipv6_hints.is_empty()),
            _ => false,
        }
    }

    fn ip_addrs(&self) -> impl Iterator<Item = IpAddr> + '_ {
        let v6 = match self {
            DnsResult::Aaaa(Ok(addrs)) => addrs.as_slice(),
            _ => &[],
        };
        let v4 = match self {
            DnsResult::A(Ok(addrs)) => addrs.as_slice(),
            _ => &[],
        };
        v6.iter()
            .copied()
            .map(IpAddr::V6)
            .chain(v4.iter().copied().map(IpAddr::V4))
    }

    fn flatten_into_endpoints(
        &self,
        port: u16,
        http_versions: &HashSet<ConnectionAttemptHttpVersions>,
    ) -> Vec<Endpoint> {
        self.ip_addrs()
            .flat_map(|ip| {
                http_versions.iter().map(move |v| Endpoint {
                    address: SocketAddr::new(ip, port),
                    http_version: *v,
                    ech_config: None,
                })
            })
            .collect()
    }
}

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct TargetName(String);

impl From<&str> for TargetName {
    fn from(s: &str) -> Self {
        TargetName(s.to_string())
    }
}

impl From<TargetName> for String {
    fn from(t: TargetName) -> Self {
        t.0
    }
}

impl TargetName {
    fn as_str(&self) -> &str {
        &self.0
    }
}

impl Debug for TargetName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Output events from the Happy Eyeballs state machine
#[derive(Debug, Clone, PartialEq)]
#[must_use]
pub enum Output {
    /// Send a DNS query
    SendDnsQuery {
        id: Id,
        hostname: TargetName,
        record_type: DnsRecordType,
    },

    /// Start a timer
    Timer { duration: Duration },

    /// Attempt to connect to an address.
    ///
    /// `is_ech_retry` is `true` iff this attempt was scheduled in response to
    /// a [`ConnectionResult::EchRetry`] on a prior attempt (i.e. an in-band
    /// ECH configuration update).
    AttemptConnection {
        id: Id,
        endpoint: Endpoint,
        is_ech_retry: bool,
    },

    /// Cancel a connection attempt
    CancelConnection { id: Id },

    /// Connection attempt succeeded
    Succeeded,

    /// Failed to establish a connection, either due to DNS resolution failure
    /// or because all connection attempts have failed.
    Failed(FailureReason),
}

/// Reason for a connection failure.
#[derive(Debug, Clone, PartialEq)]
pub enum FailureReason {
    /// All DNS resolutions failed.
    DnsResolution,
    /// All connection attempts failed.
    Connection,
}

impl Output {
    pub fn attempt(self) -> Option<Endpoint> {
        match self {
            Output::AttemptConnection { endpoint, .. } => Some(endpoint),
            _ => None,
        }
    }
}

/// DNS record types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DnsRecordType {
    Https,
    Aaaa,
    A,
}

/// Service information from HTTPS records
#[derive(Clone, PartialEq)]
pub struct ServiceInfo {
    pub priority: u16,
    pub target_name: TargetName,
    pub alpn_http_versions: HashSet<HttpVersion>,
    pub ech_config: Option<EchConfig>,
    pub ipv4_hints: Vec<Ipv4Addr>,
    pub ipv6_hints: Vec<Ipv6Addr>,
    pub port: Option<u16>,
}

impl Debug for ServiceInfo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut debug_struct = f.debug_struct("ServiceInfo");

        debug_struct.field("priority", &self.priority);
        debug_struct.field("target", &self.target_name);

        if !self.alpn_http_versions.is_empty() {
            debug_struct.field("alpn", &self.alpn_http_versions);
        }

        if self.ech_config.is_some() {
            debug_struct.field("ech", &self.ech_config);
        }

        if !self.ipv4_hints.is_empty() {
            debug_struct.field("ipv4", &self.ipv4_hints);
        }

        if !self.ipv6_hints.is_empty() {
            debug_struct.field("ipv6", &self.ipv6_hints);
        }

        debug_struct.finish()
    }
}

impl ServiceInfo {
    fn flatten_into_endpoints(
        &self,
        port: u16,
        // `None` if no A response has been received yet; `Some(addrs)` once
        // an answer (positive or negative) has arrived.
        ipv4_addrs: Option<&[Ipv4Addr]>,
        // `None` if no AAAA response has been received yet; `Some(addrs)`
        // once an answer (positive or negative) has arrived.
        ipv6_addrs: Option<&[Ipv6Addr]>,
        // The HTTP versions the client allows; used to filter this record's own
        // ALPNs.
        enabled_http_versions: &HttpVersions,
        ech_enabled: bool,
    ) -> Vec<Endpoint> {
        let port = self.port.unwrap_or(port);

        // > ServiceMode records can contain address hints via ipv6hint and
        // > ipv4hint parameters. When these are received, they SHOULD be
        // > considered as positive non-empty answers for the purpose of the
        // > algorithm when A and AAAA records corresponding to the TargetName
        // > are not available yet.
        //
        // <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2.1>
        //
        // Once an answer arrives — positive or negative — the records are no
        // longer "not available yet". A positive answer replaces hints with
        // actual addresses; a negative answer discards them entirely.
        let hint_v6 = match ipv6_addrs {
            None => self.ipv6_hints.as_slice(),
            Some(_) => &[],
        };
        let hint_v4 = match ipv4_addrs {
            None => self.ipv4_hints.as_slice(),
            Some(_) => &[],
        };

        // Each ServiceMode record's ALPN SvcParam lists the protocols available
        // at its own TargetName, so use only this record's ALPNs, never another
        // record's. Assembling the "SVCB ALPN set" -- including adding the
        // scheme default ("http/1.1" for "https") when no "alpn" is present --
        // is the caller's responsibility when interpreting the record (RFC 9460
        // Section 7.1.1). A record that still carries no ALPN here is not usable
        // (a "no-default-alpn" record without "alpn" is not even self-consistent,
        // Section 2.4.3) and yields no endpoints.
        //
        // <https://www.rfc-editor.org/rfc/rfc9460#section-7.1.1>
        let mut versions = self.alpn_http_versions.clone();
        enabled_http_versions.filter_disabled(&mut versions);
        let http_versions = ConnectionAttemptHttpVersions::from_http_versions(&versions);

        let hints = hint_v6
            .iter()
            .cloned()
            .map(IpAddr::V6)
            .chain(hint_v4.iter().cloned().map(IpAddr::V4))
            .flat_map(|ip| {
                // TODO: way around allocation?
                let ech_config = ech_enabled.then(|| self.ech_config.clone()).flatten();
                http_versions.iter().map(move |&http_version| Endpoint {
                    address: SocketAddr::new(ip, port),
                    http_version,
                    ech_config: ech_config.clone(),
                })
            });

        let addrs = ipv6_addrs
            .unwrap_or(&[])
            .iter()
            .cloned()
            .map(IpAddr::V6)
            .chain(ipv4_addrs.unwrap_or(&[]).iter().cloned().map(IpAddr::V4))
            .flat_map(|ip| {
                // TODO: way around allocation?
                let ech_config = ech_enabled.then(|| self.ech_config.clone()).flatten();
                http_versions.iter().map(move |v| Endpoint {
                    address: SocketAddr::new(ip, port),
                    http_version: *v,
                    ech_config: ech_config.clone(),
                })
            });

        hints.chain(addrs).collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum HttpVersion {
    H3,
    H2,
    H1,
}

/// Possible connection attempt HTTP version combinations.
///
/// While on a QUIC connection attempts one can only use HTTP/3, on a TCP
/// connection attempt one might either negotiate HTTP/2 or HTTP/1.1 via TLS
/// ALPN.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum ConnectionAttemptHttpVersions {
    H3,
    H2OrH1,
    H2,
    H1,
}

impl From<HttpVersion> for ConnectionAttemptHttpVersions {
    fn from(v: HttpVersion) -> Self {
        match v {
            HttpVersion::H3 => ConnectionAttemptHttpVersions::H3,
            HttpVersion::H2 => ConnectionAttemptHttpVersions::H2,
            HttpVersion::H1 => ConnectionAttemptHttpVersions::H1,
        }
    }
}

impl ConnectionAttemptHttpVersions {
    /// [`HttpVersion::H2`] and [`HttpVersion::H1`] into [`ConnectionAttemptHttpVersions::H2OrH1`].
    fn from_http_versions(
        http_versions: &HashSet<HttpVersion>,
    ) -> HashSet<ConnectionAttemptHttpVersions> {
        let mut combinations = HashSet::new();
        if http_versions.contains(&HttpVersion::H3) {
            combinations.insert(ConnectionAttemptHttpVersions::H3);
        }
        if http_versions.contains(&HttpVersion::H2) && http_versions.contains(&HttpVersion::H1) {
            combinations.insert(ConnectionAttemptHttpVersions::H2OrH1);
        } else if http_versions.contains(&HttpVersion::H2) {
            combinations.insert(ConnectionAttemptHttpVersions::H2);
        } else if http_versions.contains(&HttpVersion::H1) {
            combinations.insert(ConnectionAttemptHttpVersions::H1);
        }
        combinations
    }
}

#[derive(Debug, Clone, PartialEq)]
struct DnsQuery {
    id: Id,
    target_name: TargetName,
    record_type: DnsRecordType,
    state: DnsQueryState,
}

#[derive(Debug, Clone, PartialEq)]
enum DnsQueryState {
    InProgress,
    Completed {
        completed: Instant,
        response: DnsResult,
    },
}

impl DnsQuery {
    fn response(&self) -> Option<&DnsResult> {
        match &self.state {
            DnsQueryState::InProgress => None,
            DnsQueryState::Completed { response, .. } => Some(response),
        }
    }

    fn is_completed(&self) -> bool {
        matches!(self.state, DnsQueryState::Completed { .. })
    }
}

/// Configuration for supported HTTP versions.
#[derive(Debug, Clone, PartialEq)]
pub struct HttpVersions {
    /// Whether HTTP/1.1 is enabled.
    pub h1: bool,
    /// Whether HTTP/2 is enabled.
    pub h2: bool,
    /// Whether HTTP/3 is enabled.
    pub h3: bool,
}

impl HttpVersions {
    /// Remove the [`HttpVersion`]s disabled by this configuration from `versions`.
    fn filter_disabled(&self, versions: &mut HashSet<HttpVersion>) {
        if !self.h3 {
            versions.remove(&HttpVersion::H3);
        }
        if !self.h2 {
            versions.remove(&HttpVersion::H2);
        }
        if !self.h1 {
            versions.remove(&HttpVersion::H1);
        }
    }
}

impl Default for HttpVersions {
    fn default() -> Self {
        // Enable all by default.
        Self {
            h1: true,
            h2: true,
            h3: true,
        }
    }
}

/// IP connectivity and preference mode.
#[derive(Debug, Clone, PartialEq)]
pub enum IpPreference {
    /// Dual-stack available, prefer IPv6 over IPv4.
    DualStackPreferV6,
    /// Dual-stack available, prefer IPv4 over IPv6.
    DualStackPreferV4,
    /// IPv6-only network.
    Ipv6Only,
    /// IPv4-only network.
    Ipv4Only,
}

impl IpPreference {
    fn address_record_types(&self) -> impl Iterator<Item = DnsRecordType> {
        let aaaa = matches!(
            self,
            IpPreference::DualStackPreferV6
                | IpPreference::DualStackPreferV4
                | IpPreference::Ipv6Only
        )
        .then_some(DnsRecordType::Aaaa);
        let a = matches!(
            self,
            IpPreference::DualStackPreferV6
                | IpPreference::DualStackPreferV4
                | IpPreference::Ipv4Only
        )
        .then_some(DnsRecordType::A);
        aaaa.into_iter().chain(a)
    }
}

/// Alternative service information from previous connections.
///
/// See [RFC 7838](https://datatracker.ietf.org/doc/html/rfc7838).
#[derive(Debug, Clone)]
pub struct AltSvc {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub http_version: HttpVersion,
}

// TODO: Should we make HappyEyeballs proxy aware? E.g. should it know that the
// proxy is resolving the domain? Should it still trigger an HTTP RR lookup to
// see whether the remote supports HTTP/3? Should it first do MASQUE connect-udp
// and HTTP/3 and then HTTP CONNECT with HTTP/2?
//
// TODO: Should we make HappyEyeballs aware of whether this is a WebSocket
// connection? That way we could e.g. track EXTENDED CONNECT support, or
// fallback to a different connection in case WebSocket doesn't work? Likely for
// v2 of the project.
//
// TODO: Should we make HappyEyeballs aware of whether this is a WebTransport
// connection? That way we could e.g. track EXTENDED CONNECT support, or
// fallback to a different connection in case WebTransport doesn't work? Likely
// for v2 of the project.
//
/// Network configuration for Happy Eyeballs behavior
#[derive(Debug, Clone)]
pub struct NetworkConfig {
    /// Supported HTTP versions
    pub http_versions: HttpVersions,
    /// IP connectivity and preference
    pub ip: IpPreference,
    /// Alternative services from previous connections
    pub alt_svc: Vec<AltSvc>,
    /// The time to wait after receiving the first DNS response before moving on
    /// to the connection phase, giving the remaining queries a chance to arrive.
    ///
    /// Defaults to [`RESOLUTION_DELAY`] (50 ms) per
    /// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>.
    pub resolution_delay: Duration,
    /// The time to wait between successive connection attempts.
    ///
    /// Defaults to [`CONNECTION_ATTEMPT_DELAY`] (250 ms) per
    /// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-9>.
    pub connection_attempt_delay: Duration,
    /// Multiplier applied to [`connection_attempt_delay`](Self::connection_attempt_delay)
    /// as concurrent connection attempts pile up, growing the delay
    /// exponentially.
    ///
    /// The delay before starting another attempt while `n` attempts are already
    /// in progress is `connection_attempt_delay * multiplier^(n - 1)`. With a
    /// base delay of 250 ms and a multiplier of `2`, racing attempts are
    /// scheduled at `t=0`, `t=250`, `t=750`, `t=1750`, ... (intervals of 250,
    /// 500, 1000 ms). This lets callers lower the base delay below the
    /// RFC-recommended 250 ms while still backing off between attempts.
    ///
    /// Only in-progress attempts count, so attempts triggered by a previous
    /// attempt failing do not grow the delay.
    ///
    /// Defaults to [`CONNECTION_ATTEMPT_DELAY_MULTIPLIER`] (`1`), which keeps the
    /// delay constant per the RFC.
    pub connection_attempt_delay_multiplier: NonZeroU32,
    /// Whether Encrypted Client Hello (ECH) is enabled.
    ///
    /// When `false`, ECH configs from HTTPS records are ignored: endpoints
    /// always get `ech_config: None` and the ECH-based filtering (skip
    /// non-ECH ServiceInfos, skip origin fallback) does not apply.
    ///
    /// Defaults to `true`.
    pub ech: bool,
    /// Whether to wait for an answer for the preferred address family before
    /// moving on to the connection phase.
    ///
    /// Per the spec, moving on without waiting out the resolution delay
    /// requires a positive or negative answer for the preferred address family
    /// (e.g. AAAA when IPv6 is preferred). When that answer is slow to arrive,
    /// a client that already has the non-preferred family (e.g. A) still waits
    /// out the [`resolution_delay`](Self::resolution_delay).
    ///
    /// When `false`, that requirement is dropped: once positive address answers
    /// have been received and the SVCB/HTTPS query has completed (whether with a
    /// positive or a negative response), the state machine moves on without
    /// waiting for the preferred address family answer (and thus without the
    /// resolution delay when the non-preferred family arrives first). The delay
    /// still applies while the SVCB/HTTPS query is outstanding.
    ///
    /// Defaults to `true`, matching
    /// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>.
    pub wait_for_preferred_address: bool,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        NetworkConfig {
            http_versions: HttpVersions::default(),
            ip: IpPreference::DualStackPreferV6,
            alt_svc: Vec::new(),
            resolution_delay: RESOLUTION_DELAY,
            connection_attempt_delay: CONNECTION_ATTEMPT_DELAY,
            connection_attempt_delay_multiplier: CONNECTION_ATTEMPT_DELAY_MULTIPLIER,
            ech: true,
            wait_for_preferred_address: true,
        }
    }
}

impl NetworkConfig {
    fn prefer_v6(&self) -> bool {
        match self.ip {
            IpPreference::DualStackPreferV6 | IpPreference::Ipv6Only => true,
            IpPreference::DualStackPreferV4 | IpPreference::Ipv4Only => false,
        }
    }

    fn preferred_dns_record_type(&self) -> DnsRecordType {
        match self.ip {
            IpPreference::DualStackPreferV6 | IpPreference::Ipv6Only => DnsRecordType::Aaaa,
            IpPreference::DualStackPreferV4 | IpPreference::Ipv4Only => DnsRecordType::A,
        }
    }

    fn is_http_version_disabled(&self, http_version: HttpVersion) -> bool {
        match http_version {
            HttpVersion::H3 => !self.http_versions.h3,
            HttpVersion::H2 => !self.http_versions.h2,
            HttpVersion::H1 => !self.http_versions.h1,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionState {
    InProgress,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone)]
pub struct ConnectionAttempt {
    pub id: Id,
    pub endpoint: Endpoint,
    pub started: Instant,
    pub state: ConnectionState,
    /// Whether this attempt was initiated by an ECH retry_config.
    /// Per RFC 9849 Section 6.1.6, a second EchRetry on such an attempt
    /// must be treated as a failure.
    pub is_ech_retry: bool,
}

impl ConnectionAttempt {
    fn within_delay(&self, now: Instant, connection_attempt_delay: Duration) -> bool {
        now.duration_since(self.started) < connection_attempt_delay
    }
}

/// All information (IP, HTTP version, ...) needed to attempt a connection to a specific endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoint {
    pub address: SocketAddr,
    pub http_version: ConnectionAttemptHttpVersions,
    pub ech_config: Option<EchConfig>,
}

/// Interleave a group's endpoints across protocol variants and address
/// families so the diversity of options is tried early, instead of draining
/// every attempt of one variant before moving on to the next.
///
/// Endpoints are grouped by `(protocol variant, address family)` and dealt one
/// from each group per round, groups ordered by protocol preference and then
/// preferred family. For three IPv6 and one IPv4 address that each offer HTTP/3
/// and HTTP/2 that yields:
///
/// 1. v6a / H3 (most preferred)
/// 2. v4 / H3 (next address family)
/// 3. v6a / H2OrH1 (next protocol)
/// 4. v4 / H2OrH1
/// 5. v6b / H3 (second round)
/// 6. v6b / H2OrH1
/// 7. v6c / H3
/// 8. v6c / H2OrH1
///
/// so IPv4 (the other family) and HTTP/2 (the other protocol) are both reached
/// within the first few attempts, rather than after every IPv6 HTTP/3 attempt.
///
/// All endpoints belong to the same group (same application protocols and
/// security properties, same service priority). The round-robin honors the
/// draft's two interleavings.
///
/// Address families, per Section 5.3:
///
/// > Whichever address family is first in the list should be followed by an
/// > endpoint of the other address family.
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-03.html#section-5.3>
///
/// Protocol variants, per Section 5.1.1, since the HTTP version (HTTP/3 over
/// QUIC vs. HTTP/2 over TCP) is non-critical here:
///
/// > Clients SHOULD avoid grouping and sorting separately in cases where their
/// > use of an application protocol or feature is non-critical.
///
/// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-03.html#section-5.1.1>
fn interleave_endpoints(endpoints: Vec<Endpoint>, prefer_v6: bool) -> Vec<Endpoint> {
    let total = endpoints.len();

    // Where an address family sits relative to the preference; `Preferred` sorts
    // before `Other`, which orders the preferred family first.
    #[derive(PartialEq, Eq, PartialOrd, Ord)]
    enum FamilyPreference {
        Preferred,
        Other,
    }

    // Group endpoints into a queue per (protocol, address family), keeping DNS
    // order. The `BTreeMap` orders the queues most preferred first: by protocol
    // (the enum is ordered `H3 < H2OrH1 < H2 < H1`), then by family preference.
    let mut groups: BTreeMap<
        (ConnectionAttemptHttpVersions, FamilyPreference),
        VecDeque<Endpoint>,
    > = BTreeMap::new();
    for endpoint in endpoints {
        let family = if endpoint.address.is_ipv6() == prefer_v6 {
            FamilyPreference::Preferred
        } else {
            FamilyPreference::Other
        };
        groups
            .entry((endpoint.http_version, family))
            .or_default()
            .push_back(endpoint);
    }

    // Deal the front of every queue, round after round, dropping queues as they
    // empty, until none are left.
    let mut ordered = Vec::with_capacity(total);
    while !groups.is_empty() {
        for queue in groups.values_mut() {
            if let Some(endpoint) = queue.pop_front() {
                ordered.push(endpoint);
            }
        }
        groups.retain(|_, queue| !queue.is_empty());
    }
    ordered
}

#[derive(Debug, Clone)]
enum Host {
    Ip(IpAddr),
    Domain(String),
}

impl From<UrlHost> for Host {
    fn from(host: UrlHost) -> Self {
        match host {
            UrlHost::Ipv4(v4) => Host::Ip(IpAddr::V4(v4)),
            UrlHost::Ipv6(v6) => Host::Ip(IpAddr::V6(v6)),
            UrlHost::Domain(d) => Host::Domain(d),
        }
    }
}

impl std::fmt::Display for Host {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Host::Ip(ip) => write!(f, "{ip}"),
            Host::Domain(d) => write!(f, "{d}"),
        }
    }
}

/// Happy Eyeballs v3 state machine
pub struct HappyEyeballs {
    id_generator: IdGenerator,
    dns_queries: Vec<DnsQuery>,
    connection_attempts: Vec<ConnectionAttempt>,
    /// ECH retries received over the lifetime of this state machine.
    /// Each entry is `(previous_attempt_id, new_ech_config)`.
    ech_retries: Vec<(Id, EchConfig)>,
    /// Network configuration
    network_config: NetworkConfig,
    host: Host,
    port: u16,
}

#[derive(Error, Debug)]
#[error(transparent)]
pub struct ConstructorError {
    inner: ConstructorErrorInner,
}

impl From<ConstructorErrorInner> for ConstructorError {
    fn from(inner: ConstructorErrorInner) -> Self {
        Self { inner }
    }
}

#[derive(Error, Debug)]
enum ConstructorErrorInner {
    #[error("invalid host: {0}")]
    InvalidHost(#[from] url::ParseError),
}

impl std::fmt::Debug for HappyEyeballs {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut ds = f.debug_struct("HappyEyeballs");

        // Always include target and network configuration.
        ds.field("target", &self.host);
        ds.field("port", &self.port);
        ds.field("network_config", &self.network_config);

        // Only include vectors when non-empty to reduce noise.
        if !self.dns_queries.is_empty() {
            ds.field("dns_queries", &self.dns_queries);
        }
        if !self.connection_attempts.is_empty() {
            ds.field("connection_attempts", &self.connection_attempts);
        }
        if !self.ech_retries.is_empty() {
            ds.field("ech_retries", &self.ech_retries);
        }

        ds.finish()
    }
}

impl HappyEyeballs {
    /// Create a new Happy Eyeballs state machine with default network config
    pub fn new(host: &str, port: u16) -> Result<Self, ConstructorError> {
        Self::new_with_network_config(host, port, NetworkConfig::default())
    }

    /// Create a new Happy Eyeballs state machine with custom network configuration
    pub fn new_with_network_config(
        host: &str,
        port: u16,
        network_config: NetworkConfig,
    ) -> Result<Self, ConstructorError> {
        // Prefer URL-style host parsing (domains and bracketed IPv6).
        // If that fails, accept raw IP literals (IPv4/IPv6) without brackets.
        let host = match UrlHost::parse(host) {
            Ok(h) => Host::from(h),
            Err(e) => match host.parse::<IpAddr>() {
                Ok(ip) => Host::Ip(ip),
                Err(_) => return Err(ConstructorErrorInner::InvalidHost(e).into()),
            },
        };
        let s = Self {
            id_generator: IdGenerator::new(),
            network_config,
            dns_queries: Vec::new(),
            connection_attempts: Vec::new(),
            ech_retries: Vec::new(),
            host,
            port,
        };
        trace!("new_with_network_config: {:?}", s);
        Ok(s)
    }

    /// Process an input event
    ///
    /// Updates internal state based on the input.
    ///
    /// After calling this, call [`HappyEyeballs::process_output`] to get any pending outputs.
    pub fn process_input(&mut self, input: Input, now: Instant) {
        trace!("target={} input={:?}", self.host, input);

        match input {
            Input::DnsResult { id, result } => {
                self.on_dns_response(id, result, now);
            }
            Input::ConnectionResult { id, result } => {
                self.on_connection_result(id, result);
            }
        }
    }

    // TODO: Does this ever return None given the timeouts?
    /// Generate output based on current state
    ///
    /// Call this to advance the state machine and get any pending outputs.
    ///
    /// The caller must call [`HappyEyeballs::process_output`] repeatedly
    /// until it returns [`None`] or [`Output::Timer`].
    #[must_use]
    pub fn process_output(&mut self, now: Instant) -> Option<Output> {
        let output = self.process_output_inner(now);
        trace!("target={} process_output: {:?}", self.host, output);
        output
    }

    fn process_output_inner(&mut self, now: Instant) -> Option<Output> {
        // Check if we have any successful connection that requires canceling other attempts.
        if let Some(o) = self.cancel_remaining_attempts() {
            return Some(o);
        }

        // Attempt connections.
        if let Some(o) = self.connection_attempt(now) {
            return Some(o);
        }

        // Send DNS queries.
        if let Some(o) = self.send_dns_request() {
            return Some(o);
        }

        if let Some(o) = self.send_dns_request_for_target_name() {
            return Some(o);
        }

        if let Some(o) = self.delay(now) {
            return Some(o);
        }

        if let Some(reason) = self.failed() {
            return Some(Output::Failed(reason));
        }

        // TODO: Instead of returning None, how about happy-eyeballs also owns
        // the dns and connection attempt timeout, thus returning either that
        // timeout, or Output::Failed here.
        None
    }

    /// The delay to wait before starting the next connection attempt, growing
    /// exponentially with the number of attempts currently in progress per the
    /// configured [`connection_attempt_delay_multiplier`](NetworkConfig::connection_attempt_delay_multiplier).
    ///
    /// Only in-progress (racing) attempts count: an attempt that has already
    /// failed does not inflate the delay, so a sequence of attempts each
    /// triggered by the previous one failing keeps the base delay.
    fn connection_attempt_delay(&self) -> Duration {
        let base = self.network_config.connection_attempt_delay;
        let in_progress = self
            .connection_attempts
            .iter()
            .filter(|a| a.state == ConnectionState::InProgress)
            .count();
        let exponent = u32::try_from(in_progress)
            .unwrap_or(u32::MAX)
            .saturating_sub(1);
        let factor = self
            .network_config
            .connection_attempt_delay_multiplier
            .get()
            .checked_pow(exponent)
            .unwrap_or(u32::MAX);
        base.checked_mul(factor).unwrap_or(Duration::MAX)
    }

    fn delay(&self, now: Instant) -> Option<Output> {
        // If we have a successful connection, no connection attempt delay
        // needed.
        if self.has_successful_connection() {
            return None;
        }

        let connection_attempt_delay = self.connection_attempt_delay();
        if let Some(remaining) = self
            .connection_attempts
            .iter()
            .filter(|a| a.state == ConnectionState::InProgress)
            .map(|a| &a.started)
            .max()
            .and_then(|started| {
                let elapsed = now.duration_since(*started);
                if elapsed < connection_attempt_delay {
                    Some(connection_attempt_delay - elapsed)
                } else {
                    None
                }
            })
        {
            return Some(Output::Timer {
                duration: remaining,
            });
        }

        // If we have no in-progress DNS queries, no resolution delay needed.
        if !self.dns_queries.iter().any(|q| !q.is_completed()) {
            return None;
        }

        self.dns_queries
            .iter()
            // TODO: Currently considers all queries. Should we only consider A and AAAA?
            .filter_map(|q| match &q.state {
                DnsQueryState::Completed { completed, .. } => Some(completed),
                _ => None,
            })
            .min()
            .and_then(|completed| {
                let elapsed = now.duration_since(*completed);
                if elapsed < self.network_config.resolution_delay {
                    Some(self.network_config.resolution_delay - elapsed)
                } else {
                    None
                }
            })
            .map(|duration| Output::Timer { duration })
    }

    fn send_dns_request(&mut self) -> Option<Output> {
        let target_name: TargetName = match &self.host {
            Host::Ip(_) => {
                // No DNS queries needed for IP hosts.
                return None;
            }
            Host::Domain(domain) => domain.as_str(),
        }
        .into();

        let record_types = std::iter::once(DnsRecordType::Https)
            .chain(self.network_config.ip.address_record_types());
        for record_type in record_types {
            if !self
                .dns_queries
                .iter()
                .any(|q| q.record_type == record_type)
            {
                let id = self.id_generator.next_id();
                self.dns_queries.push(DnsQuery {
                    id,
                    target_name: target_name.clone(),
                    record_type,
                    state: DnsQueryState::InProgress,
                });
                return Some(Output::SendDnsQuery {
                    id,
                    hostname: target_name,
                    record_type,
                });
            }
        }

        None
    }

    // TODO: Limit number of target names.
    /// > Note that clients are still required to issue A and AAAA queries
    /// > for those TargetNames if they haven't yet received those records.
    ///
    /// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2.1>
    fn send_dns_request_for_target_name(&mut self) -> Option<Output> {
        let any_ech = self.any_ech();

        let target_names = self
            .completed_service_infos()
            // When any ServiceInfo has ECH, skip resolving targets without ECH.
            .filter(move |i| !any_ech || i.ech_config.is_some())
            .map(|i| &i.target_name);

        // Next AAAA or A query, respecting single-stack preferences.
        let (target_name, record_type) = target_names
            .flat_map(|tn| {
                self.network_config
                    .ip
                    .address_record_types()
                    .map(move |rt| (tn, rt))
            })
            .find(|(tn, rt)| {
                !self
                    .dns_queries
                    .iter()
                    .any(|q| q.target_name == **tn && q.record_type == *rt)
            })?;

        let target_name = target_name.clone();
        let id = self.id_generator.next_id();
        self.dns_queries.push(DnsQuery {
            id,
            target_name: target_name.clone(),
            record_type,
            state: DnsQueryState::InProgress,
        });
        Some(Output::SendDnsQuery {
            id,
            hostname: target_name,
            record_type,
        })
    }

    fn on_dns_response(&mut self, id: Id, response: DnsResult, now: Instant) {
        let Some(query) = self.dns_queries.iter_mut().find(|q| q.id == id) else {
            debug_assert!(false, "got {response:?} for unknown id {id:?}");
            return;
        };

        if query.is_completed() {
            debug_assert!(false, "got {response:?} for already completed {query:?}");
            return;
        }

        query.state = DnsQueryState::Completed {
            completed: now,
            response,
        };
    }

    fn on_connection_result(&mut self, id: Id, result: ConnectionResult) {
        let Some(attempt) = self.connection_attempts.iter_mut().find(|a| a.id == id) else {
            debug_assert!(false, "got connection result for unknown id {id:?}");
            return;
        };

        match attempt.state {
            ConnectionState::InProgress => {}
            ConnectionState::Cancelled => {
                log::debug!("ignoring connection result for cancelled attempt {id:?}: {result:?}");
                return;
            }
            ConnectionState::Succeeded | ConnectionState::Failed => {
                debug_assert!(
                    false,
                    "got connection result but attempt is in unexpected state: {attempt:?}"
                );
                return;
            }
        }

        match result {
            ConnectionResult::Success => {
                attempt.state = ConnectionState::Succeeded;
                // Cancellations will be issued by cancel_remaining_attempts()
            }
            ConnectionResult::Failure(_error) => {
                attempt.state = ConnectionState::Failed;
                // The state machine will naturally attempt the next connection
                // when process() is called again with None input
            }
            ConnectionResult::EchRetry(ech_config) => {
                attempt.state = ConnectionState::Failed;

                if !self.network_config.ech {
                    debug_assert!(false, "got EchRetry on attempt {id:?} but ECH is disabled");
                    return;
                }

                if attempt.endpoint.ech_config.is_none() {
                    debug_assert!(false, "got EchRetry on attempt {id:?} but ECH was not sent");
                    return;
                }

                // > Clients SHOULD NOT accept "retry_config" in response
                // > to a connection initiated in response to a
                // > "retry_config".
                //
                // https://datatracker.ietf.org/doc/html/rfc9849#section-6.1.6
                if attempt.is_ech_retry {
                    log::debug!("ignoring EchRetry on attempt {id:?} that is itself an ECH retry");
                    return;
                }

                self.ech_retries.push((id, ech_config));
            }
        }
    }

    /// If a connection has succeeded, cancel all remaining in-progress attempts.
    fn cancel_remaining_attempts(&mut self) -> Option<Output> {
        // Check if we have a successful connection
        if !self.has_successful_connection() {
            return None;
        }

        // Find the first in-progress attempt to cancel
        if let Some(attempt) = self
            .connection_attempts
            .iter_mut()
            .find(|a| a.state == ConnectionState::InProgress)
        {
            let id = attempt.id;
            attempt.state = ConnectionState::Cancelled;
            return Some(Output::CancelConnection { id });
        }

        // All connections have been canceled, return Succeeded
        Some(Output::Succeeded)
    }

    /// > The client moves onto sorting addresses and establishing connections
    /// > once one of the following condition sets is met:
    /// >
    /// > Either:
    /// >  
    /// > - Some positive (non-empty) address answers have been received AND
    /// > - A postive (non-empty) or negative (empty) answer has been received for the preferred address family that was queried AND
    /// > - SVCB/HTTPS service information has been received (or has received a negative response)
    /// >
    /// > Or:
    /// > - Some positive (non-empty) address answers have been received AND
    /// > - A resolution time delay has passed after which other answers have not been received
    ///
    /// <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>
    fn connection_attempt(&mut self, now: Instant) -> Option<Output> {
        // ECH retries are emitted immediately, bypassing move-on and delay checks.
        if let Some(o) = self.ech_retry_attempt(now) {
            return Some(o);
        }

        let mut move_on = false;
        move_on |= self.move_on_without_timeout();
        move_on |= self.move_on_with_timeout(now);
        move_on |= matches!(self.host, Host::Ip(_));
        if !move_on {
            return None;
        }

        let connection_attempt_delay = self.connection_attempt_delay();
        if self
            .connection_attempts
            .iter()
            .filter(|a| a.state == ConnectionState::InProgress)
            .any(|a| a.within_delay(now, connection_attempt_delay))
        {
            return None;
        }
        let endpoint = self.endpoints_to_attempt().into_iter().find(|endpoint| {
            !self
                .connection_attempts
                .iter()
                .any(|attempt| attempt.endpoint == *endpoint)
        })?;
        let id = self.id_generator.next_id();

        self.connection_attempts.push(ConnectionAttempt {
            id,
            endpoint: endpoint.clone(),
            started: now,
            state: ConnectionState::InProgress,
            is_ech_retry: false,
        });

        Some(Output::AttemptConnection {
            id,
            endpoint,
            is_ech_retry: false,
        })
    }

    /// Emit a connection attempt for a pending ECH retry, if any.
    fn ech_retry_attempt(&mut self, now: Instant) -> Option<Output> {
        let endpoint = self.ech_retries.iter().find_map(|(prev_id, ech_config)| {
            let prev = self.connection_attempts.iter().find(|a| a.id == *prev_id)?;
            let endpoint = Endpoint {
                ech_config: Some(ech_config.clone()),
                ..prev.endpoint.clone()
            };
            let already_attempted = self
                .connection_attempts
                .iter()
                .any(|a| a.endpoint == endpoint);
            (!already_attempted).then_some(endpoint)
        })?;

        let id = self.id_generator.next_id();
        self.connection_attempts.push(ConnectionAttempt {
            id,
            endpoint: endpoint.clone(),
            started: now,
            state: ConnectionState::InProgress,
            is_ech_retry: true,
        });

        Some(Output::AttemptConnection {
            id,
            endpoint,
            is_ech_retry: true,
        })
    }

    fn endpoints_to_attempt(&self) -> Vec<Endpoint> {
        match &self.host {
            Host::Ip(ip) => self.endpoints_to_attempt_ip(*ip),
            Host::Domain(domain) => self.endpoints_to_attempt_domain(domain),
        }
    }

    fn endpoints_to_attempt_ip(&self, ip: IpAddr) -> Vec<Endpoint> {
        let endpoints = self
            .origin_version_port_pairs()
            .into_iter()
            .map(|(http_version, port)| Endpoint {
                address: SocketAddr::new(ip, port),
                http_version,
                ech_config: None,
            })
            .collect();
        interleave_endpoints(endpoints, self.network_config.prefer_v6())
    }

    fn endpoints_to_attempt_domain(&self, origin_domain: &str) -> Vec<Endpoint> {
        let any_ech = self.any_ech();
        let prefer_v6 = self.network_config.prefer_v6();

        // Collect all ServiceInfos sorted by priority.
        let mut service_infos: Vec<&ServiceInfo> = self
            .completed_service_infos()
            // When at least one ServiceInfo has ECH config, skip those without it
            // and skip the origin fallback.
            .filter(|i| !any_ech || i.ech_config.is_some())
            .collect();
        service_infos.sort_by_key(|i| i.priority);

        // build a sorted endpoints per ServiceInfo.
        let mut endpoints: Vec<Endpoint> = Vec::new();
        for info in &service_infos {
            let ipv4_addrs: Option<&[Ipv4Addr]> =
                self.dns_queries.iter().find_map(|q| match &q.state {
                    DnsQueryState::Completed {
                        response: DnsResult::A(result),
                        ..
                    } if q.target_name == info.target_name => {
                        Some(result.as_deref().unwrap_or_default())
                    }
                    _ => None,
                });
            let ipv6_addrs: Option<&[Ipv6Addr]> =
                self.dns_queries.iter().find_map(|q| match &q.state {
                    DnsQueryState::Completed {
                        response: DnsResult::Aaaa(result),
                        ..
                    } if q.target_name == info.target_name => {
                        Some(result.as_deref().unwrap_or_default())
                    }
                    _ => None,
                });
            let bucket = info.flatten_into_endpoints(
                self.port,
                ipv4_addrs,
                ipv6_addrs,
                &self.network_config.http_versions,
                self.network_config.ech,
            );
            endpoints.extend(interleave_endpoints(bucket, prefer_v6));
        }

        // Alt-svc and fallback endpoints use the origin domain without ECH.
        // Only include them when ECH is not required. They form a single group
        // so that their protocol variants (e.g. an alt-svc HTTP/3 and the
        // default HTTP/2) and address families are interleaved together.
        if !any_ech {
            let mut fallback: Vec<Endpoint> = Vec::new();
            for (http_version, port) in self.origin_version_port_pairs() {
                let http_versions = HashSet::from([http_version]);
                fallback.extend(
                    self.dns_queries
                        .iter()
                        .filter_map(|q| match &q.state {
                            DnsQueryState::Completed {
                                response: r @ (DnsResult::Aaaa(_) | DnsResult::A(_)),
                                ..
                            } if q.target_name.as_str() == origin_domain => Some(r),
                            _ => None,
                        })
                        .flat_map(|r| r.flatten_into_endpoints(port, &http_versions)),
                );
            }
            endpoints.extend(interleave_endpoints(fallback, prefer_v6));
        }

        endpoints
    }

    fn has_successful_connection(&self) -> bool {
        self.connection_attempts
            .iter()
            .any(|a| a.state == ConnectionState::Succeeded)
    }

    fn failed(&self) -> Option<FailureReason> {
        if self.has_successful_connection()
            || self.dns_queries.iter().any(|q| !q.is_completed())
            || self
                .connection_attempts
                .iter()
                .any(|a| a.state == ConnectionState::InProgress)
        {
            return None;
        }

        Some(
            if self
                .connection_attempts
                .iter()
                .any(|a| a.state == ConnectionState::Failed)
            {
                FailureReason::Connection
            } else {
                FailureReason::DnsResolution
            },
        )
    }

    /// ServiceInfos from all completed HTTPS responses.
    fn completed_service_infos(&self) -> impl Iterator<Item = &ServiceInfo> {
        self.dns_queries
            .iter()
            .filter_map(|q| match &q.state {
                DnsQueryState::Completed {
                    response: DnsResult::Https(Ok(infos)),
                    ..
                } => Some(infos.as_slice()),
                _ => None,
            })
            .flatten()
    }

    fn any_ech(&self) -> bool {
        if !self.network_config.ech {
            return false;
        }
        self.completed_service_infos()
            .any(|i| i.ech_config.is_some())
    }

    /// HTTP versions when the host is an IP address (no DNS involved).
    ///
    /// Default H2/H1, filtered by network config.
    fn ip_host_http_versions(&self) -> HashSet<ConnectionAttemptHttpVersions> {
        let mut http_versions = HashSet::from([HttpVersion::H2, HttpVersion::H1]);
        self.network_config
            .http_versions
            .filter_disabled(&mut http_versions);
        ConnectionAttemptHttpVersions::from_http_versions(&http_versions)
    }

    /// HTTP versions for the origin fallback bucket.
    ///
    /// Default H2/H1, filtered by network config.
    /// HTTPS-record ALPNs are excluded: those apply only to the HTTPS bucket.
    fn fallback_http_versions(&self) -> HashSet<ConnectionAttemptHttpVersions> {
        self.ip_host_http_versions()
    }

    /// (http_version, port) pairs for origin endpoints (alt-svc and defaults).
    ///
    /// Combines:
    /// 1. Alt-svc entries (custom port or origin port)
    /// 2. Default HTTP versions (H2/H1) at the origin port
    fn origin_version_port_pairs(&self) -> Vec<(ConnectionAttemptHttpVersions, u16)> {
        let mut pairs = Vec::new();

        for alt_svc in &self.network_config.alt_svc {
            debug_assert!(
                alt_svc.host.is_none(),
                "alt-svc with custom host not yet supported"
            );
            if self
                .network_config
                .is_http_version_disabled(alt_svc.http_version)
            {
                continue;
            }
            let port = alt_svc.port.unwrap_or(self.port);
            pairs.push((alt_svc.http_version.into(), port));
        }

        for http_version in self.fallback_http_versions() {
            pairs.push((http_version, self.port));
        }

        pairs
    }

    /// Whether to move on to the connection attempt phase based on the received
    /// DNS responses, not based on a timeout.
    fn move_on_without_timeout(&self) -> bool {
        let hostname = match &self.host {
            Host::Domain(d) => d.as_str(),
            Host::Ip(_) => {
                return false;
            }
        };

        // > Some positive (non-empty) address answers have been received AND
        //
        // <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>
        if !self.dns_queries.iter().any(|q| match &q.state {
            DnsQueryState::Completed { response, .. } => response.has_addrs(),
            DnsQueryState::InProgress => false,
        }) {
            return false;
        }

        // > A postive (non-empty) or negative (empty) answer has been received
        // > for the preferred address family that was queried AND
        //
        // <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>
        //
        // Skipped when `wait_for_preferred_address` is disabled, letting the
        // state machine move on with the non-preferred family rather than
        // waiting out the resolution delay for the preferred one.
        if self.network_config.wait_for_preferred_address
            && !self
                .dns_queries
                .iter()
                .filter(|q| q.is_completed())
                .any(|q| q.record_type == self.network_config.preferred_dns_record_type())
        {
            return false;
        }

        // > SVCB/HTTPS service information has been received (or has received a negative response)
        //
        // <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>
        if !self
            .dns_queries
            .iter()
            .filter(|q| q.target_name.as_str() == hostname)
            .filter(|q| q.is_completed())
            .any(|q| q.record_type == DnsRecordType::Https)
        {
            return false;
        }

        true
    }

    /// Whether to move on to the connection attempt phase based on a timeout.
    fn move_on_with_timeout(&self, now: Instant) -> bool {
        // > Or:
        // >
        // > - Some positive (non-empty) address answers have been received AND
        // > - A resolution time delay has passed after which other answers have not been received
        //
        // <https://www.ietf.org/archive/id/draft-ietf-happy-happyeyeballs-v3-02.html#section-4.2>

        if !self
            .dns_queries
            .iter()
            .filter_map(|q| q.response())
            .any(|r| r.has_addrs())
        {
            return false;
        }

        self.dns_queries
            .iter()
            .filter_map(|q| match &q.state {
                DnsQueryState::InProgress => None,
                DnsQueryState::Completed { completed, .. } => Some(completed),
            })
            .any(|completed| now.duration_since(*completed) >= self.network_config.resolution_delay)
    }
}

#[cfg(test)]
mod tests {
    use std::net::{Ipv4Addr, Ipv6Addr};

    use super::*;

    #[test]
    fn dns_result_has_addrs() {
        for result in [
            DnsResult::Aaaa(Ok(vec![])),
            DnsResult::Aaaa(Err(())),
            DnsResult::A(Ok(vec![])),
            DnsResult::A(Err(())),
            DnsResult::Https(Err(())),
            DnsResult::Https(Ok(vec![])),
        ] {
            assert!(!result.has_addrs());
        }
        assert!(DnsResult::Aaaa(Ok(vec![Ipv6Addr::LOCALHOST])).has_addrs());
        assert!(DnsResult::A(Ok(vec![Ipv4Addr::LOCALHOST])).has_addrs());
    }

    #[test]
    fn host_display() {
        let v4 = Ipv4Addr::LOCALHOST;
        assert_eq!(Host::Ip(v4.into()).to_string(), v4.to_string());
        let v6 = Ipv6Addr::LOCALHOST;
        assert_eq!(Host::Ip(v6.into()).to_string(), v6.to_string());
        let domain = "example.com";
        assert_eq!(Host::Domain(domain.into()).to_string(), domain);
    }
}
