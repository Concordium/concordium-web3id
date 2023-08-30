# This dockerfile is meant to be run from the **root of the repository**.

ARG build_image=node:16-slim
ARG rust_base_image=rust:1.69-buster

FROM ${rust_base_image} AS backend

WORKDIR /build
COPY ./deps/concordium-rust-sdk ./deps/concordium-rust-sdk
COPY ./test-tools/issuer-front-end/backend ./test-tools/issuer-front-end/backend

RUN cargo build --release --manifest-path ./test-tools/issuer-front-end/backend/Cargo.toml

FROM ${build_image} AS frontend

RUN yarn set version 3.2.0

# Copy front end files
WORKDIR /build
COPY ./test-tools/issuer-front-end ./test-tools/issuer-front-end

WORKDIR /build/test-tools/issuer-front-end
RUN yarn install && yarn build

FROM debian:buster

COPY --from=backend /build/test-tools/issuer-front-end/backend/target/release/test-issuer /test-issuer
COPY --from=frontend /build/test-tools/issuer-front-end/dist /dist

CMD /test-issuer --dir /dist
