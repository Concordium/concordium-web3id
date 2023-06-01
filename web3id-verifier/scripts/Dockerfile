ARG build_image
ARG base_image
FROM ${build_image} AS build

WORKDIR /build
COPY web3id-verifier web3id-verifier
COPY deps/concordium-rust-sdk deps/concordium-rust-sdk
RUN cargo build --locked --manifest-path web3id-verifier/Cargo.toml --release

FROM ${base_image}
RUN apt-get update && \
    apt-get -y install \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/web3id-verifier/target/release/web3id-verifier /usr/local/bin/

