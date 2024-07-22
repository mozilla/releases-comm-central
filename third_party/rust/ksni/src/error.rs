use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("dbus error: {0}")]
    Dbus(#[from] dbus::Error),
    #[error("service stopped")]
    Stopped,
}
