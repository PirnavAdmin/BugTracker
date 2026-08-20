FROM node:20.19.0-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci --ignore-scripts

# Keep the downloads folder available in the build context even when
# developers have not placed an APK yet. This lets the image build stay
# successful while still supporting optional APK bundling.
RUN mkdir -p public/downloads

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_RAZORPAY_KEY_ID=
ENV VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID

ARG VITE_ENABLE_ADMIN_DEFAULT_LOGIN=true
ENV VITE_ENABLE_ADMIN_DEFAULT_LOGIN=$VITE_ENABLE_ADMIN_DEFAULT_LOGIN

ARG VITE_DEBUG_TEAM_SELECTION=false
ENV VITE_DEBUG_TEAM_SELECTION=$VITE_DEBUG_TEAM_SELECTION

ARG VITE_STUN_URL=stun:stun.l.google.com:19302
ENV VITE_STUN_URL=$VITE_STUN_URL

ARG VITE_TURN_URL=
ENV VITE_TURN_URL=$VITE_TURN_URL

ARG VITE_TURN_USERNAME=
ENV VITE_TURN_USERNAME=$VITE_TURN_USERNAME

ARG VITE_TURN_CREDENTIAL=
ENV VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL

ARG VITE_ICE_TRANSPORT_POLICY=all
ENV VITE_ICE_TRANSPORT_POLICY=$VITE_ICE_TRANSPORT_POLICY

RUN npm run build --ignore-scripts

FROM nginx:1.27-alpine

# Frontend runtime:
# - Serve the Vite build from /usr/share/nginx/html
# - If frontend/public/downloads/CureCode.apk exists at build time, copy it
#   into /usr/share/nginx/html/downloads/CureCode.apk
# - If it does not exist, continue the image build and log a warning
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/public/downloads /tmp/downloads

RUN mkdir -p /usr/share/nginx/html/downloads \
    && if [ -f /tmp/downloads/CureCode.apk ]; then \
        cp /tmp/downloads/CureCode.apk /usr/share/nginx/html/downloads/CureCode.apk; \
      else \
        echo "WARNING: CureCode.apk not found. APK download will be unavailable."; \
      fi \
    && rm -rf /tmp/downloads

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
