#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

import functools
import os
from typing import Callable, Optional

from mach.requirements import MachEnvRequirements, UnexpectedFlexibleRequirementException
from mach.site import (
    PIP_NETWORK_INSTALL_RESTRICTED_VIRTUALENVS,
    CommandSiteManager,
    MozSiteMetadata,
    SitePackagesSource,
    _mach_virtualenv_root,
)


class SiteNotFoundException(Exception):
    def __init__(self, site_name, manifest_paths):
        self.site_name = site_name
        self.manifest_paths = manifest_paths
        self.args = (site_name, manifest_paths)


@functools.lru_cache(maxsize=None)
def find_manifest(topsrcdir, site_name):
    manifest_paths = (
        os.path.join(topsrcdir, "comm", "python", "sites", f"{site_name}.txt"),
        os.path.join(topsrcdir, "python", "sites", f"{site_name}.txt"),
    )

    for check_path in manifest_paths:
        if os.path.exists(check_path):
            return check_path

    raise SiteNotFoundException(site_name, manifest_paths)


@functools.lru_cache(maxsize=None)
def resolve_requirements(topsrcdir, site_name):
    try:
        manifest_path = find_manifest(topsrcdir, site_name)
    except SiteNotFoundException as e:
        raise Exception(
            f'The current command is using the "{e.site_name}" '
            "site. However, that site is missing its associated "
            f"requirements definition file in one of the supported "
            f"paths: {e.manifest_paths}."
        )
    is_thunderbird = True
    try:
        return MachEnvRequirements.from_requirements_definition(
            topsrcdir,
            is_thunderbird,
            site_name not in PIP_NETWORK_INSTALL_RESTRICTED_VIRTUALENVS,
            manifest_path,
        )
    except UnexpectedFlexibleRequirementException as e:
        raise Exception(
            f'The "{site_name}" site does not have all pypi packages pinned '
            f'in the format "package==version" (found "{e.raw_requirement}").\n'
            f"Only the {PIP_NETWORK_INSTALL_RESTRICTED_VIRTUALENVS} sites are "
            "allowed to have unpinned packages."
        )


class MutlhCommandSiteManager(CommandSiteManager):
    @classmethod
    def from_environment(
        cls,
        topsrcdir: str,
        get_state_dir: Callable[[], Optional[str]],
        site_name: str,
        command_virtualenvs_dir: str,
    ):
        """
        Args:
            topsrcdir: The path to the Firefox repo
            get_state_dir: A function that resolves the path to the checkout-scoped
                state_dir, generally ~/.mozbuild/srcdirs/<checkout-based-dir>/
            site_name: The name of this site, such as "build"
            command_virtualenvs_dir: The location under which this site's virtualenv
            should be created
        """
        active_metadata = MozSiteMetadata.from_runtime()
        assert (
            active_metadata
        ), "A Mach-managed site must be active before doing work with command sites"

        mach_site_packages_source = active_metadata.mach_site_packages_source
        pip_restricted_site = site_name in PIP_NETWORK_INSTALL_RESTRICTED_VIRTUALENVS
        if not pip_restricted_site and mach_site_packages_source == SitePackagesSource.SYSTEM:
            # Sites that aren't pip-network-install-restricted are likely going to be
            # incompatible with the system. Besides, this use case shouldn't exist, since
            # using the system packages is supposed to only be needed to lower risk of
            # important processes like building Firefox.
            raise Exception(
                'Cannot use MACH_BUILD_PYTHON_NATIVE_PACKAGE_SOURCE="system" for any '
                f"sites other than {PIP_NETWORK_INSTALL_RESTRICTED_VIRTUALENVS}. The "
                f'current attempted site is "{site_name}".'
            )

        mach_virtualenv_root = (
            _mach_virtualenv_root(get_state_dir())
            if mach_site_packages_source == SitePackagesSource.VENV
            else None
        )
        populate_virtualenv = (
            mach_site_packages_source == SitePackagesSource.VENV or not pip_restricted_site
        )
        return cls(
            topsrcdir,
            mach_virtualenv_root,
            os.path.join(command_virtualenvs_dir, site_name),
            site_name,
            active_metadata,
            populate_virtualenv,
            resolve_requirements(topsrcdir, site_name),
        )
