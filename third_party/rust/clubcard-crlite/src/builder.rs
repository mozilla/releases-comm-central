/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::query::{
    CRLiteCoverage, CRLiteKey, CRLiteQuery, IssuerSpkiHash, LogId, Timestamp, TimestampInterval,
};
use clubcard::{AsQuery, Equation, Filterable};
use serde::Deserialize;
use std::collections::HashMap;

use base64::Engine;
use std::io::Read;

impl CRLiteCoverage {
    // The ct-logs.json file tells us which CT logs the ct-fetch process
    // monitored. For each log, it lists
    //   (1) the contiguous range of indices of Merkle tree leaves that
    //       ct-fetch downloaded,
    //   (2) the earliest and latest timestamps on those Merkle tree
    //       leaves, and
    //   (3) the maximum merge delay (MMD).
    //
    // Intuitively, "coverage" should reflect the [MinEntry, MaxEntry] range.
    // However, certificates only include timestamps, not indices, and
    // timestamps do not increase monotonically with leaf index.
    //
    // The timestamp in an embedded SCT is a promise from a log that it will
    // assign an index in the next MMD window. So if
    //   timestamp(Cert A) + MMD <= timestamp(Cert B)
    // then
    //   index(Cert A) < index(Cert B).
    //
    // It follows that a certificate has an index in [MinEntry, MaxEntry] if
    //   MinTimestamp + MMD <= timestamp(certificate) <= MaxTimestamp - MMD
    //
    // In the event that MinEntry = 0, we can refine this to
    //   0 <= timestamp(certificate) <= MaxTimestamp - MMD
    //
    pub fn from_mozilla_ct_logs_json<T>(reader: T) -> Self
    where
        T: Read,
    {
        #[allow(non_snake_case)]
        #[derive(Deserialize)]
        struct MozillaCtLogsJson {
            LogID: String,
            MaxTimestamp: u64,
            MinTimestamp: u64,
            MMD: u64,
            MinEntry: u64,
        }

        let mut coverage = HashMap::new();
        let json_entries: Vec<MozillaCtLogsJson> = match serde_json::from_reader(reader) {
            Ok(json_entries) => json_entries,
            _ => return CRLiteCoverage(Default::default()),
        };
        for entry in json_entries {
            let mut log_id = [0u8; 32];
            match base64::prelude::BASE64_STANDARD.decode(&entry.LogID) {
                Ok(bytes) if bytes.len() == 32 => log_id.copy_from_slice(&bytes),
                _ => continue,
            };
            // The MMD is in seconds but timestamps are in milliseconds
            let Some(entry_mmd_ms) = entry.MMD.checked_mul(1000) else {
                continue;
            };
            let low = Timestamp(if entry.MinEntry == 0 {
                entry.MinTimestamp
            } else {
                entry.MinTimestamp + entry_mmd_ms
            });
            let high = Timestamp(entry.MaxTimestamp.saturating_sub(entry_mmd_ms));
            if low < high {
                coverage.insert(LogId(log_id), TimestampInterval { low, high });
            }
        }
        CRLiteCoverage(coverage)
    }
}

pub struct CRLiteBuilderItem {
    /// issuer spki hash
    issuer: IssuerSpkiHash,
    /// serial number. TODO: smallvec?
    serial: Vec<u8>,
    /// revocation status
    revoked: bool,
}

impl CRLiteBuilderItem {
    pub fn revoked(issuer: IssuerSpkiHash, serial: Vec<u8>) -> Self {
        Self {
            issuer,
            serial,
            revoked: true,
        }
    }

    pub fn not_revoked(issuer: IssuerSpkiHash, serial: Vec<u8>) -> Self {
        Self {
            issuer,
            serial,
            revoked: false,
        }
    }
}

impl AsQuery<4> for CRLiteBuilderItem {
    fn as_query(&self, m: usize) -> Equation<4> {
        let crlite_key = CRLiteKey::new(&self.issuer, &self.serial);
        let crlite_query = CRLiteQuery::new(&crlite_key, None);
        crlite_query.as_query(m)
    }

    fn block(&self) -> &[u8] {
        &self.issuer.0
    }

    fn discriminant(&self) -> &[u8] {
        &self.serial
    }
}

impl Filterable<4> for CRLiteBuilderItem {
    fn included(&self) -> bool {
        self.revoked
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use clubcard::builder::*;
    use clubcard::Clubcard;
    use clubcard::Membership;

    use crate::builder::*;
    use crate::codec::Codec;
    use crate::query::Encoding;
    use crate::CRLiteClubcard;

    #[test]
    fn test_crlite_clubcard() {
        let (subset_sizes, universe_size, clubcard) = build_clubcard();
        let sum_subset_sizes: usize = subset_sizes.iter().sum();
        let sum_universe_sizes: usize = subset_sizes.len() * universe_size;
        let min_size = (sum_subset_sizes as f64)
            * ((sum_universe_sizes as f64) / (sum_subset_sizes as f64)).log2()
            + 1.44 * ((sum_subset_sizes) as f64);
        println!("Size lower bound {}", min_size);
        println!("Checking construction");
        println!(
            "\texpecting {} included, {} excluded",
            sum_subset_sizes,
            subset_sizes.len() * universe_size - sum_subset_sizes
        );

        let mut included = 0;
        let mut excluded = 0;
        for i in 0..subset_sizes.len() {
            let issuer = IssuerSpkiHash([i as u8; 32]);
            for j in 0..universe_size {
                let serial = j.to_le_bytes();
                let key = CRLiteKey::new(&issuer, &serial);
                if clubcard.unchecked_contains(&CRLiteQuery::new(&key, None)) {
                    included += 1;
                } else {
                    excluded += 1;
                }
            }
        }
        println!("\tfound {} included, {} excluded", included, excluded);
        assert!(sum_subset_sizes == included);
        assert!(sum_universe_sizes - sum_subset_sizes == excluded);

        // Test that querying a serial from a never-before-seen issuer results in a non-member return.
        let issuer = IssuerSpkiHash([subset_sizes.len() as u8; 32]);
        let serial = 0usize.to_le_bytes();
        let key = CRLiteKey::new(&issuer, &serial);
        assert!(!clubcard.unchecked_contains(&CRLiteQuery::new(&key, None)));

        assert!(!subset_sizes.is_empty() && subset_sizes[0] > 0 && subset_sizes[0] < universe_size);
        let issuer = IssuerSpkiHash([0u8; 32]);
        let revoked_serial = 0usize.to_le_bytes();
        let nonrevoked_serial = (universe_size - 1).to_le_bytes();

        // Test that calling contains() without a timestamp results in a NotInUniverse return
        let revoked_serial_key = CRLiteKey::new(&issuer, &revoked_serial);
        let query = CRLiteQuery::new(&revoked_serial_key, None);
        assert!(matches!(
            clubcard.contains(&query),
            Membership::NotInUniverse
        ));

        // Test that calling contains() with a timestamp in a covered interval results in a
        // Member return.
        let log_id = LogId([0u8; 32]);
        let timestamp = Timestamp(100);
        let query = CRLiteQuery::new(&revoked_serial_key, Some((log_id, timestamp)));
        assert!(matches!(clubcard.contains(&query), Membership::Member));

        // Test that calling contains() without a timestamp in a covered interval results in a
        // Member return.
        let nonrevoked_serial_key = CRLiteKey::new(&issuer, &nonrevoked_serial);
        let query = CRLiteQuery::new(&nonrevoked_serial_key, Some((log_id, timestamp)));
        assert!(matches!(clubcard.contains(&query), Membership::Nonmember));

        // Test that calling contains() without a timestamp in a covered interval results in a
        // Member return.
        let log_id = LogId([1u8; 32]);
        let query = CRLiteQuery::new(&revoked_serial_key, Some((log_id, timestamp)));
        assert!(matches!(
            clubcard.contains(&query),
            Membership::NotInUniverse
        ));
    }

    #[test]
    fn test_serialization_roundtrip() {
        let (subset_sizes, universe_size, clubcard) = build_clubcard();

        let crlite = CRLiteClubcard::from(clubcard);
        for encoding in [Encoding::V3, Encoding::V4] {
            let bytes = crlite.to_bytes(encoding).unwrap();

            // Version prefix is LE u16 0x0004
            assert_eq!(Encoding::read(&bytes).unwrap().0, encoding);

            let restored = CRLiteClubcard::from_bytes(&bytes).unwrap();

            // Verify query results match on all items
            for i in 0..subset_sizes.len() {
                let issuer = IssuerSpkiHash([i as u8; 32]);
                for j in 0..universe_size {
                    let serial = j.to_le_bytes();
                    let key = CRLiteKey::new(&issuer, &serial);
                    let query = CRLiteQuery::new(&key, None);
                    assert_eq!(
                        crlite.as_ref().unchecked_contains(&query),
                        restored.as_ref().unchecked_contains(&query),
                    );
                }
            }
        }
    }

    fn build_clubcard() -> ([usize; 5], usize, Clubcard<4, CRLiteCoverage, ()>) {
        let subset_sizes = [1 << 17, 1 << 16, 1 << 15, 1 << 14, 1 << 13];
        let universe_size = 1 << 18;

        let mut clubcard_builder = ClubcardBuilder::new();
        let mut approx_builders = vec![];
        for (i, n) in subset_sizes.iter().enumerate() {
            let mut r = clubcard_builder.new_approx_builder(&[i as u8; 32]);
            for j in 0usize..*n {
                r.insert(CRLiteBuilderItem::revoked(
                    IssuerSpkiHash([i as u8; 32]),
                    j.to_le_bytes().to_vec(),
                ));
            }
            r.set_universe_size(universe_size);
            approx_builders.push(r)
        }

        let approx_ribbons = approx_builders
            .drain(..)
            .map(ApproximateRibbon::from)
            .collect();

        println!("Approx ribbons:");
        for r in &approx_ribbons {
            println!("\t{}", r);
        }

        clubcard_builder.collect_approx_ribbons(approx_ribbons);

        let mut exact_builders = vec![];
        for (i, n) in subset_sizes.iter().enumerate() {
            let mut r = clubcard_builder.new_exact_builder(&[i as u8; 32]);
            for j in 0usize..universe_size {
                r.insert(if j < *n {
                    CRLiteBuilderItem::revoked(
                        IssuerSpkiHash([i as u8; 32]),
                        j.to_le_bytes().to_vec(),
                    )
                } else {
                    CRLiteBuilderItem::not_revoked(
                        IssuerSpkiHash([i as u8; 32]),
                        j.to_le_bytes().to_vec(),
                    )
                });
            }
            exact_builders.push(r)
        }

        let exact_ribbons = exact_builders.drain(..).map(ExactRibbon::from).collect();

        println!("Exact ribbons:");
        for r in &exact_ribbons {
            println!("\t{}", r);
        }

        clubcard_builder.collect_exact_ribbons(exact_ribbons);

        let mut log_coverage = HashMap::new();
        log_coverage.insert(
            LogId([0u8; 32]),
            TimestampInterval {
                low: Timestamp(0),
                high: Timestamp(u64::MAX),
            },
        );

        let clubcard = clubcard_builder.build::<CRLiteQuery>(CRLiteCoverage(log_coverage), ());
        println!("{}", clubcard);
        (subset_sizes, universe_size, clubcard)
    }
}
