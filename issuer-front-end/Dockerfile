# This dockerfile is meant to be run from the **root of the repository**.

ARG build_image=node:16-slim
ARG rust_base_image=rust:1.65



FROM ${rust_base_image} AS backend

WORKDIR /backend
COPY ./deps/concordium-rust-sdk /deps/concordium-rust-sdk
COPY ./test-tools/test-issuer-backend ./

RUN cargo build --release



FROM ${build_image} AS frontend

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

COPY --from=backend ./backend/target/release/test-issuer-backend ./test-issuer-backend

RUN chmod +x ./test-issuer-backend
CMD ./test-issuer-backend --node http://node.testnet.concordium.com:20000 --listen-address 0.0.0.0:3000 &

COPY --from=frontend ./app/issuer-front-end/dist ./usr/share/nginx/html

