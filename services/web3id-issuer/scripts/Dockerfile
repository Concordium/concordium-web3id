ARG build_image
ARG base_image
FROM ${build_image} AS build

WORKDIR /build
COPY web3id-issuer web3id-issuer
COPY deps/concordium-rust-sdk deps/concordium-rust-sdk
RUN cargo build --locked --manifest-path web3id-issuer/Cargo.toml --release

FROM ${base_image}
RUN apt-get update && \
    apt-get -y install \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/web3id-issuer/target/release/web3id-issuer /usr/local/bin/

