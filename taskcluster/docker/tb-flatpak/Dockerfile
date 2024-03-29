FROM freedesktopsdk/flatpak:22.08-x86_64
MAINTAINER daniel@thunderbird.net

# Create scripts directory
RUN mkdir /scripts/
WORKDIR /scripts/

# Copy everything in the docker/tb-flatpak folder but the Dockerfile
COPY [^D]* /scripts/

# Copy required recipes
# %include comm/taskcluster/docker/recipes
COPY topsrcdir/comm/taskcluster/docker/recipes/make_venv.sh /scripts/make_venv.sh
COPY topsrcdir/comm/taskcluster/docker/recipes/fluent_requirements.txt /scripts/fluent_requirements.txt
COPY topsrcdir/comm/taskcluster/docker/recipes/build_desktop_file.py /scripts/build_desktop_file.py
COPY topsrcdir/comm/taskcluster/docker/recipes/org.mozilla.thunderbird.desktop.jinja2 /scripts/org.mozilla.thunderbird.desktop.jinja2

# Set up Python virtual environment
ENV VENV_DIR="/scripts"
RUN /scripts/make_venv.sh /scripts/fluent_requirements.txt

# Manually add close_range syscall to image
RUN ["gcc", "-Wall", "-shared", "-o", "/scripts/close_range.so", "/scripts/close_range.c"]
ENV LD_PRELOAD /scripts/close_range.so

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
