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

# Generate the `env.js` file before starting the Nginx server so the frontend
# can read the `VERIFIER_V0_API` and `VERIFIER_V1_API` value from the container environment at runtime.
CMD sh -c 'echo -e "window.VERIFIER_V0_API=\"${VERIFIER_V0_API}\";\nwindow.VERIFIER_V1_API=\"${VERIFIER_V1_API}\";" > /usr/share/nginx/html/env.js && nginx -g "daemon off;"'
