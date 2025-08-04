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

const missingVars = [];
if (!CALDAV_URL) missingVars.push('CALDAV_URL');
if (!CALDAV_USER) missingVars.push('CALDAV_USER');
if (!CALDAV_PASSWORD) missingVars.push('CALDAV_PASSWORD');

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('📝 Please create a .env file with your CalDAV credentials');
  console.error('📖 See .env.example for configuration examples');

  // Don't exit, but set a flag to show helpful error messages
  global.configurationMissing = true;
} else {
  console.log('✅ CalDAV configuration loaded successfully');
  global.configurationMissing = false;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle specific routes before static files
app.get('/booking.html', (req, res) => {
  res.redirect(301, '/booking');
});

app.get('/booking', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});

// Serve static files (but routes above take precedence)
app.use(express.static('public'));

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
  console.log('📅 Parsing iCal date:', dateString);
  
  try {
    // Handle different iCal date formats
    if (dateString.includes('T')) {
      // DateTime format: 20240101T120000Z or 20240101T120000
      const cleanDate = dateString.replace(/[TZ]/g, '');
      const parsedDate = moment(cleanDate, 'YYYYMMDDHHmmss').toDate();
      console.log(`   ✅ Parsed DateTime: ${dateString} -> ${parsedDate.toISOString()} (${parsedDate.toLocaleDateString()} ${parsedDate.toLocaleTimeString()})`);
      return parsedDate;
    } else {
      // Date only format: 20240101
      const parsedDate = moment(dateString, 'YYYYMMDD').toDate();
      console.log(`   ✅ Parsed Date: ${dateString} -> ${parsedDate.toISOString()} (${parsedDate.toLocaleDateString()})`);
      return parsedDate;
    }
  } catch (error) {
    console.error(`❌ Error parsing date ${dateString}:`, error);
    throw new Error(`Invalid date format: ${dateString}`);
  }
}

// Appointment booking functions
function findFreeTimeSlots(events) {
  console.log('🔍 Finding free time slots from events...');
  console.log(`📋 Total events to check: ${events.length}`);
  
  // Look for events with specific naming patterns
  const freeTimeEvents = events.filter(event => {
    const isFreetime = event.title.includes('#freetime') ||
                      event.title.includes('Available for appointments') ||
                      event.title.startsWith('OPEN:');
    
    if (isFreetime) {
      const eventDate = new Date(event.start);
      const dayOfWeek = eventDate.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
      
      console.log(`   ✅ Found freetime event: "${event.title}"`);
      console.log(`      📅 Date: ${eventDate.toLocaleDateString()} (${dayName})`);
      console.log(`      🕐 Time: ${eventDate.toLocaleTimeString()} - ${new Date(event.end).toLocaleTimeString()}`);
      console.log(`      📍 Location: ${event.location || 'None'}`);
      console.log(`      🗓️ Weekend: ${isWeekend ? 'Yes' : 'No'}`);
    }
    
    return isFreetime;
  });

  console.log(`🕐 Found ${freeTimeEvents.length} freetime events`);

  // Convert to available time slots with stable IDs
  const availableSlots = freeTimeEvents.map(event => {
    // Create stable ID based on event properties
    const startTime = new Date(event.start).getTime();
    const endTime = new Date(event.end).getTime();
    const titleHash = event.title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const stableId = `slot_${startTime}_${endTime}_${titleHash}`;

    const eventDate = new Date(event.start);
    const dayOfWeek = eventDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    console.log(`   🎫 Creating slot ID: ${stableId}`);
    console.log(`      📅 Start: ${new Date(event.start).toISOString()}`);
    console.log(`      📅 End: ${new Date(event.end).toISOString()}`);
    console.log(`      🗓️ Weekend: ${isWeekend}`);

    return {
      id: stableId,
      start: event.start,
      end: event.end,
      duration: Math.round((new Date(event.end) - new Date(event.start)) / (1000 * 60)), // minutes
      title: event.title,
      location: event.location,
      originalEvent: event,
      isWeekend: isWeekend
    };
  });

  // Filter out past slots and sort by date
  const now = new Date();
  console.log(`⏰ Current time: ${now.toISOString()}`);
  
  const futureSlots = availableSlots.filter(slot => {
    const slotStart = new Date(slot.start);
    const isFuture = slotStart > now;
    
    if (!isFuture) {
      console.log(`   ⏰ Filtering out past slot: ${slot.title} (${slotStart.toISOString()})`);
    }
    
    return isFuture;
  });

  console.log(`✅ Final available slots: ${futureSlots.length}`);
  futureSlots.forEach(slot => {
    console.log(`   🎫 ${slot.id} - ${new Date(slot.start).toLocaleDateString()} ${new Date(slot.start).toLocaleTimeString()} (Weekend: ${slot.isWeekend})`);
  });

  return futureSlots.sort((a, b) => new Date(a.start) - new Date(b.start));
}

async function createAppointmentEvent(appointmentData) {
  try {
    const auth = Buffer.from(`${CALDAV_USER}:${CALDAV_PASSWORD}`).toString('base64');

    // Generate unique event ID
    const eventId = `appointment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    // Create iCal event data with proper DTSTAMP
    const icalEvent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CalDAV Dashboard//Appointment System//EN
BEGIN:VEVENT
UID:${eventId}@caldav-dashboard
DTSTAMP:${formatICalDate(now)}
DTSTART:${formatICalDate(appointmentData.start)}
DTEND:${formatICalDate(appointmentData.end)}
SUMMARY:${escapeICalValue(appointmentData.summary)}
DESCRIPTION:${escapeICalValue(appointmentData.description)}
LOCATION:${escapeICalValue(appointmentData.location || '')}
CREATED:${formatICalDate(now)}
LAST-MODIFIED:${formatICalDate(now)}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'text/calendar; charset=utf-8',
      'User-Agent': 'CalDAV-Dashboard/1.0'
    };

    // PUT request to create the event
    const eventUrl = `${CALDAV_URL}/${eventId}.ics`;

    console.log(`Attempting to create event at: ${eventUrl}`);
    console.log(`iCal data:`, icalEvent);

    const response = await fetch(eventUrl, {
      method: 'PUT',
      headers: headers,
      body: icalEvent,
      timeout: 30000
    });

    console.log(`CalDAV PUT response: ${response.status} ${response.statusText}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`CalDAV PUT error response:`, errorText);
      throw new Error(`Failed to create appointment: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const responseText = await response.text();
    console.log(`CalDAV PUT response body:`, responseText);
    console.log(`✅ Appointment created successfully: ${eventId}`);
    return { success: true, eventId, eventUrl };

  } catch (error) {
    console.error('Error creating appointment:', error);
    throw error;
  }
}

function formatICalDate(date) {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICalValue(value) {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\')    // Escape backslashes first
    .replace(/,/g, '\\,')      // Escape commas
    .replace(/;/g, '\\;')      // Escape semicolons
    .replace(/\n/g, '\\n')     // Escape newlines
    .replace(/\r/g, '');       // Remove carriage returns
}

async function renameFreeTimeSlot(originalEvent, appointmentData) {
  console.log('🔍 Starting renameFreeTimeSlot process');
  console.log('Original event:', originalEvent);
  
  try {
    const auth = Buffer.from(`${CALDAV_USER}:${CALDAV_PASSWORD}`).toString('base64');

    console.log('🔍 Searching for freetime event in CalDAV...');
    
    // Search for the freetime event in CalDAV
    const searchBody = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag />
    <C:calendar-data />
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:prop-filter name="SUMMARY">
          <C:text-match>${originalEvent.title}</C:text-match>
        </C:prop-filter>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    console.log('📤 Sending REPORT request to:', CALDAV_URL);
    console.log('🔍 Search body:', searchBody);

    const response = await fetch(CALDAV_URL, {
      method: 'REPORT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': '1',
        'User-Agent': 'CalDAV-Dashboard/1.0'
      },
      body: searchBody,
      timeout: 30000
    });

    console.log(`📥 REPORT response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ REPORT request failed:', errorText);
      throw new Error(`Failed to search for freetime event: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const xmlData = await response.text();
    console.log(`📄 Received XML data length: ${xmlData.length} characters`);
    
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);

    // Find the matching freetime event
    const responses = result?.['d:multistatus']?.['d:response'] || [];
    console.log(`📋 Found ${responses.length} events in search results`);

    let eventFound = false;
    
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      const calendarData = resp?.['d:propstat']?.[0]?.['d:prop']?.[0]?.['cal:calendar-data']?.[0];
      const href = resp?.['d:href']?.[0];

      console.log(`🔍 Checking event ${i + 1}/${responses.length}: ${href}`);
      
      if (!calendarData || !href) {
        console.log('⚠️ Missing calendar data or href, skipping');
        continue;
      }

      // Debug: Show the actual calendar data for the problematic event
      if (calendarData.includes(originalEvent.title)) {
        console.log('📄 Raw calendar data for matching event:');
        console.log('--- START CALENDAR DATA ---');
        console.log(calendarData);
        console.log('--- END CALENDAR DATA ---');
      }

      const containsTitle = calendarData.includes(originalEvent.title);
      const containsAppointment = calendarData.includes('Appointment:');
      const isAppointmentHref = href.includes('appointment-');

      console.log(`   - Contains title "${originalEvent.title}": ${containsTitle}`);
      console.log(`   - Contains "Appointment:": ${containsAppointment}`);
      console.log(`   - Href contains "appointment-": ${isAppointmentHref}`);

      if (containsTitle && !containsAppointment && !isAppointmentHref) {
        console.log('✅ Found matching freetime event!');
        eventFound = true;
        
        // Parse the existing event to get its UID and other properties
        const lines = calendarData.split('\n').map(line => line.trim());
        let uid = '';
        let dtstart = '';
        let dtend = '';
        let location = '';
        let description = '';
        let inVEvent = false;
        
        for (const line of lines) {
          // Track if we're inside a VEVENT section (not VTIMEZONE)
          if (line === 'BEGIN:VEVENT') {
            inVEvent = true;
            continue;
          }
          if (line === 'END:VEVENT') {
            inVEvent = false;
            continue;
          }
          
          // Only parse properties when we're inside VEVENT
          if (inVEvent) {
            if (line.startsWith('UID:')) {
              uid = line.substring(4);
            }
            if (line.startsWith('DTSTART')) {
              const colonIndex = line.indexOf(':');
              if (colonIndex > -1) {
                dtstart = line.substring(colonIndex + 1);
              }
            }
            if (line.startsWith('DTEND')) {
              const colonIndex = line.indexOf(':');
              if (colonIndex > -1) {
                dtend = line.substring(colonIndex + 1);
              }
            }
            if (line.startsWith('LOCATION:')) {
              location = line.substring(9);
            }
            if (line.startsWith('DESCRIPTION:')) {
              description = line.substring(12);
            }
          }
        }

        console.log('📋 Parsed event details:', { uid, dtstart, dtend, location, description });

        if (!uid) {
          console.error('❌ Missing UID');
          continue;
        }
        
        if (!dtstart || !dtend) {
          console.error('❌ Missing DTSTART or DTEND:', { dtstart, dtend });
          console.log('📄 Full calendar data for debugging:');
          console.log(calendarData);
          continue;
        }

        // Validate the date format
        if (dtstart.length < 8 || dtend.length < 8) {
          console.error('❌ Invalid date format:', { dtstart, dtend });
          continue;
        }

        // Create updated iCal event with appointment details
        const now = new Date();
        
        // Ensure DTSTART and DTEND are properly formatted
        let formattedDtstart = dtstart;
        let formattedDtend = dtend;
        
        // If the dates don't contain 'T', they might be date-only, so we need to preserve the format
        if (!dtstart.includes('T') && dtstart.length === 8) {
          // Date-only format, keep as is
          formattedDtstart = dtstart;
        } else if (dtstart.includes('T')) {
          // DateTime format, ensure it's properly formatted
          formattedDtstart = dtstart.replace(/[^0-9TZ]/g, '');
        }
        
        if (!dtend.includes('T') && dtend.length === 8) {
          // Date-only format, keep as is
          formattedDtend = dtend;
        } else if (dtend.includes('T')) {
          // DateTime format, ensure it's properly formatted
          formattedDtend = dtend.replace(/[^0-9TZ]/g, '');
        }
        
        console.log('📅 Formatted dates:', { 
          original: { dtstart, dtend }, 
          formatted: { formattedDtstart, formattedDtend } 
        });
        
        const updatedEvent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CalDAV Dashboard//Appointment System//EN
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatICalDate(now)}
DTSTART:${formattedDtstart}
DTEND:${formattedDtend}
SUMMARY:${escapeICalValue(appointmentData.summary)}
DESCRIPTION:${escapeICalValue(appointmentData.description)}
LOCATION:${escapeICalValue(appointmentData.location)}
CREATED:${formatICalDate(now)}
LAST-MODIFIED:${formatICalDate(now)}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

        // Extract the event filename from href
        const eventFilename = href.split('/').pop();
        const updateUrl = `${CALDAV_URL}${eventFilename}`;

        console.log(`🔄 Attempting to update event: ${updateUrl}`);
        console.log('📝 Updated event data:', updatedEvent);

        const updateResponse = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'text/calendar; charset=utf-8',
            'User-Agent': 'CalDAV-Dashboard/1.0'
          },
          body: updatedEvent,
          timeout: 30000
        });

        console.log(`📥 PUT response: ${updateResponse.status} ${updateResponse.statusText}`);

        if (updateResponse.ok) {
          const responseText = await updateResponse.text();
          console.log(`✅ Successfully renamed freetime event: ${eventFilename}`);
          console.log('📥 PUT response body:', responseText);
          return { success: true, updatedUrl: updateUrl, eventId: uid };
        } else {
          const errorText = await updateResponse.text();
          console.error(`❌ Failed to rename event ${eventFilename}: ${updateResponse.status} ${updateResponse.statusText}`);
          console.error('Error response body:', errorText);
          throw new Error(`Failed to update event: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`);
        }
      }
    }

    if (!eventFound) {
      console.error('❌ No matching freetime event found');
      console.log('Available events in search results:');
      responses.forEach((resp, i) => {
        const href = resp?.['d:href']?.[0];
        const calendarData = resp?.['d:propstat']?.[0]?.['d:prop']?.[0]?.['cal:calendar-data']?.[0];
        if (calendarData) {
          const summaryMatch = calendarData.match(/SUMMARY:([^\r\n]+)/);
          const summary = summaryMatch ? summaryMatch[1] : 'No summary';
          console.log(`  ${i + 1}. ${href} - ${summary}`);
        }
      });
      throw new Error(`Could not find matching freetime event with title: "${originalEvent.title}"`);
    }

  } catch (error) {
    console.error('❌ Error in renameFreeTimeSlot:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// API Routes
app.get('/api/events', async (req, res) => {
  // Check if configuration is missing
  if (global.configurationMissing) {
    return res.status(500).json({
      error: 'CalDAV configuration missing',
      details: 'Please create a .env file with CALDAV_URL, CALDAV_USER, and CALDAV_PASSWORD',
      help: 'See .env.example for configuration examples',
      timestamp: new Date().toISOString()
    });
  }

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

// Appointment booking API endpoints
app.get('/api/available-slots', async (req, res) => {
  if (global.configurationMissing) {
    return res.status(500).json({
      error: 'CalDAV configuration missing',
      details: 'Please create a .env file with CALDAV_URL, CALDAV_USER, and CALDAV_PASSWORD'
    });
  }

  try {
    const events = await fetchCalendarEvents();
    const availableSlots = findFreeTimeSlots(events);

    res.json({
      success: true,
      slots: availableSlots,
      count: availableSlots.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({
      error: 'Failed to fetch available appointment slots',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/book-appointment', async (req, res) => {
  console.log('📅 Booking appointment request received');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  if (global.configurationMissing) {
    console.error('❌ CalDAV configuration missing');
    return res.status(500).json({
      error: 'CalDAV configuration missing',
      details: 'Please create a .env file with CALDAV_URL, CALDAV_USER, and CALDAV_PASSWORD'
    });
  }

  try {
    const { slotId, clientName, clientEmail, clientPhone, location, notes } = req.body;

    // Validate required fields
    if (!slotId || !clientName || !clientEmail) {
      console.error('❌ Missing required fields:', { slotId: !!slotId, clientName: !!clientName, clientEmail: !!clientEmail });
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'slotId, clientName, and clientEmail are required'
      });
    }

    console.log('✅ Required fields validated');
    console.log('📋 Fetching calendar events...');

    // Get current available slots to find the selected one
    const events = await fetchCalendarEvents();
    console.log(`📅 Found ${events.length} total events`);
    
    const availableSlots = findFreeTimeSlots(events);
    console.log(`🕐 Found ${availableSlots.length} available slots`);
    
    const selectedSlot = availableSlots.find(slot => slot.id === slotId);

    console.log('🔍 Looking for slot ID:', slotId);
    console.log('📋 Available slot IDs:', availableSlots.map(s => s.id));
    
    // Check if this is a weekend slot issue
    const weekendSlots = availableSlots.filter(s => s.isWeekend);
    const weekdaySlots = availableSlots.filter(s => !s.isWeekend);
    console.log(`🗓️ Weekend slots: ${weekendSlots.length}, Weekday slots: ${weekdaySlots.length}`);
    
    if (slotId.includes('slot_') && !availableSlots.find(s => s.id === slotId)) {
      console.log('❌ Slot ID not found in available slots');
      console.log('🔍 Debugging slot ID components:');
      
      // Try to extract timestamp from slot ID
      const slotIdParts = slotId.split('_');
      if (slotIdParts.length >= 3) {
        const startTimestamp = parseInt(slotIdParts[1]);
        const endTimestamp = parseInt(slotIdParts[2]);
        
        if (!isNaN(startTimestamp) && !isNaN(endTimestamp)) {
          const slotStartDate = new Date(startTimestamp);
          const slotEndDate = new Date(endTimestamp);
          const slotDayOfWeek = slotStartDate.getDay();
          const isSlotWeekend = slotDayOfWeek === 0 || slotDayOfWeek === 6;
          
          console.log(`   📅 Requested slot date: ${slotStartDate.toLocaleDateString()} (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][slotDayOfWeek]})`);
          console.log(`   🕐 Requested slot time: ${slotStartDate.toLocaleTimeString()} - ${slotEndDate.toLocaleTimeString()}`);
          console.log(`   🗓️ Is weekend: ${isSlotWeekend}`);
          
          // Check if there's a similar slot with different ID
          const similarSlots = availableSlots.filter(s => {
            const timeDiff = Math.abs(new Date(s.start).getTime() - startTimestamp);
            return timeDiff < 60000; // Within 1 minute
          });
          
          if (similarSlots.length > 0) {
            console.log('🔍 Found similar slots with different IDs:');
            similarSlots.forEach(s => {
              console.log(`   - ${s.id} (${new Date(s.start).toLocaleString()})`);
            });
          }
        }
      }
    }

    if (!selectedSlot) {
      console.error('❌ Selected slot not found');
      return res.status(404).json({
        error: 'Appointment slot not found or no longer available',
        details: `The selected time slot (${slotId}) may have been booked by someone else or is no longer available`,
        availableSlots: availableSlots.map(s => ({ id: s.id, start: s.start, end: s.end }))
      });
    }

    console.log('✅ Selected slot found:', {
      id: selectedSlot.id,
      start: selectedSlot.start,
      end: selectedSlot.end,
      title: selectedSlot.title
    });

    // Create appointment data
    const appointmentData = {
      start: selectedSlot.start,
      end: selectedSlot.end,
      summary: `Appointment: ${clientName}`,
      description: `Client: ${clientName}
Email: ${clientEmail}
Phone: ${clientPhone || 'Not provided'}
Notes: ${notes || 'None'}

Original slot: ${selectedSlot.title}`,
      location: selectedSlot.location || location || 'Office' // or whatever default you prefer
    };

    console.log('📝 Appointment data prepared:', appointmentData);

    // Rename the original freetime slot to show it's booked (instead of creating a separate appointment)
    try {
      console.log('🔄 Attempting to rename freetime slot...');
      const result = await renameFreeTimeSlot(selectedSlot.originalEvent, appointmentData);
      console.log(`✅ Successfully renamed freetime slot: ${selectedSlot.title}`);
      
      const response = {
        success: true,
        message: 'Appointment booked successfully',
        appointment: {
          eventId: result.eventId || 'renamed-freetime-slot',
          start: selectedSlot.start,
          end: selectedSlot.end,
          clientName,
          clientEmail,
          location: appointmentData.location
        },
        timestamp: new Date().toISOString()
      };
      
      console.log('📤 Sending success response:', response);
      res.json(response);
      
    } catch (renameError) {
      console.error(`❌ Failed to rename freetime slot:`, renameError);
      console.error('Stack trace:', renameError.stack);
      
      const errorResponse = {
        error: 'Failed to book appointment',
        details: renameError.message,
        timestamp: new Date().toISOString(),
        debugInfo: {
          slotId,
          originalEventTitle: selectedSlot.originalEvent?.title,
          errorType: renameError.constructor.name
        }
      };
      
      console.log('📤 Sending error response:', errorResponse);
      res.status(500).json(errorResponse);
    }

  } catch (error) {
    console.error('❌ Unexpected error in booking appointment:', error);
    console.error('Stack trace:', error.stack);
    
    const errorResponse = {
      error: 'Failed to book appointment',
      details: error.message,
      timestamp: new Date().toISOString(),
      debugInfo: {
        errorType: error.constructor.name,
        requestBody: req.body
      }
    };
    
    console.log('📤 Sending unexpected error response:', errorResponse);
    res.status(500).json(errorResponse);
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

app.get('/booking', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});
app.get('/booking.html', (req, res) => {
  res.redirect(301, '/booking');
});

app.listen(PORT, () => {
  console.log(`CalDAV Dashboard running on port ${PORT}`);
  console.log(`CalDAV URL: ${CALDAV_URL}`);
});