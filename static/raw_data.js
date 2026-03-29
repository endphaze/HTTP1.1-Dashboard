async function fetchRawData() {
    try {
        const response = await fetch('/api/raw-data');
        const result = await response.json();

        document.getElementById('lastUpdate').innerText = `Last update: ${new Date().toLocaleTimeString()}`;

        renderTable(result.data);
    } catch (error) {
        console.error('Error fetching raw data:', error);
    }
}

function renderTable(data) {
    if (!data || data.length === 0) {
        document.getElementById('tableBody').innerHTML = '<tr><td colspan="100%">No data available</td></tr>';
        return;
    }

    // Extract all unique keys to form the columns
    const allKeys = new Set();
    data.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
    });

    // Sort keys: _id first, then time, type, then the rest
    const sortedKeys = Array.from(allKeys).sort((a, b) => {
        const order = { '_id': 1, 'time': 2, 'type': 3 };
        const orderA = order[a] || 100;
        const orderB = order[b] || 100;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });

    // Render Header
    const thead = document.getElementById('tableHead');
    thead.innerHTML = '';
    const headerRow = document.createElement('tr');
    sortedKeys.forEach(key => {
        const th = document.createElement('th');
        th.textContent = key;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Render Body
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');
        sortedKeys.forEach(key => {
            const td = document.createElement('td');
            let value = item[key];
            if (value === null || value === undefined) {
                value = '-';
            } else if (typeof value === 'object') {
                value = JSON.stringify(value);
            }
            td.textContent = value;
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });
}

// Fetch every 5 seconds per spec
setInterval(fetchRawData, 5000);

// Initial fetch
fetchRawData();
