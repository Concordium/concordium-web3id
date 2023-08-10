# This dockerfile is meant to be run from the **root of the repository**.

ARG build_image=node:16-slim
ARG rust_base_image=rust:1.62



FROM ${rust_base_image} AS backend

WORKDIR /backend
COPY ./deps/concordium-rust-sdk /deps/concordium-rust-sdk
COPY ./sponsoredTransactions/backend ./

RUN cargo build --release



FROM ${build_image} AS build

RUN yarn set version 3.2.0

# Copy front end files
WORKDIR /app
COPY ./issuer-front-end ./issuer-front-end
COPY ./deps/concordium-browser-wallet ./deps/concordium-browser-wallet

# Install front end dependencies
WORKDIR /app/deps/concordium-browser-wallet
RUN yarn install && yarn build:api-helpers

WORKDIR /app/issuer-front-end
RUN yarn install && yarn build

# Serve front end
FROM nginx
COPY --from=build ./app/issuer-front-end/dist ./usr/share/nginx/html

