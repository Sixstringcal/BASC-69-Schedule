// API Configuration
const API_URL = 'https://api.worldcubeassociation.org/competitions/SCUIIIFMCTripleScoop2026/wcif/public';

// Event name mapping
const EVENT_NAMES = {
    '222': '2x2x2 Cube',
    '333': '3x3x3 Cube',
    '444': '4x4x4 Cube',
    '555': '5x5x5 Cube',
    '666': '6x6x6 Cube',
    '777': '7x7x7 Cube',
    '333bf': '3x3x3 Blindfolded',
    '333fm': '3x3x3 Fewest Moves',
    '333oh': '3x3x3 One-Handed',
    'clock': 'Clock',
    'minx': 'Megaminx',
    'pyram': 'Pyraminx',
    'skewb': 'Skewb',
    'sq1': 'Square-1',
    '444bf': '4x4x4 Blindfolded',
    '555bf': '5x5x5 Blindfolded',
    '333mbf': '3x3x3 Multi-Blind'
};

const EVENT_ICONS = {
    '222': '',
    '333': '',
    '444': '',
    '555': '',
    '666': '',
    '777': '',
    '333bf': '',
    '333fm': '',
    '333oh': '',
    'clock': '',
    'minx': '',
    'pyram': '',
    'skewb': '',
    'sq1': '',
    '444bf': '',
    '555bf': '',
    '333mbf': ''
};

// Global data storage
let wcifData = null;
let customInfo = null;
let selectedDay = 0;
let visibleRooms = new Set();

// Initialize the application
async function init() {
    try {
        wcifData = await fetchWCIFData();
        customInfo = await fetchCustomInfo();
        renderCompetitionInfo();
        renderInfoCards();
        renderDayTabs();
        renderRoomLegend();
        renderSchedule(selectedDay);
        setupModal();
        hideLoading();
    } catch (error) {
        console.error('Error initializing:', error);
        showError('Failed to load competition data. Please try again later.');
    }
}

// Fetch WCIF data from API
async function fetchWCIFData() {
    const response = await fetch(API_URL);
    if (!response.ok) {
        throw new Error('Failed to fetch competition data');
    }
    return await response.json();
}

// Fetch custom info from JSON file
async function fetchCustomInfo() {
    try {
        console.log('Attempting to fetch custom-info.json...');
        const response = await fetch('custom-info.json');
        if (!response.ok) {
            console.warn('Custom info file not found, using defaults');
            return { activityInfo: {}, globalSettings: {} };
        }
        const data = await response.json();
        console.log('Custom info loaded successfully:', data);
        return data;
    } catch (error) {
        console.warn('Error loading custom info:', error);
        return { activityInfo: {}, globalSettings: {} };
    }
}

// Hide loading screen
function hideLoading() {
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
}

// Show error message
function showError(message) {
    const loading = document.getElementById('loading');
    loading.innerHTML = `
        <div style="text-align: center; color: var(--accent-color);">
            <h2>❌ Error</h2>
            <p>${message}</p>
        </div>
    `;
}

// Render competition information in header
function renderCompetitionInfo() {
    document.getElementById('compTitle').textContent = wcifData.name;
    
    const dates = formatDateRange(wcifData.schedule.startDate, wcifData.schedule.numberOfDays);
    document.getElementById('compDates').textContent = dates;
    
    const venue = wcifData.schedule.venues[0];
    document.getElementById('compVenue').textContent = `${venue.name}`;
}

// Render info cards
function renderInfoCards() {
    const dates = formatDateRange(wcifData.schedule.startDate, wcifData.schedule.numberOfDays);
    document.getElementById('dateInfo').textContent = dates;
    
    const venue = wcifData.schedule.venues[0];
    document.getElementById('venueInfo').textContent = venue.name;
}

// Render day tabs
function renderDayTabs() {
    const dayTabs = document.getElementById('dayTabs');
    const startDate = new Date(wcifData.schedule.startDate + 'T00:00:00Z');
    
    for (let i = 0; i < wcifData.schedule.numberOfDays; i++) {
        const date = new Date(startDate);
        date.setUTCDate(date.getUTCDate() + i);
        
        const tab = document.createElement('button');
        tab.className = `day-tab ${i === selectedDay ? 'active' : ''}`;
        tab.textContent = `Day ${i + 1} - ${date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            timeZone: 'UTC'
        })}`;
        tab.addEventListener('click', () => selectDay(i));
        dayTabs.appendChild(tab);
    }
}

// Select a day
function selectDay(dayIndex) {
    selectedDay = dayIndex;
    
    // Update tab styles
    const tabs = document.querySelectorAll('.day-tab');
    tabs.forEach((tab, index) => {
        tab.classList.toggle('active', index === dayIndex);
    });
    
    // Re-render schedule
    renderSchedule(dayIndex);
}

// Render room legend
function renderRoomLegend() {
    const roomLegend = document.getElementById('roomLegend');
    const venue = wcifData.schedule.venues[0];
    
    venue.rooms.forEach(room => visibleRooms.add(room.id));
    
    venue.rooms.forEach(room => {
        const badge = document.createElement('div');
        badge.className = 'room-badge active';
        badge.dataset.roomId = room.id;
        badge.innerHTML = `
            <div class="room-color" style="background-color: ${room.color};"></div>
            <span>${room.name}</span>
        `;
        
        badge.addEventListener('click', () => {
            if (visibleRooms.has(room.id)) {
                visibleRooms.delete(room.id);
                badge.classList.remove('active');
            } else {
                visibleRooms.add(room.id);
                badge.classList.add('active');
            }
            renderSchedule(selectedDay);
        });
        
        roomLegend.appendChild(badge);
    });
}

// Render schedule for selected day (TV Guide Style)
function renderSchedule(dayIndex) {
    const scheduleGrid = document.getElementById('scheduleGrid');
    scheduleGrid.innerHTML = '';
    
    const venue = wcifData.schedule.venues[0];
    const timezone = venue.timezone;
    
    // Calculate the target date for this day index in UTC to avoid local timezone shifting
    const startDate = new Date(wcifData.schedule.startDate + 'T00:00:00Z');
    const targetDate = new Date(startDate);
    targetDate.setUTCDate(targetDate.getUTCDate() + dayIndex);
    const targetDateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Collect all activities for this day, grouped by room (only visible rooms)
    const roomActivities = {};
    let earliestTime = null;
    let latestTime = null;
    
    venue.rooms.forEach(room => {
        if (!visibleRooms.has(room.id)) return;
        const dayActivities = room.activities.filter(activity => {
            const activityStart = new Date(activity.startTime);
            
            // Get the date of this activity in the venue's local timezone
            const activityDateStr = activityStart.toLocaleDateString('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }); // Returns YYYY-MM-DD format
            
            return activityDateStr === targetDateStr;
        });
        
        if (dayActivities.length > 0) {
            roomActivities[room.id] = {
                room: room,
                activities: dayActivities
            };
            
            // Track earliest and latest times
            dayActivities.forEach(activity => {
                const start = new Date(activity.startTime);
                const end = new Date(activity.endTime);
                if (!earliestTime || start < earliestTime) earliestTime = start;
                if (!latestTime || end > latestTime) latestTime = end;
            });
        }
    });
    
    if (Object.keys(roomActivities).length === 0) {
        scheduleGrid.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-light);">No activities scheduled for this day.</p>';
        return;
    }
    
    // Create 30-minute time slots
    const timeSlots = [];
    const slotDuration = 30 * 60 * 1000; // 30 minutes in milliseconds
    const slotHeight = 80; // pixels per 30-minute slot
    
    // Round down to nearest 30 minutes
    const startTime = new Date(earliestTime);
    startTime.setMinutes(Math.floor(startTime.getMinutes() / 30) * 30, 0, 0);
    
    // Round up to nearest 30 minutes
    const endTime = new Date(latestTime);
    endTime.setMinutes(Math.ceil(endTime.getMinutes() / 30) * 30, 0, 0);
    
    let currentTime = new Date(startTime);
    while (currentTime <= endTime) {
        timeSlots.push(new Date(currentTime));
        currentTime = new Date(currentTime.getTime() + slotDuration);
    }
    
    // Create TV guide container
    const tvGuide = document.createElement('div');
    tvGuide.className = 'tv-guide-container fade-in';
    
    // Create time column
    const timeColumn = document.createElement('div');
    timeColumn.className = 'time-column';
    
    const timeHeader = document.createElement('div');
    timeHeader.className = 'time-column-header';
    timeHeader.textContent = 'Time';
    timeColumn.appendChild(timeHeader);
    
    timeSlots.forEach(time => {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        timeSlot.textContent = formatTime(time);
        timeColumn.appendChild(timeSlot);
    });
    
    tvGuide.appendChild(timeColumn);
    
    // Create rooms container
    const roomsContainer = document.createElement('div');
    roomsContainer.className = 'rooms-container';
    
    // Create a column for each room
    Object.values(roomActivities).forEach(({room, activities}) => {
        const roomColumn = document.createElement('div');
        roomColumn.className = 'room-column';
        
        // Room header
        const roomHeader = document.createElement('div');
        roomHeader.className = 'room-header';
        roomHeader.innerHTML = `
            <div class="room-header-color" style="background-color: ${room.color};"></div>
            <span>${room.name}</span>
        `;
        roomColumn.appendChild(roomHeader);
        
        // Room content with time grid and activities
        const roomContent = document.createElement('div');
        roomContent.className = 'room-content';
        roomContent.style.height = `${timeSlots.length * slotHeight}px`;
        
        // Add time grid lines
        const timeGrid = document.createElement('div');
        timeGrid.className = 'time-grid';
        timeSlots.forEach(() => {
            const line = document.createElement('div');
            line.className = 'time-grid-line';
            timeGrid.appendChild(line);
        });
        roomContent.appendChild(timeGrid);
        
        // Position activities
        activities.forEach(activity => {
            const actStart = new Date(activity.startTime);
            const actEnd = new Date(activity.endTime);
            
            // Calculate position and height
            const offsetMinutes = (actStart - startTime) / (1000 * 60);
            const durationMinutes = (actEnd - actStart) / (1000 * 60);
            
            const top = (offsetMinutes / 30) * slotHeight;
            const height = (durationMinutes / 30) * slotHeight;
            
            const activityBlock = document.createElement('div');
            activityBlock.className = 'activity-block';
            
            // Add class for short events (less than 45 minutes)
            if (durationMinutes < 45) {
                activityBlock.classList.add('short-event');
            }
            
            activityBlock.style.top = `${top}px`;
            activityBlock.style.height = `${height - 2}px`;
            activityBlock.style.borderLeftColor = room.color;
            
            const activityName = formatActivityName(activity.name, activity.activityCode);
            const timeRange = `${formatTime(actStart)} - ${formatTime(actEnd)}`;
            const showInfoBtn = hasRelevantInfo(activityName, activity.activityCode);
            
            activityBlock.innerHTML = `
                <div class="activity-name">${activityName}</div>
                <div class="activity-time">${timeRange}</div>
                ${showInfoBtn ? '<button class="info-btn" title="View round details">ⓘ</button>' : ''}
            `;
            
            // Add info button handler
            if (showInfoBtn) {
                const infoBtn = activityBlock.querySelector('.info-btn');
                infoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showActivityInfo(activityName, activity.activityCode);
                });
            }
            
            // Add click/tap to expand for mobile and short events
            activityBlock.addEventListener('click', (e) => {
                e.stopPropagation();
                activityBlock.classList.toggle('expanded');
            });
            
            roomContent.appendChild(activityBlock);
        });
        
        roomColumn.appendChild(roomContent);
        roomsContainer.appendChild(roomColumn);
    });
    
    tvGuide.appendChild(roomsContainer);
    scheduleGrid.appendChild(tvGuide);
    
    // Close expanded blocks when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.activity-block.expanded').forEach(block => {
            block.classList.remove('expanded');
        });
    });
}

// Render events and rounds - REMOVED: Now shown in modal via info button

// Setup modal functionality
function setupModal() {
    const modal = document.getElementById('infoModal');
    const overlay = document.getElementById('modalOverlay');
    const closeBtn = document.getElementById('modalClose');
    
    const closeModal = () => {
        modal.classList.remove('show');
    };
    
    overlay.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            closeModal();
        }
    });
}

// Show info modal for activity
function showActivityInfo(activityName, activityCode) {
    const modal = document.getElementById('infoModal');
    const modalBody = document.getElementById('modalBody');
    
    const customData = getCustomInfoByName(activityName) || {};
    const roundInfo = getRoundInfo(activityCode);
    
    // Determine title and icon
    let title = activityName;
    let icon = customData.icon;
    let subtitle = '';
    
    if (roundInfo && !icon) {
        icon = EVENT_ICONS[roundInfo.eventId] || '';
    } else if (!icon) {
        icon = '';
    }
    
    let infoHTML = `
        <div class="modal-event-header">
            <div class="modal-event-icon">${icon}</div>
            <div>
                <h3>${title}</h3>
                ${subtitle ? `<p class="modal-round-name">${subtitle}</p>` : ''}
            </div>
        </div>
        <div class="modal-info-list">
    `;
    
    // Description
    if (customData.description) {
        infoHTML += `
            <div class="modal-info-item modal-description">
                <span class="modal-info-value">${customData.description}</span>
            </div>
        `;
    }
    
    // Format (custom or WCIF)
    const format = customData.customFormat || (roundInfo?.format ? formatRoundFormat(roundInfo.format) : null);
    if (format) {
        infoHTML += `
            <div class="modal-info-item">
                <span class="modal-info-label">Format:</span>
                <span class="modal-info-value">${format}</span>
            </div>
        `;
    }
    
    // Time Limit (custom or WCIF)
    const timeLimit = customData.customTimeLimit || (roundInfo?.timeLimit ? formatTimeLimit(roundInfo.timeLimit.centiseconds) : null);
    if (timeLimit) {
        infoHTML += `
            <div class="modal-info-item">
                <span class="modal-info-label">Time Limit:</span>
                <span class="modal-info-value">${timeLimit}</span>
            </div>
        `;
    }
    
    // Cutoff (custom or WCIF)
    const cutoff = customData.customCutoff || (roundInfo?.cutoff ? 
        `${formatTimeLimit(roundInfo.cutoff.attemptResult)} (${roundInfo.cutoff.numberOfAttempts} attempt${roundInfo.cutoff.numberOfAttempts > 1 ? 's' : ''})` : null);
    if (cutoff) {
        infoHTML += `
            <div class="modal-info-item">
                <span class="modal-info-label">Cutoff:</span>
                <span class="modal-info-value">${cutoff}</span>
            </div>
        `;
    }
    
    // Advancement (custom or WCIF)
    let advancement = customData.advancement;
    if (!advancement && roundInfo?.advancementCondition) {
        const condition = roundInfo.advancementCondition;
        if (condition.type === 'ranking') {
            advancement = `Top ${condition.level} competitors`;
        } else if (condition.type === 'percent') {
            advancement = `Top ${condition.level}%`;
        } else if (condition.type === 'attemptResult') {
            advancement = `Result better than ${formatTimeLimit(condition.level)}`;
        }
    }
    if (advancement) {
        infoHTML += `
            <div class="modal-info-item">
                <span class="modal-info-label">Advancement:</span>
                <span class="modal-info-value">${advancement}</span>
            </div>
        `;
    }
    
    // Notes
    if (customData.notes) {
        infoHTML += `
            <div class="modal-info-item modal-notes">
                <span class="modal-info-label">⚠️ Note:</span>
                <span class="modal-info-value">${customData.notes}</span>
            </div>
        `;
    }
    
    // Extra custom fields
    if (customData.extraInfo) {
        for (const [key, value] of Object.entries(customData.extraInfo)) {
            infoHTML += `
                <div class="modal-info-item">
                    <span class="modal-info-label">${key}:</span>
                    <span class="modal-info-value">${value}</span>
                </div>
            `;
        }
    }
    
    infoHTML += '</div>';
    
    modalBody.innerHTML = infoHTML;
    modal.classList.add('show');
}

// Get round info from activity code
function getRoundInfo(activityCode) {
    if (!activityCode || !activityCode.includes('-r')) {
        return null;
    }
    
    const parts = activityCode.split('-');
    const eventId = parts[0];
    const roundNumber = parseInt(parts[1].substring(1));
    
    const event = wcifData.events.find(e => e.id === eventId);
    if (!event) return null;
    
    const round = event.rounds[roundNumber - 1];
    if (!round) return null;
    
    return {
        eventId,
        roundNumber,
        ...round
    };
}

// Check if activity has relevant info to display
function hasRelevantInfo(activityName, activityCode) {
    // Check if there's custom info for this activity name
    if (customInfo?.activityInfo) {
        const customData = getCustomInfoByName(activityName);
        if (customData) return true;
    }
    
    // Check if it's hidden globally
    if (customInfo?.globalSettings?.hideInfoForActivityNames?.includes(activityName)) {
        return false;
    }
    
    // Check if there's WCIF round info
    const roundInfo = getRoundInfo(activityCode);
    if (!roundInfo) return false;
    
    return roundInfo.timeLimit || roundInfo.cutoff || roundInfo.advancementCondition;
}

// Get custom info by activity name (case-insensitive)
function getCustomInfoByName(activityName) {
    if (!customInfo?.activityInfo) {
        console.log('No customInfo.activityInfo available');
        return null;
    }
    
    // Try exact match first
    if (customInfo.activityInfo[activityName]) {
        console.log('Found exact match for:', activityName);
        return customInfo.activityInfo[activityName];
    }
    
    // Try case-insensitive match
    const lowerName = activityName.toLowerCase();
    for (const [key, value] of Object.entries(customInfo.activityInfo)) {
        if (key.toLowerCase() === lowerName) {
            console.log('Found case-insensitive match:', key, 'for', activityName);
            return value;
        }
    }
    
    console.log('No match found for:', activityName, 'Available keys:', Object.keys(customInfo.activityInfo));
    return null;
}

// Utility functions
function formatDateRange(startDate, numberOfDays) {
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + numberOfDays - 1);
    
    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} - ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

function formatTimeRange(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
}

function formatActivityName(name, code) {
    // If it's a standard event round, use the event name
    if (code.includes('-r')) {
        const eventId = code.split('-')[0];
        const eventName = EVENT_NAMES[eventId];
        if (eventName) {
            return name.replace(eventId, eventName);
        }
    }
    return name;
}

function formatRoundFormat(format) {
    const formats = {
        'a': 'Average of 5',
        'm': 'Mean of 3',
        '1': 'Best of 1',
        '2': 'Best of 2',
        '3': 'Best of 3',
        '5': 'Best of 5'
    };
    return formats[format] || format;
}

function formatTimeLimit(centiseconds) {
    if (!centiseconds) return 'No limit';
    
    const totalSeconds = Math.floor(centiseconds / 100);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
}

function getCountryFlag(countryCode) {
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
