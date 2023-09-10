ARG build_image
ARG base_image
FROM ${build_image} AS build

WORKDIR /build
COPY examples/bots/discord-bot examples/bots/discord-bot
COPY deps/concordium-rust-sdk deps/concordium-rust-sdk
COPY examples/some-verifier-lib examples/some-verifier-lib
RUN cargo build --locked --manifest-path examples/bots/discord-bot/Cargo.toml --release

FROM ${base_image}
RUN apt-get update && \
    apt-get -y install \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/examples/bots/discord-bot/target/release/discord-bot /usr/local/bin/

