ARG build_image
ARG base_image
FROM ${build_image} AS build

WORKDIR /build
COPY examples/some-verifier examples/some-verifier
COPY examples/some-verifier-lib examples/some-verifier-lib
COPY deps/concordium-rust-sdk deps/concordium-rust-sdk
RUN cargo build --locked --manifest-path examples/some-verifier/Cargo.toml --release

FROM ${base_image}
RUN apt-get update && \
    apt-get -y install \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/examples/some-verifier/target/release/some-verifier /usr/local/bin/

