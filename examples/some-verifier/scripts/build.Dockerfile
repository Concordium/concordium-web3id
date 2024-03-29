ARG frontend_build_image=node:18-slim
ARG build_image=rust:1.72-bookworm
ARG base_image=debian:bookworm

FROM ${frontend_build_image} AS frontend

# Copy front end files
WORKDIR /build/examples/some-verifier/frontend
COPY ./examples/some-verifier/frontend .
RUN yarn install --immutable && yarn build

FROM ${build_image} AS build

WORKDIR /build
COPY examples/some-verifier examples/some-verifier
COPY examples/some-verifier-lib examples/some-verifier-lib
COPY deps/concordium-rust-sdk deps/concordium-rust-sdk
RUN cargo build --locked --manifest-path examples/some-verifier/Cargo.toml --release

FROM ${base_image}

ENV SOME_VERIFIER_FRONTEND=/frontend

RUN apt-get update && \
    apt-get -y install \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=frontend /build/examples/some-verifier/frontend/dist frontend

COPY --from=build /build/examples/some-verifier/target/release/some-verifier /usr/local/bin/

