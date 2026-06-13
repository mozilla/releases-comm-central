/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::cmp::max;
use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::fmt;
use std::mem::size_of;

use base64::Engine;
use clubcard::{
    ApproximateSizeOf, AsQuery, Clubcard, ClubcardIndex, ClubcardIndexEntry, Equation, Membership,
    Queryable,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::codec::{encode_len, read_len, Codec};
use crate::W;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct IssuerSpkiHash(pub [u8; 32]);

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct LogId(pub [u8; 32]);

// opaque LogId[32]: a fixed-width 32-byte SHA-256 digest, no length prefix.
impl Codec for LogId {
    fn encode(&self, buf: &mut Vec<u8>) {
        buf.extend_from_slice(&self.0);
    }

    fn read(buf: &[u8]) -> Result<(Self, &[u8]), ClubcardError> {
        match buf.split_first_chunk() {
            Some((bytes, rest)) => Ok((LogId(*bytes), rest)),
            None => Err(ClubcardError::Deserialize),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialOrd, PartialEq, Serialize)]
pub struct Timestamp(pub u64);

impl Timestamp {
    pub const MIN: Timestamp = Timestamp(0);
    pub const MAX: Timestamp = Timestamp(u64::MAX);
}

// uint64 Timestamp, big-endian (see the u64 Codec impl).
impl Codec for Timestamp {
    fn encode(&self, buf: &mut Vec<u8>) {
        self.0.encode(buf);
    }

    fn read(buf: &[u8]) -> Result<(Self, &[u8]), ClubcardError> {
        u64::read(buf).map(|(val, rest)| (Timestamp(val), rest))
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct TimestampInterval {
    pub low: Timestamp,
    pub high: Timestamp,
}

// struct {
//     Timestamp low;
//     Timestamp high;
// } TimestampInterval;
impl Codec for TimestampInterval {
    fn encode(&self, buf: &mut Vec<u8>) {
        self.low.encode(buf);
        self.high.encode(buf);
    }

    fn read(buf: &[u8]) -> Result<(Self, &[u8]), ClubcardError> {
        let (low, buf) = Timestamp::read(buf)?;
        let (high, buf) = Timestamp::read(buf)?;
        Ok((TimestampInterval { low, high }, buf))
    }
}

#[derive(Serialize, Deserialize)]
pub struct CRLiteCoverage(pub(crate) HashMap<LogId, TimestampInterval>);

impl CRLiteCoverage {
    pub fn iter(&self) -> impl Iterator<Item = (&LogId, &TimestampInterval)> {
        self.0.iter()
    }
}

// struct {
//     LogId             log_id;
//     TimestampInterval interval;
// } Coverage;
//
// Coverage coverage<count>;   // uint16 count, then `count` entries
impl Codec for CRLiteCoverage {
    fn encode(&self, buf: &mut Vec<u8>) {
        encode_len::<2>(self.0.len(), buf);
        for (log_id, interval) in &self.0 {
            log_id.encode(buf);
            interval.encode(buf);
        }
    }

    fn read(buf: &[u8]) -> Result<(Self, &[u8]), ClubcardError> {
        let (count, mut buf) = read_len::<2>(buf)?;

        let mut map = HashMap::with_capacity(count);
        for _ in 0..count {
            let (log_id, rest) = LogId::read(buf)?;
            let (interval, rest) = TimestampInterval::read(rest)?;
            map.insert(log_id, interval);
            buf = rest;
        }

        Ok((Self(map), buf))
    }
}

// struct {
//     opaque             block_id[32];
//     ClubcardIndexEntry entry;
// } IndexEntry;
//
// IndexEntry index<count>;   // uint32 count, then `count` entries
impl Codec for ClubcardIndex {
    fn encode(&self, buf: &mut Vec<u8>) {
        encode_len::<4>(self.len(), buf);
        for (block_id, entry) in self {
            buf.extend_from_slice(block_id);
            entry.encode(buf);
        }
    }

    fn read(buf: &[u8]) -> Result<(Self, &[u8]), ClubcardError> {
        let (count, mut buf) = read_len::<4>(buf)?;
        let mut index = BTreeMap::new();
        for _ in 0..count {
            let Some((block_id, rest)) = buf.split_first_chunk::<32>() else {
                return Err(ClubcardError::Deserialize);
            };

            let (entry, rest) = ClubcardIndexEntry::read(rest)?;
            index.insert(block_id.to_vec(), entry);
            buf = rest;
        }

        Ok((index, buf))
    }
}

#[derive(Debug)]
pub struct CRLiteKey<'a> {
    pub(crate) issuer: &'a IssuerSpkiHash,
    pub(crate) serial: &'a [u8],
    pub(crate) issuer_serial_hash: [u8; 32],
}

impl<'a> CRLiteKey<'a> {
    pub fn new(issuer: &'a IssuerSpkiHash, serial: &'a [u8]) -> CRLiteKey<'a> {
        let mut hasher = Sha256::new();
        hasher.update(issuer.0);
        hasher.update(serial);

        let mut issuer_serial_hash = [0u8; 32];
        hasher.finalize_into((&mut issuer_serial_hash).into());
        CRLiteKey {
            issuer,
            serial,
            issuer_serial_hash,
        }
    }
}

#[derive(Clone, Debug)]
pub struct CRLiteQuery<'a> {
    pub(crate) key: &'a CRLiteKey<'a>,
    pub(crate) log_timestamp: Option<(LogId, Timestamp)>,
}

impl<'a> CRLiteQuery<'a> {
    pub fn new(
        key: &'a CRLiteKey<'a>,
        log_timestamp: Option<(LogId, Timestamp)>,
    ) -> CRLiteQuery<'a> {
        CRLiteQuery { key, log_timestamp }
    }
}

impl AsQuery<W> for CRLiteQuery<'_> {
    fn block(&self) -> &[u8] {
        &self.key.issuer.0
    }

    fn as_query(&self, m: usize) -> Equation<W> {
        let mut a = [0u64; 4];
        for (i, x) in self
            .key
            .issuer_serial_hash
            .chunks_exact(8) // TODO: use array_chunks::<8>() when stable
            .map(|x| TryInto::<[u8; 8]>::try_into(x).unwrap())
            .map(u64::from_le_bytes)
            .enumerate()
        {
            a[i] = x;
        }
        a[0] |= 1;
        let s = (a[3] % (max(1, m) as u64)) as usize;
        Equation::homogeneous(s, a)
    }

    fn discriminant(&self) -> &[u8] {
        self.key.serial
    }
}

impl Queryable<W> for CRLiteQuery<'_> {
    type UniverseMetadata = CRLiteCoverage;

    // The set of CRLiteKeys is partitioned by issuer, and each
    // CRLiteKey knows its issuer. So there's no need for additional
    // partition metadata.
    type PartitionMetadata = ();

    fn in_universe(&self, universe: &Self::UniverseMetadata) -> bool {
        let Some((log_id, timestamp)) = self.log_timestamp else {
            return false;
        };
        if let Some(interval) = universe.0.get(&log_id) {
            if interval.low <= timestamp && timestamp <= interval.high {
                return true;
            }
        }
        false
    }
}

#[derive(Debug)]
pub enum ClubcardError {
    Serialize,
    Deserialize,
    UnsupportedVersion,
}

impl fmt::Display for ClubcardError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Serialize => write!(f, "failed to serialize clubcard"),
            Self::Deserialize => write!(f, "failed to deserialize clubcard"),
            Self::UnsupportedVersion => write!(f, "unsupported clubcard version"),
        }
    }
}

impl Error for ClubcardError {}

#[derive(Debug, PartialEq, Eq)]
pub enum CRLiteStatus {
    Good,
    NotCovered,
    NotEnrolled,
    Revoked,
}

impl From<Membership> for CRLiteStatus {
    fn from(membership: Membership) -> CRLiteStatus {
        match membership {
            Membership::Nonmember => CRLiteStatus::Good,
            Membership::NotInUniverse => CRLiteStatus::NotCovered,
            Membership::NoData => CRLiteStatus::NotEnrolled,
            Membership::Member => CRLiteStatus::Revoked,
        }
    }
}

pub struct CRLiteClubcard(Clubcard<W, CRLiteCoverage, ()>);

impl From<Clubcard<W, CRLiteCoverage, ()>> for CRLiteClubcard {
    fn from(inner: Clubcard<W, CRLiteCoverage, ()>) -> CRLiteClubcard {
        CRLiteClubcard(inner)
    }
}

impl AsRef<Clubcard<W, CRLiteCoverage, ()>> for CRLiteClubcard {
    fn as_ref(&self) -> &Clubcard<W, CRLiteCoverage, ()> {
        &self.0
    }
}

impl std::fmt::Display for CRLiteClubcard {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        writeln!(f, "{}", self.0)?;
        writeln!(f, "{:=^80}", " Coverage ")?;
        writeln!(
            f,
            "{: ^46}  {: >16}{: >16}",
            "CT Log ID", "Min Time", "Max Time"
        )?;
        writeln!(f, "{:-<80}", "")?;
        let mut coverage_data = self
            .universe()
            .0
            .iter()
            .map(|(log_id, interval)| {
                (
                    base64::prelude::BASE64_STANDARD.encode(log_id.0),
                    interval.low,
                    interval.high,
                )
            })
            .collect::<Vec<_>>();
        coverage_data.sort_by_key(|x| u64::MAX - x.2 .0);
        for (log_id, low, high) in coverage_data {
            writeln!(f, "{: >46},{: >16},{: >16}", log_id, low.0, high.0)?;
        }
        writeln!(f)?;
        writeln!(f, "{:=^80}", " Index ")?;
        writeln!(
            f,
            "{: ^46}{: >10}{: >10}{: >14}",
            "Issuer ID", "Exceptions", "Rank", "Bits"
        )?;
        writeln!(f, "{:-<80}", "")?;
        let mut index_data = self
            .0
            .index()
            .iter()
            .map(|(block, entry)| {
                let filter_size =
                    entry.approx_filter_m * entry.approx_filter_rank + entry.exact_filter_m;
                (
                    base64::prelude::BASE64_URL_SAFE.encode(block),
                    entry.approx_filter_rank,
                    entry.exceptions.len(),
                    filter_size,
                )
            })
            .collect::<Vec<(String, usize, usize, usize)>>();
        index_data.sort_by_key(|x| usize::MAX - x.3);

        for (issuer, rank, exceptions, filter_size) in &index_data {
            writeln!(
                f,
                "{: >46},{: >9},{: >9},{: >13}",
                issuer, exceptions, rank, filter_size
            )?;
        }
        Ok(())
    }
}

impl CRLiteClubcard {
    /// Serialize this clubcard.
    pub fn to_bytes(&self, encoding: Encoding) -> Result<Vec<u8>, ClubcardError> {
        let mut out = Vec::with_capacity(2 + self.0.approximate_size_of());
        encoding.encode(&mut out);

        match encoding {
            #[cfg(feature = "bincode")]
            Encoding::V3 => {
                bincode::serialize_into(&mut out, &self.0).map_err(|_| ClubcardError::Serialize)?
            }
            Encoding::V4 => self.0.encode(&mut out),
        }

        Ok(out)
    }

    /// Deserialize a clubcard.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, ClubcardError> {
        match Encoding::read(bytes)? {
            #[cfg(feature = "bincode")]
            (Encoding::V3, rest) => match bincode::deserialize(rest) {
                Ok(clubcard) => Ok(Self(clubcard)),
                Err(_) => Err(ClubcardError::Deserialize),
            },
            (Encoding::V4, rest) => {
                let (clubcard, rest) = Clubcard::read(rest)?;
                if !rest.is_empty() {
                    return Err(ClubcardError::Deserialize);
                }
                Ok(Self(clubcard))
            }
        }
    }

    pub fn universe(&self) -> &CRLiteCoverage {
        self.0.universe()
    }

    pub fn index(&self) -> &ClubcardIndex {
        self.0.index()
    }

    pub fn contains<'a>(
        &self,
        key: &CRLiteKey<'a>,
        timestamps: impl Iterator<Item = (LogId, Timestamp)>,
    ) -> CRLiteStatus {
        for (log_id, timestamp) in timestamps {
            let crlite_query = CRLiteQuery::new(key, Some((log_id, timestamp)));
            let status = self.0.contains(&crlite_query).into();
            if status == CRLiteStatus::NotCovered {
                continue;
            }
            return status;
        }
        CRLiteStatus::NotCovered
    }
}

impl ApproximateSizeOf for CRLiteCoverage {
    fn approximate_size_of(&self) -> usize {
        size_of::<HashMap<LogId, TimestampInterval>>()
            + self.0.len() * (size_of::<LogId>() + size_of::<TimestampInterval>())
    }
}

impl ApproximateSizeOf for CRLiteClubcard {
    fn approximate_size_of(&self) -> usize {
        self.0.approximate_size_of()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u16)]
pub enum Encoding {
    // Cascade-based CRLite filters use version numbers 0x0000, 0x0001, and 0x0002.
    #[cfg(feature = "bincode")]
    V3 = 3,
    V4 = 4,
}

impl Codec for Encoding {
    fn encode(&self, buf: &mut Vec<u8>) {
        buf.extend((*self as u16).to_le_bytes());
    }

    fn read(buf: &[u8]) -> Result<(Self, &[u8]), ClubcardError> {
        let Some((value, rest)) = buf.split_first_chunk::<2>() else {
            return Err(ClubcardError::Deserialize);
        };

        match u16::from_le_bytes(*value) {
            #[cfg(feature = "bincode")]
            3 => Ok((Encoding::V3, rest)),
            4 => Ok((Encoding::V4, rest)),
            _ => Err(ClubcardError::UnsupportedVersion),
        }
    }
}
