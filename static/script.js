let currentStream = null;
let currentPeriodData = null;

function showSection(sectionId) {
    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${sectionId}`).classList.add('active');

    document.querySelectorAll('main section').forEach(sec => sec.classList.remove('active-section'));
    document.getElementById(`${sectionId}-section`).classList.add('active-section');

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
    }
}

async function startCamera(videoId) {
    const videoElement = document.getElementById(videoId);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' } 
        });
        videoElement.srcObject = stream;
        currentStream = stream;
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Unable to access camera. Please allow camera permissions in your browser.");
    }
}

function captureImage(videoId, canvasId) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId);
    
    if (!video.videoWidth) {
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

// Fetch & Display Live Ongoing Period Information
async function loadCurrentPeriod() {
    try {
        const res = await fetch('/current-period');
        if (!res.ok) return;
        const data = await res.json();
        currentPeriodData = data;

        const statusText = document.getElementById('live-status-text');
        const subjectEl = document.getElementById('live-subject');
        const facultyEl = document.getElementById('live-faculty');
        const timeEl = document.getElementById('live-time');
        const selectEl = document.getElementById('period-select');

        if (data.is_class_active) {
            statusText.textContent = `Live: ${data.period} • ${data.day}`;
            statusText.parentElement.querySelector('.dot').style.backgroundColor = '#10b981';
            subjectEl.textContent = `${data.subject_code} - ${data.subject_name}`;
            facultyEl.textContent = `Faculty: ${data.faculty}`;
            timeEl.textContent = `Time: ${data.time_range}`;
        } else {
            statusText.textContent = `${data.status} • ${data.day}`;
            statusText.parentElement.querySelector('.dot').style.backgroundColor = '#f59e0b';
            subjectEl.textContent = data.subject_name || "No ongoing lecture";
            facultyEl.textContent = data.faculty !== "-" ? `Next Faculty: ${data.faculty}` : "";
            timeEl.textContent = data.time_range !== "-" ? `Timing: ${data.time_range}` : "";
        }

        // Populate today's period options in the selector
        if (data.today_periods && data.today_periods.length > 0) {
            selectEl.innerHTML = `<option value="auto">⚡ Auto: Active Period (${data.period})</option>`;
            data.today_periods.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.period;
                opt.textContent = `${p.period}: ${p.subject_code} (${p.time_range})`;
                selectEl.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error loading current period:", e);
    }
}

// Attendance Logic
document.getElementById('btn-take-attendance').addEventListener('click', async () => {
    const statusEl = document.getElementById('attendance-status');
    statusEl.textContent = 'Scanning face...';
    statusEl.className = 'status-msg';
    
    const blob = await captureImage('attendance-video', 'attendance-canvas');
    if (!blob) {
        statusEl.textContent = 'Camera not ready.';
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
        const result = await response.json();
        
        if (response.ok && !result.error) {
            statusEl.textContent = result.message;
            statusEl.className = 'status-msg';
        } else {
            statusEl.textContent = result.error || 'Failed to verify face.';
            statusEl.className = 'status-msg error-msg';
        }
    } catch (error) {
        statusEl.textContent = 'Network error.';
        statusEl.className = 'status-msg error-msg';
    }
});

// Registration Logic
document.getElementById('btn-register').addEventListener('click', async () => {
    const name = document.getElementById('student-name').value.trim();
    const statusEl = document.getElementById('register-status');
    
    if (!name) {
        statusEl.textContent = 'Please enter a name.';
        statusEl.className = 'status-msg error-msg';
        return;
    }
    
    statusEl.textContent = 'Registering & uploading to Cloudinary...';
    statusEl.className = 'status-msg';

    const blob = await captureImage('register-video', 'register-canvas');
    if (!blob) {
        statusEl.textContent = 'Camera not ready.';
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
        const result = await response.json();
        
        if (response.ok && !result.error) {
            statusEl.textContent = result.message;
            statusEl.className = 'status-msg';
            document.getElementById('student-name').value = '';
        } else {
            statusEl.textContent = result.error || 'Registration failed.';
            statusEl.className = 'status-msg error-msg';
        }
    } catch (error) {
        statusEl.textContent = 'Network error.';
        statusEl.className = 'status-msg error-msg';
    }
});

// Dashboard Records Logic
async function loadRecords() {
    const tbody = document.querySelector('#records-table tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading records...</td></tr>';
    
    try {
        const response = await fetch('/records');
        const records = await response.json();
        
        tbody.innerHTML = '';
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No attendance records found</td></tr>';
            return;
        }
        
        records.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${r.name}</strong></td>
                <td>${r.subject}</td>
                <td><span style="color:#93c5fd; font-weight:600;">${r.period}</span></td>
                <td><small>${r.faculty}</small></td>
                <td>${r.date}</td>
                <td>${r.time}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="error-msg" style="text-align:center;">Error loading records</td></tr>';
    }
}

// Auto-refresh period every 30 seconds
setInterval(() => {
    const attSection = document.getElementById('attendance-section');
    if (attSection && attSection.classList.contains('active-section')) {
        loadCurrentPeriod();
    }
}, 30000);

// Initialize on page load
window.addEventListener('load', () => {
    loadCurrentPeriod();
    startCamera('attendance-video');
});
