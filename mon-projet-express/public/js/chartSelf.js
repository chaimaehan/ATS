// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', function () {
    // Petit délai pour s'assurer que tout est chargé
    setTimeout(() => {
        initializeChart();
        initializeChartActions();
    }, 100);
});

// Variables globales
let myChart = null;
let pieChart = null;
let currentPieView = 'overview';

// Configuration et création du graphique
function initializeChart() {
    const canvas = document.getElementById('myChart');
    if (!canvas) {
        console.error('Canvas myChart non trouvé');
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Impossible d\'obtenir le contexte 2D');
        return;
    }

    // Vérifier si Chart.js est chargé
    if (typeof Chart === 'undefined') {
        console.error('Chart.js n\'est pas chargé');
        // Fallback : afficher un message
        showChartFallback();
        return;
    }

    try {
        // Détruire le graphique existant s'il y en a un
        if (myChart) {
            myChart.destroy();
        }

        myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Utilisateurs\nactifs', 'Offres\npubliées', 'Candidatures', 'Matching %'],
                datasets: [{
                    label: 'Statistiques',
                    data: [1245, 58, 432, 78],
                    backgroundColor: [
                        'rgba(74, 108, 247, 0.8)',
                        'rgba(125, 92, 198, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(245, 158, 11, 0.8)'
                    ],
                    borderColor: [
                        '#4a6cf7',
                        '#7d5cc6',
                        '#ef4444',
                        '#f59e0b'
                    ],
                    borderWidth: 2,
                    borderRadius: 6,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            stepSize: 200,
                            color: '#64748b',
                            font: {
                                size: 12
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#64748b',
                            font: {
                                size: 12
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(30, 41, 59, 0.95)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#4a6cf7',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: {
                            size: 14,
                            weight: 'bold'
                        },
                        bodyFont: {
                            size: 13
                        },
                        displayColors: true,
                        callbacks: {
                            title: function (context) {
                                return context[0].label.replace('\n', ' ');
                            },
                            label: function (context) {
                                let value = context.parsed.y;
                                if (context.label.includes('Matching')) {
                                    return `Valeur: ${value}%`;
                                }
                                return `Valeur: ${value.toLocaleString()}`;
                            }
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart'
                }
            }
        });

        console.log('Graphique initialisé avec succès');
    } catch (error) {
        console.error('Erreur lors de la création du graphique:', error);
        showChartFallback();
    }
}

// Fallback si le graphique ne peut pas être créé
function showChartFallback() {
    const container = document.getElementById('chartContainer');
    container.innerHTML = `
                <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                    border-radius: 12px;
                    border: 2px dashed #cbd5e1;
                    flex-direction: column;
                    gap: 15px;
                    color: #64748b;
                ">
                    <i class="fas fa-chart-bar" style="font-size: 48px; opacity: 0.5;"></i>
                    <div style="text-align: center;">
                        <h4 style="margin: 0; color: #475569;">Graphique indisponible</h4>
                        <p style="margin: 5px 0 0 0; font-size: 14px;">Les données sont affichées dans le tableau ci-dessus</p>
                    </div>
                </div>
            `;
}

// Gestion des boutons d'action du graphique
function initializeChartActions() {
    const buttons = document.querySelectorAll('.chart-actions button');

    buttons.forEach(button => {
        button.addEventListener('click', function () {
            // Retirer la classe active de tous les boutons
            buttons.forEach(btn => btn.classList.remove('active'));

            // Ajouter la classe active au bouton cliqué
            this.classList.add('active');

            // Simuler le changement de données selon la période
            updateChartData(this.textContent);
        });
    });
}

// Mise à jour des données du graphique selon la période
function updateChartData(period) {
    if (!myChart) return;

    let newData;
    switch (period) {
        case '7 jours':
            newData = [315, 12, 89, 72];
            break;
        case '30 jours':
            newData = [1245, 58, 432, 78];
            break;
        case '90 jours':
            newData = [3680, 156, 1205, 81];
            break;
        default:
            newData = [1245, 58, 432, 78];
    }

    myChart.data.datasets[0].data = newData;
    myChart.update('active');

    console.log('Données du graphique mises à jour pour:', period);
}

// Gestion des erreurs de chargement
window.addEventListener('error', function (e) {
    if (e.target.src && e.target.src.includes('chartSelf.js')) {
        console.error('Erreur de chargement de Chart.js');
        showChartFallback();
    }
});

function initializePieChart() {
    const canvas = document.getElementById('pieChart');
    if (!canvas) {
        console.error('Canvas pieChart non trouvé');
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Impossible d\'obtenir le contexte 2D pour le pie chart');
        return;
    }

    if (typeof Chart === 'undefined') {
        console.error('Chart.js n\'est pas chargé pour le pie chart');
        showPieChartFallback();
        return;
    }

    try {
        if (pieChart) {
            pieChart.destroy();
        }

        // Get data based on current view
        const chartData = getPieChartData(currentPieView);

        pieChart = new Chart(ctx, {
            type: 'pie',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(30, 41, 59, 0.95)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#4a6cf7',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                let value = context.parsed;
                                let total = context.dataset.data.reduce((a, b) => a + b, 0);
                                let percentage = ((value / total) * 100).toFixed(1);
                                return `${context.label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart'
                }
            }
        });

        console.log('Pie chart initialisé avec succès');
    } catch (error) {
        console.error('Erreur lors de la création du pie chart:', error);
        showPieChartFallback();
    }
}

// Function to get pie chart data based on view
function getPieChartData(view) {
    if (view === 'overview') {
        return {
            labels: ['Candidats totaux', 'Candidats avec candidatures', 'Offres disponibles'],
            datasets: [{
                data: [
                    pieData.totalCandidates || 0,
                    pieData.totalApplications || 0,
                    pieData.totalOffers || 0
                ],
                backgroundColor: ['#4a6cf7', '#10b981', '#f59e0b'],
                borderColor: ['#3a5ae8', '#059669', '#d97706'],
                borderWidth: 2,
                hoverOffset: 10
            }]
        };
    } else {
        return {
            labels: ['Candidats avec CV', 'Candidats sans CV', 'Candidats récents (30j)', 'Candidats anciens'],
            datasets: [{
                data: [
                    pieData.candidatesWithCV || 0,
                    pieData.candidatesWithoutCV || 0,
                    pieData.recentCandidates || 0,
                    pieData.olderCandidates || 0
                ],
                backgroundColor: ['#10b981', '#ef4444', '#8b5cf6', '#64748b'],
                borderColor: ['#059669', '#dc2626', '#7c3aed', '#475569'],
                borderWidth: 2,
                hoverOffset: 10
            }]
        };
    }
}


// Function to switch pie chart view
function switchPieChart(view) {
    currentPieView = view;

    // Update button states
    const buttons = document.querySelectorAll('#pieChartContainer').parentElement.querySelectorAll('.chart-actions button');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Reinitialize chart with new data
    initializePieChart();
}

// Function to show pie chart fallback
function showPieChartFallback() {
    const container = document.getElementById('pieChartContainer');
    container.innerHTML = `
        <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            height: 300px;
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border-radius: 12px;
            border: 2px dashed #cbd5e1;
            flex-direction: column;
            gap: 15px;
            color: #64748b;
        ">
            <i class="fas fa-chart-pie" style="font-size: 48px; opacity: 0.5;"></i>
            <div style="text-align: center;">
                <h4 style="margin: 0; color: #475569;">Graphique en secteurs indisponible</h4>
                <p style="margin: 5px 0 0 0; font-size: 14px;">Les données sont affichées dans les statistiques ci-dessus</p>
            </div>
        </div>
    `;
}

// Update your DOMContentLoaded event listener to include pie chart initialization
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => {
        initializeChart();
        initializeChartActions();
        initializePieChart(); // Add this line
    }, 100);
});

function getPieDataFromDOM() {
    const el = document.getElementById("pie-data");
    if (!el) return {};
    try {
        return JSON.parse(el.textContent);
    } catch (e) {
        console.error("Failed to parse pie data", e);
        return {};
    }
}

const pieData = getPieDataFromDOM();