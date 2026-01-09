use std::{
    future::Future,
    mem,
    pin::{pin, Pin},
    task::{Context, Poll},
};

use futures::{io::AsyncRead, FutureExt};

use super::int::{read_varint, ReadVarint};
use crate::{Error, Res};

/// A reader for a varint-length-prefixed buffer.
#[pin_project::pin_project(project = ReadVecProj)]
#[allow(clippy::module_name_repetitions)]
pub enum ReadVec<S> {
    // Invariant: This Option is always Some.
    ReadLen {
        src: Option<ReadVarint<S>>,
        cap: u64,
    },
    ReadBody {
        src: S,
        buf: Vec<u8>,
        remaining: usize,
    },
}

impl<S> ReadVec<S> {
    /// # Panics
    /// If `limit` is more than `usize::MAX` or
    /// if this is called after the length is read.
    pub fn limit(&mut self, limit: u64) {
        usize::try_from(limit).expect("cannot set a limit larger than usize::MAX");
        if let Self::ReadLen { ref mut cap, .. } = self {
            *cap = limit;
        } else {
            panic!("cannot set a limit once the size has been read");
        }
    }

    pub fn stream(self) -> S {
        match self {
            Self::ReadLen { mut src, .. } => src.take().unwrap().stream(),
            Self::ReadBody { src, .. } => src,
        }
    }
}

impl<S: AsyncRead + Unpin> Future for ReadVec<S> {
    type Output = Res<Option<Vec<u8>>>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = self.as_mut();
        if let Self::ReadLen { src, cap } = this.get_mut() {
            match src.as_mut().unwrap().poll_unpin(cx) {
                Poll::Ready(Ok(None)) => return Poll::Ready(Ok(None)),
                Poll::Ready(Ok(Some(0))) => return Poll::Ready(Ok(Some(Vec::new()))),
                Poll::Ready(Ok(Some(sz))) => {
                    if sz > *cap {
                        return Poll::Ready(Err(Error::LimitExceeded));
                    }
                    // `cap` cannot exceed min(usize::MAX, u64::MAX).
                    let sz = usize::try_from(sz).unwrap();
                    let body = Self::ReadBody {
                        src: src.take().unwrap().stream(),
                        buf: vec![0; sz],
                        remaining: sz,
                    };
                    self.set(body);
                }
                Poll::Ready(Err(e)) => return Poll::Ready(Err(e)),
                Poll::Pending => return Poll::Pending,
            }
        }

        let ReadVecProj::ReadBody {
            src,
            buf,
            remaining,
        } = self.project()
        else {
            return Poll::Pending;
        };

        let offset = buf.len() - *remaining;
        match pin!(src).poll_read(cx, &mut buf[offset..]) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Err(e)) => Poll::Ready(Err(Error::from(e))),
            Poll::Ready(Ok(0)) => Poll::Ready(Err(Error::Truncated)),
            Poll::Ready(Ok(c)) => {
                *remaining -= c;
                if *remaining > 0 {
                    Poll::Pending
                } else {
                    Poll::Ready(Ok(Some(mem::take(buf))))
                }
            }
        }
    }
}

#[allow(clippy::module_name_repetitions)]
pub fn read_vec<S>(src: S) -> ReadVec<S> {
    ReadVec::ReadLen {
        src: Some(read_varint(src)),
        cap: u64::try_from(usize::MAX).unwrap_or(u64::MAX),
    }
}

#[cfg(test)]
mod test {

    use std::{
        cmp,
        fmt::Debug,
        io::Result,
        pin::Pin,
        task::{Context, Poll},
    };

    use futures::AsyncRead;
    use sync_async::SyncResolve;

    use crate::{rw::write_varint as sync_write_varint, stream::vec::read_vec, Error};

    const FILL_VALUE: u8 = 90;

    fn fill<T>(len: T) -> Vec<u8>
    where
        u64: TryFrom<T>,
        <u64 as TryFrom<T>>::Error: Debug,
        usize: TryFrom<T>,
        <usize as TryFrom<T>>::Error: Debug,
        T: Debug + Copy,
    {
        let mut buf = Vec::new();
        sync_write_varint(u64::try_from(len).unwrap(), &mut buf).unwrap();
        buf.resize(buf.len() + usize::try_from(len).unwrap(), FILL_VALUE);
        buf
    }

    #[test]
    fn read_vecs() {
        for len in [0, 1, 2, 3, 64] {
            let buf = fill(len);
            let mut buf_ref = &buf[..];
            let mut fut = read_vec(&mut buf_ref);
            if let Ok(Some(out)) = fut.sync_resolve() {
                assert_eq!(len, out.len());
                assert!(out.iter().all(|&v| v == FILL_VALUE));

                assert!(fut.stream().is_empty());
            }
        }
    }

    #[test]
    fn exceed_cap() {
        const LEN: u64 = 20;
        let buf = fill(LEN);
        let mut buf_ref = &buf[..];
        let mut fut = read_vec(&mut buf_ref);
        fut.limit(LEN - 1);
        assert!(matches!(fut.sync_resolve(), Err(Error::LimitExceeded)));
    }

    /// This class implements `AsyncRead`, but
    /// always blocks after returning a fixed value.
    #[derive(Default)]
    struct IncompleteRead<'a> {
        data: &'a [u8],
        consumed: usize,
    }

    impl<'a> IncompleteRead<'a> {
        fn new(data: &'a [u8]) -> Self {
            Self { data, consumed: 0 }
        }
    }

    impl AsyncRead for IncompleteRead<'_> {
        fn poll_read(
            mut self: Pin<&mut Self>,
            _cx: &mut Context<'_>,
            buf: &mut [u8],
        ) -> Poll<Result<usize>> {
            let remaining = &self.data[self.consumed..];
            if remaining.is_empty() {
                Poll::Pending
            } else {
                let copied = cmp::min(buf.len(), remaining.len());
                buf[..copied].copy_from_slice(&remaining[..copied]);
                self.as_mut().consumed += copied;
                Poll::Ready(std::io::Result::Ok(copied))
            }
        }
    }

    #[test]
    #[should_panic(expected = "cannot set a limit once the size has been read")]
    fn late_cap() {
        let mut buf = IncompleteRead::new(&[2, 1]);
        _ = read_vec(&mut buf).sync_resolve_with(|mut f| {
            println!("pending");
            f.as_mut().limit(100);
        });
    }

    #[test]
    #[cfg(any(target_pointer_width = "32", target_pointer_width = "16"))]
    #[should_panic(expected = "cannot set a limit larger than usize::MAX")]
    fn too_large_cap() {
        const LEN: u64 = 20;
        let buf = fill(LEN);

        let mut buf_ref = &buf[..];
        let mut fut = read_vec(&mut buf_ref);
        fut.limit(u64::try_from(usize::MAX).unwrap() + 1);
    }
}
