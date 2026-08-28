# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from taskgraph.transforms.base import TransformSequence

from gecko_taskgraph.transforms.repackage_routes import transforms as repackage_routes_transforms

transforms = TransformSequence()

@transforms.add
def rewrite_shipping_product(config, jobs):
    for job in jobs:
        if "enterprise-repack" in config.kind:
            job["shipping-product"] = config.config["task-defaults"]["shipping-product"]
        elif "enterprise" in config.params["project"] and "shipping-product" in job:
            job["shipping-product"] = config.params["release_product"]
        yield job

@transforms.add
def rewrite_run_on_projects(config, jobs):
    for job in jobs:
        if "enterprise-repack" in config.kind:
            job["run-on-projects"] = config.config["task-defaults"]["run-on-projects"]
        elif "enterprise" in config.params["project"] and "run-on-projects" in job:
            job["run-on-projects"] = config.params["project"]
        yield job


@transforms.add
def rewrite_mozharness_configs(config, jobs):
    for job in jobs:
        if "enterprise-repack-repackage" in config.kind:
            job["mozharness"]["comm-checkout"] = True
            job["mozharness"]["config-paths"] = config.config["task-defaults"]["mozharness"]["config-paths"]
        elif "enterprise-repack" in config.kind:
            job["run"]["comm-checkout"] = True
            job["run"]["config-paths"] = config.config["task-defaults"]["run"]["config-paths"]
            job["run"]["config"] = config.config["task-defaults"]["run"]["config"]
        yield job


@transforms.add
def maybe_repackage_routes(config, jobs):
    if "enterprise" in config.params["project"]:
        yield from repackage_routes_transforms(config, jobs)
    else:
        yield from jobs


@transforms.add
def rewrite_shipping_phase(config, jobs):
    for job in jobs:
        if "enterprise" in config.params["project"]:
            if job.get("shipping-phase"):
                job["shipping-phase"] = "build"
            elif job.get("attributes", {}).get("shipping-phase"):
                job["attributes"]["shipping-phase"] = "build"
            elif job.get("attributes", {}).get("shipping_phase"):
                job["attributes"]["shipping_phase"] = "build"
        yield job


@transforms.add
def remove_enterprise_tests(config, jobs):
    for job in jobs:
        if "test" in config.kind and "enterprise" not in config.params["project"] and "enterprise" in job["test-platform"]:
            continue
        yield job


@transforms.add
def remove_enterprise_builds(config, jobs):
    for job in jobs:
        if "build" in config.kind and "enterprise" not in config.params["project"] and "enterprise" in job.get("attributes", {}).get("build_platform"):
            continue
        yield job

@transforms.add
def remove_enterprise_complete(config, jobs):
    for job in jobs:
        if "complete" in config.kind and "enterprise" not in config.params["project"] and "enterprise" in job["name"]:
            continue
        yield job
