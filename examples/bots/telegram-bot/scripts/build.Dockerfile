ARG build_image
ARG base_image
FROM ${build_image} AS build

WORKDIR /build
COPY . .
RUN cargo build --locked -p telegram-bot --release

FROM ${base_image}
RUN apt-get update && \
    apt-get -y install \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/target/release/telegram-bot /usr/local/bin/

