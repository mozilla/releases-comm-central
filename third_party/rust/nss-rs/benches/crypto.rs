// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

//! Benchmarks for primitives the `blapi` feature does not affect.

#![expect(clippy::unwrap_used, reason = "This is benchmark code.")]
#![expect(
    clippy::significant_drop_tightening,
    reason = "Inherent in codspeed criterion_group! macro."
)]

mod common;

use std::hint::black_box;

use common::{CIPHERS, DATA, SIZES, secret};
use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use nss_rs::{
    constants::TLS_VERSION_1_3,
    ec::{EcCurve, ecdh, ecdh_keygen, sign_ecdsa, sign_eddsa, verify_ecdsa, verify_eddsa},
    hash::{HashAlgorithm, hash},
    hkdf,
    hmac::HmacAlgorithm,
};
use test_fixture::fixture_init;

fn key_schedule(c: &mut Criterion) {
    let secret = secret();
    let mut group = c.benchmark_group("key_schedule");
    for (name, cipher) in CIPHERS {
        group.bench_function(BenchmarkId::new("extract", name), |b| {
            b.iter(|| {
                hkdf::extract(TLS_VERSION_1_3, black_box(cipher), Some(&secret), &secret).unwrap()
            });
        });
        group.bench_function(BenchmarkId::new("expand_label", name), |b| {
            b.iter(|| {
                hkdf::expand_label(
                    TLS_VERSION_1_3,
                    black_box(cipher),
                    &secret,
                    &[],
                    "c hs traffic",
                )
                .unwrap()
            });
        });
    }
    group.finish();
}

fn digest(c: &mut Criterion) {
    let hmac = HmacAlgorithm::HMAC_SHA2_256;
    let hmac_key = hmac.import_key(&[0x5a; 32]).unwrap();
    let mut group = c.benchmark_group("digest");
    for size in SIZES {
        let data = vec![0x5a; size];
        for (name, alg) in [
            ("sha256", HashAlgorithm::SHA2_256),
            ("sha384", HashAlgorithm::SHA2_384),
            ("sha512", HashAlgorithm::SHA2_512),
        ] {
            group.bench_function(BenchmarkId::new(name, size), |b| {
                b.iter(|| hash(&alg, black_box(&data)).unwrap());
            });
        }
        group.bench_function(BenchmarkId::new("hmac_sha256", size), |b| {
            b.iter(|| hmac.hmac(&hmac_key, black_box(&data)).unwrap());
        });
    }
    group.finish();
}

fn ec(c: &mut Criterion) {
    let mut group = c.benchmark_group("ec");
    for (name, curve) in [
        ("x25519", EcCurve::X25519),
        ("p256", EcCurve::P256),
        ("p384", EcCurve::P384),
    ] {
        group.bench_function(BenchmarkId::new("keygen", name), |b| {
            b.iter(|| ecdh_keygen(black_box(&curve)).unwrap());
        });

        let (ours, peer) = (ecdh_keygen(&curve).unwrap(), ecdh_keygen(&curve).unwrap());
        group.bench_function(BenchmarkId::new("ecdh", name), |b| {
            b.iter(|| ecdh(&ours.private, black_box(&peer.public)).unwrap());
        });
    }

    for (name, curve, sign, verify) in [
        (
            "p256",
            EcCurve::P256,
            sign_ecdsa as fn(&_, &_) -> _,
            verify_ecdsa as fn(&_, &_, &_) -> _,
        ),
        ("ed25519", EcCurve::Ed25519, sign_eddsa, verify_eddsa),
    ] {
        let kp = ecdh_keygen(&curve).unwrap();
        let sig = sign(&kp.private, DATA).unwrap();
        group.bench_function(BenchmarkId::new("sign", name), |b| {
            b.iter(|| sign(&kp.private, black_box(DATA)).unwrap());
        });
        group.bench_function(BenchmarkId::new("verify", name), |b| {
            b.iter(|| assert!(verify(&kp.public, black_box(DATA), &sig).unwrap()));
        });
    }
    group.finish();
}

criterion_group! {
    name = benches;
    config = { fixture_init(); Criterion::default() };
    targets = key_schedule, digest, ec
}
criterion_main!(benches);
