use std::{
    future::Future,
    pin::{pin, Pin},
    task::{Context, Poll},
};

use futures::io::AsyncRead;

use crate::{Error, Res};

/// A reader for a network-byte-order integer of predetermined size.
#[pin_project::pin_project]
pub struct ReadUint<S, const N: usize> {
    ///  The source of data.
    src: S,
    /// A buffer that holds the bytes that have been read so far.
    v: [u8; 8],
    /// A counter of the number of bytes that are already in place.
    /// This starts out at `8-N`.
    read: usize,
}

impl<S, const N: usize> ReadUint<S, N> {
    pub fn stream(self) -> S {
        self.src
    }
}

impl<S: AsyncRead + Unpin, const N: usize> Future for ReadUint<S, N> {
    type Output = Res<u64>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.project();
        match pin!(this.src).poll_read(cx, &mut this.v[*this.read..]) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Ok(count)) => {
                if count == 0 {
                    return Poll::Ready(Err(Error::Truncated));
                }
                *this.read += count;
                if *this.read == 8 {
                    Poll::Ready(Ok(u64::from_be_bytes(*this.v)))
                } else {
                    Poll::Pending
                }
            }
            Poll::Ready(Err(e)) => Poll::Ready(Err(Error::from(e))),
        }
    }
}

#[cfg(test)]
fn read_uint<S, const N: usize>(src: S) -> ReadUint<S, N> {
    ReadUint {
        src,
        v: [0; 8],
        read: 8 - N,
    }
}

/// A reader for a [QUIC variable-length integer](https://datatracker.ietf.org/doc/html/rfc9000#section-16).
#[pin_project::pin_project(project = ReadVarintProj)]
pub enum ReadVarint<S> {
    // Invariant: this Option always contains Some.
    First(Option<S>),
    Extra1(#[pin] ReadUint<S, 8>),
    Extra3(#[pin] ReadUint<S, 8>),
    Extra7(#[pin] ReadUint<S, 8>),
}

impl<S> ReadVarint<S> {
    pub fn stream(self) -> S {
        match self {
            Self::Extra1(s) | Self::Extra3(s) | Self::Extra7(s) => s.stream(),
            Self::First(mut s) => s.take().unwrap(),
        }
    }
}

impl<S: AsyncRead + Unpin> Future for ReadVarint<S> {
    type Output = Res<Option<u64>>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.as_mut();
        if let Self::First(ref mut src) = this.get_mut() {
            let mut buf = [0; 1];
            let src_ref = src.as_mut().unwrap();
            if let Poll::Ready(res) = pin!(src_ref).poll_read(cx, &mut buf[..]) {
                match res {
                    Ok(0) => return Poll::Ready(Ok(None)),
                    Ok(_) => (),
                    Err(e) => return Poll::Ready(Err(Error::from(e))),
                }

                let b1 = buf[0];
                let mut v = [0; 8];
                let next = match b1 >> 6 {
                    0 => return Poll::Ready(Ok(Some(u64::from(b1)))),
                    1 => {
                        let src = src.take().unwrap();
                        v[6] = b1 & 0x3f;
                        Self::Extra1(ReadUint { src, v, read: 7 })
                    }
                    2 => {
                        let src = src.take().unwrap();
                        v[4] = b1 & 0x3f;
                        Self::Extra3(ReadUint { src, v, read: 5 })
                    }
                    3 => {
                        let src = src.take().unwrap();
                        v[0] = b1 & 0x3f;
                        Self::Extra7(ReadUint { src, v, read: 1 })
                    }
                    _ => unreachable!(),
                };

                self.set(next);
            }
        }
        let extra = match self.project() {
            ReadVarintProj::Extra1(s) | ReadVarintProj::Extra3(s) | ReadVarintProj::Extra7(s) => {
                s.poll(cx)
            }
            ReadVarintProj::First(_) => return Poll::Pending,
        };
        if let Poll::Ready(v) = extra {
            Poll::Ready(v.map(Some))
        } else {
            Poll::Pending
        }
    }
}

/// Read a [QUIC variable-length integer](https://datatracker.ietf.org/doc/html/rfc9000#section-16).
pub fn read_varint<S>(src: S) -> ReadVarint<S> {
    ReadVarint::First(Some(src))
}

#[cfg(test)]
mod test {
    use sync_async::SyncResolve;

    use crate::{
        err::Error,
        rw::{write_uint as sync_write_uint, write_varint as sync_write_varint},
        stream::int::{read_uint, read_varint},
    };

    const VARINTS: &[u64] = &[
        0,
        1,
        63,
        64,
        (1 << 14) - 1,
        1 << 14,
        (1 << 30) - 1,
        1 << 30,
        (1 << 62) - 1,
    ];

    #[test]
    fn read_uint_values() {
        macro_rules! validate_uint_range {
            (@ $n:expr) => {
                let m = u64::MAX >> (64 - 8 * $n);
                for v in [0, 1, m] {
                    println!("{n} byte encoding of 0x{v:x}", n = $n);
                    let mut buf = Vec::with_capacity($n);
                    sync_write_uint::<$n>(v, &mut buf).unwrap();
                    let mut buf_ref = &buf[..];
                    let mut fut = read_uint::<_, $n>(&mut buf_ref);
                    assert_eq!(v, fut.sync_resolve().unwrap());
                    let s = fut.stream();
                    assert!(s.is_empty());
                }
            };
            ($($n:expr),+ $(,)?) => {
                $(
                    validate_uint_range!(@ $n);
                )+
            }
        }
        validate_uint_range!(1, 2, 3, 4, 5, 6, 7, 8);
    }

    #[test]
    fn read_uint_truncated() {
        macro_rules! validate_uint_truncated {
            (@ $n:expr) => {
                let m = u64::MAX >> (64 - 8 * $n);
                for v in [0, 1, m] {
                    println!("{n} byte encoding of 0x{v:x}", n = $n);
                    let mut buf = Vec::with_capacity($n);
                    sync_write_uint::<$n>(v, &mut buf).unwrap();
                    for i in 1..buf.len() {
                        let err = read_uint::<_, $n>(&mut &buf[..i]).sync_resolve().unwrap_err();
                        assert!(matches!(err, Error::Truncated));
                    }
                }
            };
            ($($n:expr),+ $(,)?) => {
                $(
                    validate_uint_truncated!(@ $n);
                )+
            }
        }
        validate_uint_truncated!(1, 2, 3, 4, 5, 6, 7, 8);
    }

    #[test]
    fn read_varint_values() {
        for &v in VARINTS {
            let mut buf = Vec::new();
            sync_write_varint(v, &mut buf).unwrap();
            let mut buf_ref = &buf[..];
            let mut fut = read_varint(&mut buf_ref);
            assert_eq!(Some(v), fut.sync_resolve().unwrap());
            let s = fut.stream();
            assert!(s.is_empty());
        }
    }

    #[test]
    fn read_varint_none() {
        assert!(read_varint(&mut &[][..]).sync_resolve().unwrap().is_none());
    }

    #[test]
    fn read_varint_truncated() {
        for &v in VARINTS {
            let mut buf = Vec::new();
            sync_write_varint(v, &mut buf).unwrap();
            for i in 1..buf.len() {
                let err = {
                    let mut buf: &[u8] = &buf[..i];
                    read_varint(&mut buf).sync_resolve()
                }
                .unwrap_err();
                assert!(matches!(err, Error::Truncated));
            }
        }
    }

    #[test]
    fn read_varint_extra() {
        const EXTRA: &[u8] = &[161, 2, 49];
        for &v in VARINTS {
            let mut buf = Vec::new();
            sync_write_varint(v, &mut buf).unwrap();
            buf.extend_from_slice(EXTRA);
            let mut buf_ref = &buf[..];
            let mut fut = read_varint(&mut buf_ref);
            assert_eq!(Some(v), fut.sync_resolve().unwrap());
            let s = fut.stream();
            assert_eq!(&s[..], EXTRA);
        }
    }
}
