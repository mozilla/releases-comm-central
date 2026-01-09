#![allow(dead_code)]
#![allow(clippy::incompatible_msrv)] // This module uses features from rust 1.82

use std::{
    cmp::min,
    io::{Cursor, Error as IoError, Result as IoResult},
    mem,
    pin::{pin, Pin},
    task::{Context, Poll},
};

use futures::{stream::unfold, AsyncRead, Stream, TryStreamExt};

use crate::{
    err::Res,
    stream::{int::read_varint, vec::read_vec},
    ControlData, Error, Field, FieldSection, Header, InformationalResponse, Message, Mode, COOKIE,
};
mod int;
mod vec;

trait AsyncReadControlData: Sized {
    async fn async_read<S: AsyncRead + Unpin>(request: bool, src: S) -> Res<Self>;
}

impl AsyncReadControlData for ControlData {
    async fn async_read<S: AsyncRead + Unpin>(request: bool, mut src: S) -> Res<Self> {
        let v = if request {
            let method = read_vec(&mut src).await?.ok_or(Error::Truncated)?;
            let scheme = read_vec(&mut src).await?.ok_or(Error::Truncated)?;
            let authority = read_vec(&mut src).await?.ok_or(Error::Truncated)?;
            let path = read_vec(&mut src).await?.ok_or(Error::Truncated)?;
            Self::Request {
                method,
                scheme,
                authority,
                path,
            }
        } else {
            let code = read_varint(&mut src).await?.ok_or(Error::Truncated)?;
            Self::Response(crate::StatusCode::try_from(code)?)
        };
        Ok(v)
    }
}

trait AsyncReadFieldSection: Sized {
    async fn async_read<S: AsyncRead + Unpin>(mode: Mode, src: S) -> Res<Self>;
}

impl AsyncReadFieldSection for FieldSection {
    async fn async_read<S: AsyncRead + Unpin>(mode: Mode, mut src: S) -> Res<Self> {
        let fields = if mode == Mode::KnownLength {
            // Known-length fields can just be read into a buffer.
            if let Some(buf) = read_vec(&mut src).await? {
                Self::read_bhttp_fields(false, &mut Cursor::new(&buf[..]))?
            } else {
                Vec::new()
            }
        } else {
            // The async version needs to be implemented directly.
            let mut fields: Vec<Field> = Vec::new();
            let mut cookie_index: Option<usize> = None;
            loop {
                if let Some(n) = read_vec(&mut src).await? {
                    if n.is_empty() {
                        break fields;
                    }
                    let mut v = read_vec(&mut src).await?.ok_or(Error::Truncated)?;
                    if n == COOKIE {
                        if let Some(i) = &cookie_index {
                            fields[*i].value.extend_from_slice(b"; ");
                            fields[*i].value.append(&mut v);
                            continue;
                        }
                        cookie_index = Some(fields.len());
                    }
                    fields.push(Field::new(n, v));
                } else if fields.is_empty() {
                    break fields;
                } else {
                    return Err(Error::Truncated);
                }
            }
        };
        Ok(Self(fields))
    }
}

#[derive(Default)]
enum BodyState {
    // The starting state.
    #[default]
    Init,
    // When reading the length, use this.
    ReadLength {
        buf: [u8; 8],
        read: usize,
    },
    // When reading the data, track how much is left.
    ReadData {
        remaining: usize,
    },
}

impl BodyState {
    fn read_len() -> Self {
        Self::ReadLength {
            buf: [0; 8],
            read: 0,
        }
    }
}

pub struct Body<'b, S> {
    msg: &'b mut AsyncMessage<S>,
}

impl<S> Body<'_, S> {}

impl<S: AsyncRead + Unpin> AsyncRead for Body<'_, S> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut [u8],
    ) -> Poll<IoResult<usize>> {
        self.msg.read_body(cx, buf).map_err(IoError::other)
    }
}

/// A helper function for the more complex body-reading code.
fn poll_error(e: Error) -> Poll<IoResult<usize>> {
    Poll::Ready(Err(IoError::other(e)))
}

enum AsyncMessageState {
    Init,
    // Processing Informational responses (or before that).
    Informational(bool),
    // Having obtained the control data for the header, this is it.
    Header(ControlData),
    // Processing the Body.
    Body(BodyState),
    // Processing the trailer.
    Trailer,
    // All done.
    Done,
}

pub struct AsyncMessage<S> {
    // Whether this is a request and which mode.
    mode: Option<Mode>,
    state: AsyncMessageState,
    src: S,
}

unsafe impl<S: Send> Send for AsyncMessage<S> {}

impl<S: AsyncRead + Unpin> AsyncMessage<S> {
    async fn next_info(&mut self) -> Res<Option<InformationalResponse>> {
        let request = if matches!(self.state, AsyncMessageState::Init) {
            // Read control data ...
            let t = read_varint(&mut self.src).await?.ok_or(Error::Truncated)?;
            let request = t == 0 || t == 2;
            self.mode = Some(Mode::try_from(t)?);
            self.state = AsyncMessageState::Informational(request);
            request
        } else {
            // ... or recover it.
            let AsyncMessageState::Informational(request) = self.state else {
                return Err(Error::InvalidState);
            };
            request
        };

        let control = ControlData::async_read(request, &mut self.src).await?;
        if let Some(status) = control.informational() {
            let mode = self.mode.unwrap();
            let fields = FieldSection::async_read(mode, &mut self.src).await?;
            Ok(Some(InformationalResponse::new(status, fields)))
        } else {
            self.state = AsyncMessageState::Header(control);
            Ok(None)
        }
    }

    /// Produces a stream of informational responses from a fresh message.
    /// Returns an empty stream if passed a request (or if there are no informational responses).
    /// Error values on the stream indicate failures.
    ///
    /// There is no need to call this method to read a request, though
    /// doing so is harmless.
    ///
    /// You can discard the stream that this function returns
    /// without affecting the message.  You can then either call this
    /// method again to get any additional informational responses or
    /// call `header()` to get the message header.
    pub fn informational(&mut self) -> impl Stream<Item = Res<InformationalResponse>> + '_ {
        unfold(self, |this| async move {
            this.next_info().await.transpose().map(|info| (info, this))
        })
    }

    /// This reads the header.  If you have not called `informational`
    /// and drained the resulting stream, this will do that for you.
    /// # Panics
    /// Never.
    pub async fn header(&mut self) -> Res<Header> {
        if matches!(
            self.state,
            AsyncMessageState::Init | AsyncMessageState::Informational(_)
        ) {
            // Need to scrub for errors,
            // so that this can abort properly if there is one.
            // The `try_any` usage is there to ensure that the stream is fully drained.
            _ = self.informational().try_any(|_| async { false }).await?;
        }

        if matches!(self.state, AsyncMessageState::Header(_)) {
            let mode = self.mode.unwrap();
            let hfields = FieldSection::async_read(mode, &mut self.src).await?;

            let AsyncMessageState::Header(control) = mem::replace(
                &mut self.state,
                AsyncMessageState::Body(BodyState::default()),
            ) else {
                unreachable!();
            };
            Ok(Header::from((control, hfields)))
        } else {
            Err(Error::InvalidState)
        }
    }

    fn body_state(&mut self, s: BodyState) {
        self.state = AsyncMessageState::Body(s);
    }

    fn body_done(&mut self) {
        self.state = AsyncMessageState::Trailer;
    }

    /// Read the length of a body chunk.
    /// This updates the values of `read` and `buf` to track the portion of the length
    /// that was successfully read.
    /// Returns `Some` with the error code that should be used if the reading
    /// resulted in a conclusive outcome.
    fn read_body_len(
        cx: &mut Context<'_>,
        src: &mut S,
        first: bool,
        read: &mut usize,
        buf: &mut [u8; 8],
    ) -> Option<Poll<Result<usize, IoError>>> {
        let mut src = pin!(src);
        if *read == 0 {
            let mut b = [0; 1];
            match src.as_mut().poll_read(cx, &mut b[..]) {
                Poll::Pending => return Some(Poll::Pending),
                Poll::Ready(Ok(0)) => {
                    return if first {
                        // It's OK for the first length to be absent.
                        // Just skip to the end.
                        *read = 8;
                        None
                    } else {
                        // ...it's not OK to drop length when continuing.
                        Some(poll_error(Error::Truncated))
                    };
                }
                Poll::Ready(Ok(1)) => match b[0] >> 6 {
                    0 => {
                        buf[7] = b[0] & 0x3f;
                        *read = 8;
                    }
                    1 => {
                        buf[6] = b[0] & 0x3f;
                        *read = 7;
                    }
                    2 => {
                        buf[4] = b[0] & 0x3f;
                        *read = 5;
                    }
                    3 => {
                        buf[0] = b[0] & 0x3f;
                        *read = 1;
                    }
                    _ => unreachable!(),
                },
                Poll::Ready(Ok(_)) => unreachable!(),
                Poll::Ready(Err(e)) => return Some(Poll::Ready(Err(e))),
            }
        }
        if *read < 8 {
            match src.as_mut().poll_read(cx, &mut buf[*read..]) {
                Poll::Pending => return Some(Poll::Pending),
                Poll::Ready(Ok(0)) => return Some(poll_error(Error::Truncated)),
                Poll::Ready(Ok(len)) => {
                    *read += len;
                }
                Poll::Ready(Err(e)) => return Some(Poll::Ready(Err(e))),
            }
        }
        None
    }

    fn read_body(&mut self, cx: &mut Context<'_>, buf: &mut [u8]) -> Poll<IoResult<usize>> {
        // The length that precedes the first chunk can be absent.
        // Only allow that for the first chunk (if indeterminate length).
        let first = if let AsyncMessageState::Body(BodyState::Init) = &self.state {
            self.body_state(BodyState::read_len());
            true
        } else {
            false
        };

        // Read the length.  This uses `read_body_len` to track the state of this reading.
        // This doesn't use `ReadVarint` or any convenience functions because we
        // need to track the state and we don't want the borrow checker to flip out.
        if let AsyncMessageState::Body(BodyState::ReadLength { buf, read }) = &mut self.state {
            if let Some(res) = Self::read_body_len(cx, &mut self.src, first, read, buf) {
                return res;
            }
            if *read == 8 {
                match usize::try_from(u64::from_be_bytes(*buf)) {
                    Ok(0) => {
                        self.body_done();
                        return Poll::Ready(Ok(0));
                    }
                    Ok(remaining) => {
                        self.body_state(BodyState::ReadData { remaining });
                    }
                    Err(e) => return poll_error(Error::IntRange(e)),
                }
            }
        }

        match &mut self.state {
            AsyncMessageState::Body(BodyState::ReadData { remaining }) => {
                let amount = min(*remaining, buf.len());
                let res = pin!(&mut self.src).poll_read(cx, &mut buf[..amount]);
                match res {
                    Poll::Pending => Poll::Pending,
                    Poll::Ready(Ok(0)) => poll_error(Error::Truncated),
                    Poll::Ready(Ok(len)) => {
                        *remaining -= len;
                        if *remaining == 0 {
                            let mode = self.mode.unwrap();
                            if mode == Mode::IndeterminateLength {
                                self.body_state(BodyState::read_len());
                            } else {
                                self.body_done();
                            }
                        }
                        Poll::Ready(Ok(len))
                    }
                    Poll::Ready(Err(e)) => Poll::Ready(Err(e)),
                }
            }
            AsyncMessageState::Trailer => Poll::Ready(Ok(0)),
            _ => Poll::Pending,
        }
    }

    /// Read the body.
    /// This produces an implementation of `AsyncRead` that filters out
    /// the framing from the message body.
    /// # Errors
    /// This errors when the header has not been read.
    /// Any IO errors are generated by the returned `Body` instance.
    pub fn body(&mut self) -> Res<Body<'_, S>> {
        match self.state {
            AsyncMessageState::Body(_) => Ok(Body { msg: self }),
            _ => Err(Error::InvalidState),
        }
    }

    /// Read any trailer.
    /// This might be empty.
    /// # Errors
    /// This errors when the body has not been read.
    /// # Panics
    /// Never.
    pub async fn trailer(&mut self) -> Res<FieldSection> {
        if matches!(self.state, AsyncMessageState::Trailer) {
            let trailer = FieldSection::async_read(self.mode.unwrap(), &mut self.src).await?;
            self.state = AsyncMessageState::Done;
            Ok(trailer)
        } else {
            Err(Error::InvalidState)
        }
    }
}

/// Asynchronous reading for a [`Message`].
pub trait AsyncReadMessage: Sized {
    fn async_read<S: AsyncRead + Unpin>(src: S) -> AsyncMessage<S>;
}

impl AsyncReadMessage for Message {
    fn async_read<S: AsyncRead + Unpin>(src: S) -> AsyncMessage<S> {
        AsyncMessage {
            mode: None,
            state: AsyncMessageState::Init,
            src,
        }
    }
}

#[cfg(test)]
mod test {
    use std::pin::pin;

    use futures::TryStreamExt;
    use sync_async::{Dribble, SyncRead, SyncResolve, SyncTryCollect};

    use crate::{stream::AsyncReadMessage, Error, Message};

    // Example from Section 5.1 of RFC 9292.
    const REQUEST1: &[u8] = &[
        0x00, 0x03, 0x47, 0x45, 0x54, 0x05, 0x68, 0x74, 0x74, 0x70, 0x73, 0x00, 0x0a, 0x2f, 0x68,
        0x65, 0x6c, 0x6c, 0x6f, 0x2e, 0x74, 0x78, 0x74, 0x40, 0x6c, 0x0a, 0x75, 0x73, 0x65, 0x72,
        0x2d, 0x61, 0x67, 0x65, 0x6e, 0x74, 0x34, 0x63, 0x75, 0x72, 0x6c, 0x2f, 0x37, 0x2e, 0x31,
        0x36, 0x2e, 0x33, 0x20, 0x6c, 0x69, 0x62, 0x63, 0x75, 0x72, 0x6c, 0x2f, 0x37, 0x2e, 0x31,
        0x36, 0x2e, 0x33, 0x20, 0x4f, 0x70, 0x65, 0x6e, 0x53, 0x53, 0x4c, 0x2f, 0x30, 0x2e, 0x39,
        0x2e, 0x37, 0x6c, 0x20, 0x7a, 0x6c, 0x69, 0x62, 0x2f, 0x31, 0x2e, 0x32, 0x2e, 0x33, 0x04,
        0x68, 0x6f, 0x73, 0x74, 0x0f, 0x77, 0x77, 0x77, 0x2e, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c,
        0x65, 0x2e, 0x63, 0x6f, 0x6d, 0x0f, 0x61, 0x63, 0x63, 0x65, 0x70, 0x74, 0x2d, 0x6c, 0x61,
        0x6e, 0x67, 0x75, 0x61, 0x67, 0x65, 0x06, 0x65, 0x6e, 0x2c, 0x20, 0x6d, 0x69, 0x00, 0x00,
    ];
    const REQUEST2: &[u8] = &[
        0x02, 0x03, 0x47, 0x45, 0x54, 0x05, 0x68, 0x74, 0x74, 0x70, 0x73, 0x00, 0x0a, 0x2f, 0x68,
        0x65, 0x6c, 0x6c, 0x6f, 0x2e, 0x74, 0x78, 0x74, 0x0a, 0x75, 0x73, 0x65, 0x72, 0x2d, 0x61,
        0x67, 0x65, 0x6e, 0x74, 0x34, 0x63, 0x75, 0x72, 0x6c, 0x2f, 0x37, 0x2e, 0x31, 0x36, 0x2e,
        0x33, 0x20, 0x6c, 0x69, 0x62, 0x63, 0x75, 0x72, 0x6c, 0x2f, 0x37, 0x2e, 0x31, 0x36, 0x2e,
        0x33, 0x20, 0x4f, 0x70, 0x65, 0x6e, 0x53, 0x53, 0x4c, 0x2f, 0x30, 0x2e, 0x39, 0x2e, 0x37,
        0x6c, 0x20, 0x7a, 0x6c, 0x69, 0x62, 0x2f, 0x31, 0x2e, 0x32, 0x2e, 0x33, 0x04, 0x68, 0x6f,
        0x73, 0x74, 0x0f, 0x77, 0x77, 0x77, 0x2e, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 0x2e,
        0x63, 0x6f, 0x6d, 0x0f, 0x61, 0x63, 0x63, 0x65, 0x70, 0x74, 0x2d, 0x6c, 0x61, 0x6e, 0x67,
        0x75, 0x61, 0x67, 0x65, 0x06, 0x65, 0x6e, 0x2c, 0x20, 0x6d, 0x69, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];

    #[test]
    fn informational() {
        const INFO: &[u8] = &[1, 64, 100, 0, 64, 200, 0];
        let mut buf_alias = INFO;
        let mut msg = Message::async_read(&mut buf_alias);
        let info = msg.informational().sync_collect::<Vec<_>>().unwrap();
        assert_eq!(info.len(), 1);
        let err = msg.informational().sync_collect::<Vec<_>>();
        assert!(matches!(err, Err(Error::InvalidState)));
        let hdr = pin!(msg.header()).sync_resolve().unwrap();
        assert_eq!(hdr.control().status().unwrap().code(), 200);
        assert!(hdr.is_empty());
    }

    #[test]
    fn sample_requests() {
        fn validate_sample_request(mut buf: &[u8]) {
            let mut msg = Message::async_read(&mut buf);
            let info = msg.informational().sync_collect::<Vec<_>>().unwrap();
            assert!(info.is_empty());

            let hdr = pin!(msg.header()).sync_resolve().unwrap();
            assert_eq!(hdr.control(), &(b"GET", b"https", b"", b"/hello.txt"));
            assert_eq!(
                hdr.get(b"user-agent"),
                Some(&b"curl/7.16.3 libcurl/7.16.3 OpenSSL/0.9.7l zlib/1.2.3"[..]),
            );
            assert_eq!(hdr.get(b"host"), Some(&b"www.example.com"[..]));
            assert_eq!(hdr.get(b"accept-language"), Some(&b"en, mi"[..]));
            assert_eq!(hdr.len(), 3);

            let body = pin!(msg.body().unwrap()).sync_read_to_end();
            assert!(body.is_empty());

            let trailer = pin!(msg.trailer()).sync_resolve().unwrap();
            assert!(trailer.is_empty());
        }

        validate_sample_request(REQUEST1);
        validate_sample_request(REQUEST2);
        validate_sample_request(&REQUEST2[..REQUEST2.len() - 12]);
    }

    #[test]
    fn truncated_header() {
        // The indefinite-length request example includes 10 bytes of padding.
        // The three additional zero values at the end represent:
        // 1. The terminating zero for the header field section.
        // 2. The terminating zero for the (empty) body.
        // 3. The terminating zero for the (absent) trailer field section.
        // The latter two (body and trailer) can be cut and the message will still work.
        // The first is not optional; dropping it means that the message is truncated.
        let mut buf = &mut &REQUEST2[..REQUEST2.len() - 13];
        let mut msg = Message::async_read(&mut buf);
        // Use this test to test skipping a few things.
        let err = pin!(msg.header()).sync_resolve().unwrap_err();
        assert!(matches!(err, Error::Truncated));
    }

    /// This test is crazy.  It reads a byte at a time and checks the state constantly.
    #[test]
    fn sample_response() {
        const RESPONSE: &[u8] = &[
            0x03, 0x40, 0x66, 0x07, 0x72, 0x75, 0x6e, 0x6e, 0x69, 0x6e, 0x67, 0x0a, 0x22, 0x73,
            0x6c, 0x65, 0x65, 0x70, 0x20, 0x31, 0x35, 0x22, 0x00, 0x40, 0x67, 0x04, 0x6c, 0x69,
            0x6e, 0x6b, 0x23, 0x3c, 0x2f, 0x73, 0x74, 0x79, 0x6c, 0x65, 0x2e, 0x63, 0x73, 0x73,
            0x3e, 0x3b, 0x20, 0x72, 0x65, 0x6c, 0x3d, 0x70, 0x72, 0x65, 0x6c, 0x6f, 0x61, 0x64,
            0x3b, 0x20, 0x61, 0x73, 0x3d, 0x73, 0x74, 0x79, 0x6c, 0x65, 0x04, 0x6c, 0x69, 0x6e,
            0x6b, 0x24, 0x3c, 0x2f, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x2e, 0x6a, 0x73, 0x3e,
            0x3b, 0x20, 0x72, 0x65, 0x6c, 0x3d, 0x70, 0x72, 0x65, 0x6c, 0x6f, 0x61, 0x64, 0x3b,
            0x20, 0x61, 0x73, 0x3d, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x00, 0x40, 0xc8, 0x04,
            0x64, 0x61, 0x74, 0x65, 0x1d, 0x4d, 0x6f, 0x6e, 0x2c, 0x20, 0x32, 0x37, 0x20, 0x4a,
            0x75, 0x6c, 0x20, 0x32, 0x30, 0x30, 0x39, 0x20, 0x31, 0x32, 0x3a, 0x32, 0x38, 0x3a,
            0x35, 0x33, 0x20, 0x47, 0x4d, 0x54, 0x06, 0x73, 0x65, 0x72, 0x76, 0x65, 0x72, 0x06,
            0x41, 0x70, 0x61, 0x63, 0x68, 0x65, 0x0d, 0x6c, 0x61, 0x73, 0x74, 0x2d, 0x6d, 0x6f,
            0x64, 0x69, 0x66, 0x69, 0x65, 0x64, 0x1d, 0x57, 0x65, 0x64, 0x2c, 0x20, 0x32, 0x32,
            0x20, 0x4a, 0x75, 0x6c, 0x20, 0x32, 0x30, 0x30, 0x39, 0x20, 0x31, 0x39, 0x3a, 0x31,
            0x35, 0x3a, 0x35, 0x36, 0x20, 0x47, 0x4d, 0x54, 0x04, 0x65, 0x74, 0x61, 0x67, 0x14,
            0x22, 0x33, 0x34, 0x61, 0x61, 0x33, 0x38, 0x37, 0x2d, 0x64, 0x2d, 0x31, 0x35, 0x36,
            0x38, 0x65, 0x62, 0x30, 0x30, 0x22, 0x0d, 0x61, 0x63, 0x63, 0x65, 0x70, 0x74, 0x2d,
            0x72, 0x61, 0x6e, 0x67, 0x65, 0x73, 0x05, 0x62, 0x79, 0x74, 0x65, 0x73, 0x0e, 0x63,
            0x6f, 0x6e, 0x74, 0x65, 0x6e, 0x74, 0x2d, 0x6c, 0x65, 0x6e, 0x67, 0x74, 0x68, 0x02,
            0x35, 0x31, 0x04, 0x76, 0x61, 0x72, 0x79, 0x0f, 0x41, 0x63, 0x63, 0x65, 0x70, 0x74,
            0x2d, 0x45, 0x6e, 0x63, 0x6f, 0x64, 0x69, 0x6e, 0x67, 0x0c, 0x63, 0x6f, 0x6e, 0x74,
            0x65, 0x6e, 0x74, 0x2d, 0x74, 0x79, 0x70, 0x65, 0x0a, 0x74, 0x65, 0x78, 0x74, 0x2f,
            0x70, 0x6c, 0x61, 0x69, 0x6e, 0x00, 0x33, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57,
            0x6f, 0x72, 0x6c, 0x64, 0x21, 0x20, 0x4d, 0x79, 0x20, 0x63, 0x6f, 0x6e, 0x74, 0x65,
            0x6e, 0x74, 0x20, 0x69, 0x6e, 0x63, 0x6c, 0x75, 0x64, 0x65, 0x73, 0x20, 0x61, 0x20,
            0x74, 0x72, 0x61, 0x69, 0x6c, 0x69, 0x6e, 0x67, 0x20, 0x43, 0x52, 0x4c, 0x46, 0x2e,
            0x0d, 0x0a, 0x00, 0x00,
        ];

        let mut buf = RESPONSE;
        let mut msg = Message::async_read(Dribble::new(&mut buf));

        {
            // Need to scope access to `info` or it will hold the reference to `msg`.
            let mut info = pin!(msg.informational());

            let info1 = info.try_next().sync_resolve().unwrap().unwrap();
            assert_eq!(info1.status(), 102_u16);
            assert_eq!(info1.len(), 1);
            assert_eq!(info1.get(b"running"), Some(&b"\"sleep 15\""[..]));

            let info2 = info.try_next().sync_resolve().unwrap().unwrap();
            assert_eq!(info2.status(), 103_u16);
            assert_eq!(info2.len(), 2);
            let links = info2.get_all(b"link").collect::<Vec<_>>();
            assert_eq!(
                &links,
                &[
                    &b"</style.css>; rel=preload; as=style"[..],
                    &b"</script.js>; rel=preload; as=script"[..],
                ]
            );

            assert!(info.try_next().sync_resolve().unwrap().is_none());
        }

        let hdr = pin!(msg.header()).sync_resolve().unwrap();
        assert_eq!(hdr.control(), &200_u16);
        assert_eq!(hdr.len(), 8);
        assert_eq!(hdr.get(b"vary"), Some(&b"Accept-Encoding"[..]));
        assert_eq!(hdr.get(b"etag"), Some(&b"\"34aa387-d-1568eb00\""[..]));

        {
            let mut body = pin!(msg.body().unwrap());
            assert_eq!(body.sync_read_exact(12), b"Hello World!");
        }
        // Attempting to read the trailer before finishing the body should fail.
        assert!(matches!(
            pin!(msg.trailer()).sync_resolve(),
            Err(Error::InvalidState)
        ));
        {
            // Picking up the body again should work fine.
            let mut body = pin!(msg.body().unwrap());
            assert_eq!(
                body.sync_read_to_end(),
                b" My content includes a trailing CRLF.\r\n"
            );
        }
        let trailer = pin!(msg.trailer()).sync_resolve().unwrap();
        assert!(trailer.is_empty());
    }
}
