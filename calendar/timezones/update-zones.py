#!/usr/bin/python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import argparse, ftplib, json, os, os.path, re, shutil, subprocess, sys, tarfile, tempfile
from collections import OrderedDict

def parse_args():
    """Gather arguments from the command-line."""
    parser = argparse.ArgumentParser(description="Create timezone info JSON file from tzdata files")
    parser.add_argument("-v", "--vzic", dest="vzic_path", required=True,
        help="""Path to the `vzic` executable. This must be downloaded
        from https://code.google.com/p/tzurl/ and compiled."""
    )
    parser.add_argument("-t", "--tzdata", dest="tzdata_path",
        help="""Path to a directory containing the IANA timezone data.
        If this argument is omitted, the data will be downloaded from ftp.iana.org."""
    )
    return parser.parse_args()

def prepare_tzdata():
    """Download timezone info, or use a local copy, if specified.
    Then use vzic to create ICS versions of the data."""
    args = parse_args()

    if args.tzdata_path is None:
        tzdata_download_path = tempfile.mktemp(".tar.gz", prefix="zones")
        sys.stderr.write("Downloading tzdata-latest.tar.gz from ftp.iana.org to %s\n" % tzdata_download_path)
        ftp = ftplib.FTP("ftp.iana.org")
        ftp.login()
        ftp.retrbinary("RETR /tz/tzdata-latest.tar.gz", open(tzdata_download_path, "wb").write)
        ftp.quit()

        tzdata_path = tempfile.mkdtemp(prefix="zones")
        sys.stderr.write("Extracting %s to %s\n" % (tzdata_download_path, tzdata_path))
        tarfile.open(tzdata_download_path).extractall(path=tzdata_path)
        os.unlink(tzdata_download_path)
    else:
        tzdata_path = args.tzdata_path

    # Extract version number of tzdata files.
    with open(os.path.join(tzdata_path, "Makefile"), "r") as fp:
        for line in fp:
            match = re.search(r"VERSION=\s*(\w+)", line)
            if match is not None:
                version = "2." + match.group(1)
                break

    # Use `vzic` to create 'pure' and 'non-pure' zone files.
    sys.stderr.write("Exporting zone info to %s\n" % zoneinfo_path)
    subprocess.check_call([
        args.vzic_path,
        "--olson-dir", tzdata_path,
        "--output-dir", zoneinfo_path
    ], stdout=sys.stderr)

    sys.stderr.write("Exporting pure zone info to %s\n" % zoneinfo_pure_path)
    subprocess.check_call([
        args.vzic_path,
        "--olson-dir", tzdata_path,
        "--output-dir", zoneinfo_pure_path,
        "--pure"
    ], stdout=sys.stderr)

    if args.tzdata_path is None:
        shutil.rmtree(tzdata_path)

    return version

def read_zones_tab():
    """Read zones.tab for latitude and longitude data."""
    lat_long_data = {}
    with open(os.path.join(zoneinfo_path, "zones.tab"), "r") as tab:
        for line in tab:
            if len(line) < 19:
                sys.stderr.write("Line in zones.tab not long enough: %s\n" % line.strip())
                continue

            [latitude, longitude, name] = line.rstrip().split(" ", 2)
            lat_long_data[name] = (latitude, longitude)
    return lat_long_data

def read_ics(filename):
    """Read a single zone's ICS files.

    We keep only the lines we want, and we use the pure version of RRULE if
    the versions differ. See Asia/Jerusalem for an example."""
    with open(os.path.join(zoneinfo_path, filename), "r") as fp:
        zoneinfo = fp.readlines()

    with open(os.path.join(zoneinfo_pure_path, filename), "r") as fp:
        zoneinfo_pure = fp.readlines()

    ics_data = []
    for i in range(0, len(zoneinfo)):
        line = zoneinfo[i]
        key = line[:line.find(":")]

        if key == "BEGIN":
            if line != "BEGIN:VCALENDAR\r\n":
                ics_data.append(line)
        elif key == "END":
            if line != "END:VCALENDAR\r\n":
                ics_data.append(line)
        elif key in ("TZID", "TZOFFSETFROM", "TZOFFSETTO", "TZNAME", "DTSTART"):
            ics_data.append(line)
        elif key == "RRULE":
            if line == zoneinfo_pure[i]:
                ics_data.append(line)
            else:
                sys.stderr.write("Using pure version of %s\n" % filename[:-4])
                ics_data.append(zoneinfo_pure[i])

    zone_data = {
        "ics": "".join(ics_data).rstrip()
    }
    zone_name = filename[:-4]
    if zone_name in lat_long_data:
        zone_data["latitude"] = lat_long_data[zone_name][0]
        zone_data["longitude"] = lat_long_data[zone_name][1]

    return zone_data

def read_dir(path, prefix=""):
    """Recursively read a directory for ICS files.

    Files could be two or three levels deep."""
    zones = {}
    for entry in os.listdir(path):
        fullpath = os.path.join(path, entry)
        if os.path.isdir(fullpath):
            zones.update(read_dir(fullpath, os.path.join(prefix, entry)))
        elif prefix != "":
            filename = os.path.join(prefix, entry)
            zones[filename[:-4]] = read_ics(filename)
    return zones

def read_aliases():
    """Copy the list of aliases from the previous version of zones.json."""
    with open(json_file, "r") as fp:
        json_data = json.load(fp)
        return json_data["aliases"]

def write_output(version, aliases, zones):
    """Write the data to zones.json."""
    data = OrderedDict()
    data["version"] = version
    data["aliases"] = OrderedDict(sorted(aliases.items()))
    data["zones"] = OrderedDict(sorted(zones.items()))

    with open(json_file, "w") as fp:
        json.dump(data, fp, indent=2, separators=(",", ": "))
        fp.write("\n")

json_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "zones.json")
zoneinfo_path = tempfile.mkdtemp(prefix="zones")
zoneinfo_pure_path = tempfile.mkdtemp(prefix="zones")

version = prepare_tzdata()
lat_long_data = read_zones_tab()
zones = read_dir(zoneinfo_path)
aliases = read_aliases()

write_output(version, aliases, zones)

# Clean up.
shutil.rmtree(zoneinfo_path)
shutil.rmtree(zoneinfo_pure_path)
