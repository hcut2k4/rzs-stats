FROM node:20-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf.template
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'envsubst "${PORT} ${BACKEND_URL}" < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf' >> /start.sh && \
    echo 'exec nginx -g "daemon off;"' >> /start.sh && \
    chmod +x /start.sh
EXPOSE 80
CMD ["/start.sh"]
