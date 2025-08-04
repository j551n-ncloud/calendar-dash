# Cloudflare Tunnels + CalDAV Fixes

## Problem Analysis

### Why Cloudflare Tunnels Failed:
1. **Error 1000**: DNS pointing to prohibited private IP
2. **HTTP Method Blocking**: REPORT/PROPFIND methods blocked
3. **Header Stripping**: CalDAV headers removed by Cloudflare
4. **SSL/TLS Issues**: Certificate validation problems

## Solution 1: Separate Subdomains (RECOMMENDED)

### DNS Configuration:
```
# Cloudflare DNS Settings
A     caldav    192.168.0.202    🔴 DNS Only (Gray Cloud)
CNAME app       tunnel-id.cfargotunnel.com    🟠 Proxied (Orange Cloud)
```

### Benefits:
- CalDAV bypasses Cloudflare completely
- Dashboard still gets Cloudflare protection
- No method/header restrictions
- Direct SSL connection

### Implementation:
```bash
# 1. Update DNS in Cloudflare Dashboard
# 2. Get SSL certificate for caldav subdomain
sudo certbot certonly --standalone -d caldav.j551n.com

# 3. Update .env
CALDAV_URL=https://caldav.j551n.com:8085/dav.php/calendars/j551n/default/
```

## Solution 2: Cloudflare Page Rules

### Configure Page Rules for CalDAV:
```
URL: cal.j551n.com/dav.php/*
Settings:
- Security Level: Essentially Off
- Cache Level: Bypass
- Disable Apps
- Disable Performance
- Browser Integrity Check: Off
```

## Solution 3: Cloudflare Workers Proxy

### Worker Script:
```javascript
addEventListener('fetch', event => {
  event.respondWith(handleCalDAV(event.request))
})

async function handleCalDAV(request) {
  const url = new URL(request.url)
  
  // Only handle CalDAV paths
  if (!url.pathname.startsWith('/dav.php/')) {
    return fetch(request)
  }
  
  // Add CalDAV headers
  const modifiedRequest = new Request(request, {
    headers: {
      ...request.headers,
      'DAV': '1, 2, 3, calendar-access',
      'User-Agent': 'CalDAV-Client/1.0',
      'Accept': 'application/xml, text/xml'
    }
  })
  
  // Proxy to internal server
  const targetUrl = url.toString().replace(url.hostname, '192.168.0.202:8085')
  return fetch(targetUrl, modifiedRequest)
}
```

## Solution 4: Transform Rules (New Cloudflare Feature)

### Request Header Modification:
```javascript
// Condition: URI Path starts with "/dav.php/"
// Action: Set request header
set_request_header("DAV", "1, 2, 3, calendar-access");
set_request_header("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, REPORT");
```

## Solution 5: Internal Network Access (CURRENT)

### Current Working Setup:
```bash
# Container accesses CalDAV server directly via internal network
CALDAV_URL=http://192.168.0.202:8085/dav.php/calendars/j551n/default/

# Dashboard accessible via Cloudflare Tunnel
https://schedule.j551n.com -> Cloudflare Tunnel -> localhost:3002
```

### Benefits:
- ✅ Bypasses all Cloudflare restrictions
- ✅ Direct network connection
- ✅ No SSL/certificate issues
- ✅ Full CalDAV method support

## Troubleshooting Network Issues

### Test Container Network Access:
```bash
# Test if container can reach CalDAV server
docker-compose exec caldav-dashboard ping 192.168.0.202

# Test specific port
docker-compose exec caldav-dashboard nc -zv 192.168.0.202 8085

# Test CalDAV endpoint
docker-compose exec caldav-dashboard curl -I http://192.168.0.202:8085/dav.php/
```

### Docker Network Fixes:
```yaml
# Option 1: Host networking
services:
  caldav-dashboard:
    network_mode: host

# Option 2: Custom network
networks:
  caldav-network:
    driver: bridge
    ipam:
      config:
        - subnet: 192.168.0.0/24
```

## Current Status & Next Steps

### ✅ What's Working:
- Dashboard accessible via Cloudflare Tunnel
- Container can resolve internal hostnames
- CalDAV credentials configured

### ❌ What Needs Fixing:
- Container network access to 192.168.0.202:8085
- Environment variable updates not persisting

### Immediate Fixes:
1. **Test network connectivity**
2. **Use host.docker.internal if CalDAV is on same machine**
3. **Configure Docker networking properly**
4. **Set up separate caldav subdomain for future**