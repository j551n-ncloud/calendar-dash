// Clean Calendar-Style Booking System with Better Error Handling
class CalendarBooking {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = null;
        this.selectedSlot = null;
        this.availableSlots = [];
        this.timeFormat = '24h';

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            // Small delay to ensure all elements are rendered
            setTimeout(() => this.init(), 100);
        }
    }

    init() {
        console.log('Initializing CalendarBooking...');

        // Initialize theme
        this.initTheme();

        // Verify critical elements exist
        const criticalElements = [
            'slotsLoading', 'timeSlots', 'noSlots', 'daysGrid', 'currentMonth'
        ];

        const missingElements = criticalElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0) {
            console.error('Critical elements missing:', missingElements);
            this.showFallbackError();
            return;
        }

        this.setupEventListeners();
        this.renderCalendar();
        this.loadAvailableSlots();
    }

    showFallbackError() {
        const container = document.querySelector('.main-content') || document.body;
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <h2>❌ Booking System Error</h2>
                <p>The booking interface failed to load properly.</p>
                <p>This might be due to a page loading issue.</p>
                <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem;">
                    Refresh Page
                </button>
                <br><br>
                <a href="/" style="color: #007bff; text-decoration: none;">← Back to Calendar</a>
            </div>
        `;
    }

    safeSetStyle(element, property, value) {
        try {
            if (element && element.style && typeof element.style[property] !== 'undefined') {
                element.style[property] = value;
                return true;
            }
        } catch (error) {
            console.warn('Failed to set style:', error);
        }
        return false;
    }

    initTheme() {
        // Load saved theme preference (sync with main dashboard)
        const savedTheme = localStorage.getItem('calendar-theme') || 'light';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        const body = document.body;
        const themeToggle = document.getElementById('theme-toggle');

        if (theme === 'dark') {
            body.classList.add('dark-theme');
            if (themeToggle) themeToggle.textContent = '☀️';
        } else {
            body.classList.remove('dark-theme');
            if (themeToggle) themeToggle.textContent = '🌙';
        }

        localStorage.setItem('calendar-theme', theme);
    }

    toggleTheme() {
        const isDark = document.body.classList.contains('dark-theme');
        this.setTheme(isDark ? 'light' : 'dark');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');

        // Month navigation
        const prevMonth = document.getElementById('prevMonth');
        const nextMonth = document.getElementById('nextMonth');

        if (prevMonth) {
            prevMonth.addEventListener('click', () => {
                this.currentDate.setMonth(this.currentDate.getMonth() - 1);
                this.renderCalendar();
            });
        }

        if (nextMonth) {
            nextMonth.addEventListener('click', () => {
                this.currentDate.setMonth(this.currentDate.getMonth() + 1);
                this.renderCalendar();
            });
        }

        // Time format is fixed to 24h - no toggle needed

        // Form submission
        const bookingForm = document.getElementById('bookingForm');
        if (bookingForm) {
            bookingForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitBooking();
            });
        }

        // Modal controls
        const closeModal = document.getElementById('closeModal');
        if (closeModal) {
            closeModal.addEventListener('click', () => this.closeModal());
        }

        const cancelBooking = document.getElementById('cancelBooking');
        if (cancelBooking) {
            cancelBooking.addEventListener('click', () => this.closeModal());
        }

        // Close modal on backdrop click
        const bookingModal = document.getElementById('bookingModal');
        if (bookingModal) {
            bookingModal.addEventListener('click', (e) => {
                if (e.target.id === 'bookingModal') {
                    this.closeModal();
                }
            });
        }

        // Theme toggle removed - no theme toggle on booking page
    }

    async loadAvailableSlots() {
        console.log('Loading available slots...');

        const slotsLoading = document.getElementById('slotsLoading');
        const timeSlots = document.getElementById('timeSlots');
        const noSlots = document.getElementById('noSlots');

        // Verify elements exist
        if (!slotsLoading || !timeSlots || !noSlots) {
            console.error('Required elements not found for slot loading');
            return;
        }

        try {
            this.safeSetStyle(slotsLoading, 'display', 'block');
            this.safeSetStyle(timeSlots, 'display', 'none');
            this.safeSetStyle(noSlots, 'display', 'none');

            console.log('Fetching slots from API...');
            const response = await fetch('/api/available-slots');
            const data = await response.json();

            console.log('API response:', data);

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load available slots');
            }

            this.availableSlots = data.slots || [];
            console.log(`Loaded ${this.availableSlots.length} slots`);

            this.safeSetStyle(slotsLoading, 'display', 'none');

            if (this.availableSlots.length === 0) {
                this.safeSetStyle(noSlots, 'display', 'block');
            } else {
                this.renderCalendar();
                this.renderTimeSlots();
                this.safeSetStyle(timeSlots, 'display', 'grid');
            }

        } catch (error) {
            console.error('Error loading slots:', error);
            this.safeSetStyle(slotsLoading, 'display', 'none');
            this.safeSetStyle(noSlots, 'display', 'block');

            if (noSlots) {
                noSlots.innerHTML = `
                    <p>❌ Error loading appointment slots</p>
                    <p>${error.message}</p>
                    <button class="btn-primary" onclick="location.reload()">Try Again</button>
                `;
            }
        }
    }

    renderCalendar() {
        console.log('Rendering calendar...');

        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const currentMonth = document.getElementById('currentMonth');
        if (currentMonth) {
            currentMonth.textContent =
                `${monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
        }

        const daysGrid = document.getElementById('daysGrid');
        if (!daysGrid) {
            console.error('daysGrid element not found');
            return;
        }

        daysGrid.innerHTML = '';

        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1));

        for (let i = 0; i < 42; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);

            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            dayElement.textContent = date.getDate();

            if (date.getMonth() !== this.currentDate.getMonth()) {
                dayElement.classList.add('other-month');
            }

            const daySlots = this.getSlotsForDate(date);
            if (daySlots.length > 0) {
                dayElement.classList.add('has-slots');
            }

            if (this.selectedDate && this.isSameDate(date, this.selectedDate)) {
                dayElement.classList.add('selected');
            }

            dayElement.addEventListener('click', () => {
                if (daySlots.length > 0) {
                    this.selectDate(date);
                }
            });

            daysGrid.appendChild(dayElement);
        }

        console.log('Calendar rendered successfully');
    }

    getSlotsForDate(date) {
        return this.availableSlots.filter(slot => {
            const slotDate = new Date(slot.start);
            return this.isSameDate(date, slotDate);
        });
    }

    isSameDate(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate();
    }

    selectDate(date) {
        console.log('Date selected:', date);
        this.selectedDate = date;
        this.renderCalendar();
        this.renderTimeSlots();

        const dateStr = date.toLocaleDateString('en-US', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        const selectedDateElement = document.getElementById('selectedDate');
        if (selectedDateElement) {
            selectedDateElement.textContent = dateStr;
        }
    }

    renderTimeSlots() {
        console.log('Rendering time slots...');

        const timeSlots = document.getElementById('timeSlots');
        if (!timeSlots) {
            console.error('timeSlots element not found');
            return;
        }

        timeSlots.innerHTML = '';

        if (!this.selectedDate) {
            this.safeSetStyle(timeSlots, 'display', 'none');
            return;
        }

        const daySlots = this.getSlotsForDate(this.selectedDate);

        if (daySlots.length === 0) {
            this.safeSetStyle(timeSlots, 'display', 'none');
            return;
        }

        daySlots.forEach(slot => {
            const slotElement = this.createTimeSlotElement(slot);
            timeSlots.appendChild(slotElement);
        });

        this.safeSetStyle(timeSlots, 'display', 'grid');
        console.log(`Rendered ${daySlots.length} time slots`);
    }

    createTimeSlotElement(slot) {
        const element = document.createElement('div');
        element.className = 'time-slot';
        element.dataset.slotId = slot.id;

        const startTime = new Date(slot.start);
        const timeStr = this.formatTime(startTime);

        element.innerHTML = `
            <div class="slot-time">${timeStr}</div>
            <div class="slot-duration">${slot.duration}min</div>
        `;

        element.addEventListener('click', () => {
            this.selectTimeSlot(slot, element);
        });

        return element;
    }

    formatTime(date) {
        if (this.timeFormat === '24h') {
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } else {
            return date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }
    }

    selectTimeSlot(slot, element) {
        console.log('Time slot selected:', slot);

        document.querySelectorAll('.time-slot').forEach(el => {
            el.classList.remove('selected');
        });

        element.classList.add('selected');
        this.selectedSlot = slot;

        const selectedDuration = document.getElementById('selectedDuration');
        if (selectedDuration) {
            selectedDuration.textContent = `${slot.duration} minutes`;
        }

        this.showBookingModal();
    }

    showBookingModal() {
        console.log('Showing booking modal...');

        if (!this.selectedSlot) return;

        const modal = document.getElementById('bookingModal');
        const slotInfo = document.getElementById('selectedSlotInfo');

        if (!modal || !slotInfo) {
            console.error('Modal elements not found');
            return;
        }

        const startDate = new Date(this.selectedSlot.start);
        const endDate = new Date(this.selectedSlot.end);

        const dateStr = startDate.toLocaleDateString('en-US', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        const timeStr = `${this.formatTime(startDate)} - ${this.formatTime(endDate)}`;

        slotInfo.innerHTML = `
            <h4>Selected Appointment</h4>
            <p><strong>Date:</strong> ${dateStr}</p>
            <p><strong>Time:</strong> ${timeStr}</p>
            <p><strong>Duration:</strong> ${this.selectedSlot.duration} minutes</p>
        `;

        this.safeSetStyle(modal, 'display', 'flex');
        this.safeSetStyle(document.body, 'overflow', 'hidden');
    }

    closeModal() {
        const bookingModal = document.getElementById('bookingModal');
        const successModal = document.getElementById('successModal');

        if (bookingModal) this.safeSetStyle(bookingModal, 'display', 'none');
        if (successModal) this.safeSetStyle(successModal, 'display', 'none');

        this.safeSetStyle(document.body, 'overflow', 'auto');

        const bookingForm = document.getElementById('bookingForm');
        if (bookingForm) bookingForm.reset();
    }

    async submitBooking() {
        console.log('Submitting booking...');

        if (!this.selectedSlot) {
            alert('Please select a time slot first');
            return;
        }

        const submitButton = document.getElementById('submitBooking');
        const btnText = submitButton?.querySelector('.btn-text');
        const btnLoading = submitButton?.querySelector('.btn-loading');

        if (!submitButton) {
            console.error('Submit button not found');
            return;
        }

        try {
            submitButton.disabled = true;
            if (btnText) this.safeSetStyle(btnText, 'display', 'none');
            if (btnLoading) this.safeSetStyle(btnLoading, 'display', 'inline');

            const formData = new FormData(document.getElementById('bookingForm'));
            const bookingData = {
                slotId: this.selectedSlot.id,
                clientName: formData.get('clientName'),
                clientEmail: formData.get('clientEmail'),
                clientPhone: formData.get('clientPhone'),
                location: formData.get('appointmentLocation') || this.selectedSlot.location || '',
                notes: formData.get('notes')
            };

            console.log('Booking data:', bookingData);

            const response = await fetch('/api/book-appointment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bookingData)
            });

            const result = await response.json();
            console.log('Booking result:', result);

            if (!response.ok) {
                throw new Error(result.error || 'Failed to book appointment');
            }

            this.showSuccess(result.appointment);

        } catch (error) {
            console.error('Error booking appointment:', error);
            alert(`Error booking appointment: ${error.message}`);

            submitButton.disabled = false;
            if (btnText) this.safeSetStyle(btnText, 'display', 'inline');
            if (btnLoading) this.safeSetStyle(btnLoading, 'display', 'none');
        }
    }

    showSuccess(appointment) {
        console.log('Showing success modal...');

        const bookingModal = document.getElementById('bookingModal');
        const successModal = document.getElementById('successModal');
        const appointmentDetails = document.getElementById('appointmentDetails');

        if (!successModal || !appointmentDetails) {
            console.error('Success modal elements not found');
            return;
        }

        const startDate = new Date(appointment.start);
        const endDate = new Date(appointment.end);

        const dateStr = startDate.toLocaleDateString('en-US', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        const timeStr = `${this.formatTime(startDate)} - ${this.formatTime(endDate)}`;

        appointmentDetails.innerHTML = `
            <h4>Appointment Confirmation</h4>
            <p><strong>Client:</strong> ${appointment.clientName}</p>
            <p><strong>Email:</strong> ${appointment.clientEmail}</p>
            <p><strong>Date:</strong> ${dateStr}</p>
            <p><strong>Time:</strong> ${timeStr}</p>
            ${appointment.location ? `<p><strong>Location:</strong> ${appointment.location}</p>` : ''}
        `;

        if (bookingModal) this.safeSetStyle(bookingModal, 'display', 'none');
        this.safeSetStyle(successModal, 'display', 'flex');
    }
}

// Initialize booking system when page loads
console.log('Booking script loaded');
new CalendarBooking();