// API Configuration
const API_BASE_URL = 'https://basc69-schedule-backend-d86998e8386e.herokuapp.com';

// Global state
let currentUser = null;
let isDelegate = false;
let lastAdminData = null;

// Initialize group selection functionality
async function initGroupSelection() {
    // Check if returning from OAuth login with token
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
        // Store token in localStorage
        localStorage.setItem('wca_auth_token', token);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    await checkAuthStatus();
    setupTabNavigation();
    setupUserSection();
}

// Check authentication status
async function checkAuthStatus() {
    try {
        console.log('Checking auth status...');
        const token = localStorage.getItem('wca_auth_token');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            credentials: 'include',
            headers
        });
        const data = await response.json();
        console.log('Auth response:', data);
        
        if (data.authenticated) {
            currentUser = data.user;
            console.log('User authenticated:', currentUser);
            
            // Check if user is a delegate
            const delegateResponse = await fetch(`${API_BASE_URL}/api/admin/check`, {
                credentials: 'include',
                headers
            });
            const delegateData = await delegateResponse.json();
            isDelegate = delegateData.isDelegate || false;
            
            if (isDelegate) {
                document.getElementById('adminTabBtn').style.display = 'block';
            }
        } else {
            console.log('User not authenticated');
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// Setup tab navigation
function setupTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}Tab`).classList.add('active');
            
            // Load tab content
            if (tabName === 'groups') {
                loadGroupSelection();
            } else if (tabName === 'admin') {
                loadAdminPanel();
            }
        });
    });
}

// Setup user section in header
function setupUserSection() {
    const userSection = document.getElementById('userSection');
    
    if (currentUser) {
        userSection.innerHTML = `
            <div class="user-info">
                <span class="user-name">${currentUser.name}</span>
                ${currentUser.wcaId ? `<span class="user-wca-id">(${currentUser.wcaId})</span>` : ''}
                <button class="logout-btn" onclick="logout()">Logout</button>
            </div>
        `;
    } else {
        userSection.innerHTML = `
            <div class="login-section">
                <a href="${API_BASE_URL}/auth/wca" class="login-btn">Login with WCA</a>
            </div>
        `;
    }
}

// Load group selection UI
async function loadGroupSelection() {
    const content = document.getElementById('groupsContent');

    if (!currentUser) {
        content.innerHTML = `
            <div class="message-box">
                <h3>Login Required</h3>
                <p>Please log in with your WCA account to select groups.</p>
                <a href="${API_BASE_URL}/auth/wca" class="login-btn">Login with WCA</a>
            </div>
        `;
        return;
    }

    content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading available groups...</p></div>';

    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const [groupsRes, unofficialRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/groups`, { credentials: 'include', headers }),
            fetch(`${API_BASE_URL}/api/unofficial`, { credentials: 'include', headers })
        ]);

        if (!groupsRes.ok) {
            const error = await groupsRes.json();
            throw new Error(error.error || 'Failed to load groups');
        }

        const groupData = await groupsRes.json();
        const unofficialData = unofficialRes.ok ? await unofficialRes.json() : { events: [] };

        renderGroupSelection(groupData, unofficialData);

    } catch (error) {
        console.error('Load groups error:', error);
        content.innerHTML = `
            <div class="message-box error">
                <h3>Error</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Render group selection UI
function renderGroupSelection(data, unofficialData) {
    const content = document.getElementById('groupsContent');
    const unofficialEvents = (unofficialData && unofficialData.events) || [];

    let html = '';

    // Unofficial events section
    if (unofficialEvents.length > 0) {
        html += `
            <div class="unofficial-events-section">
                <h3>Unofficial Events</h3>
                <p>Click an event to sign up, or click again to remove your registration.</p>
                <div class="unofficial-events-grid">
        `;
        for (const event of unofficialEvents) {
            const fn = event.registered ? `unofficialUnregister('${event.id}')` : `unofficialRegister('${event.id}')`;
            html += `
                <div class="unofficial-event-card ${event.registered ? 'registered' : ''}" onclick="${fn}">
                    ${event.registered ? '<div class="unofficial-check">✓</div>' : ''}
                    <div class="unofficial-event-name">${event.name}</div>
                    <div class="unofficial-event-status">${event.registered ? 'Registered' : 'Click to sign up'}</div>
                </div>
            `;
        }
        html += '</div></div>';
    }

    if (!data.availableGroups || data.availableGroups.length === 0) {
        if (unofficialEvents.length === 0) {
            content.innerHTML = `
                <div class="message-box">
                    <h3>No Groups Available</h3>
                    <p>Either you're not registered for any events with group selection, or groups haven't been configured yet.</p>
                </div>
            `;
            return;
        }
        content.innerHTML = html;
        return;
    }

    html += `
        <div class="competitor-info">
            <h3>Welcome, ${data.person.name}!</h3>
            <p>Select your competing groups for the events you're registered for.</p>
        </div>
        <div class="groups-list">
    `;
    
    for (const activity of data.availableGroups) {
        html += `
            <div class="activity-groups">
                <div class="activity-header">
                    <h4>${activity.activityName}</h4>
                    <span class="activity-meta">${activity.room} • ${formatTime(activity.startTime)} - ${formatTime(activity.endTime)}</span>
                </div>
                <div class="groups-grid">
        `;
        
        for (const group of activity.groups) {
            const isSelected = group.isSelected;
            const isAssigned = group.isAssigned;
            const isFull = group.isFull;
            const canSelect = !isFull;
            const statusClass = isAssigned ? 'assigned' : (isSelected ? 'selected' : (isFull ? 'full' : ''));
            
            html += `
                <div class="group-option ${statusClass}" data-activity-id="${group.activityId}" data-group-number="${group.groupNumber}">
                    <div class="group-header">
                        <span class="group-number">Group ${group.groupNumber}</span>
                        <span class="group-capacity ${isFull ? 'full' : ''}">${group.currentCount}/${group.maxCapacity}</span>
                    </div>
                    <div class="group-time">
                        ${formatTime(group.startTime)} - ${formatTime(group.endTime)}
                    </div>
                    ${isAssigned ? '<div class="assigned-badge">📋 Already Assigned</div>' : ''}
                    <button class="select-group-btn"
                            ${!canSelect && !isSelected ? 'disabled' : ''}
                            onclick="${isSelected ? `deselectGroup(${group.activityId})` : `selectGroup(${group.activityId}, ${group.groupNumber})`}"
                            data-activity-id="${group.activityId}"
                            data-group-number="${group.groupNumber}">
                        ${isSelected ? '✓ Selected (click to remove)' : (isFull ? 'Full' : 'Select')}
                    </button>
                </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    content.innerHTML = html;
}

// Select a group
async function selectGroup(activityId, groupNumber) {
    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(`${API_BASE_URL}/api/groups/select`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ activityId, groupNumber })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to select group');
        }
        
        // Show success message
        showNotification('Group selected successfully!', 'success');
        
        // Reload groups to show updated state
        await loadGroupSelection();
        
    } catch (error) {
        console.error('Select group error:', error);
        showNotification(error.message, 'error');
    }
}

// Register for an unofficial event
async function unofficialRegister(eventId) {
    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}/api/unofficial/register`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ eventId })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to register');

        showNotification('Registered for unofficial event!', 'success');
        await loadGroupSelection();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Unregister from an unofficial event
async function unofficialUnregister(eventId) {
    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}/api/unofficial/register`, {
            method: 'DELETE',
            headers,
            credentials: 'include',
            body: JSON.stringify({ eventId })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to unregister');

        showNotification('Removed registration.', 'success');
        await loadGroupSelection();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Deselect a group
async function deselectGroup(activityId) {
    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}/api/groups/select`, {
            method: 'DELETE',
            headers,
            credentials: 'include',
            body: JSON.stringify({ activityId })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to deselect group');
        }

        showNotification('Group selection removed.', 'success');
        await loadGroupSelection();

    } catch (error) {
        console.error('Deselect group error:', error);
        showNotification(error.message, 'error');
    }
}

// Load admin panel
async function loadAdminPanel() {
    const content = document.getElementById('adminContent');
    
    if (!isDelegate) {
        content.innerHTML = `
            <div class="message-box error">
                <h3>Access Denied</h3>
                <p>Only delegates can access this panel.</p>
            </div>
        `;
        return;
    }
    
    content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading admin panel...</p></div>';
    
    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(`${API_BASE_URL}/api/admin/pending-groups`, {
            credentials: 'include',
            headers
        });
        
        if (!response.ok) {
            throw new Error('Failed to load pending groups');
        }
        
        const data = await response.json();
        lastAdminData = data;
        renderAdminPanel(data);

    } catch (error) {
        console.error('Load admin panel error:', error);
        content.innerHTML = `
            <div class="message-box error">
                <h3>Error</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Render admin panel
function renderAdminPanel(data) {
    const content = document.getElementById('adminContent');
    const unofficialRegs = data.unofficialRegistrations || [];

    let html = `
        <div class="admin-header">
            <h3>Pending Group Selections</h3>
            <p>Total selections: ${data.totalSelections}</p>
            <button class="write-wcif-btn" onclick="writeToWCIF()">Write to WCIF</button>
            <button class="clear-selections-btn" onclick="clearSelections()">Clear All Selections</button>
        </div>
        <div class="admin-groups-list">
    `;

    if (data.activities.length === 0) {
        html += '<p>No group selections yet.</p>';
    } else {
        for (const activity of data.activities) {
            html += `
                <div class="admin-activity">
                    <h4>${activity.activityName}</h4>
                    <div class="admin-groups">
            `;

            for (const group of activity.groups) {
                html += `
                    <div class="admin-group">
                        <div class="admin-group-header">
                            <strong>Group ${group.groupNumber}</strong>
                            <span class="group-count">${group.count} competitors</span>
                        </div>
                        <div class="admin-competitors">
                            <ul>
                `;

                for (const competitor of group.competitors) {
                    html += `<li>${competitor.name} ${competitor.wcaId ? `(${competitor.wcaId})` : ''}</li>`;
                }

                html += `</ul></div></div>`;
            }

            html += `</div></div>`;
        }
    }

    html += '</div>';

    // Unofficial registrations section
    if (unofficialRegs.length > 0) {
        html += `
            <div class="admin-unofficial-section">
                <div class="admin-unofficial-header">
                    <h3>Unofficial Event Sign-ups</h3>
                    <button class="export-csv-btn" onclick="exportUnofficialScorecards()">Export Scorecards CSV</button>
                </div>
        `;
        for (const event of unofficialRegs) {
            html += `
                <div class="admin-activity">
                    <div class="admin-activity-header">
                        <h4>${event.eventName} <span class="group-count">${event.count} competitor${event.count !== 1 ? 's' : ''}</span></h4>
                        <button class="export-csv-btn export-csv-btn--small" onclick="exportUnofficialScorecards('${event.eventId}')">Export CSV</button>
                    </div>
                    <ul>
            `;
            for (const c of event.competitors) {
                html += `<li>${c.name} ${c.wcaId ? `(${c.wcaId})` : ''}</li>`;
            }
            html += '</ul></div>';
        }
        html += '</div>';
    }

    content.innerHTML = html;
}

// Write groups to WCIF
async function writeToWCIF() {
    if (!confirm('Are you sure you want to write these group selections to the WCIF? This will update the competitor assignments on the WCA website.')) {
        return;
    }
    
    try {
        showNotification('Writing to WCIF...', 'info');
        
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(`${API_BASE_URL}/api/admin/write-wcif`, {
            method: 'POST',
            credentials: 'include',
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (data.wcaRequestId) {
                const reportLink = data.reportUrl
                    ? `<a href="${data.reportUrl}" target="_blank" style="color:#fff;text-decoration:underline">Report to WCA WST</a>`
                    : '';
                showNotification(
                    `WCA server error (Request ID: ${data.wcaRequestId}). ${reportLink}`,
                    'error',
                    12000,
                    true
                );
            } else {
                throw new Error(data.error || 'Failed to write to WCIF');
            }
            return;
        }
        
        showNotification(`Successfully wrote ${data.groupsWritten} group assignments to WCIF!`, 'success');
        
        // Reload pending groups
        await loadAdminPanel();
    } catch (error) {
        console.error('Write WCIF error:', error);
        showNotification(error.message, 'error');
    }
}

// Clear all group selections from DB
async function clearSelections() {
    if (!confirm('Delete ALL group selections from the database? This cannot be undone.')) {
        return;
    }
    
    try {
        showNotification('Clearing selections...', 'info');
        
        const token = localStorage.getItem('wca_auth_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}/api/admin/clear-selections`, {
            method: 'DELETE',
            credentials: 'include',
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to clear selections');
        }
        
        showNotification(`Cleared ${data.deleted} group selection(s).`, 'success');
        await loadAdminPanel();
    } catch (error) {
        console.error('Clear selections error:', error);
        showNotification(error.message, 'error');
    }
}

// Export unofficial event scorecards as CSV (pass eventId to filter to one event)
function exportUnofficialScorecards(eventId) {
    if (!lastAdminData) return;

    const regs = lastAdminData.unofficialRegistrations || [];
    const events = eventId ? regs.filter(e => e.eventId === eventId) : regs;

    const rows = [];
    for (const event of events) {
        for (const c of event.competitors) {
            rows.push({
                wca_id: c.wcaId || '',
                name: c.name,
                event_id: event.eventId,
                event_name: event.eventName
            });
        }
    }

    if (rows.length === 0) {
        showNotification('No registrations to export.', 'info');
        return;
    }

    const headers = ['wca_id', 'name', 'event_id', 'event_name'];
    const escape = val => '"' + String(val).replace(/"/g, '""') + '"';
    const lines = [headers.map(escape).join(',')];
    for (const row of rows) {
        lines.push(headers.map(h => escape(row[h])).join(','));
    }

    const csv = lines.join('\n');
    const filename = eventId ? `scorecards_${eventId}.csv` : 'unofficial_scorecards.csv';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Logout function
async function logout() {
    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers
        });
        
        // Clear token from localStorage
        localStorage.removeItem('wca_auth_token');
        
        currentUser = null;
        isDelegate = false;
        document.getElementById('adminTabBtn').style.display = 'none';
        setupUserSection();
        
        // Switch to schedule tab
        document.querySelector('[data-tab="schedule"]').click();
        
        showNotification('Logged out successfully', 'success');
        
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Failed to logout', 'error');
    }
}

// Utility: Format time
function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Utility: Show notification
function showNotification(message, type = 'info', duration = 3000, isHTML = false) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    if (isHTML) {
        notification.innerHTML = message;
    } else {
        notification.textContent = message;
    }
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

// Check for login callback
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login') === 'success') {
        showNotification('Logged in successfully!', 'success');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('login') === 'error') {
        showNotification('Login failed. Please try again.', 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});
