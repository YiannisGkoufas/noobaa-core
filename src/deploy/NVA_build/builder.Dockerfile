FROM centos:7 
LABEL maintainer="Liran Mauda (lmauda@redhat.com)"

##############################################################
# Layers:
#   Title: Installing pre requirments
#   Size: ~ 613 MB
#   Cache: Rebuild when we adding/removing requirments
##############################################################
ENV container docker
RUN yum update -y -q && yum install dnf -y -q
RUN dnf update -y -q && \
    dnf install -y -q wget unzip which vim python3 && \
    dnf group install -y "Development Tools" && \
    dnf clean all
RUN rm -rf /usr/bin/python && ln -s /usr/bin/python3 /usr/bin/python
RUN version="1.3.0" && \
    wget -q -O yasm-${version}.tar.gz https://github.com/yasm/yasm/archive/v${version}.tar.gz && \
    tar -xf yasm-${version}.tar.gz && \
    pushd yasm-${version} && \
    ./autogen.sh --build=ppc64le && \
    make && \
    make install && \
    popd && \
    rm -rf yasm-${version} yasm-${version}.tar.gz

##############################################################
# Layers:
#   Title: Getting the node 
#   Size: ~ 110 MB
#   Cache: Rebuild the .nvmrc is changing
##############################################################
COPY ./.nvmrc ./.nvmrc
COPY ./src/deploy/NVA_build/install_nodejs.sh ./
RUN chmod +x ./install_nodejs.sh && \
    ./install_nodejs.sh $(cat .nvmrc) && \
    npm config set unsafe-perm true && \
    echo '{ "allow_root": true }' > /root/.bowerrc

##############################################################
# Layers:
#   Title: installing kubectl 
#   Size: ~ 43 MB
#   Cache: Rebuild the .nvmrc is changing
##############################################################
RUN stable_version=$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt) && \
    curl -LO https://storage.googleapis.com/kubernetes-release/release/${stable_version}/bin/linux/ppc64le/kubectl && \
    chmod +x ./kubectl

RUN mkdir -p /noobaa/src/
WORKDIR /noobaa
