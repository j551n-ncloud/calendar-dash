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

// CalDAV client functions
async function fetchCalendarEvents() {
  try {
    const auth = Buffer.from(`${CALDAV_USER}:${CALDAV_PASSWORD}`).toString('base64');
    
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

    const response = await fetch(CALDAV_URL, {
      method: 'REPORT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1'
      },
      body: propfindBody
    });

    if (!response.ok) {
      throw new Error(`CalDAV request failed: ${response.status} ${response.statusText}`);
    }

    const xmlData = await response.text();
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);
    
    return parseCalendarEvents(result);
  } catch (error) {
    console.error('Error fetching calendar events:', error);
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
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CalDAV Dashboard running on port ${PORT}`);
  console.log(`CalDAV URL: ${CALDAV_URL}`);
});