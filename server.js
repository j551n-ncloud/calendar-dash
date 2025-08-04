const express = require('express');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const moment = require('moment');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const CALDAV_URL = process.env.CALDAV_URL;
const CALDAV_USER = process.env.CALDAV_USER;
const CALDAV_PASSWORD = process.env.CALDAV_PASSWORD;

if (!CALDAV_URL || !CALDAV_USER || !CALDAV_PASSWORD) {
  console.error('Missing required environment variables: CALDAV_URL, CALDAV_USER, CALDAV_PASSWORD');
  process.exit(1);
}

app.use(express.static('public'));
app.use(express.json());

// CalDAV client functions with Cloudflare Tunnel support
async function fetchCalendarEvents() {
  try {
    const auth = Buffer.from(`${CALDAV_USER}:${CALDAV_PASSWORD}`).toString('base64');

    // Enhanced headers for Cloudflare Tunnel compatibility
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml; charset=utf-8',
      'Depth': '1',
      'User-Agent': 'CalDAV-Dashboard/1.0',
      'Accept': 'application/xml, text/xml, */*',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      // Cloudflare-specific headers
      'CF-Connecting-IP': '127.0.0.1',
      'X-Forwarded-For': '127.0.0.1',
      'X-Real-IP': '127.0.0.1'
    };

    // PROPFIND request to get calendar data
    const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag />
    <C:calendar-data />
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT" />
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    console.log(`Attempting CalDAV connection to: ${CALDAV_URL}`);
    console.log(`Using user: ${CALDAV_USER}`);

    const response = await fetch(CALDAV_URL, {
      method: 'REPORT',
      headers: headers,
      body: propfindBody,
      timeout: 30000, // 30 second timeout
      // Disable SSL verification for self-signed certificates (if needed)
      // agent: new https.Agent({ rejectUnauthorized: false })
    });

    console.log(`CalDAV response status: ${response.status} ${response.statusText}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`CalDAV error response body:`, errorText);
      throw new Error(`CalDAV request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const xmlData = await response.text();
    console.log(`Received XML data length: ${xmlData.length} characters`);

    if (xmlData.length === 0) {
      throw new Error('Empty response from CalDAV server');
    }

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);

    const events = parseCalendarEvents(result);
    console.log(`Parsed ${events.length} events from CalDAV response`);

    return events;
  } catch (error) {
    console.error('Error fetching calendar events:', error);

    // Try alternative method for Cloudflare Tunnels
    if (error.message.includes('REPORT') || error.message.includes('405')) {
      console.log('REPORT method failed, trying PROPFIND method...');
      return await fetchCalendarEventsAlternative();
    }

    throw error;
  }
}

// Alternative method for Cloudflare Tunnels that don't support REPORT
async function fetchCalendarEventsAlternative() {
  try {
    const auth = Buffer.from(`${CALDAV_USER}:${CALDAV_PASSWORD}`).toString('base64');

    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml; charset=utf-8',
      'Depth': '1',
      'User-Agent': 'CalDAV-Dashboard/1.0',
      'Accept': 'application/xml, text/xml, */*'
    };

    // PROPFIND request to discover calendar resources
    const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag />
    <D:getcontenttype />
    <C:calendar-data />
  </D:prop>
</D:propfind>`;

    console.log('Trying alternative PROPFIND method...');

    const response = await fetch(CALDAV_URL, {
      method: 'PROPFIND',
      headers: headers,
      body: propfindBody,
      timeout: 30000
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Alternative CalDAV error:`, errorText);
      throw new Error(`Alternative CalDAV request failed: ${response.status} ${response.statusText}`);
    }

    const xmlData = await response.text();
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);

    return parseCalendarEvents(result);
  } catch (error) {
    console.error('Alternative CalDAV method also failed:', error);
    throw error;
  }
}

function parseCalendarEvents(xmlResult) {
  const events = [];

  try {
    const responses = xmlResult?.['d:multistatus']?.['d:response'] || [];

    for (const response of responses) {
      const calendarData = response?.['d:propstat']?.[0]?.['d:prop']?.[0]?.['cal:calendar-data']?.[0];

      if (calendarData) {
        const parsedEvents = parseICalData(calendarData);
        events.push(...parsedEvents);
      }
    }
  } catch (error) {
    console.error('Error parsing calendar events:', error);
  }

  return events.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function unescapeICalValue(value) {
  if (!value) return value;

  return value
    .replace(/\\,/g, ',')      // Unescape commas
    .replace(/\\;/g, ';')      // Unescape semicolons
    .replace(/\\n/g, '\n')     // Unescape newlines
    .replace(/\\N/g, '\n')     // Unescape newlines (alternative format)
    .replace(/\\\\/g, '\\')    // Unescape backslashes (must be last)
    .trim();
}

function parseICalData(icalData) {
  const events = [];
  const lines = icalData.split('\n').map(line => line.trim());

  let currentEvent = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      if (currentEvent.summary && currentEvent.dtstart) {
        events.push({
          title: unescapeICalValue(currentEvent.summary),
          start: parseICalDate(currentEvent.dtstart),
          end: currentEvent.dtend ? parseICalDate(currentEvent.dtend) : null,
          location: unescapeICalValue(currentEvent.location) || null,
          description: unescapeICalValue(currentEvent.description) || null
        });
      }
      currentEvent = null;
    } else if (currentEvent && line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':');

      const cleanKey = key.split(';')[0].toLowerCase();

      switch (cleanKey) {
        case 'summary':
          currentEvent.summary = value;
          break;
        case 'dtstart':
          currentEvent.dtstart = value;
          break;
        case 'dtend':
          currentEvent.dtend = value;
          break;
        case 'location':
          currentEvent.location = value;
          break;
        case 'description':
          currentEvent.description = value;
          break;
      }
    }
  }

  return events;
}

function parseICalDate(dateString) {
  // Handle different iCal date formats
  if (dateString.includes('T')) {
    // DateTime format: 20240101T120000Z or 20240101T120000
    const cleanDate = dateString.replace(/[TZ]/g, '');
    return moment(cleanDate, 'YYYYMMDDHHmmss').toDate();
  } else {
    // Date only format: 20240101
    return moment(dateString, 'YYYYMMDD').toDate();
  }
}

// API Routes
app.get('/api/events', async (req, res) => {
  try {
    const events = await fetchCalendarEvents();
    res.json(events);
  } catch (error) {
    console.error('API error:', error);

    // Provide more specific error messages
    let errorMessage = 'Failed to fetch calendar events';
    let statusCode = 500;

    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Cannot connect to CalDAV server. Check your CALDAV_URL.';
      statusCode = 503;
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorMessage = 'Authentication failed. Check your CALDAV_USER and CALDAV_PASSWORD.';
      statusCode = 401;
    } else if (error.message.includes('404')) {
      errorMessage = 'Calendar not found. Check your CALDAV_URL path.';
      statusCode = 404;
    } else if (error.message.includes('405')) {
      errorMessage = 'CalDAV method not allowed. Server may not support CalDAV or is behind a proxy.';
      statusCode = 405;
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Connection timeout. CalDAV server is not responding.';
      statusCode = 408;
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      caldav_url: CALDAV_URL ? 'configured' : 'missing',
      caldav_user: CALDAV_USER ? 'configured' : 'missing',
      caldav_password: CALDAV_PASSWORD ? 'configured' : 'missing'
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CalDAV Dashboard running on port ${PORT}`);
  console.log(`CalDAV URL: ${CALDAV_URL}`);
});