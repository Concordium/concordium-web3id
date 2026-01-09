ARG build_image=rust:1.85-bookworm
ARG base_image=debian:bookworm
FROM ${build_image} AS build

WORKDIR /build
COPY . .
RUN cargo build --locked --release -p web3id-verifier

FROM ${base_image}
RUN apt-get update && \
    apt-get -y install \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/target/release/web3id-verifier /usr/local/bin/

