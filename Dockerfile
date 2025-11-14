# Govli AI - Government Workflow & Security Platform
# Lightweight nginx-based container for serving static HTML application

FROM nginx:alpine

# Set metadata
LABEL maintainer="Govli AI Team"
LABEL description="Government Workflow & Security Platform"
LABEL version="1.0.0"

# Remove default nginx configuration
RUN rm -rf /usr/share/nginx/html/*

# Copy application files
COPY *.html /usr/share/nginx/html/
COPY RULES.md /usr/share/nginx/html/

# Create a custom nginx configuration for better caching and security
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # Security headers \
    add_header X-Frame-Options "SAMEORIGIN" always; \
    add_header X-Content-Type-Options "nosniff" always; \
    add_header X-XSS-Protection "1; mode=block" always; \
    add_header Referrer-Policy "no-referrer-when-downgrade" always; \
    \
    # Cache static assets \
    location ~* \.(html|css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
    \
    # Main location \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # Disable access logs for health checks \
    location /health { \
        access_log off; \
        return 200 "healthy\n"; \
        add_header Content-Type text/plain; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
