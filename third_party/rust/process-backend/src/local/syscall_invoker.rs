use {super::errno, core::ffi::c_int};

#[derive(Debug, Default)]
pub struct SyscallInvoker(Option<c_int>);

impl SyscallInvoker {
    /// Helper function to invoke a syscall and capture errno if it fails
    ///
    /// The given function's job is simply to invoke the syscall and determine whether the return
    /// value was success (`Ok(t)`) or failure (`Err(())`). On success, this wrapper will return
    /// whatever value the inner function returned. On failure, it will return `Err(errno())`.
    ///
    /// If testing requests a failure, will never actually make the syscall and just returns
    /// the errno requested by testing
    pub fn invoke<T, F>(&mut self, f: F) -> Result<T, c_int>
    where
        F: FnOnce() -> Result<T, ()>,
    {
        if let Some(errno) = self.0.take() {
            Err(errno)
        } else {
            f().map_err(|()| errno())
        }
    }

    /// Ergonomics for `invoke` for the standard case where `-1` indicates the syscall failed
    pub fn invoke_standard<T, F>(&mut self, f: F) -> Result<T, c_int>
    where
        F: FnOnce() -> T,
        T: From<i8> + core::cmp::PartialEq,
    {
        self.invoke(|| {
            let rv = f();
            if rv == T::from(-1) {
                return Err(());
            }
            Ok(rv)
        })
    }

    /// Force the next syscall to fail with the given errno
    #[cfg(feature = "testing")]
    pub fn fail_one_syscall_with(&mut self, errno: c_int) {
        self.0 = Some(errno);
    }
}
