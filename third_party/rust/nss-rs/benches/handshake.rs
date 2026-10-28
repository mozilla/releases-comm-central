// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

//! In-memory TLS 1.3 handshake benchmarks.

#![expect(clippy::unwrap_used, reason = "This is benchmark code.")]
#![expect(
    clippy::significant_drop_tightening,
    reason = "Inherent in codspeed criterion_group! macro."
)]

use std::hint::black_box;

use criterion::{BatchSize, BenchmarkId, Criterion, criterion_group, criterion_main};
use nss_rs::{
    AuthenticationStatus, Client, Server, TLS_AES_128_GCM_SHA256, TLS_CHACHA20_POLY1305_SHA256,
    TLS_GRP_EC_SECP256R1, TLS_GRP_EC_X25519, constants::Group,
};
use test_fixture::{fixture_init, now};

type Agents = (Client, Server);

fn agents(group: Group) -> Agents {
    let mut client = Client::new("server.example", true).unwrap();
    client.set_groups(&[group]).unwrap();
    let mut server = Server::new(&["key"]).unwrap();
    server.set_groups(&[group]).unwrap();
    (client, server)
}

/// Runs a 1-RTT handshake to completion.
fn handshake((client, server): &mut Agents) {
    let now = now();
    let ch = client.handshake(now, &[]).unwrap();
    let sh = server.handshake(now, &ch).unwrap();
    client.handshake(now, &sh).unwrap();
    client.authenticated(AuthenticationStatus::Ok);
    let fin = client.handshake(now, &[]).unwrap();
    server.handshake(now, &fin).unwrap();
    assert!(client.state().is_connected() && server.state().is_connected());
}

fn handshakes(c: &mut Criterion) {
    let mut group = c.benchmark_group("handshake");
    for (name, grp) in [
        ("x25519", TLS_GRP_EC_X25519),
        ("secp256r1", TLS_GRP_EC_SECP256R1),
    ] {
        group.bench_function(BenchmarkId::new("full", name), |b| {
            b.iter(|| handshake(&mut agents(black_box(grp))));
        });
        group.bench_function(BenchmarkId::new("handshake_only", name), |b| {
            b.iter_batched_ref(|| agents(grp), handshake, BatchSize::SmallInput);
        });
    }

    group.bench_function("agent_setup", |b| {
        b.iter(|| agents(black_box(TLS_GRP_EC_X25519)));
    });

    for (name, suite) in [
        ("aes128gcm", TLS_AES_128_GCM_SHA256),
        ("chacha20poly1305", TLS_CHACHA20_POLY1305_SHA256),
    ] {
        let setup = || {
            let mut agents = agents(TLS_GRP_EC_X25519);
            agents.0.set_ciphers(&[suite]).unwrap();
            agents
        };
        group.bench_function(BenchmarkId::new("cipher_suite", name), |b| {
            b.iter_batched_ref(setup, handshake, BatchSize::SmallInput);
        });
    }
    group.finish();
}

criterion_group! {
    name = benches;
    config = { fixture_init(); Criterion::default() };
    targets = handshakes
}
criterion_main!(benches);
