# CalDAV Calendar Dashboard

A clean, minimal calendar dashboard that connects to CalDAV servers to display your upcoming events. Inspired by spacepad.io, this single-user dashboard provides a beautiful view of your calendar events.

## Features

- 🗓️ Connect to any CalDAV server
- 📅 Clean, responsive dashboard design
- ⏰ Highlights next upcoming event
- 📱 Mobile-friendly interface
- 🔄 Auto-refresh every 5 minutes
- 🐳 Docker-ready deployment

## Quick Start

### Using Docker Compose

1. Clone this repository
2. Update the environment variables in `docker-compose.yml`:
   ```yaml
   environment:
     - CALDAV_URL=https://your-caldav-server.com/path/to/calendar/
     - CALDAV_USER=your_username
     - CALDAV_PASSWORD=your_password
   ```

3. Run the application:
   ```bash
   docker-compose up -d
   ```

4. Open http://localhost:3000 in your browser

### Using Docker

```bash
docker build -t caldav-dashboard .

docker run -d \
  -p 3000:3000 \
  -e CALDAV_URL="https://your-caldav-server.com/path/to/calendar/" \
  -e CALDAV_USER="your_username" \
  -e CALDAV_PASSWORD="your_password" \
  caldav-dashboard
```

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variables:
   ```bash
   export CALDAV_URL="https://your-caldav-server.com/path/to/calendar/"
   export CALDAV_USER="your_username"
   export CALDAV_PASSWORD="your_password"
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CALDAV_URL` | Full URL to your CalDAV calendar | `https://cal.example.com/dav.php/calendars/user/default/` |
| `CALDAV_USER` | CalDAV username | `your_username` |
| `CALDAV_PASSWORD` | CalDAV password | `your_password` |
| `PORT` | Port to run the server on (optional) | `3000` |

## CalDAV Server Compatibility

This dashboard has been tested with:
- Nextcloud Calendar
- Radicale
- Apple Calendar Server
- Google Calendar (CalDAV)

## API Endpoints

- `GET /` - Dashboard interface
- `GET /api/events` - JSON API for calendar events

## Contributing

Feel free to submit issues and pull requests to improve the dashboard.

## License

MIT License