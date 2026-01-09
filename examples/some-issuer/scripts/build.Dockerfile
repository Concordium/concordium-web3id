ARG frontend_build_image
ARG build_image
ARG base_image

FROM ${frontend_build_image} AS frontend

# Copy front end files
WORKDIR /build/examples/some-issuer/frontend
COPY ./examples/some-issuer/frontend .
RUN yarn install --immutable && yarn build-telegram && yarn build-discord

FROM ${build_image} AS build

WORKDIR /build
COPY . .
RUN cargo build --locked -p some-issuer --release

FROM ${base_image}

ENV DISCORD_ISSUER_FRONTEND=/frontend/discord
ENV TELEGRAM_ISSUER_FRONTEND=/frontend/telegram

RUN apt-get update && \
    apt-get -y install \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=frontend /build/examples/some-issuer/frontend/dist frontend

COPY --from=build /build/examples/some-issuer/json-schemas/ /json-schemas
COPY --from=build /build/target/release/discord /usr/local/bin/
COPY --from=build /build/target/release/telegram /usr/local/bin/
