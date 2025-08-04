class CalendarDashboard {
    constructor() {
        this.events = [];
        this.timezone = 'Europe/Berlin';
        this.init();
    }

    init() {
        this.initTheme();
        this.bindEvents();
        this.updateClock();
        this.loadEvents();

        // Update clock every second
        this.clockInterval = setInterval(() => {
            this.updateClock();
        }, 1000);

        // Update event display every 15 seconds for real-time duration updates
        this.displayInterval = setInterval(() => {
            if (this.events.length > 0) {
                this.renderEvents();
            }
        }, 15000);

        // Auto-refresh calendar data every 3 minutes for more responsive updates
        this.refreshInterval = setInterval(() => {
            this.loadEvents();
        }, 3 * 60 * 1000);

        // Handle visibility change to pause/resume intervals when tab is not active
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseIntervals();
            } else {
                this.resumeIntervals();
                // Refresh data when tab becomes active again
                this.loadEvents();
            }
        });
    }

    initTheme() {
        // Load saved theme preference
        const savedTheme = localStorage.getItem('calendar-theme') || 'dark';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        const body = document.body;
        const themeToggle = document.getElementById('theme-toggle');
        
        if (theme === 'light') {
            body.classList.add('light-theme');
            if (themeToggle) themeToggle.textContent = '☀️';
        } else {
            body.classList.remove('light-theme');
            if (themeToggle) themeToggle.textContent = '🌙';
        }
        
        localStorage.setItem('calendar-theme', theme);
    }

    toggleTheme() {
        const isLight = document.body.classList.contains('light-theme');
        this.setTheme(isLight ? 'dark' : 'light');
    }

    bindEvents() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadEvents();
            });
        }

        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }
        
        // Mobile pull-to-refresh functionality
        this.setupPullToRefresh();
        
        // Prevent zoom on double tap for iOS
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }
    
    setupPullToRefresh() {
        let startY = 0;
        let currentY = 0;
        let pullDistance = 0;
        let isPulling = false;
        const threshold = 80;
        
        document.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0) {
                startY = e.touches[0].clientY;
                isPulling = true;
            }
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            
            currentY = e.touches[0].clientY;
            pullDistance = currentY - startY;
            
            if (pullDistance > 0 && window.scrollY === 0) {
                // Visual feedback for pull-to-refresh
                const container = document.querySelector('.container');
                const opacity = Math.min(pullDistance / threshold, 1);
                container.style.transform = `translateY(${Math.min(pullDistance * 0.5, 40)}px)`;
                container.style.opacity = 1 - (opacity * 0.1);
                
                if (pullDistance > threshold) {
                    // Show refresh indicator
                    document.body.style.setProperty('--pull-refresh', '1');
                }
            }
        }, { passive: true });
        
        document.addEventListener('touchend', () => {
            if (isPulling && pullDistance > threshold) {
                this.loadEvents();
            }
            
            // Reset visual state
            const container = document.querySelector('.container');
            container.style.transform = '';
            container.style.opacity = '';
            document.body.style.removeProperty('--pull-refresh');
            
            isPulling = false;
            pullDistance = 0;
        }, { passive: true });
    }

    updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('de-DE', {
            timeZone: this.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        document.getElementById('current-time').textContent = timeString;
    }

    async loadEvents() {
        const refreshBtn = document.getElementById('refresh-btn');
        const refreshOverlay = document.getElementById('refresh-overlay');
        
        refreshBtn.classList.add('loading');
        refreshOverlay.classList.add('active');
        this.showLoading();

        try {
            const response = await fetch('/api/events');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.events = await response.json();
            
            // Minimal delay for smooth transition
            await new Promise(resolve => setTimeout(resolve, 400));
            
            this.renderEvents();
        } catch (error) {
            console.error('Error loading events:', error);
            this.showError('Failed to load calendar events. Please check your connection and try again.');
        } finally {
            refreshBtn.classList.remove('loading');
            refreshOverlay.classList.remove('active');
        }
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('error').classList.add('hidden');
        document.getElementById('main-content').classList.add('hidden');
        document.getElementById('no-events').classList.add('hidden');
        document.getElementById('bottom-bar').style.display = 'none';
    }

    showError(message) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('error').textContent = message;
        document.getElementById('main-content').classList.add('hidden');
        document.getElementById('no-events').classList.add('hidden');
        document.getElementById('bottom-bar').style.display = 'none';
    }

    renderEvents() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');

        // Trigger ambient animation pulse when events update
        this.triggerAmbientPulse();

        if (this.events.length === 0) {
            document.getElementById('no-events').classList.remove('hidden');
            document.getElementById('bottom-bar').style.display = 'none';
            return;
        }

        const now = new Date();

        // Find current ongoing event (priority)
        const currentEvent = this.events.find(event => {
            const start = new Date(event.start);
            const end = event.end ? new Date(event.end) : new Date(start.getTime() + 60 * 60 * 1000); // Default 1 hour if no end
            return start <= now && now <= end;
        });

        // Get upcoming events
        const upcomingEvents = this.events.filter(event => new Date(event.start) > now);

        // Prioritize current event, otherwise show next upcoming
        const displayEvent = currentEvent || upcomingEvents[0];

        if (!displayEvent) {
            document.getElementById('no-events').classList.remove('hidden');
            document.getElementById('bottom-bar').style.display = 'none';
            return;
        }

        // Show the main event (current or next)
        this.renderNextEvent(displayEvent, !!currentEvent);
        this.renderBottomBar(upcomingEvents, currentEvent);
    }

    renderNextEvent(event, isCurrent = false) {
        document.getElementById('main-content').classList.remove('hidden');
        document.getElementById('next-title').textContent = event.title;

        const duration = this.getEventDuration(event, isCurrent);
        document.getElementById('next-duration').textContent = duration;

        // Show additional event details
        this.renderEventDetails(event, isCurrent);
    }

    renderEventDetails(event, isCurrent) {
        const eventTimeEl = document.getElementById('event-time');
        const eventLocationEl = document.getElementById('event-location');

        // Show event time
        const timeText = this.formatEventTime(event);
        eventTimeEl.textContent = timeText;

        // Show event location
        if (event.location && event.location.trim()) {
            eventLocationEl.textContent = event.location.trim();
            eventLocationEl.style.display = 'flex';
        } else {
            eventLocationEl.textContent = '';
            eventLocationEl.style.display = 'none';
        }
    }

    renderBottomBar(upcomingEvents, currentEvent) {
        document.getElementById('bottom-bar').style.display = 'flex';

        let nextEvent = null;
        if (currentEvent && upcomingEvents.length > 0) {
            // If showing current event, show next upcoming in bottom bar
            nextEvent = upcomingEvents[0];
            const timeUntil = this.getTimeUntilEvent(nextEvent);
            document.getElementById('upcoming-summary').textContent =
                `Nächste: ${timeUntil}, ${nextEvent.title}`;
        } else if (!currentEvent && upcomingEvents.length > 1) {
            // If showing next event, show the one after that
            nextEvent = upcomingEvents[1];
            const timeUntil = this.getTimeUntilEvent(nextEvent);
            document.getElementById('upcoming-summary').textContent =
                `Nächste: ${timeUntil}, ${nextEvent.title}`;
        } else {
            document.getElementById('upcoming-summary').textContent = '';
        }

        // Show duration of next event
        if (nextEvent && nextEvent.end) {
            const start = new Date(nextEvent.start);
            const end = new Date(nextEvent.end);
            const duration = Math.round((end - start) / (1000 * 60));
            const hours = Math.floor(duration / 60);
            const minutes = duration % 60;

            let durationText = '';
            if (hours > 0) {
                durationText = `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`;
            } else {
                durationText = `${minutes}m`;
            }
            document.getElementById('next-event-duration').textContent = durationText;
        } else {
            document.getElementById('next-event-duration').textContent = '';
        }
    }

    getEventDuration(event, isCurrent = false) {
        const now = new Date();
        const start = new Date(event.start);
        const end = event.end ? new Date(event.end) : null;

        if (!end) {
            return this.getTimeUntilEvent(event);
        }

        const totalDuration = Math.round((end - start) / (1000 * 60)); // minutes
        const hours = Math.floor(totalDuration / 60);
        const minutes = totalDuration % 60;

        if (isCurrent) {
            // For current events, show remaining time
            const remainingMs = end - now;
            const remainingMinutes = Math.round(remainingMs / (1000 * 60));
            const remainingHours = Math.floor(remainingMinutes / 60);
            const remainingMins = remainingMinutes % 60;

            if (remainingMinutes <= 0) {
                return 'endet jetzt';
            } else if (remainingMinutes < 60) {
                return `noch ${remainingMinutes} Min.`;
            } else {
                return `noch ${remainingHours} Std. ${remainingMins > 0 ? remainingMins + ' Min.' : ''}`;
            }
        } else {
            // For future events, show time until + duration
            const timeUntil = this.getTimeUntilEvent(event);

            if (hours > 0) {
                return `${timeUntil} für ${hours} Std. ${minutes > 0 ? minutes + ' Min.' : ''}`;
            } else {
                return `${timeUntil} für ${minutes} Min.`;
            }
        }
    }

    getTimeUntilEvent(event) {
        const now = new Date();
        const start = new Date(event.start);
        const diffMs = start - now;
        const diffMinutes = Math.round(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const remainingMinutes = diffMinutes % 60;

        if (diffMinutes < 60) {
            return `in ${diffMinutes} Min.`;
        } else if (diffHours < 24) {
            return `in ${diffHours} Std. ${remainingMinutes > 0 ? remainingMinutes + ' Min.' : ''}`;
        } else {
            const diffDays = Math.floor(diffHours / 24);
            return `in ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
        }
    }

    formatEventTime(event) {
        const start = new Date(event.start);
        const end = event.end ? new Date(event.end) : null;

        const options = {
            timeZone: this.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };

        let timeString = start.toLocaleTimeString('de-DE', options);

        if (end && end.getTime() !== start.getTime()) {
            // If same day, just show end time
            if (start.toDateString() === end.toDateString()) {
                timeString += ` - ${end.toLocaleTimeString('de-DE', options)}`;
            }
        }

        return timeString;
    }

    pauseIntervals() {
        if (this.clockInterval) clearInterval(this.clockInterval);
        if (this.displayInterval) clearInterval(this.displayInterval);
        if (this.refreshInterval) clearInterval(this.refreshInterval);
    }

    resumeIntervals() {
        this.clockInterval = setInterval(() => {
            this.updateClock();
        }, 1000);

        this.displayInterval = setInterval(() => {
            if (this.events.length > 0) {
                this.renderEvents();
            }
        }, 15000);

        this.refreshInterval = setInterval(() => {
            this.loadEvents();
        }, 3 * 60 * 1000);
    }

    triggerAmbientPulse() {
        // Briefly intensify the ambient animations when events update
        const dots = document.querySelectorAll('.dot');
        const orbs = document.querySelectorAll('.orb');
        
        dots.forEach((dot, index) => {
            dot.style.animationDuration = '2s';
            dot.style.opacity = '0.8';
            setTimeout(() => {
                dot.style.animationDuration = '';
                dot.style.opacity = '';
            }, 2000);
        });
        
        orbs.forEach((orb, index) => {
            orb.style.animationDuration = '5s';
            orb.style.opacity = '0.6';
            setTimeout(() => {
                orb.style.animationDuration = '';
                orb.style.opacity = '';
            }, 3000);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CalendarDashboard();
});