let currentStream = null;

function showSection(sectionId) {
    // Update nav buttons
    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${sectionId}`).classList.add('active');

    // Update sections
    document.querySelectorAll('main section').forEach(sec => sec.classList.remove('active-section'));
    document.getElementById(`${sectionId}-section`).classList.add('active-section');

    // Stop camera if navigating away from camera pages
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }

    // Start camera if needed
    if (sectionId === 'attendance') {
        startCamera('attendance-video');
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
        alert("Unable to access camera. Please allow camera permissions.");
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
    
    // Return a Promise that resolves with the blob
    return new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });
}

// Attendance Logic
document.getElementById('btn-take-attendance').addEventListener('click', async () => {
    const statusEl = document.getElementById('attendance-status');
    statusEl.textContent = 'Processing...';
    statusEl.className = 'status-msg';
    
    const blob = await captureImage('attendance-video', 'attendance-canvas');
    if (!blob) {
        statusEl.textContent = 'Camera not ready.';
        statusEl.className = 'status-msg error-msg';
        return;
    }

    const formData = new FormData();
    formData.append('file', blob, 'capture.jpg');

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
    
    statusEl.textContent = 'Processing...';
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

// Dashboard Logic
async function loadRecords() {
    const tbody = document.querySelector('#records-table tbody');
    tbody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
    
    try {
        const response = await fetch('/records');
        const records = await response.json();
        
        tbody.innerHTML = '';
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2">No records found</td></tr>';
            return;
        }
        
        records.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.name}</td>
                <td>${r.time}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="2" class="error-msg">Error loading records</td></tr>';
    }
}

// Initialize
window.addEventListener('load', () => {
    // Start with attendance section
    startCamera('attendance-video');
});
