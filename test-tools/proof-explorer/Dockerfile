# This dockerfile is meant to be run from the **root of the repository**.

ARG build_image=node:16-slim

FROM ${build_image} AS frontend

RUN yarn set version 3.2.0

# Copy front end files
WORKDIR /build
COPY ./deps/concordium-browser-wallet ./deps/concordium-browser-wallet
COPY ./test-tools/proof-explorer ./test-tools/proof-explorer

# Install front end dependencies
WORKDIR /build/deps/concordium-browser-wallet
RUN yarn install && yarn build:api-helpers

WORKDIR /build/test-tools/proof-explorer
RUN yarn install && yarn build


# production environment
FROM nginx:stable-alpine
COPY --from=frontend /build/test-tools/proof-explorer/dist /usr/share/nginx/html
CMD ["nginx", "-g", "daemon off;"]
