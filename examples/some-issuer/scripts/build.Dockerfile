ARG build_image
ARG base_image
FROM ${build_image} AS build

WORKDIR /build
COPY examples/some-issuer examples/some-issuer
COPY deps/concordium-rust-sdk deps/concordium-rust-sdk
RUN cargo build --locked --manifest-path examples/some-issuer/Cargo.toml --release

FROM ${base_image}
RUN apt-get update && \
    apt-get -y install \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
    
COPY --from=build /build/examples/some-issuer/json-schemas/ /json-schemas
COPY --from=build /build/examples/some-issuer/target/release/discord /usr/local/bin/
COPY --from=build /build/examples/some-issuer/target/release/telegram /usr/local/bin/