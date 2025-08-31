function toggleFilter() {
    const checkbox = document.getElementById('applicationFilter');
    const cards = document.querySelectorAll('.candidate-card');
    const container = document.getElementById('candidatesContainer');
    const noResults = document.getElementById('noResults');
    const statsDisplay = document.getElementById('statsDisplay');

    let visibleCount = 0;

    cards.forEach(card => {
        const hasApplication = card.getAttribute('data-has-application') === 'true';

        if (checkbox.checked) {
            // Show only candidates with applications
            if (hasApplication) {
                card.style.display = 'block';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        } else {
            // Show all candidates
            card.style.display = 'block';
            visibleCount++;
        }
    });

    // Update stats display
    if (checkbox.checked) {
        const totalWithApplications = document.querySelectorAll('[data-has-application="true"]').length;
        statsDisplay.textContent = `Avec candidatures: ${totalWithApplications} candidat${totalWithApplications > 1 ? 's' : ''}`;
    } else {
        const totalCandidates = cards.length;
        statsDisplay.textContent = `Total: ${totalCandidates} candidat${totalCandidates > 1 ? 's' : ''}`;
    }

    // Show/hide no results message
    if (visibleCount === 0) {
        container.style.display = 'none';
        noResults.style.display = 'block';
    } else {
        container.style.display = 'flex';
        noResults.style.display = 'none';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    toggleFilter(); // Apply initial filter state
});