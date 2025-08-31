// Initialize Lucide icons safely
    if (typeof lucide !== "undefined" && lucide.createIcons) {
        lucide.createIcons();
    } else {
        console.warn("Lucide icons library not loaded — chatbot icons may not display.");
    }

    class ChatBot {
        constructor() {
            this.trigger = document.getElementById('chatbot-trigger');
            this.window = document.getElementById('chatbot-window');
            this.messages = document.getElementById('chatbot-messages');
            this.input = document.getElementById('chatbot-input');
            this.isOpen = false;

            this.responses = {
                'bonjour': 'Bonjour ! Comment puis-je vous assister avec votre système RH aujourd\'hui ?',
                'aide': 'Je peux vous aider avec : 📋 Gestion des CVs, 👥 Recherche de candidats, 💼 Offres d\'emploi, 📊 Analytics, ⚙️ Paramètres système',
                'cv': 'Pour gérer les CVs : cliquez sur "Ajouter CV" pour télécharger, ou "Candidats" pour consulter la base existante. L\'IA analyse automatiquement chaque CV.',
                'candidat': 'Dans la section "Candidats", vous pouvez filtrer par compétences, expérience, score IA, et voir les profils détaillés de chaque candidat.',
                'offre': 'Gérez vos offres dans la section "Offres d\'Emploi" : créez, modifiez, publiez et suivez les candidatures pour chaque poste.',
                'recherche': 'Utilisez la recherche IA intelligente pour trouver des candidats par mots-clés, compétences ou critères spécifiques.',
                'score': 'Le score IA évalue la compatibilité candidat-poste basé sur les compétences, expérience et critères définis.',
                'statistique': 'Consultez vos métriques dans le tableau de bord : candidatures totales, offres actives, taux de matching et tendances.',
                'merci': 'De rien ! N\'hésitez pas si vous avez d\'autres questions. 😊'
            };

            this.init();
        }

        init() {
            if (!this.trigger || !this.input) {
                console.error("ChatBot elements not found in DOM.");
                return;
            }

            console.log("✅ ChatBot initialized");

            this.trigger.addEventListener('click', () => this.toggleWindow());

            // Use keydown instead of keypress for better browser support
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        toggleWindow() {
            this.isOpen = !this.isOpen;
            this.window.style.display = this.isOpen ? 'block' : 'none';

            if (this.isOpen) {
                this.input.focus();
                this.trigger.innerHTML = '<i data-lucide="x"></i>';
            } else {
                this.trigger.innerHTML = '<i data-lucide="message-circle"></i>';
            }

            if (typeof lucide !== "undefined" && lucide.createIcons) {
                lucide.createIcons();
            }
        }

        sendMessage() {
            const message = this.input.value.trim();
            if (!message) return;

            this.addMessage('user', message);
            this.input.value = '';

            setTimeout(() => {
                const response = this.generateResponse(message);
                this.addMessage('bot', response);
            }, 800 + Math.random() * 800);
        }

        addMessage(sender, text) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${sender}`;

            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            bubble.textContent = text;

            messageDiv.appendChild(bubble);
            this.messages.appendChild(messageDiv);
            this.messages.scrollTop = this.messages.scrollHeight;
        }

        generateResponse(message) {
            const lowerMessage = message.toLowerCase();
            for (const [key, response] of Object.entries(this.responses)) {
                if (lowerMessage.includes(key)) {
                    return response;
                }
            }
            if (lowerMessage.includes('comment') || lowerMessage.includes('pourquoi')) {
                return 'Excellente question ! Pouvez-vous être plus spécifique ?';
            }
            if (lowerMessage.includes('problème') || lowerMessage.includes('erreur')) {
                return 'Je comprends votre préoccupation. Pouvez-vous préciser le problème ?';
            }
            return 'Je ne suis pas sûr de comprendre. Essayez des questions sur les CVs, candidats, offres, recherche IA ou statistiques.';
        }
    }

    // Notifications system (unchanged)
    function initializeNotifications() {
        const trigger = document.getElementById('notification-trigger');
        const dropdown = document.getElementById('notifications-dropdown');
        const markAllRead = document.getElementById('mark-all-read');
        const notificationCount = document.getElementById('notification-count');

        let isOpen = false;
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            isOpen = !isOpen;
            dropdown.classList.toggle('show', isOpen);
        });
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
                isOpen = false;
                dropdown.classList.remove('show');
            }
        });
        markAllRead.addEventListener('click', () => {
            dropdown.querySelectorAll('.notification-item.unread')
                .forEach(item => item.classList.remove('unread'));
            notificationCount.textContent = '0';
            notificationCount.style.display = 'none';
        });
    }

    // Initialize safely
    document.addEventListener('DOMContentLoaded', () => {
        try {
            new ChatBot();
            initializeNotifications();
        } catch (err) {
            console.error("❌ ChatBot initialization failed:", err);
        }
    });