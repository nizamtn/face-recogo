let currentStream = null;
let currentPeriodData = null;
let facultyReportData = null;

// Tab Switching
function showSection(sectionId) {
    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${sectionId}`);
    if (navBtn) navBtn.classList.add('active');

    document.querySelectorAll('main section').forEach(sec => sec.classList.remove('active-section'));
    const targetSec = document.getElementById(`${sectionId}-section`);
    if (targetSec) targetSec.classList.add('active-section');

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }

    if (sectionId === 'attendance') {
        startCamera('attendance-video');
        loadCurrentPeriod();
    } else if (sectionId === 'register') {
        startCamera('register-video');
    } else if (sectionId === 'dashboard') {
        loadRecords();
    } else if (sectionId === 'faculty') {
        checkFacultyAuth();
    }
}

// Camera Management
async function startCamera(videoId) {
    const videoElement = document.getElementById(videoId);
    if (!videoElement) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("Camera API not available or insecure context (HTTPS required).");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' } 
        });
        videoElement.srcObject = stream;
        currentStream = stream;
    } catch (err) {
        console.error("Camera access error:", err);
    }
}

function captureImage(videoId, canvasId) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId);
    
    if (!video || !canvas || !video.videoWidth) {
        return null;
    }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
}

// Helper: Get local Date in YYYY-MM-DD
function getLocalDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Fetch & Display Live Ongoing Period Information with Auto-retry
async function loadCurrentPeriod(retryCount = 0) {
    const statusText = document.getElementById('live-status-text');
    const subjectEl = document.getElementById('live-subject');
    const facultyEl = document.getElementById('live-faculty');
    const timeEl = document.getElementById('live-time');
    const selectEl = document.getElementById('period-select');

    try {
        const res = await fetch('/current-period');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        currentPeriodData = data;

        if (statusText) {
            const dot = statusText.parentElement ? statusText.parentElement.querySelector('.dot') : null;
            if (data.is_class_active) {
                statusText.textContent = `Live: ${data.period} • ${data.day}`;
                if (dot) dot.style.backgroundColor = '#10b981';
            } else {
                statusText.textContent = `${data.status} • ${data.day}`;
                if (dot) dot.style.backgroundColor = '#f59e0b';
            }
        }

        if (subjectEl) subjectEl.textContent = data.is_class_active ? `${data.subject_code} - ${data.subject_name}` : (data.subject_name || "No ongoing lecture");
        if (facultyEl) facultyEl.textContent = data.faculty && data.faculty !== "-" ? `Faculty: ${data.faculty}` : "";
        if (timeEl) timeEl.textContent = data.time_range && data.time_range !== "-" ? `Timing: ${data.time_range}` : "";

        if (selectEl && data.today_periods && data.today_periods.length > 0) {
            const currentVal = selectEl.value;
            selectEl.innerHTML = `<option value="auto">⚡ Auto (Current Active: ${data.period})</option>`;
            data.today_periods.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.period;
                opt.textContent = `${p.period}: ${p.subject_code} (${p.time_range})`;
                selectEl.appendChild(opt);
            });
            if (currentVal && currentVal !== 'auto') {
                selectEl.value = currentVal;
            }
        }
    } catch (e) {
        console.warn("Notice loading period:", e);
        if (retryCount < 5) {
            if (statusText) statusText.textContent = `Waking cloud server (${retryCount + 1}/5)...`;
            setTimeout(() => loadCurrentPeriod(retryCount + 1), 2500);
        } else {
            if (statusText) statusText.textContent = "Server waking up. Tap refresh soon.";
        }
    }
}

// Attendance Logic
async function handleTakeAttendance() {
    const statusEl = document.getElementById('attendance-status');
    statusEl.textContent = 'Scanning face...';
    statusEl.className = 'status-msg';
    
    const blob = await captureImage('attendance-video', 'attendance-canvas');
    if (!blob) {
        statusEl.textContent = 'Camera not ready. Please allow camera access and face camera directly.';
        statusEl.className = 'status-msg error-msg';
        return;
    }

    const periodSelect = document.getElementById('period-select');
    const selectedPeriod = periodSelect ? periodSelect.value : 'auto';

    const formData = new FormData();
    formData.append('file', blob, 'capture.jpg');
    formData.append('selected_period', selectedPeriod);

    try {
        const response = await fetch('/attendance', {
            method: 'POST',
            body: formData
        });
        
        let result = {};
        const textResp = await response.text();
        try {
            result = JSON.parse(textResp);
        } catch (_) {
            result = { error: `Server error (${response.status}): ${textResp.slice(0, 100)}` };
        }
        
        if (response.ok && !result.error) {
            statusEl.textContent = result.message;
            statusEl.className = 'status-msg';
        } else {
            statusEl.textContent = result.error || 'Failed to verify face.';
            statusEl.className = 'status-msg error-msg';
        }
    } catch (error) {
        statusEl.textContent = 'Connection error: ' + (error.message || 'Please try again.');
        statusEl.className = 'status-msg error-msg';
    }
}

// Registration Logic
async function handleRegister() {
    const nameInput = document.getElementById('student-name');
    const name = nameInput ? nameInput.value.trim() : '';
    const statusEl = document.getElementById('register-status');
    
    if (!name) {
        statusEl.textContent = 'Please enter student name.';
        statusEl.className = 'status-msg error-msg';
        return;
    }
    
    statusEl.textContent = 'Registering & uploading face to Cloudinary...';
    statusEl.className = 'status-msg';

    const blob = await captureImage('register-video', 'register-canvas');
    if (!blob) {
        statusEl.textContent = 'Camera not ready. Please look at the camera.';
        statusEl.className = 'status-msg error-msg';
        return;
    }

    const formData = new FormData();
    formData.append('file', blob, 'capture.jpg');
    formData.append('name', name);

    try {
        const response = await fetch('/register', {
            method: 'POST',
            body: formData
        });
        
        let result = {};
        const textResp = await response.text();
        try {
            result = JSON.parse(textResp);
        } catch (_) {
            result = { error: `Server error (${response.status}): ${textResp.slice(0, 100)}` };
        }
        
        if (response.ok && !result.error) {
            statusEl.textContent = result.message;
            statusEl.className = 'status-msg';
            nameInput.value = '';
        } else {
            statusEl.textContent = result.error || 'Registration failed.';
            statusEl.className = 'status-msg error-msg';
        }
    } catch (error) {
        statusEl.textContent = 'Connection error: ' + (error.message || 'Please try again.');
        statusEl.className = 'status-msg error-msg';
    }
}

// Dashboard Records Logic with Auto-retry
async function loadRecords(retryCount = 0) {
    const tbody = document.querySelector('#records-table tbody');
    if (!tbody) return;

    if (retryCount === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 18px;">Loading attendance records...</td></tr>';
    }
    
    try {
        const response = await fetch('/records');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const records = await response.json();
        
        tbody.innerHTML = '';
        if (!Array.isArray(records) || records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding: 18px;">No attendance records found yet.</td></tr>';
            return;
        }
        
        records.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${r.name || '-'}</strong></td>
                <td>${r.subject || 'General'}</td>
                <td><span style="color:#93c5fd; font-weight:600;">${r.period || 'Period 1'}</span></td>
                <td><small>${r.faculty || '-'}</small></td>
                <td>${r.date || '-'}</td>
                <td>${r.time || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.warn("Records loading notice:", error);
        if (retryCount < 4) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#f59e0b; padding: 18px;">Server is waking up (attempt ${retryCount + 1}/4)...</td></tr>`;
            setTimeout(() => loadRecords(retryCount + 1), 2500);
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="error-msg" style="text-align:center; padding: 18px;">
                        <div>⚠️ Could not load records at this moment.</div>
                        <button onclick="loadRecords(0)" class="secondary-btn" style="margin-top:8px; padding:4px 14px; font-size:0.8rem; cursor:pointer;">🔄 Retry Now</button>
                    </td>
                </tr>
            `;
        }
    }
}

// ----------------------------------------------------
// Faculty & HOD Portal Logic
// ----------------------------------------------------

function checkFacultyAuth() {
    const isLogged = localStorage.getItem('faculty_logged_in') === 'true' || sessionStorage.getItem('faculty_logged_in') === 'true';
    const loginCard = document.getElementById('faculty-login-card');
    const dashboardContent = document.getElementById('faculty-dashboard-content');

    if (isLogged) {
        if (loginCard) loginCard.style.display = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
        
        const loggedUser = localStorage.getItem('faculty_user') || sessionStorage.getItem('faculty_user') || 'HOD';
        const nameEl = document.getElementById('logged-faculty-name');
        if (nameEl) nameEl.textContent = loggedUser;
        
        const datePicker = document.getElementById('faculty-date-picker');
        if (datePicker && !datePicker.value) {
            datePicker.value = getLocalDateString();
        }
        loadFacultyReport();
    } else {
        if (loginCard) loginCard.style.display = 'block';
        if (dashboardContent) dashboardContent.style.display = 'none';
    }
}

// 1-Click Login Helper for HOD / Faculty
function quickFillFaculty(username, password) {
    const u = document.getElementById('faculty-user');
    const p = document.getElementById('faculty-pass');
    if (u) u.value = username;
    if (p) p.value = password;
    loginFaculty(username, password);
}

// Submit Login Credentials
async function loginFaculty(customUser, customPass) {
    const user = customUser || (document.getElementById('faculty-user') ? document.getElementById('faculty-user').value.trim() : '');
    const pass = customPass || (document.getElementById('faculty-pass') ? document.getElementById('faculty-pass').value.trim() : '');
    const statusEl = document.getElementById('faculty-login-status');

    if (!user || !pass) {
        if (statusEl) {
            statusEl.textContent = 'Please enter username and password.';
            statusEl.className = 'status-msg error-msg';
        }
        return;
    }

    if (statusEl) {
        statusEl.textContent = 'Authenticating...';
        statusEl.className = 'status-msg';
    }

    const formData = new FormData();
    formData.append('username', user);
    formData.append('password', pass);

    try {
        const res = await fetch('/api/faculty/login', {
            method: 'POST',
            body: formData
        });
        const result = await res.json();

        if (res.ok && result.success) {
            localStorage.setItem('faculty_logged_in', 'true');
            localStorage.setItem('faculty_user', (result.user || user).toUpperCase());
            sessionStorage.setItem('faculty_logged_in', 'true');
            sessionStorage.setItem('faculty_user', (result.user || user).toUpperCase());
            
            if (statusEl) statusEl.textContent = '';
            const pField = document.getElementById('faculty-pass');
            if (pField) pField.value = '';
            
            checkFacultyAuth();
        } else {
            if (statusEl) {
                statusEl.textContent = result.error || 'Invalid credentials.';
                statusEl.className = 'status-msg error-msg';
            }
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = 'Network error while logging in. Please retry.';
            statusEl.className = 'status-msg error-msg';
        }
    }
}

// Faculty Logout
function handleFacultyLogout() {
    localStorage.removeItem('faculty_logged_in');
    localStorage.removeItem('faculty_user');
    sessionStorage.removeItem('faculty_logged_in');
    sessionStorage.removeItem('faculty_user');
    checkFacultyAuth();
}

// Load Faculty Period Report with Auto-retry
async function loadFacultyReport(retryCount = 0) {
    const datePicker = document.getElementById('faculty-date-picker');
    const periodPicker = document.getElementById('faculty-period-picker');
    
    const date = datePicker && datePicker.value ? datePicker.value : getLocalDateString();
    const period = periodPicker && periodPicker.value ? periodPicker.value : 'Period 1';

    try {
        const res = await fetch(`/api/faculty/report?date=${date}&period=${encodeURIComponent(period)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        facultyReportData = data;

        // Update Class Banner
        const subTitleEl = document.getElementById('report-subject-name');
        const facDescEl = document.getElementById('report-faculty-name');
        if (subTitleEl) subTitleEl.textContent = `${data.period}: ${data.subject}`;
        if (facDescEl) facDescEl.textContent = `Faculty Incharge: ${data.faculty} • ${data.day}`;

        // Update Metrics
        const elAbsent = document.getElementById('metric-absent');
        const elPresent = document.getElementById('metric-present');
        const elFullDay = document.getElementById('metric-fullday');
        const elTotal = document.getElementById('metric-total');
        if (elAbsent) elAbsent.textContent = data.absent_count;
        if (elPresent) elPresent.textContent = data.present_count;
        if (elFullDay) elFullDay.textContent = data.full_day_count;
        if (elTotal) elTotal.textContent = data.total_enrolled;

        // Render Absentees List (Default)
        renderAbsentList(data.absent_students, data.period);

        // Render Present List
        renderPresentList(data.present_students);

        // Render Full Day List
        renderFullDayList(data.full_day_students);

    } catch (err) {
        console.warn("Faculty report load notice:", err);
        if (retryCount < 3) {
            setTimeout(() => loadFacultyReport(retryCount + 1), 2000);
        }
    }
}

// Render Absentees (Clean, Uncluttered View)
function renderAbsentList(students, period) {
    const container = document.getElementById('absent-list-container');
    if (!container) return;

    if (!students || students.length === 0) {
        container.innerHTML = '<div class="empty-state">🎉 Excellent! No absentees in this period. 100% Attendance!</div>';
        return;
    }

    container.innerHTML = students.map((s, idx) => `
        <div class="list-item absent-item">
            <span class="item-name">${idx + 1}. ${s.name}</span>
            <span class="item-badge" style="color:#f87171;">Absent</span>
        </div>
    `).join('');
}

// Render Present List
function renderPresentList(students) {
    const container = document.getElementById('present-list-container');
    if (!container) return;

    if (!students || students.length === 0) {
        container.innerHTML = '<div class="empty-state">No student attendance recorded for this period yet.</div>';
        return;
    }

    container.innerHTML = students.map((s, idx) => `
        <div class="list-item present-item">
            <span class="item-name">${idx + 1}. ${s.name}</span>
            <span class="item-badge" style="color:#34d399;">Present at ${s.time}</span>
        </div>
    `).join('');
}

// Render Full-Day Attendees
function renderFullDayList(students) {
    const container = document.getElementById('fullday-list-container');
    if (!container) return;

    if (!students || students.length === 0) {
        container.innerHTML = '<div class="empty-state">No students have attended all periods for this date yet.</div>';
        return;
    }

    container.innerHTML = students.map((s, idx) => `
        <div class="list-item fullday-item">
            <span class="item-name">${idx + 1}. ${s.name}</span>
            <span class="item-badge" style="color:#fbbf24;">⭐ ${s.periods_attended} Periods Attended</span>
        </div>
    `).join('');
}

// Switch Report Sub-tabs
function switchReportTab(tabName) {
    document.querySelectorAll('.report-tab').forEach(b => b.classList.remove('active'));
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');

    const vAbsent = document.getElementById('report-absent-view');
    const vPresent = document.getElementById('report-present-view');
    const vFullDay = document.getElementById('report-fullday-view');
    if (vAbsent) vAbsent.style.display = tabName === 'absent' ? 'block' : 'none';
    if (vPresent) vPresent.style.display = tabName === 'present' ? 'block' : 'none';
    if (vFullDay) vFullDay.style.display = tabName === 'fullday' ? 'block' : 'none';
}

// Copy Absentee List Button
function handleCopyAbsentees() {
    if (!facultyReportData) return;
    const btn = document.getElementById('btn-copy-absentees');
    const absentees = facultyReportData.absent_students || [];

    let text = `📢 S3 AD B - Absentees Report\n`;
    text += `📅 Date: ${facultyReportData.date} (${facultyReportData.day})\n`;
    text += `⏰ ${facultyReportData.period}: ${facultyReportData.subject}\n`;
    text += `👤 Faculty: ${facultyReportData.faculty}\n`;
    text += `------------------------------------\n`;
    if (absentees.length === 0) {
        text += `All students present! No absentees.\n`;
    } else {
        text += `Total Absentees: ${absentees.length}\n`;
        absentees.forEach((s, idx) => {
            text += `${idx + 1}. ${s.name}\n`;
        });
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                const originalText = btn.textContent;
                btn.textContent = '✅ Copied to Clipboard!';
                btn.style.color = '#34d399';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.color = '#93c5fd';
                }, 2500);
            }
        }).catch(() => {
            alert("Absentees List:\n\n" + text);
        });
    } else {
        alert("Absentees List:\n\n" + text);
    }
}

// Safe Initialization
function initApp() {
    // Attach listeners
    const btnAttendance = document.getElementById('btn-take-attendance');
    if (btnAttendance) btnAttendance.addEventListener('click', handleTakeAttendance);

    const btnReg = document.getElementById('btn-register');
    if (btnReg) btnReg.addEventListener('click', handleRegister);

    const btnLogin = document.getElementById('btn-faculty-login');
    if (btnLogin) btnLogin.addEventListener('click', () => loginFaculty());

    const btnLogout = document.getElementById('btn-faculty-logout');
    if (btnLogout) btnLogout.addEventListener('click', handleFacultyLogout);

    const datePick = document.getElementById('faculty-date-picker');
    if (datePick) datePick.addEventListener('change', () => loadFacultyReport());

    const periodPick = document.getElementById('faculty-period-picker');
    if (periodPick) periodPick.addEventListener('change', () => loadFacultyReport());

    const btnCopy = document.getElementById('btn-copy-absentees');
    if (btnCopy) btnCopy.addEventListener('click', handleCopyAbsentees);

    // Initial loads
    loadCurrentPeriod();
    startCamera('attendance-video');
}

// Auto-refresh period every 30 seconds
setInterval(() => {
    const attSection = document.getElementById('attendance-section');
    if (attSection && attSection.classList.contains('active-section')) {
        loadCurrentPeriod();
    }
}, 30000);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
