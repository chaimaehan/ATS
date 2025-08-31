// Handle download button animation and tracking
function handleDownload(button, reportType) {
    // Prevent multiple clicks
    if (button.classList.contains('loading')) return false;

    // Show loading state
    button.classList.add('loading');
    const originalText = button.innerHTML;
    button.innerHTML = '<div class="loading-spinner"></div> Téléchargement...';

    // Simulate download completion (the actual download happens via the href)
    setTimeout(() => {
        button.classList.remove('loading');
        button.classList.add('success');
        button.innerHTML = '<i class="fas fa-check"></i> Téléchargé!';

        // Track download
        trackDownload(reportType);

        // Reset button after 2 seconds
        setTimeout(() => {
            button.classList.remove('success');
            button.innerHTML = originalText;
        }, 2000);
    }, 1000);

    return true;
}

// Download recruitment report in specified format
function downloadRecruitment(format) {
    const url = `/reports/download/recruitment?format=${format}`;

    // Create temporary link and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = `rapport-recrutement.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Track download
    trackDownload('recruitment', format);

    // Show success message
    showNotification(`Rapport téléchargé en format ${format.toUpperCase()}`, 'success');
}

// Show format options for recruitment report
function showFormatOptions(button) {
    const formatSelector = button.parentElement.querySelector('.format-selector');
    if (formatSelector) {
        formatSelector.style.display = formatSelector.style.display === 'none' ? 'flex' : 'none';
    }
}

// Track downloads (could send to analytics endpoint)
function trackDownload(reportType, format = null) {
    console.log(`Download tracked: ${reportType}${format ? ` (${format})` : ''}`);

    // Optional: Send to analytics endpoint
    fetch('/api/track-download', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            report_type: reportType,
            format: format,
            timestamp: new Date().toISOString()
        })
    }).catch(err => console.log('Analytics tracking failed:', err));
}

// Refresh statistics
function refreshStats() {
    const refreshBtn = document.querySelector('.refresh-btn');
    const originalContent = refreshBtn.innerHTML;

    // Show loading state
    refreshBtn.innerHTML = '<div class="loading-spinner"></div> Actualisation...';
    refreshBtn.disabled = true;

    fetch('/api/reports/stats')
        .then(response => response.json())
        .then(data => {
            // Update main statistics with real data
            document.getElementById('reports-generated').textContent = data.generatedReports || 0;
            document.getElementById('downloads-count').textContent = data.downloads || 0;
            document.getElementById('active-candidates').textContent = data.totalCandidates || 0;

            // Update change indicators with calculated percentages
            const candidatesChange = data.candidatesChange || 0;
            const applicationsChange = data.applicationsChange || 0;
            const downloadsChange = data.downloadsChange || 0;

            // Update change text with appropriate indicators
            updateChangeIndicator('candidates-change', candidatesChange, 'cette semaine');
            updateChangeIndicator('downloads-change', downloadsChange, 'cette semaine');
            updateChangeIndicator('reports-change', Math.max(candidatesChange, applicationsChange), 'ce mois-ci');

            // Update last modified dates
            const now = new Date().toLocaleDateString('fr-FR');
            document.getElementById('monthly-date').textContent = now;
            document.getElementById('performance-date').textContent = now;
            document.getElementById('recruitment-date').textContent = now;

            // Show additional info in console for debugging
            console.log('Stats updated:', {
                candidates: data.totalCandidates,
                newThisWeek: data.newCandidatesWeek,
                applications: data.totalApplications,
                downloads: data.downloads,
                reports: data.generatedReports
            });

            showNotification('Statistiques mises à jour', 'success');
        })
        .catch(error => {
            console.error('Error refreshing stats:', error);
            showNotification('Erreur lors de la mise à jour', 'error');
        })
        .finally(() => {
            // Reset button
            setTimeout(() => {
                refreshBtn.innerHTML = originalContent;
                refreshBtn.disabled = false;
            }, 1000);
        });
}

// Helper function to update change indicators
function updateChangeIndicator(elementId, changePercent, period) {
    const element = document.getElementById(elementId);
    const changeIcon = changePercent >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
    const changeClass = changePercent >= 0 ? 'positive' : 'negative';
    const changeText = Math.abs(changePercent);

    // Update the parent element's class
    const parentElement = element.closest('.stat-change');
    parentElement.className = `stat-change ${changeClass}`;

    // Update the content
    element.parentElement.innerHTML = `<i class="fas ${changeIcon}"></i> <span id="${elementId}">${changeText}% ${period}</span>`;
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 1000;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
                max-width: 300px;
            `;

    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.background = '#2ecc71';
            break;
        case 'error':
            notification.style.background = '#e74c3c';
            break;
        default:
            notification.style.background = '#4361ee';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);

    // Animate out and remove
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Auto-refresh stats every 5 minutes
setInterval(refreshStats, 5 * 60 * 1000);

// Initialize page
document.addEventListener('DOMContentLoaded', function () {
    // Set current dates
    const now = new Date().toLocaleDateString('fr-FR');
    document.getElementById('monthly-date').textContent = now;
    document.getElementById('performance-date').textContent = now;
    document.getElementById('recruitment-date').textContent = now;

    // Load initial stats
    refreshStats();

    console.log('Reports dashboard initialized');
});

// Handle download links with better error handling
document.addEventListener('click', function (e) {
    if (e.target.closest('.download-btn[href]')) {
        const link = e.target.closest('.download-btn[href]');
        const reportType = link.href.includes('monthly') ? 'monthly' :
            link.href.includes('performance') ? 'performance' : 'unknown';

        // Don't prevent default, let browser handle download
        setTimeout(() => {
            showNotification('Téléchargement en cours...', 'info');
            trackDownload(reportType);
        }, 100);
    }
});