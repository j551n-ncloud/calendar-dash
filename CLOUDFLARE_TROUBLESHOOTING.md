# Cloudflare Tunnels CalDAV Troubleshooting Guide

## Common Issues with Cloudflare Tunnels and CalDAV

### 1. HTTP Method Restrictions
**Problem**: Cloudflare may block or modify CalDAV-specific HTTP methods (REPORT, PROPFIND)
**Solutions**:
- Configure Cloudflare to allow WebDAV methods
- Use Cloudflare Page Rules to bypass security for CalDAV endpoints
- Consider using Cloudflare Access instead of public tunnels

### 2. Header Modifications
**Problem**: Cloudflare may strip or modify CalDAV headers
**Solutions**:
- Add custom headers in Cloudflare Workers
- Use Transform Rules to preserve CalDAV headers

### 3. SSL/TLS Issues
**Problem**: Certificate validation failures through tunnels
**Solutions**:
- Ensure proper SSL configuration on origin server
- Use Cloudflare's Full (Strict) SSL mode

## Cloudflare Configuration for CalDAV

### Page Rules (Legacy)
Add these page rules for your CalDAV endpoint:
```
URL: your-domain.com/caldav/*
Settings:
- Security Level: Essentially Off
- Cache Level: Bypass
- Disable Apps
- Disable Performance
```

### Transform Rules (Recommended)
Create transform rules to handle CalDAV methods:
```javascript
// Request Header Modification
if (http.request.uri.path matches "^/caldav/.*") {
  set_request_header("DAV", "1, 2, 3, calendar-access");
  set_request_header("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK, REPORT");
}
```

### Workers Script
Use a Cloudflare Worker to proxy CalDAV requests:
```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Only handle CalDAV paths
  if (!url.pathname.startsWith('/caldav/')) {
    return fetch(request)
  }
  
  // Clone request and add CalDAV headers
  const modifiedRequest = new Request(request, {
    headers: {
      ...request.headers,
      'DAV': '1, 2, 3, calendar-access',
      'User-Agent': 'CalDAV-Client/1.0'
    }
  })
  
  return fetch(modifiedRequest)
}
```

## Alternative Solutions

### 1. Direct Connection
Skip Cloudflare for CalDAV by using a subdomain:
```
caldav.yourdomain.com -> Direct to server
app.yourdomain.com -> Through Cloudflare Tunnel
```

### 2. VPN/Tailscale
Use a private network solution:
- Set up Tailscale or WireGuard
- Access CalDAV server directly through VPN
- Keep web interface public through Cloudflare

### 3. CalDAV Proxy
Set up a dedicated CalDAV proxy:
```bash
# Using nginx as CalDAV proxy
location /caldav/ {
    proxy_pass http://internal-caldav-server/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header DAV "1, 2, 3, calendar-access";
}
```

## Testing CalDAV Connection

### 1. Test with curl
```bash
# Test PROPFIND
curl -X PROPFIND \
  -H "Authorization: Basic $(echo -n 'user:pass' | base64)" \
  -H "Content-Type: application/xml" \
  -H "Depth: 1" \
  -d '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>' \
  https://your-caldav-url/

# Test REPORT
curl -X REPORT \
  -H "Authorization: Basic $(echo -n 'user:pass' | base64)" \
  -H "Content-Type: application/xml" \
  -H "Depth: 1" \
  -d '<?xml version="1.0"?><calendar-query xmlns="urn:ietf:params:xml:ns:caldav"><prop xmlns="DAV:"><getetag/></prop><filter><comp-filter name="VCALENDAR"><comp-filter name="VEVENT"/></comp-filter></filter></calendar-query>' \
  https://your-caldav-url/
```

### 2. Check Dashboard Logs
```bash
# View detailed logs
docker-compose logs -f caldav-dashboard

# Check health endpoint
curl http://localhost:3000/api/health
```

### 3. Test Different URLs
Try these URL formats:
```
# Standard CalDAV
https://server.com/caldav/calendars/user/calendar/

# Nextcloud
https://server.com/remote.php/dav/calendars/user/calendar/

# With Cloudflare Tunnel
https://tunnel-id.trycloudflare.com/caldav/calendars/user/calendar/
```

## Environment Variables for Cloudflare

```bash
# Use the tunnel URL
CALDAV_URL=https://your-tunnel.trycloudflare.com/path/to/calendar/

# Or use custom domain
CALDAV_URL=https://caldav.yourdomain.com/path/to/calendar/

# Add debug logging
DEBUG=true
```

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `405 Method Not Allowed` | Cloudflare blocking REPORT/PROPFIND | Configure page rules or use worker |
| `403 Forbidden` | Security rules blocking request | Lower security level for CalDAV path |
| `SSL_ERROR` | Certificate issues | Check SSL configuration |
| `ECONNREFUSED` | Tunnel not running | Verify tunnel status |
| `401 Unauthorized` | Wrong credentials | Check username/password |

## Support

If you're still having issues:
1. Check Cloudflare dashboard for blocked requests
2. Review tunnel logs: `cloudflared tunnel logs`
3. Test direct connection without Cloudflare
4. Consider alternative solutions listed above