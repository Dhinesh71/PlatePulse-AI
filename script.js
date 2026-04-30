const API_BASE = window.location.protocol === 'file:'
    ? 'http://localhost:5000'
    : (window.PLATEVISION_API_BASE || '');

const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const previewImg = document.getElementById('preview-img');
const captureBtn = document.getElementById('capture-btn');
const cameraToggle = document.getElementById('camera-toggle');
const fileInput = document.getElementById('file-upload');
const uploadTrigger = document.getElementById('upload-trigger');
const resultDisplay = document.getElementById('result-display');
const logList = document.getElementById('log-list');
const loader = document.getElementById('processing-overlay');
const scannerLine = document.querySelector('.scanner-line');
const autoToggle = document.getElementById('auto-mode-toggle');
const exportBtn = document.getElementById('export-csv-btn');
const historyTableBody = document.getElementById('history-table-body');
const searchInput = document.querySelector('.header-search input');

let isCameraOn = false;
let stream = null;
let mainChart = null;
let autoModeEnabled = false;
let autoInferenceInterval = null;
let analyticsChart = null;
let detectionsData = [];

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    setupNavigation();
    setupSearch();
    loadHistory();
});

function apiUrl(path) {
    return `${API_BASE}${path}`;
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', event => {
            event.preventDefault();
            const targetView = item.getAttribute('data-view');

            navItems.forEach(navItem => navItem.classList.remove('active'));
            item.classList.add('active');

            views.forEach(view => {
                view.classList.add('hidden');
                view.classList.remove('active');
            });

            const activeView = document.getElementById(`${targetView}-view`);
            activeView.classList.remove('hidden');
            activeView.classList.add('active');

            if (targetView === 'history') {
                renderHistoryTable(getFilteredDetections());
            }

            if (targetView === 'analytics') {
                initAnalyticsPage();
            }
        });
    });
}

function setupSearch() {
    searchInput.addEventListener('input', () => {
        renderHistoryTable(getFilteredDetections());
    });
}

function initCharts() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Detections',
                data: [],
                borderColor: '#00d2ff',
                backgroundColor: 'rgba(0, 210, 255, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#8b949e',
                        precision: 0
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#8b949e' }
                }
            }
        }
    });
}

function initAnalyticsPage() {
    const ctx = document.getElementById('analyticsChart').getContext('2d');

    if (!analyticsChart) {
        analyticsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Weekly Detections',
                    data: [],
                    backgroundColor: 'rgba(0, 210, 255, 0.4)',
                    borderColor: '#00d2ff',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#8b949e',
                            precision: 0
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8b949e' }
                    }
                }
            }
        });
    }

    updateAnalyticsChart(detectionsData);
}

function addLog(message, type = 'info') {
    const item = document.createElement('li');
    item.className = `log-item ${type}`;
    item.textContent = `> ${new Date().toLocaleTimeString()} | ${message}`;
    logList.prepend(item);

    while (logList.children.length > 25) {
        logList.removeChild(logList.lastChild);
    }
}

function setCaptureEnabled(enabled) {
    captureBtn.classList.toggle('disabled', !enabled);
}

function stopCameraStream() {
    if (!stream) {
        return;
    }

    stream.getTracks().forEach(track => track.stop());
    stream = null;
}

cameraToggle.addEventListener('click', async () => {
    if (isCameraOn) {
        stopCameraStream();
        video.classList.add('hidden');
        previewImg.classList.remove('hidden');
        setCaptureEnabled(false);
        isCameraOn = false;
        cameraToggle.innerHTML = '<i class="fas fa-video"></i> Start Camera';
        addLog('Camera stream terminated');
        return;
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.classList.remove('hidden');
        previewImg.classList.add('hidden');
        setCaptureEnabled(true);
        isCameraOn = true;
        cameraToggle.innerHTML = '<i class="fas fa-video-slash"></i> Stop Camera';
        addLog('Camera link established', 'success');
    } catch (error) {
        addLog('Camera access restricted', 'error');
    }
});

uploadTrigger.addEventListener('click', () => fileInput.click());

autoToggle.addEventListener('change', event => {
    autoModeEnabled = event.target.checked;
    if (autoModeEnabled) {
        addLog('Automatic monitoring enabled', 'success');
        startAutoInference();
    } else {
        addLog('Automatic monitoring suspended');
        stopAutoInference();
    }
});

function startAutoInference() {
    stopAutoInference();
    autoInferenceInterval = setInterval(() => {
        if (autoModeEnabled && isCameraOn && !captureBtn.classList.contains('disabled')) {
            runInference();
        }
    }, 3500);
}

function stopAutoInference() {
    if (autoInferenceInterval) {
        clearInterval(autoInferenceInterval);
        autoInferenceInterval = null;
    }
}

fileInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    if (!file.type.startsWith('image/')) {
        addLog('Only image uploads are supported right now', 'error');
        fileInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = loadEvent => {
        previewImg.src = loadEvent.target.result;
        previewImg.classList.remove('hidden');
        video.classList.add('hidden');

        if (isCameraOn) {
            stopCameraStream();
            isCameraOn = false;
            cameraToggle.innerHTML = '<i class="fas fa-video"></i> Start Camera';
        }

        setCaptureEnabled(true);
        addLog(`Asset loaded: ${file.name}`);
    };
    reader.readAsDataURL(file);
});

captureBtn.addEventListener('click', runInference);

exportBtn.addEventListener('click', () => {
    const filteredDetections = getFilteredDetections();
    if (filteredDetections.length === 0) {
        addLog('No data available to export', 'error');
        return;
    }

    const rows = [
        'ID,Plate,Confidence,Status,Timestamp',
        ...filteredDetections.map(detection =>
            `${detection.id},${detection.plate},${(detection.confidence * 100).toFixed(1)}%,${detection.status},${detection.timestamp}`
        )
    ];

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PlateVision_Export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    addLog('Data exported to CSV successfully', 'success');
});

async function parseJsonResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = payload.error || payload.message || `Request failed with status ${response.status}`;
        throw new Error(message);
    }
    return payload;
}

async function createInferenceBlob() {
    if (isCameraOn) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error('Failed to capture camera frame'));
                    return;
                }
                resolve(blob);
            }, 'image/jpeg');
        });
    }

    const response = await fetch(previewImg.src);
    if (!response.ok) {
        throw new Error('Unable to read the selected image');
    }
    return response.blob();
}

async function runInference() {
    if (captureBtn.classList.contains('disabled')) {
        return;
    }

    loader.classList.remove('hidden');
    scannerLine.style.display = 'block';
    setCaptureEnabled(false);

    try {
        const blob = await createInferenceBlob();
        const formData = new FormData();
        formData.append('image', blob, 'inference_target.jpg');

        if (!autoModeEnabled) {
            addLog('Neural network processing frame...');
        }

        const response = await fetch(apiUrl('/detect'), {
            method: 'POST',
            body: formData
        });
        const data = await parseJsonResponse(response);

        if (data.plate) {
            displayResult(data);
            await loadHistory();
            addLog(
                autoModeEnabled ? `AUTO: Detected ${data.plate}` : `Object detected: ${data.plate}`,
                'success'
            );
            return;
        }

        if (!autoModeEnabled) {
            resultDisplay.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>No license plate found in this frame.</p>
                </div>`;
        }
        addLog('Inference completed without a valid plate match', 'error');
    } catch (error) {
        addLog(error.message || 'API link failure', 'error');
    } finally {
        loader.classList.add('hidden');
        scannerLine.style.display = 'none';
        setCaptureEnabled(isCameraOn || Boolean(fileInput.files[0]));
    }
}

function buildStatusBadge(data) {
    if (data.is_blacklisted || data.status === 'Blacklisted') {
        return '<span class="badge-blacklist">Alert / Blacklisted</span>';
    }

    if (data.status === 'Invalid') {
        return '<span class="badge-invalid">Invalid</span>';
    }

    return `<span class="badge-valid">${data.status}</span>`;
}

function displayResult(data) {
    resultDisplay.innerHTML = `
        <div class="result-card-inner">
            <div style="display:flex; justify-content:space-between; align-items:center; gap: 1rem;">
                <span style="font-size:0.7rem; color:var(--text-secondary)">MATCH CONFIDENCE: ${(data.confidence * 100).toFixed(1)}%</span>
                ${buildStatusBadge(data)}
            </div>
            <div class="plate-text">${data.plate}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem">
                <p><i class="fas fa-map-marker-alt"></i> Region: India (Auto-detected)</p>
                <p><i class="far fa-clock"></i> Logged ID: #${data.id}</p>
            </div>
            <button onclick="generateReport(${data.id})" class="btn-primary" style="width:100%">
                <i class="fas fa-file-pdf"></i> Generate PDF Report
            </button>
        </div>
    `;
}

function normalizeImagePath(imagePath = '') {
    return imagePath.split(/[/\\]/).pop();
}

function getFilteredDetections() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
        return detectionsData;
    }

    return detectionsData.filter(detection => {
        const timestampText = new Date(detection.timestamp).toLocaleString().toLowerCase();
        return (
            detection.plate.toLowerCase().includes(query) ||
            detection.status.toLowerCase().includes(query) ||
            timestampText.includes(query)
        );
    });
}

function renderHistoryTable(detections) {
    if (!detections.length) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; color: var(--text-secondary);">No detections match the current filter.</td>
            </tr>
        `;
        return;
    }

    historyTableBody.innerHTML = detections.map(detection => {
        const imageName = normalizeImagePath(detection.image_path);
        const imageUrl = imageName ? apiUrl(`/uploads/${encodeURIComponent(imageName)}`) : '';
        return `
            <tr>
                <td>#${detection.id}</td>
                <td><img src="${imageUrl}" class="snap-img" onerror="this.src='https://via.placeholder.com/80x45?text=No+Img'"></td>
                <td style="font-weight:700; color:var(--accent-blue)">${detection.plate}</td>
                <td>${(detection.confidence * 100).toFixed(1)}%</td>
                <td><span class="badge-${detection.status.toLowerCase()}">${detection.status}</span></td>
                <td>${new Date(detection.timestamp).toLocaleString()}</td>
                <td>
                    <button onclick="generateReport(${detection.id})" class="btn-secondary btn-sm"><i class="fas fa-download"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function buildLast24HourSeries(detections) {
    const bucketSizeHours = 4;
    const bucketCount = 6;
    const now = new Date();
    const rangeStart = new Date(now.getTime() - bucketCount * bucketSizeHours * 60 * 60 * 1000);
    const labels = [];
    const counts = Array(bucketCount).fill(0);

    for (let index = 0; index < bucketCount; index += 1) {
        const labelTime = new Date(rangeStart.getTime() + index * bucketSizeHours * 60 * 60 * 1000);
        labels.push(labelTime.toLocaleTimeString([], { hour: 'numeric' }));
    }

    detections.forEach(detection => {
        const timestamp = new Date(detection.timestamp);
        if (timestamp < rangeStart || timestamp > now) {
            return;
        }

        const offset = timestamp.getTime() - rangeStart.getTime();
        const bucketIndex = Math.min(
            bucketCount - 1,
            Math.floor(offset / (bucketSizeHours * 60 * 60 * 1000))
        );
        counts[bucketIndex] += 1;
    });

    return { labels, counts };
}

function buildLast7DaySeries(detections) {
    const labels = [];
    const counts = Array(7).fill(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let index = 6; index >= 0; index -= 1) {
        const day = new Date(today);
        day.setDate(today.getDate() - index);
        labels.push(day.toLocaleDateString([], { weekday: 'short' }));
    }

    detections.forEach(detection => {
        const timestamp = new Date(detection.timestamp);
        timestamp.setHours(0, 0, 0, 0);
        const dayOffset = Math.round((today - timestamp) / (24 * 60 * 60 * 1000));
        if (dayOffset >= 0 && dayOffset < 7) {
            counts[6 - dayOffset] += 1;
        }
    });

    return { labels, counts };
}

function updateDashboardStats(detections) {
    const totalDetections = detections.length;
    const flaggedDetections = detections.filter(detection => detection.status !== 'Valid').length;

    document.getElementById('stat-total').textContent = totalDetections;
    document.getElementById('stat-violations').textContent = flaggedDetections;
}

function updateMainChart(detections) {
    const series = buildLast24HourSeries(detections);
    mainChart.data.labels = series.labels;
    mainChart.data.datasets[0].data = series.counts;
    mainChart.update();
}

function updateAnalyticsChart(detections) {
    if (!analyticsChart) {
        return;
    }

    const series = buildLast7DaySeries(detections);
    analyticsChart.data.labels = series.labels;
    analyticsChart.data.datasets[0].data = series.counts;
    analyticsChart.update();

    const hasWeeklyData = series.counts.some(count => count > 0);
    const peakIndex = hasWeeklyData ? series.counts.indexOf(Math.max(...series.counts)) : -1;
    const busiestDay = peakIndex >= 0 ? series.labels[peakIndex] : 'N/A';
    document.querySelector('#analytics-view .stats-grid .stat-card:nth-child(2) .stat-value').textContent = busiestDay;
}

async function loadHistory() {
    try {
        const response = await fetch(apiUrl('/detections'));
        const detections = await parseJsonResponse(response);
        detectionsData = Array.isArray(detections) ? detections : [];
        renderHistoryTable(getFilteredDetections());
        updateDashboardStats(detectionsData);
        updateMainChart(detectionsData);
        updateAnalyticsChart(detectionsData);
    } catch (error) {
        addLog(error.message || 'Failed to load history', 'error');
    }
}

async function generateReport(id) {
    addLog(`Preparing report for ID: ${id}...`);
    try {
        const response = await fetch(apiUrl(`/report/${id}`), { method: 'POST' });
        const data = await parseJsonResponse(response);
        if (data.report_url) {
            window.open(apiUrl(data.report_url), '_blank', 'noopener');
            addLog('Report exported to PDF successfully', 'success');
        }
    } catch (error) {
        addLog(error.message || 'Report generation failed', 'error');
    }
}
