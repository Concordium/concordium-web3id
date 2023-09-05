# This dockerfile is meant to be run from the **root of the repository**.

ARG build_image=node:16-slim

FROM ${build_image} AS frontend

RUN yarn set version 3.2.0

# Copy front end files
WORKDIR /build
COPY ./issuer-front-end ./issuer-front-end

WORKDIR /build/issuer-front-end
RUN yarn install && yarn build

FROM nginx
COPY --from=frontend /build/issuer-front-end/dist ./usr/share/nginx/html





