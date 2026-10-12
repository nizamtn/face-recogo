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
    } else if (sectionId === 'dropout') {
        loadDropoutAnalytics();
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

// ----------------------------------------------------
// PBADT304: Student Dropout Risk & Confusion Matrix
// ----------------------------------------------------

let currentDropoutData = null;

function switchDropoutSubTab(tabName) {
    document.querySelectorAll('.report-tab').forEach(b => {
        if (b.id && b.id.startsWith('dtab-')) b.classList.remove('active');
    });
    const activeBtn = document.getElementById(`dtab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    const vMatrix = document.getElementById('dropout-matrix-view');
    const vSim = document.getElementById('dropout-simulator-view');
    const vDir = document.getElementById('dropout-directory-view');

    if (vMatrix) vMatrix.style.display = tabName === 'matrix' ? 'block' : 'none';
    if (vSim) vSim.style.display = tabName === 'simulator' ? 'block' : 'none';
    if (vDir) vDir.style.display = tabName === 'directory' ? 'block' : 'none';

    if (tabName === 'simulator') {
        runRiskSimulation();
    }
}

async function loadDropoutAnalytics() {
    loadConfusionMatrix();
    loadDropoutOverview();
}

async function loadConfusionMatrix(customThreshold) {
    const slider = document.getElementById('cm-threshold-slider');
    const label = document.getElementById('cm-threshold-label');
    const threshold = customThreshold !== undefined ? customThreshold : (slider ? slider.value : 48);

    if (label) label.textContent = `${threshold}%`;

    try {
        const res = await fetch(`/api/dropout/confusion-matrix?threshold=${threshold}`);
        if (!res.ok) return;
        const data = await res.json();

        // Update Matrix Grid
        const m = data.matrix;
        const elTp = document.getElementById('cm-tp');
        const elTn = document.getElementById('cm-tn');
        const elFp = document.getElementById('cm-fp');
        const elFn = document.getElementById('cm-fn');
        if (elTp) elTp.textContent = m.tp;
        if (elTn) elTn.textContent = m.tn;
        if (elFp) elFp.textContent = m.fp;
        if (elFn) elFn.textContent = m.fn;

        // Update Metrics
        const met = data.metrics;
        const elAcc = document.getElementById('cm-acc');
        const elPrec = document.getElementById('cm-prec');
        const elRec = document.getElementById('cm-rec');
        const elF1 = document.getElementById('cm-f1');
        const elSpec = document.getElementById('cm-spec');
        if (elAcc) elAcc.textContent = `${met.accuracy}%`;
        if (elPrec) elPrec.textContent = `${met.precision}%`;
        if (elRec) elRec.textContent = `${met.recall}%`;
        if (elF1) elF1.textContent = `${met.f1_score}%`;
        if (elSpec) elSpec.textContent = `${met.specificity}%`;

        const kpiAcc = document.getElementById('ds-kpi-accuracy');
        if (kpiAcc) kpiAcc.textContent = `${met.accuracy}%`;
    } catch (e) {
        console.warn("Notice loading confusion matrix:", e);
    }
}

async function loadDropoutOverview() {
    const majorSelect = document.getElementById('ds-major-filter');
    const statusSelect = document.getElementById('ds-status-filter');
    const searchInput = document.getElementById('ds-search-input');

    const major = majorSelect ? majorSelect.value : '';
    const status = statusSelect ? statusSelect.value : '';
    const search = searchInput ? searchInput.value.trim().toUpperCase() : '';

    try {
        let url = `/api/dropout/overview?limit=150`;
        if (major) url += `&major=${encodeURIComponent(major)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;

        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        currentDropoutData = data;

        // Update KPIs
        const kpis = data.kpis;
        if (document.getElementById('ds-kpi-total')) document.getElementById('ds-kpi-total').textContent = kpis.total_students.toLocaleString();
        if (document.getElementById('ds-kpi-high-risk')) document.getElementById('ds-kpi-high-risk').textContent = `${kpis.high_risk_count} (${((kpis.high_risk_count/kpis.total_students)*100).toFixed(1)}%)`;
        if (document.getElementById('ds-kpi-attendance')) document.getElementById('ds-kpi-attendance').textContent = `${kpis.avg_attendance}%`;

        // Render Table
        renderDropoutTable(data.students, search);
    } catch (e) {
        console.warn("Notice loading dropout overview:", e);
    }
}

function renderDropoutTable(students, filterQuery = '') {
    const tbody = document.querySelector('#dropout-students-table tbody');
    if (!tbody) return;

    let filtered = students || [];
    if (filterQuery) {
        filtered = filtered.filter(s => s.student_id.toUpperCase().includes(filterQuery));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:18px; color:#94a3b8;">No student records match the filter criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(s => {
        const riskClass = s.actual_risk === 'High' ? 'badge-high' : (s.actual_risk === 'Medium' ? 'badge-med' : 'badge-low');
        const predRiskClass = s.predicted_level === 'High Risk' ? 'badge-high' : (s.predicted_level === 'Medium Risk' ? 'badge-med' : 'badge-low');
        const recText = s.recommendations && s.recommendations.length > 0 ? s.recommendations[0] : 'Standard advisory.';

        return `
            <tr>
                <td><strong>${s.student_id}</strong></td>
                <td><small>${s.major}</small></td>
                <td><strong>${s.gpa}</strong></td>
                <td>${s.attendance_rate}%</td>
                <td><small>${s.enrollment_status}</small></td>
                <td><span class="badge-risk ${riskClass}">${s.actual_risk}</span></td>
                <td>
                    <span class="badge-risk ${predRiskClass}">${s.predicted_score}%</span>
                </td>
                <td><small style="color:#cbd5e1;">${recText}</small></td>
            </tr>
        `;
    }).join('');
}

// Interactive Simulator Execution
function runRiskSimulation() {
    const inputAtt = document.getElementById('sim-input-att');
    const inputGpa = document.getElementById('sim-input-gpa');
    const inputGrade = document.getElementById('sim-input-grade');
    const inputLoad = document.getElementById('sim-input-load');
    const inputLogins = document.getElementById('sim-input-logins');
    const inputAssign = document.getElementById('sim-input-assign');
    const inputStatus = document.getElementById('sim-input-status');

    const attVal = inputAtt ? parseFloat(inputAtt.value) : 80;
    const gpaVal = inputGpa ? parseFloat(inputGpa.value) : 2.90;
    const gradeVal = inputGrade ? parseFloat(inputGrade.value) : 75;
    const loadVal = inputLoad ? parseInt(inputLoad.value) : 4;
    const loginsVal = inputLogins ? parseInt(inputLogins.value) : 20;
    const assignVal = inputAssign ? parseFloat(inputAssign.value) : 80;
    const statusVal = inputStatus ? inputStatus.value : 'Active';

    // Update labels
    if (document.getElementById('sim-val-att')) document.getElementById('sim-val-att').textContent = `${attVal}%`;
    if (document.getElementById('sim-val-gpa')) document.getElementById('sim-val-gpa').textContent = gpaVal.toFixed(2);
    if (document.getElementById('sim-val-grade')) document.getElementById('sim-val-grade').textContent = `${gradeVal}%`;
    if (document.getElementById('sim-val-load')) document.getElementById('sim-val-load').textContent = `${loadVal} courses`;
    if (document.getElementById('sim-val-logins')) document.getElementById('sim-val-logins').textContent = `${loginsVal} logins`;
    if (document.getElementById('sim-val-assign')) document.getElementById('sim-val-assign').textContent = `${assignVal}%`;

    // Local instant calculation for fluid feedback
    const gpaDef = Math.max(0, Math.min(100, ((4.0 - gpaVal) / 2.0) * 100));
    const gradeDef = Math.max(0, Math.min(100, ((100 - gradeVal) / 50.0) * 100));
    const acadDef = (gpaDef * 0.7) + (gradeDef * 0.3);

    const attDef = Math.max(0, Math.min(100, ((100 - attVal) / 40.0) * 100));

    const assignDef = (100 - assignVal);
    const loginDef = Math.max(0, (35.0 - Math.min(35.0, loginsVal)) / 35.0 * 100);
    const engDef = (assignDef * 0.5) + (loginDef * 0.5);

    let adminDef = 15.0;
    if (statusVal.toLowerCase() === 'leave') adminDef = 75.0;
    else if (statusVal.toLowerCase() === 'graduated') adminDef = 10.0;
    else if (loadVal >= 6) adminDef = 35.0;

    const riskScore = Math.max(0, Math.min(100, (0.35 * acadDef) + (0.35 * attDef) + (0.15 * engDef) + (0.15 * adminDef)));
    const roundedScore = riskScore.toFixed(1);

    let riskLevel = 'Low Risk';
    let riskColor = '#10b981';
    let riskClass = 'badge-low';

    if (riskScore >= 55.0) {
        riskLevel = 'High Risk';
        riskColor = '#ef4444';
        riskClass = 'badge-high';
    } else if (riskScore >= 35.0) {
        riskLevel = 'Medium Risk';
        riskColor = '#f59e0b';
        riskClass = 'badge-med';
    }

    // Update Simulator Output UI
    if (document.getElementById('sim-score-number')) document.getElementById('sim-score-number').textContent = roundedScore;
    const badgeEl = document.getElementById('sim-badge-level');
    if (badgeEl) {
        badgeEl.textContent = riskLevel;
        badgeEl.className = `badge-risk ${riskClass}`;
    }

    const fillEl = document.getElementById('sim-progress-fill');
    if (fillEl) {
        fillEl.style.width = `${roundedScore}%`;
        fillEl.style.backgroundColor = riskColor;
    }

    if (document.getElementById('sim-def-acad')) document.getElementById('sim-def-acad').textContent = `${acadDef.toFixed(1)}%`;
    if (document.getElementById('sim-def-att')) document.getElementById('sim-def-att').textContent = `${attDef.toFixed(1)}%`;
    if (document.getElementById('sim-def-eng')) document.getElementById('sim-def-eng').textContent = `${engDef.toFixed(1)}%`;
    if (document.getElementById('sim-def-admin')) document.getElementById('sim-def-admin').textContent = `${adminDef.toFixed(1)}%`;

    // Dynamic Recommendations
    const recList = document.getElementById('sim-rec-list');
    if (recList) {
        const recs = [];
        if (attVal < 75.0) recs.push("Attendance Alert: Attendance below 75% threshold (Parent notice).");
        if (gpaVal < 2.5 || gradeVal < 65.0) recs.push("Academic Warning: Assign Peer Tutor & Remedial Academic Support.");
        if (statusVal.toLowerCase() === 'leave') recs.push("Enrollment Check: Student on leave of absence. Advisor consultation.");
        if (assignVal < 70.0 || loginsVal < 12) recs.push("LMS Engagement Notice: Low portal activity & assignment submission lag.");
        if (recs.length === 0) recs.push("Student on track. Standard academic advisory & mentoring.");

        recList.innerHTML = recs.map(r => `<li>${r}</li>`).join('');
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

    // Confusion Matrix Slider Listener
    const cmSlider = document.getElementById('cm-threshold-slider');
    if (cmSlider) {
        cmSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            if (document.getElementById('cm-threshold-label')) {
                document.getElementById('cm-threshold-label').textContent = `${val}%`;
            }
            loadConfusionMatrix(val);
        });
    }

    // Simulator Listeners
    ['sim-input-att', 'sim-input-gpa', 'sim-input-grade', 'sim-input-load', 'sim-input-logins', 'sim-input-assign', 'sim-input-status'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', runRiskSimulation);
            el.addEventListener('change', runRiskSimulation);
        }
    });

    // Directory Search & Filters
    const searchInput = document.getElementById('ds-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (currentDropoutData && currentDropoutData.students) {
                renderDropoutTable(currentDropoutData.students, searchInput.value.trim().toUpperCase());
            }
        });
    }

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
