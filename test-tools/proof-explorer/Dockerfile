# This dockerfile is meant to be run from the **root of the repository**.

ARG build_image=node:18-slim

FROM ${build_image} AS frontend

RUN yarn set version 3.2.0

# Copy front end files
WORKDIR /build
COPY ./test-tools/proof-explorer ./test-tools/proof-explorer

WORKDIR /build/test-tools/proof-explorer
RUN yarn install && yarn build

# production environment
FROM nginx:stable-alpine
COPY --from=frontend /build/test-tools/proof-explorer/dist /usr/share/nginx/html
COPY ./test-tools/proof-explorer/nginx.conf /etc/nginx/conf.d/default.conf
CMD ["nginx", "-g", "daemon off;"]
