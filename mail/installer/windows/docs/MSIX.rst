MSIX Package
============

See the Firefox MSIX installer docs.

resources.pri
'''''''''''''

Generate a new ``resources.pri`` file on a Windows machine using
``makepri.exe`` from the Windows SDK, like:

::

    C:\> makepri.exe new ^
        -IndexName thunderbird ^
        -ConfigXml comm\mail\installer\windows\msix\priconfig.xml ^
        -ProjectRoot comm\mail\branding\nightly\msix ^
        -OutputFile comm\mail\installer\windows\msix\resources.pri ^
        -Overwrite

The choice of channel (i.e.,
``comm\mail\branding\{thunderbird,nightly}``) should
not matter.
