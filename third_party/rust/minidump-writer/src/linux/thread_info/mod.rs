use {
    super::{
        Pid,
        process_inspection::{ProcessInspector, regs},
        serializers::*,
    },
    crate::serializers::*,
    std::{
        io::{self, BufRead},
        path,
    },
};

type Result<T> = std::result::Result<T, ThreadInfoError>;

#[derive(thiserror::Error, Debug, serde::Serialize)]
pub enum ThreadInfoError {
    #[error("Index out of bounds: Got {0}, only have {1}")]
    IndexOutOfBounds(usize, usize),
    #[error("Either ppid ({1}) or tgid ({2}) not found in {0}")]
    InvalidPid(String, Pid, Pid),
    #[error("IO error")]
    IOError(
        #[from]
        #[serde(serialize_with = "serialize_io_error")]
        std::io::Error,
    ),
    #[error("Couldn't parse address")]
    UnparsableInteger(
        #[from]
        #[serde(skip)]
        std::num::ParseIntError,
    ),
    #[error("nix::ptrace() error")]
    PtraceError(
        #[source]
        #[serde(serialize_with = "serialize_nix_error")]
        nix::Error,
    ),
    #[error("Invalid line in /proc/{0}/status: {1}")]
    InvalidProcStatusFile(Pid, String),
}

cfg_if::cfg_if! {
    if #[cfg(any(target_arch = "x86", target_arch = "x86_64"))] {
        mod x86;
        pub type ThreadInfo = x86::ThreadInfoX86;

        #[cfg(target_arch = "x86_64")]
        pub use x86::copy_u32_registers;
    } else if #[cfg(target_arch = "arm")] {
        mod arm;
        pub type ThreadInfo = arm::ThreadInfoArm;
    } else if #[cfg(target_arch = "aarch64")] {
        mod aarch64;
        pub type ThreadInfo = aarch64::ThreadInfoAarch64;
    }
}

fn get_ppid_and_tgid(process_inspector: &ProcessInspector, tid: Pid) -> Result<(Pid, Pid)> {
    let mut ppid = -1;
    let mut tgid = -1;

    let status_path = path::PathBuf::from(format!("/proc/{tid}/status"));
    let status_file = process_inspector.read_file(status_path)?;
    for line in io::BufReader::new(status_file).lines() {
        let l = line?;
        let start = l
            .get(0..6)
            .ok_or_else(|| ThreadInfoError::InvalidProcStatusFile(tid, l.clone()))?;
        match start {
            "Tgid:\t" => {
                tgid = l
                    .get(6..)
                    .ok_or_else(|| ThreadInfoError::InvalidProcStatusFile(tid, l.clone()))?
                    .parse::<Pid>()?;
            }
            "PPid:\t" => {
                ppid = l
                    .get(6..)
                    .ok_or_else(|| ThreadInfoError::InvalidProcStatusFile(tid, l.clone()))?
                    .parse::<Pid>()?;
            }
            _ => continue,
        }
    }
    if ppid == -1 || tgid == -1 {
        return Err(ThreadInfoError::InvalidPid(
            format!("/proc/{tid}/status"),
            ppid,
            tgid,
        ));
    }
    Ok((ppid, tgid))
}
