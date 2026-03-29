let rpsChart, responseTimeChart;
let thresholdValue = 100;
let rpsThresholdValue = 1000;
let resppsThresholdValue = 1000;
let lastAlertTime = 0;

document.getElementById('threshold').addEventListener('change', (e) => {
    thresholdValue = parseFloat(e.target.value) || 100;
});
document.getElementById('rpsThreshold').addEventListener('change', (e) => {
    rpsThresholdValue = parseFloat(e.target.value) || 1000;
});
document.getElementById('resppsThreshold').addEventListener('change', (e) => {
    resppsThresholdValue = parseFloat(e.target.value) || 1000;
});

async function fetchData() {
    try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();
        updateDashboard(data);
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function updateDashboard(data) {
    document.getElementById('lastUpdate').innerText = `Last update: ${new Date().toLocaleTimeString()}`;
    document.getElementById('report-title').innerText = `Report of ${data.collection}`;

    // Update Charts
    updateCharts(data.timeseries);

    // Update Stats Tables
    updateStatsTable('rpsStatsBody', {
        'Req/sec': data.stats.rps,
        'Resp/sec': data.stats.respps
    });
    updateStatsTable('otherStatsBody', {
        'Resp Time (ms)': data.stats.response_time,
        'Req Size (Byte)': data.stats.request_size
    });

    // Update Top Lists
    updateTopList('topEndpointsBody', data.top_endpoints);
    updateTopList('topPortsBody', data.top_ports);

    // Update Formal PDF Tables
    updateStatsTable('formalRpsStatsBody', {
        'Req/sec': data.stats.rps,
        'Resp/sec': data.stats.respps
    });
    updateStatsTable('formalOtherStatsBody', {
        'Resp Time (ms)': data.stats.response_time,
        'Req Size (Bytes)': data.stats.request_size
    });
    updateTopList('formalTopEndpointsBody', data.top_endpoints);
    updateTopList('formalTopPortsBody', data.top_ports);

    // Check Threshold for Alert
    const latestTime = data.timeseries[data.timeseries.length - 1];
    let isAlert = false;
    let alertMessages = [];

    if (latestTime) {
        if (latestTime.avg_response_time > thresholdValue) {
            isAlert = true;
            alertMessages.push(`Resp Time (${latestTime.avg_response_time.toFixed(2)}ms) > ${thresholdValue}`);
        }
        if (latestTime.requests > rpsThresholdValue) {
            isAlert = true;
            alertMessages.push(`RPS (${latestTime.requests}) > ${rpsThresholdValue}`);
        }
        if (latestTime.responses > resppsThresholdValue) {
            isAlert = true;
            alertMessages.push(`RespPS (${latestTime.responses}) > ${resppsThresholdValue}`);
        }
    }

    if (isAlert) {
        const banner = document.getElementById('alertBanner');
        banner.style.display = 'block';
        banner.innerText = `⚠️ ALERT: ${alertMessages.join(' | ')}`;
        sendAlertDiscord(alertMessages.join(', '));
    } else {
        document.getElementById('alertBanner').style.display = 'none';
    }
}

async function sendAlertDiscord(message) {
    const now = Date.now();
    // 60 seconds cooldown to avoid spamming
    if (now - lastAlertTime < 60000) {
        return;
    }

    lastAlertTime = now;

    try {
        await fetch('/api/send-alert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message
            })
        });
    } catch (error) {
        console.error('Error sending alert:', error);
        lastAlertTime = 0; // reset to allow retry
    }
}

function updateCharts(timeseries) {
    const labels = timeseries.map(t => new Date(t._id * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const requestsData = timeseries.map(t => t.requests);
    const responsesData = timeseries.map(t => t.responses);
    const avgRespTimeData = timeseries.map(t => t.avg_response_time || 0);

    // Point colors based on threshold
    const respTimePointColors = avgRespTimeData.map(val => val > thresholdValue ? '#ef4444' : '#fbbf24');
    const respTimePointRadius = avgRespTimeData.map(val => val > thresholdValue ? 6 : 3);

    const rpsPointColors = requestsData.map(val => val > rpsThresholdValue ? '#ef4444' : '#2563eb');
    const rpsPointRadius = requestsData.map(val => val > rpsThresholdValue ? 6 : 3);

    const resppsPointColors = responsesData.map(val => val > resppsThresholdValue ? '#ef4444' : '#f43f5e');
    const resppsPointRadius = responsesData.map(val => val > resppsThresholdValue ? 6 : 3);

    // RPS Chart
    if (!rpsChart) {
        const ctx = document.getElementById('rpsChart').getContext('2d');
        rpsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Requests/s',
                        data: requestsData,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        pointBackgroundColor: rpsPointColors,
                        pointBorderColor: rpsPointColors,
                        pointRadius: rpsPointRadius,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Responses/s',
                        data: responsesData,
                        borderColor: '#f43f5e',
                        backgroundColor: 'rgba(244, 63, 94, 0.1)',
                        pointBackgroundColor: resppsPointColors,
                        pointBorderColor: resppsPointColors,
                        pointRadius: resppsPointRadius,
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#e2e8f0' },
                        ticks: { color: '#475569' },
                        title: { display: true, text: 'Count (per second)', color: '#1e293b', font: { weight: 'bold' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#475569' },
                        title: { display: true, text: 'Time (HH:MM:SS)', color: '#1e293b', font: { weight: 'bold' } }
                    }
                },
                plugins: { legend: { labels: { color: '#1e293b' } } }
            }
        });
    } else {
        rpsChart.data.labels = labels;
        rpsChart.data.datasets[0].data = requestsData;
        rpsChart.data.datasets[0].pointBackgroundColor = rpsPointColors;
        rpsChart.data.datasets[0].pointBorderColor = rpsPointColors;
        rpsChart.data.datasets[0].pointRadius = rpsPointRadius;
        rpsChart.data.datasets[1].data = responsesData;
        rpsChart.data.datasets[1].pointBackgroundColor = resppsPointColors;
        rpsChart.data.datasets[1].pointBorderColor = resppsPointColors;
        rpsChart.data.datasets[1].pointRadius = resppsPointRadius;
        rpsChart.options.scales.x.title.display = true;
        rpsChart.options.scales.x.title.text = 'Time (HH:MM:SS)';
        rpsChart.options.scales.y.title.display = true;
        rpsChart.options.scales.y.title.text = 'Count (per second)';
        rpsChart.update();
    }

    // Response Time Chart
    if (!responseTimeChart) {
        const ctx = document.getElementById('responseTimeChart').getContext('2d');
        responseTimeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Avg Response Time (ms)',
                    data: avgRespTimeData,
                    borderColor: '#fbbf24',
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    pointBackgroundColor: respTimePointColors,
                    pointBorderColor: respTimePointColors,
                    pointRadius: respTimePointRadius,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#e2e8f0' },
                        ticks: { color: '#475569' },
                        title: { display: true, text: 'Response Time (ms)', color: '#1e293b', font: { weight: 'bold' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#475569' },
                        title: { display: true, text: 'Time (HH:MM:SS)', color: '#1e293b', font: { weight: 'bold' } }
                    }
                },
                plugins: { legend: { labels: { color: '#1e293b' } } }
            }
        });
    } else {
        responseTimeChart.data.labels = labels;
        responseTimeChart.data.datasets[0].data = avgRespTimeData;
        responseTimeChart.data.datasets[0].pointBackgroundColor = respTimePointColors;
        responseTimeChart.data.datasets[0].pointBorderColor = respTimePointColors;
        responseTimeChart.data.datasets[0].pointRadius = respTimePointRadius;
        responseTimeChart.options.scales.x.title.display = true;
        responseTimeChart.options.scales.x.title.text = 'Time (HH:MM:SS)';
        responseTimeChart.options.scales.y.title.display = true;
        responseTimeChart.options.scales.y.title.text = 'Response Time (ms)';
        responseTimeChart.update();
    }
}

async function exportToPDF() {
    const btn = document.querySelector('button[onclick="exportToPDF()"]');
    const originalText = btn.innerText;
    btn.innerText = 'Generating PDF...';
    btn.disabled = true;

    try {
        const element = document.getElementById('report-container');

        // Temporarily adjust layout for PDF
        element.classList.add('pdf-export-mode');

        // Hide dashboard stats and show formal stats
        document.querySelectorAll('.stats-grid').forEach(el => el.style.display = 'none');
        document.getElementById('formal-stats-container').style.display = 'block';

        if (rpsChart) rpsChart.resize();
        if (responseTimeChart) responseTimeChart.resize();

        // Temporarily modify the title for the report
        const titleEl = document.getElementById('report-title');
        const originalTitle = titleEl.innerText;
        titleEl.innerText = `Report of ${document.getElementById('lastUpdate').innerText.replace('Last update: ', '')}`;

        const opt = {
            margin: 10,
            filename: `Network_Analysis_Report_${new Date().getTime()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'], avoid: '.prevent-split' }
        };

        await html2pdf().set(opt).from(element).save();

        // Restore title
        titleEl.innerText = originalTitle;

    } catch (error) {
        console.error('PDF Export Error:', error);
        alert('Failed to generate PDF. Please try again.');
    } finally {
        const element = document.getElementById('report-container');
        if (element) {
            element.classList.remove('pdf-export-mode');
        }

        // Restore dashboard stats and hide formal stats
        document.querySelectorAll('.stats-grid').forEach(el => el.style.display = 'grid');
        document.getElementById('formal-stats-container').style.display = 'none';

        if (rpsChart) rpsChart.resize();
        if (responseTimeChart) responseTimeChart.resize();

        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function updateStatsTable(tableId, statsMap) {
    const tbody = document.getElementById(tableId);
    tbody.innerHTML = '';

    for (const [name, stats] of Object.entries(statsMap)) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${name}</td>
            <td>${stats.min.toFixed(2)}</td>
            <td>${stats.max.toFixed(2)}</td>
            <td>${stats.avg.toFixed(2)}</td>
            <td>${stats.stdev.toFixed(2)}</td>
            <td>${stats.p95.toFixed(2)}</td>
            <td>${stats.p99.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    }
}

function updateTopList(tableId, data) {
    const tbody = document.getElementById(tableId);
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item._id}</td>
            <td>${item.count}</td>
        `;
        tbody.appendChild(row);
    });
}

// Initial fetch and set interval
let fetchIntervalId;

function startFetching() {
    fetchData(); // Fetch immediately
    const intervalSeconds = parseInt(document.getElementById('interval').value, 10) || 5;
    fetchIntervalId = setInterval(fetchData, intervalSeconds * 1000);
}

document.getElementById('interval').addEventListener('change', () => {
    clearInterval(fetchIntervalId);
    startFetching();
});

startFetching();
