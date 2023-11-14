# This dockerfile is meant to be run from the **root of the repository**.

ARG build_image=node:18-slim

FROM ${build_image} AS frontend

# Copy front end files
WORKDIR /build/issuer-front-end
COPY ./issuer-front-end ./
RUN yarn install && yarn build

FROM nginx
COPY --from=frontend /build/issuer-front-end/dist ./usr/share/nginx/html
COPY ./issuer-front-end/nginx.conf /etc/nginx/conf.d/default.conf
