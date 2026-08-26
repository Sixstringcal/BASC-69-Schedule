// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://basc69-schedule-backend-d86998e8386e.herokuapp.com';

// Feature / Registration Settings (Set to false to re-enable signups for future competitions)
const REGISTRATION_CLOSED = true;
const PANELS_CLOSED = false;
const DEADLINE_NOTICE_HTML = 'Competition is coming up soon! You cannot select time slots anymore. If you have a conflict, please contact Calvin Nielson at <a href="mailto:cnielson@worldcubeassociation.org">cnielson@worldcubeassociation.org</a>';

// Global state
let currentUser = null;
let isDelegate = false;
let lastAdminData = null;
let currentUserRegistration = null;
let userSharedEmail = '';

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
        
        if (response.ok && data.authenticated) {
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
            console.log('User not authenticated - clearing local session token');
            localStorage.removeItem('wca_auth_token');
            currentUser = null;
            isDelegate = false;
            const adminTabBtn = document.getElementById('adminTabBtn');
            if (adminTabBtn) adminTabBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('wca_auth_token');
        currentUser = null;
        isDelegate = false;
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
            } else if (tabName === 'roomBlocks') {
                loadRoomBlocks();
            } else if (tabName === 'panels') {
                loadPanels();
            } else if (tabName === 'tshirt') {
                loadTShirt();
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
                <p>Please log in with your WCA account to select time slots.</p>
                <a href="${API_BASE_URL}/auth/wca" class="login-btn">Login with WCA</a>
            </div>
        `;
        return;
    }

    content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading available time slots...</p></div>';

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
    const timezone = data.timezone;

    let html = '';

    if (REGISTRATION_CLOSED) {
        html += `
            <div class="message-box warning" style="background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; margin-bottom: 25px; line-height: 1.5;">
                <p style="margin: 0; font-size: 1.05rem; font-weight: 600;">
                    ${DEADLINE_NOTICE_HTML}
                </p>
            </div>
        `;
    }

    // Unofficial events section
    if (unofficialEvents.length > 0) {
        html += `
            <div class="unofficial-events-section">
                <h3>Unofficial Events</h3>
                <p>${REGISTRATION_CLOSED ? 'Registration for unofficial events is now closed.' : 'Click an event to sign up, or click again to remove your registration. For team events (Doubles, Team-Blind), only one person per team needs to register.'}</p>
                <div class="unofficial-events-grid">
        `;
        for (const event of unofficialEvents) {
            const fn = REGISTRATION_CLOSED ? '' : (event.registered ? `unofficialUnregister('${event.id}')` : `unofficialRegister('${event.id}')`);
            const styleAttr = REGISTRATION_CLOSED ? 'style="cursor: default; opacity: 0.85;"' : '';
            html += `
                <div class="unofficial-event-card ${event.registered ? 'registered' : ''}" ${fn ? `onclick="${fn}"` : ''} ${styleAttr}>
                    ${event.registered ? '<div class="unofficial-check">✓</div>' : ''}
                    <div class="unofficial-event-name">${event.name}</div>
                    <div class="unofficial-event-status">${event.registered ? 'Registered' : (REGISTRATION_CLOSED ? 'Closed' : 'Click to sign up')}</div>
                </div>
            `;
        }
        html += '</div></div>';
    }

    if (!data.availableGroups || data.availableGroups.length === 0) {
        if (unofficialEvents.length === 0) {
            content.innerHTML = html + `
                <div class="message-box">
                    <h3>No Time Slots Available</h3>
                    <p>Either you're not registered for any events with time slot selection, or time slots haven't been configured yet.</p>
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
            <p>${REGISTRATION_CLOSED ? 'Your time slot selections for registered events:' : 'Select your time slots for the events you\'re registered for.'}</p>
        </div>
        <div class="groups-list">
    `;
    
    for (const activity of data.availableGroups) {
        html += `
            <div class="activity-groups">
                <div class="activity-header">
                    <h4>${activity.activityName}</h4>
                    <span class="activity-meta">${activity.room} • ${formatTime(activity.startTime, timezone)} - ${formatTime(activity.endTime, timezone)}</span>
                </div>
                <div class="groups-grid">
        `;
        
        for (const group of activity.groups) {
            const isSelected = group.isSelected;
            const isAccepted = group.isAccepted;
            const isAssigned = group.isAssigned;
            const isFull = group.isFull;
            const isLocked = isAssigned || isAccepted || REGISTRATION_CLOSED;
            const canSelect = !isFull && !REGISTRATION_CLOSED;
            const statusClass = isAssigned ? 'assigned' : (isAccepted ? 'accepted' : (isSelected ? 'selected' : (isFull ? 'full' : '')));

            const btnText = isAccepted 
                ? '✅ Accepted' 
                : (isSelected 
                    ? (REGISTRATION_CLOSED ? '✓ Selected' : '✓ Selected (click to remove)') 
                    : (isAssigned 
                        ? '📋 Assigned' 
                        : (isFull ? 'Full' : (REGISTRATION_CLOSED ? 'Closed' : 'Select'))));

            html += `
                <div class="group-option ${statusClass}" data-activity-id="${group.activityId}" data-group-number="${group.groupNumber}">
                    <div class="group-header">
                        <span class="group-number">Time Slot ${group.groupNumber}</span>
                        <span class="group-capacity ${isFull ? 'full' : ''}">${group.currentCount}/${group.maxCapacity}</span>
                    </div>
                    <div class="group-time">
                        ${formatTime(group.startTime, timezone)} - ${formatTime(group.endTime, timezone)}
                    </div>
                    ${isAssigned ? '<div class="assigned-badge">📋 Already Assigned</div>' : ''}
                    ${isAccepted ? '<div class="assigned-badge">✅ Accepted</div>' : ''}
                    <button class="select-group-btn"
                            ${(!canSelect && !isSelected) || isLocked ? 'disabled' : ''}
                            ${!REGISTRATION_CLOSED && isSelected && !isLocked ? `onclick="deselectGroup(${group.activityId})"` : ''}
                            ${!REGISTRATION_CLOSED && !isSelected && canSelect ? `onclick="selectGroup(${group.activityId}, ${group.groupNumber})"` : ''}
                            data-activity-id="${group.activityId}"
                            data-group-number="${group.groupNumber}">
                        ${btnText}
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
        showNotification('Time slot selected successfully!', 'success');
        
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

        showNotification('Time slot selection removed.', 'success');
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
        
        const [pendingRes, roomBlocksRes, roomBlocksRegsRes, panelsRes, tshirtRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/admin/pending-groups`, { credentials: 'include', headers }),
            fetch(`${API_BASE_URL}/api/room-blocks/public`, { credentials: 'include', headers }),
            fetch(`${API_BASE_URL}/api/room-blocks/admin/registrations`, { credentials: 'include', headers }),
            fetch(`${API_BASE_URL}/api/panels/admin/submissions`, { credentials: 'include', headers }),
            fetch(`${API_BASE_URL}/api/tshirt/admin/summary`, { credentials: 'include', headers })
        ]);
        
        if (!pendingRes.ok || !roomBlocksRes.ok || !roomBlocksRegsRes.ok || !panelsRes.ok || !tshirtRes.ok) {
            throw new Error('Failed to load some admin data');
        }
        
        const pendingData = await pendingRes.json();
        const roomBlocksData = await roomBlocksRes.json();
        const roomBlocksRegsData = await roomBlocksRegsRes.json();
        const panelsData = await panelsRes.json();
        const tshirtData = await tshirtRes.json();
        
        lastAdminData = {
            ...pendingData,
            roomBlocks: roomBlocksData.roomBlocks,
            roomBlockRegistrations: roomBlocksRegsData.registrations,
            panels: panelsData.submissions,
            tshirtSummary: tshirtData.summary,
            tshirtDetails: tshirtData.details
        };
        
        renderAdminPanel(lastAdminData);

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
            <h3>Time Slot Selections</h3>
            <p>Total selections: ${data.totalSelections}</p>
            <button class="write-wcif-btn" onclick="acceptGroupSelections()">Accept Time Slot Selections</button>
            <button class="clear-selections-btn" onclick="clearSelections()">Clear All Selections</button>
        </div>
        <div class="admin-groups-list">
    `;

    if (data.activities.length === 0) {
        html += '<p>No time slot selections yet.</p>';
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
                            <strong>Time Slot ${group.groupNumber}</strong>
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
                html += `<li>${c.name} ${c.wcaId ? `(${c.wcaId})` : ''} - <strong>Group ${c.groupNumber || 1}</strong></li>`;
            }
            html += '</ul></div>';
        }
        html += '</div>';
    }

    // === ROOM BLOCKS ADMIN SECTION ===
    const roomBlocks = data.roomBlocks || [];
    const roomBlockRegs = data.roomBlockRegistrations || [];
    
    html += `
        <div class="admin-unofficial-section" style="margin-top: 50px; border-top: 2px solid var(--border-color); padding-top: 30px;">
            <div class="admin-unofficial-header">
                <h3>Room Blocks & Tournaments</h3>
                <button class="export-csv-btn" onclick="exportRoomBlockRegistrationsCSV()">Export Registrants CSV</button>
            </div>
            
            <div style="text-align: left; margin-top: 20px;">
                <!-- Room Blocks list & registrations -->
                <div style="width: 100%;">
    `;
    
    if (roomBlocks.length === 0) {
        html += '<p>No room blocks created yet.</p>';
    } else {
        for (const block of roomBlocks) {
            const blockRegs = roomBlockRegs.filter(r => r.roomBlockId === block.id);
            const activeRegs = blockRegs.filter(r => r.status === 'registered');
            const waitlistRegs = blockRegs.filter(r => r.status === 'waitlist');
            
            html += `
                <div class="admin-activity" style="margin-bottom: 25px; padding: 15px; border: 1px solid var(--border-color); border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <h4 style="margin: 0; font-size: 1.15rem; color: var(--primary-color);">${block.name}</h4>
                            <small style="color: var(--text-light);">${block.hasSignups ? `Capacity: ${block.maxCapacity} | Total Sign-ups: ${blockRegs.length}` : 'Info Only (No Sign-ups)'}</small>
                        </div>
                    </div>
                    <p style="font-size: 0.9rem; color: var(--text-color); margin-bottom: 15px; font-style: italic;">${block.blurb || 'No description/blurb.'}</p>
            `;
            
            if (block.hasSignups) {
                html += `
                    <div style="margin-top: 10px;">
                        <strong style="font-size: 0.85rem; color: var(--text-color);">Accepted (${activeRegs.length}):</strong>
                        ${activeRegs.length === 0 ? '<span style="font-size: 0.85rem; color: var(--text-light); margin-left: 5px;">None</span>' : `
                            <ul style="margin: 5px 0 15px 15px; font-size: 0.85rem; padding-left: 10px;">
                                ${activeRegs.map(r => `<li>${r.competitorName} ${r.wcaId ? `(${r.wcaId})` : ''} - <small style="color: var(--text-light);">${r.email}</small></li>`).join('')}
                            </ul>
                        `}
                        
                        <strong style="font-size: 0.85rem; color: var(--text-color);">Waitlist (${waitlistRegs.length}):</strong>
                        ${waitlistRegs.length === 0 ? '<span style="font-size: 0.85rem; color: var(--text-light); margin-left: 5px;">Empty</span>' : `
                            <ol style="margin: 5px 0 5px 15px; font-size: 0.85rem; padding-left: 10px;">
                                ${waitlistRegs.map(r => `<li>${r.competitorName} ${r.wcaId ? `(${r.wcaId})` : ''} - <small style="color: var(--text-light);">${r.email}</small></li>`).join('')}
                            </ol>
                        `}
                    </div>
                `;
            }
            
            html += '</div>';
        }
    }
    
    html += `
                </div>
            </div>
        </div>
    `;
    
    // === PANEL SUBMISSIONS ADMIN SECTION ===
    const panels = data.panels || [];
    html += `
        <div class="admin-unofficial-section" style="margin-top: 50px; border-top: 2px solid var(--border-color); padding-top: 30px;">
            <div class="admin-unofficial-header" style="margin-bottom: 20px;">
                <h3>Panel Submissions</h3>
                <button class="export-csv-btn" onclick="exportPanelSubmissionsCSV()">Export Proposals CSV</button>
            </div>
    `;
    
    if (panels.length === 0) {
        html += '<p style="text-align: left;">No panel proposals submitted yet.</p>';
    } else {
        html += `
            <div class="admin-table-container" style="padding: 0; box-shadow: none; margin-bottom: 0;">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Competitor</th>
                            <th>WCA ID</th>
                            <th>Email</th>
                            <th>Panel Name</th>
                            <th>Description</th>
                            <th>Submitted At</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${panels.map(p => `
                            <tr>
                                <td><strong>${p.competitorName}</strong></td>
                                <td>${p.wcaId ? `<a href="https://worldcubeassociation.org/persons/${p.wcaId}" target="_blank">${p.wcaId}</a>` : 'N/A'}</td>
                                <td><a href="mailto:${p.email}">${p.email}</a></td>
                                <td><strong>${p.panelName}</strong></td>
                                <td><div style="max-height: 80px; overflow-y: auto; font-size: 0.85rem; max-width: 350px; line-height: 1.4; text-align: left;">${p.description}</div></td>
                                <td>${new Date(p.submittedAt).toLocaleDateString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    html += '</div>';
    
    // === T-SHIRT SELECTIONS ADMIN SECTION ===
    const tshirtSummary = data.tshirtSummary || [];
    const tshirtDetails = data.tshirtDetails || [];
    
    html += `
        <div class="admin-unofficial-section" style="margin-top: 50px; border-top: 2px solid var(--border-color); padding-top: 30px; margin-bottom: 30px;">
            <div class="admin-unofficial-header" style="margin-bottom: 20px;">
                <h3>T-Shirt Sizes Demand</h3>
                <button class="export-csv-btn" onclick="exportTShirtSelectionsCSV()">Export Sizes CSV</button>
            </div>
            
            <div style="text-align: left; margin-top: 20px;">
                <div style="width: 100%; max-width: 500px;">
                    <h4 style="margin-bottom: 10px;">Size Distribution</h4>
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Size</th>
                                <th>Estimated Count Needed</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tshirtSummary.length === 0 ? '<tr><td colspan="2">No selections recorded.</td></tr>' : 
                              tshirtSummary.map(ts => `
                                <tr>
                                    <td><strong>${ts.tshirtSize}</strong></td>
                                    <td><strong>${ts.count}</strong></td>
                                </tr>
                              `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    content.innerHTML = html;
}

// Accept group selections: writes official events to WCIF, marks unofficial events as accepted in DB
async function acceptGroupSelections() {
    if (!confirm('Accept all group selections? Official event groups will be written to the WCA website. Unofficial event groups (e.g. 9x9) will be confirmed in our system.')) {
        return;
    }

    try {
        showNotification('Accepting group selections...', 'info');

        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE_URL}/api/admin/accept-selections`, {
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
                throw new Error(data.error || 'Failed to accept group selections');
            }
            return;
        }

        const parts = [];
        if (data.groupsWritten > 0) parts.push(`${data.groupsWritten} official group(s) written to WCIF`);
        if (data.unofficialAccepted > 0) parts.push(`${data.unofficialAccepted} unofficial group(s) accepted`);
        showNotification(parts.length > 0 ? parts.join(', ') + '.' : data.message, 'success');

        await loadAdminPanel();
    } catch (error) {
        console.error('Accept selections error:', error);
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
    const competitionName = lastAdminData.competitionName || '';

    const rows = [];
    for (const event of events) {
        for (const c of event.competitors) {
            rows.push({
                competition_name: competitionName,
                registrant_id: c.registrantId != null ? c.registrantId : '',
                wca_id: c.wcaId || '',
                name: c.name,
                event_id: event.eventId,
                event_name: event.eventName,
                group_number: c.groupNumber != null ? c.groupNumber : 1,
                format: event.format != null ? event.format : '',
                time_limit: event.timeLimit != null ? event.timeLimit : '',
                cutoff_attempts: event.cutoff != null ? event.cutoff.numberOfAttempts : '',
                cutoff_time: event.cutoff != null ? event.cutoff.attemptResult : ''
            });
        }
    }

    if (rows.length === 0) {
        showNotification('No registrations to export.', 'info');
        return;
    }

    const headers = ['competition_name', 'registrant_id', 'wca_id', 'name', 'event_id', 'event_name', 'group_number', 'format', 'time_limit', 'cutoff_attempts', 'cutoff_time'];
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
}

// ==================== ROOM BLOCKS TAB ====================
async function loadRoomBlocks() {
    const content = document.getElementById('roomBlocksContent');
    content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading room blocks...</p></div>';
    
    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(`${API_BASE_URL}/api/room-blocks/public`, {
            credentials: 'include',
            headers
        });
        if (!response.ok) throw new Error('Failed to fetch room blocks');
        
        const data = await response.json();
        currentUserRegistration = data.userRegistration;
        if (currentUserRegistration && currentUserRegistration.email) {
            userSharedEmail = currentUserRegistration.email;
        } else {
            try {
                const panelRes = await fetch(`${API_BASE_URL}/api/panels/my-submissions`, {
                    credentials: 'include',
                    headers
                });
                if (panelRes.ok) {
                    const panelData = await panelRes.json();
                    if (panelData.submissions && panelData.submissions.length > 0) {
                        userSharedEmail = panelData.submissions[0].email || '';
                    } else {
                        userSharedEmail = '';
                    }
                }
            } catch (err) {
                console.warn('Failed to check panel submissions:', err);
            }
        }
        renderRoomBlocks(data.roomBlocks, data.userRegistration);
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="message-box error">
                <h3>Error</h3>
                <p>Failed to load room blocks data.</p>
            </div>
        `;
    }
}

function renderRoomBlocks(roomBlocks, userRegistration) {
    const content = document.getElementById('roomBlocksContent');
    let html = '';
    
    if (userRegistration) {
        html += `
            <div class="warning-box" style="border-left-color: var(--secondary-color); background: #f0faf0; text-align: center;">
                <p style="color: #2c5e2e; font-weight: 600;">
                    ✓ You are signed up for: <strong>${userRegistration.roomBlockName}</strong> 
                    (${userRegistration.status === 'registered' ? 'Registered/Accepted' : `Waitlist Position #${userRegistration.waitlistPosition}`})
                </p>
            </div>
        `;
    }
    
    html += '<div class="room-blocks-grid">';
    
    for (const block of roomBlocks) {
        const isRegisteredHere = userRegistration && userRegistration.roomBlockId === block.id;
        const cardClass = isRegisteredHere ? 'room-block-card registered' : 'room-block-card';
        
        html += `
            <div class="${cardClass}">
                ${isRegisteredHere ? `
                    <span class="room-block-badge reg" style="position: absolute; top: 12px; right: 12px; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; ${userRegistration.status === 'registered' ? 'background: #d4edda; color: #155724;' : 'background: #fff3cd; color: #856404;'}">${userRegistration.status === 'registered' ? 'Registered' : `Waitlist #${userRegistration.waitlistPosition}`}</span>
                ` : ''}
                <div class="room-block-name">${block.name}</div>
                <div class="room-block-blurb">${block.blurb || 'No description available.'}</div>
        `;
        
        if (block.hasSignups) {
            html += `
                <div class="room-block-stats">
                    <div class="room-block-stat-row">
                        <span>Capacity:</span>
                        <strong>${block.maxCapacity} spots</strong>
                    </div>
                    <div class="room-block-stat-row">
                        <span>Registered:</span>
                        <strong>${block.registrationCount}/${block.maxCapacity}</strong>
                    </div>
                    <div class="room-block-stat-row">
                        <span>Waitlist:</span>
                        <strong>${block.waitlistCount} people</strong>
                    </div>
                </div>
            `;
            
            if (currentUser) {
                if (isRegisteredHere) {
                    html += `
                        <div class="room-block-actions" style="margin-top: auto;">
                            <button class="btn-danger" style="width: 100%;" onclick="roomBlocksLeave(${block.id})">Leave Block</button>
                        </div>
                    `;
                } else if (userRegistration) {
                    const isFull = block.hasSignups && block.registrationCount >= block.maxCapacity;
                    const switchText = isFull ? "Switch to Waitlist" : "Switch to this Block";
                    html += `
                        <div class="room-block-actions" style="margin-top: auto;">
                            <button class="btn-primary" style="background-color: var(--secondary-color); width: 100%;" onclick="roomBlocksSwitch(${block.id}, '${block.name.replace(/'/g, "\\'")}', '${userRegistration.roomBlockName.replace(/'/g, "\\'")}')">${switchText}</button>
                        </div>
                    `;
                } else {
                    const isFull = block.hasSignups && block.registrationCount >= block.maxCapacity;
                    const buttonText = isFull ? "Join Waitlist" : "Sign Up";
                    html += `
                        <div class="room-block-actions" id="signup-container-${block.id}" style="margin-top: auto; width: 100%;">
                            <button class="btn-primary" style="width: 100%;" onclick="showSignupField(${block.id}, ${isFull})">${buttonText}</button>
                        </div>
                    `;
                }
            } else {
                html += `
                    <div style="margin-top: auto; text-align: center;">
                        <a href="${API_BASE_URL}/auth/wca" class="login-btn" style="display: block; font-size: 0.9rem; padding: 8px 12px; text-decoration: none;">Login with WCA to Sign Up</a>
                    </div>
                `;
            }
        } else {
            html += `
                <div class="room-block-stats" style="text-align: center; color: var(--text-light); margin-top: auto;">
                    <em>No sign-ups required. See schedule details.</em>
                </div>
            `;
        }
        
        html += '</div>';
    }
    
    content.innerHTML = html;
}

function showSignupField(blockId, isFull) {
    const container = document.getElementById(`signup-container-${blockId}`);
    if (!container) return;
    
    if (userSharedEmail) {
        submitSignupDirect(blockId);
        return;
    }
    
    const buttonText = isFull ? "Join Waitlist" : "Confirm";
    
    container.innerHTML = `
        <div class="form-group" style="margin-bottom: 10px; width: 100%;">
            <input type="email" id="email-input-${blockId}" placeholder="Enter your email" required style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px;">
        </div>
        <button class="btn-primary" style="width: 100%;" onclick="submitSignup(${blockId})">${buttonText}</button>
    `;
    
    document.getElementById(`email-input-${blockId}`).focus();
}

async function submitSignupDirect(blockId) {
    await executeRoomBlockRegister(blockId, userSharedEmail);
}

async function submitSignup(blockId) {
    const emailInput = document.getElementById(`email-input-${blockId}`);
    if (!emailInput) return;
    
    const email = emailInput.value.trim();
    
    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification("Please enter a valid email address.", "error");
        emailInput.focus();
        return;
    }
    
    userSharedEmail = email; // Cache it
    await executeRoomBlockRegister(blockId, email);
}

async function roomBlocksSwitch(roomBlockId, newBlockName, oldBlockName) {
    const switchConfirmed = confirm(`You are currently registered for '${oldBlockName}'. Switching will drop you from this block. Are you sure you want to proceed?`);
    if (!switchConfirmed) return;
    
    const email = userSharedEmail;
    if (!email) {
        const emailInput = prompt("Please confirm your email address:", "");
        if (!emailInput) return;
        userSharedEmail = emailInput;
        await executeRoomBlockRegister(roomBlockId, emailInput);
    } else {
        await executeRoomBlockRegister(roomBlockId, email);
    }
}

async function executeRoomBlockRegister(roomBlockId, email) {
    const token = localStorage.getItem('wca_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/room-blocks/register`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({ roomBlockId, email })
        });
        if (response.ok) {
            showNotification('Registered successfully!', 'success');
            await loadRoomBlocks();
        } else {
            const err = await response.json();
            showNotification(err.error || 'Failed to register', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error during registration', 'error');
    }
}

async function roomBlocksLeave(roomBlockId) {
    if (!confirm("Are you sure you want to leave this room block? This will drop your registration and any waitlist positions.")) return;
    
    const token = localStorage.getItem('wca_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/room-blocks/unregister`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({ roomBlockId })
        });
        if (response.ok) {
            showNotification('Left room block successfully', 'success');
            await loadRoomBlocks();
        } else {
            showNotification('Failed to leave room block', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error leaving room block', 'error');
    }
}


// ==================== PANEL SIGNUPS TAB ====================
async function loadPanels() {
    const content = document.getElementById('panelsContent');
    
    if (!currentUser) {
        content.innerHTML = `
            <div class="message-box">
                <h3>Login Required</h3>
                <p>Please log in with your WCA account to submit panels.</p>
                <a href="${API_BASE_URL}/auth/wca" class="login-btn">Login with WCA</a>
            </div>
        `;
        return;
    }
    
    content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading your panels...</p></div>';
    
    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(`${API_BASE_URL}/api/panels/my-submissions`, {
            credentials: 'include',
            headers
        });
        if (!response.ok) throw new Error('Failed to load panels');
        
        const data = await response.json();
        if (data.submissions && data.submissions.length > 0) {
            userSharedEmail = data.submissions[0].email || userSharedEmail;
        } else {
            if (!currentUserRegistration) {
                userSharedEmail = '';
            }
        }
        renderPanels(data.submissions);
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="message-box error">
                <h3>Error</h3>
                <p>Failed to load panels.</p>
            </div>
        `;
    }
}

function renderPanels(submissions) {
    const content = document.getElementById('panelsContent');
    
    // Determine a default email if they have already provided one
    if (submissions && submissions.length > 0) {
        userSharedEmail = submissions[0].email || userSharedEmail;
    } else if (currentUserRegistration && currentUserRegistration.email) {
        userSharedEmail = currentUserRegistration.email;
    }
    
    let html = '';

    if (PANELS_CLOSED) {
        html += `
            <div class="message-box warning" style="background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; margin-bottom: 25px; line-height: 1.5;">
                <p style="margin: 0; font-size: 1.05rem; font-weight: 600;">
                    Competition is coming up soon! Panel submissions and edits are now closed. If you have a conflict, please contact Calvin Nielson at <a href="mailto:cnielson@worldcubeassociation.org">cnielson@worldcubeassociation.org</a>
                </p>
            </div>
        `;
    } else {
        let emailFieldHtml = '';
        if (!userSharedEmail) {
            emailFieldHtml = `
                <div class="form-group">
                    <label for="panel-email">Email Address</label>
                    <input type="email" id="panel-email" placeholder="your@email.com" required>
                    <span class="form-help">We collect your email so we can contact you to schedule your panel.</span>
                </div>
            `;
        }
        
        html += `
            <form onsubmit="panelsSubmit(event)" class="custom-form">
                <h3>Submit a Panel</h3>
                <p style="color: var(--text-light); margin-bottom: 20px; font-size: 0.9rem;">
                    Host a panel or presentation at the competition! Share your speedcubing knowledge, collection, or other fun ideas with the community.
                </p>
                <div class="form-group">
                    <label for="panel-name">Panel Name</label>
                    <input type="text" id="panel-name" placeholder="e.g. History of Rubik's Cube Mods" required>
                </div>
                <div class="form-group">
                    <label for="panel-desc">Panel Description</label>
                    <textarea id="panel-desc" rows="4" placeholder="Briefly describe what your panel is about and what you'll need." required></textarea>
                </div>
                ${emailFieldHtml}
                <button type="submit" class="btn-primary">Submit Panel Proposal</button>
            </form>
        `;
    }
    
    html += '<div class="submissions-list">';
    html += '<h3>Your Submissions</h3>';
    
    if (!submissions || submissions.length === 0) {
        html += '<p style="color: var(--text-light); margin-top: 15px;">You have not submitted any panels yet.</p>';
    } else {
        for (const sub of submissions) {
            html += `
                <div class="submission-item">
                    <div class="submission-details">
                        <h4>${sub.panelName}</h4>
                        <p>${sub.description}</p>
                        <small style="color: var(--text-light); display: block; margin-top: 5px;">
                            Submitted at: ${new Date(sub.submittedAt).toLocaleDateString()} | Contact: ${sub.email}
                        </small>
                    </div>
                    ${PANELS_CLOSED ? '' : `<button class="btn-danger" onclick="panelsDelete(${sub.id})">Delete</button>`}
                </div>
            `;
        }
    }
    
    html += '</div>';
    content.innerHTML = html;
}

async function panelsSubmit(e) {
    if (e) e.preventDefault();
    const token = localStorage.getItem('wca_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const panelName = document.getElementById('panel-name').value;
    const description = document.getElementById('panel-desc').value;
    
    let email = userSharedEmail;
    const emailInput = document.getElementById('panel-email');
    if (emailInput) {
        email = emailInput.value.trim();
        // Email regex validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showNotification("Please enter a valid email address.", "error");
            emailInput.focus();
            return;
        }
        userSharedEmail = email; // Cache it
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/panels/submit`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({ panelName, description, email })
        });
        
        if (response.ok) {
            showNotification('Panel proposal submitted!', 'success');
            await loadPanels();
        } else {
            showNotification('Failed to submit panel proposal', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error submitting panel', 'error');
    }
}

async function panelsDelete(id) {
    if (!confirm('Are you sure you want to delete this panel proposal?')) return;
    
    const token = localStorage.getItem('wca_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/panels/my-submissions/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers
        });
        
        if (response.ok) {
            showNotification('Panel proposal deleted', 'success');
            await loadPanels();
        } else {
            showNotification('Failed to delete panel proposal', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error deleting panel', 'error');
    }
}


// ==================== T-SHIRT SIZE SELECTION TAB ====================
async function loadTShirt() {
    const content = document.getElementById('tshirtContent');
    
    if (!currentUser) {
        content.innerHTML = `
            <div class="message-box">
                <h3>Login Required</h3>
                <p>Please log in with your WCA account to select T-Shirt sizes.</p>
                <a href="${API_BASE_URL}/auth/wca" class="login-btn">Login with WCA</a>
            </div>
        `;
        return;
    }
    
    content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading T-shirt settings...</p></div>';
    
    try {
        const token = localStorage.getItem('wca_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(`${API_BASE_URL}/api/tshirt/my-selection`, {
            credentials: 'include',
            headers
        });
        if (!response.ok) throw new Error('Failed to load size choice');
        
        const data = await response.json();
        renderTShirt(data.selection);
    } catch (error) {
        console.error(error);
        content.innerHTML = `
            <div class="message-box error">
                <h3>Error</h3>
                <p>Failed to load T-shirt size selections.</p>
            </div>
        `;
    }
}

function renderTShirt(selection) {
    const content = document.getElementById('tshirtContent');
    const selectedSize = selection ? selection.tshirtSize : '';
    
    let html = `
        <div class="warning-box">
            <p>
                <strong>Important Note:</strong> We are <strong>not pre-selling T-shirts online</strong>. 
                We will be custom heat pressing them live at the competition! 
                We are collecting this data solely to ensure we order a sufficient quantity of blank shirts in each size. 
                Selecting a size helps us estimate demand so everyone gets their preferred fit.
            </p>
        </div>
        
        <form onsubmit="tshirtSubmit(event)" class="custom-form">
            <h3>Select T-Shirt Size</h3>
            
            ${selectedSize ? `
                <div style="background: #e6f4ea; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 0.95rem; color: #137333; font-weight: 600; text-align: center;">
                    ✓ Current Selection: ${selectedSize}
                </div>
            ` : ''}
            
            <div class="form-group">
                <label for="tshirt-size">Preferred Fit</label>
                <select id="tshirt-size" required>
                    <option value="" disabled ${!selectedSize ? 'selected' : ''}>-- Select Size --</option>
                    <option value="XS" ${selectedSize === 'XS' ? 'selected' : ''}>Extra Small (XS)</option>
                    <option value="S" ${selectedSize === 'S' ? 'selected' : ''}>Small (S)</option>
                    <option value="M" ${selectedSize === 'M' ? 'selected' : ''}>Medium (M)</option>
                    <option value="L" ${selectedSize === 'L' ? 'selected' : ''}>Large (L)</option>
                    <option value="XL" ${selectedSize === 'XL' ? 'selected' : ''}>Extra Large (XL)</option>
                    <option value="XXL" ${selectedSize === 'XXL' ? 'selected' : ''}>Double Extra Large (XXL)</option>
                    <option value="XXXL" ${selectedSize === 'XXXL' ? 'selected' : ''}>Triple Extra Large (XXXL)</option>
                </select>
            </div>
            
            <button type="submit" class="btn-primary" style="width: 100%;">${selectedSize ? 'Update Size Selection' : 'Confirm Size Selection'}</button>
        </form>
    `;
    
    content.innerHTML = html;
}

async function tshirtSubmit(e) {
    if (e) e.preventDefault();
    const token = localStorage.getItem('wca_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const size = document.getElementById('tshirt-size').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/tshirt/select`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({ size })
        });
        
        if (response.ok) {
            showNotification('T-shirt size selection saved!', 'success');
            await loadTShirt();
        } else {
            showNotification('Failed to save size selection', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Error saving T-shirt size', 'error');
    }
}


// ==================== ADMIN ACTIONS & CSV EXPORTS ====================
function exportRoomBlockRegistrationsCSV() {
    if (!lastAdminData || !lastAdminData.roomBlockRegistrations) return;
    const headers = ["ID", "Competitor Name", "WCA ID", "Email", "Room Block Name", "Status", "Waitlist Position", "Registered At"];
    const rows = lastAdminData.roomBlockRegistrations.map(r => [
        r.id,
        r.competitorName,
        r.wcaId || 'N/A',
        r.email,
        r.roomBlockName,
        r.status,
        r.status === 'waitlist' ? r.waitlistPosition : 'N/A',
        r.registeredAt
    ]);
    downloadCSV("room_block_registrations.csv", headers, rows);
}

function exportPanelSubmissionsCSV() {
    if (!lastAdminData || !lastAdminData.panels) return;
    const headers = ["ID", "Competitor Name", "WCA ID", "Email", "Panel Name", "Description", "Submitted At"];
    const rows = lastAdminData.panels.map(p => [
        p.id,
        p.competitorName,
        p.wcaId || 'N/A',
        p.email,
        p.panelName,
        p.description,
        p.submittedAt
    ]);
    downloadCSV("panel_submissions.csv", headers, rows);
}

function exportTShirtSelectionsCSV() {
    if (!lastAdminData || !lastAdminData.tshirtSummary) return;
    const headers = ["Size", "Count"];
    const rows = lastAdminData.tshirtSummary.map(t => [
        t.tshirtSize,
        t.count
    ]);
    downloadCSV("tshirt_sizes_distribution.csv", headers, rows);
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
function formatTime(isoString, timezone) {
    const date = new Date(isoString);
    const opts = { hour: '2-digit', minute: '2-digit', hour12: true };
    if (timezone) opts.timeZone = timezone;
    return date.toLocaleTimeString('en-US', opts);
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
