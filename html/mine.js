// === Sistema de Avisos/Notificações ===
const NOTICES = {
    current: "notice-2025-11-25", // ID do aviso atual
    notices: {
        "notice-2025-11-25": {
            title: "Atualizações / Novidades",
            content: `
                <div style="text-align: center; padding: 20px;">
                    <h2 style="font-family: 'Courier New'; margin-bottom: 20px;">NOVIDADES</h2>
                    <ul style="text-align: left; max-width: 400px; margin: 0 auto;">
                        <li>1. Novos temas, porem sao feios nao sei fazer</li>
                        <li>2. Sistema de login por Discord</li>
                        <li>3. Mapa 3d do servidor, com cenas atuais: 1.Base 2. Quartos</li>
                    </ul>
                    <p style="margin-top: 30px; font-size: 12px; opacity: 0.7;">
                        Versão 2.0 - Novembro 2025
                    </p>
                </div>
            `,
            priority: "high"
        }
    }
};

let loggedUserId = null; // Será preenchido após verificar autenticação

async function checkAndShowNotice() {
    if (!loggedUserId) return;
    
    const currentNoticeId = NOTICES.current;
    if (!currentNoticeId || !NOTICES.notices[currentNoticeId]) return;
    
    try {
        // Verificar se o usuário já dispensou este aviso
        const response = await fetch(`/api/notices/dismissed/${loggedUserId}`);
        const data = await response.json();
        
        if (data.success && data.dismissed.includes(currentNoticeId)) {
            // Usuário já clicou em "Não ver mais" para este aviso
            return;
        }
        
        // Mostrar o aviso
        showNotice(currentNoticeId);
    } catch (error) {
        console.error('Erro ao verificar avisos:', error);
        // Em caso de erro, mostra o aviso mesmo assim
        showNotice(currentNoticeId);
    }
}

function showNotice(noticeId) {
    const notice = NOTICES.notices[noticeId];
    if (!notice) return;
    
    const modal = document.getElementById('noticeModal');
    const titleEl = document.getElementById('noticeTitle');
    const contentEl = document.getElementById('noticeContent');
    const priorityEl = document.getElementById('noticePriority');
    
    titleEl.textContent = notice.title;
    contentEl.innerHTML = notice.content;
    
    // Configurar badge de prioridade
    priorityEl.textContent = notice.priority === 'high' ? 'NOVO' : 
                             notice.priority === 'medium' ? 'INFO' : 'DICA';
    priorityEl.className = 'notice-priority ' + notice.priority;
    
    // Armazenar o ID do aviso atual para usar no dismiss
    modal.dataset.noticeId = noticeId;
    
    modal.classList.add('active');
}

function closeNotice() {
    const modal = document.getElementById('noticeModal');
    modal.classList.remove('active');
}

async function dismissNotice() {
    const modal = document.getElementById('noticeModal');
    const noticeId = modal.dataset.noticeId;
    
    if (!loggedUserId || !noticeId) {
        closeNotice();
        return;
    }
    
    try {
        await fetch('/api/notices/dismiss', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: loggedUserId,
                noticeId: noticeId
            })
        });
    } catch (error) {
        console.error('Erro ao dispensar aviso:', error);
    }
    
    closeNotice();
}

// Event listeners para o modal de avisos
document.getElementById('noticeCloseBtn').addEventListener('click', closeNotice);
document.getElementById('noticeDismissBtn').addEventListener('click', dismissNotice);

// Fechar modal ao clicar fora
document.getElementById('noticeModal').addEventListener('click', (e) => {
    if (e.target.id === 'noticeModal') {
        closeNotice();
    }
});

// Fechar modal com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('noticeModal').classList.contains('active')) {
        closeNotice();
    }
});

// === Sistema de Autenticação Discord ===
let authToken = null;
let authCheckInterval = null;
let currentUserId = null;
let currentUserName = null;

// Verificar se está autenticado ao carregar a página
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (!data.authenticated) {
            showLoginModal();
        } else {
            // Usuário autenticado - buscar info e verificar avisos
            await loadUserInfo();
        }
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        showLoginModal();
    }
}

// Carregar informações do usuário logado
async function loadUserInfo() {
    try {
        const response = await fetch('/api/user-info');
        const data = await response.json();
        
        if (data.authenticated && data.userId) {
            loggedUserId = data.userId;
            // Verificar e mostrar avisos após identificar o usuário
            checkAndShowNotice();
        }
    } catch (error) {
        console.error('Erro ao carregar info do usuário:', error);
    }
}

// Mostrar modal de login
function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    loginModal.style.display = 'flex';
    loadDiscordMembersForLogin();
}

// Carregar membros do Discord para o modal de login
async function loadDiscordMembersForLogin() {
    const membersList = document.getElementById('loginMembersList');
    
    try {
        const response = await fetch('/api/discord/members');
        const data = await response.json();
        
        if (data.members && data.members.length > 0) {
            membersList.innerHTML = '';
            
            data.members.forEach(member => {
                const memberItem = document.createElement('div');
                memberItem.className = 'member-item';
                memberItem.innerHTML = `
                    <img src="${member.avatar}" alt="${member.name}" class="member-avatar">
                    <div class="member-info">
                        <div class="member-name">${member.displayName || member.name}</div>
                        <div class="member-status">${member.status || 'offline'}</div>
                    </div>
                `;
                
                memberItem.addEventListener('click', () => {
                    requestAuth(member.id, member.displayName || member.name);
                });
                
                membersList.appendChild(memberItem);
            });
        } else {
            membersList.innerHTML = '<div class="loading-message">Nenhum membro encontrado.</div>';
        }
    } catch (error) {
        console.error('Erro ao carregar membros:', error);
        membersList.innerHTML = '<div class="loading-message">Erro ao carregar membros.</div>';
    }
}

// Solicitar autenticação
async function requestAuth(userId, userName) {
    try {
        const response = await fetch('/api/discord/request-auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                userName: userName,
                userIp: 'Site Access'
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.token) {
            authToken = data.token;
            showAuthWaiting(userId, userName);
            startAuthCheck();
        } else {
            alert('Erro ao solicitar autenticação. Tente novamente.');
        }
    } catch (error) {
        console.error('Erro ao solicitar autenticação:', error);
        alert('Erro ao solicitar autenticação. Tente novamente.');
    }
}

// Mostrar tela de espera
function showAuthWaiting(userId, userName) {
    currentUserId = userId;
    currentUserName = userName;
    document.getElementById('loginContent').style.display = 'none';
    document.getElementById('authWaiting').style.display = 'block';
}

// Verificar status da autenticação periodicamente
function startAuthCheck() {
    authCheckInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/discord/verify-auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: authToken,
                    userId: currentUserId,
                    userName: currentUserName
                })
            });
            
            const data = await response.json();
            
            if (data.verified) {
                clearInterval(authCheckInterval);
                document.getElementById('loginModal').style.display = 'none';
                location.reload(); // Recarregar página após autenticação
            } else if (data.expired) {
                clearInterval(authCheckInterval);
                cancelAuth();
                alert('Tempo de autenticação expirado. Tente novamente.');
            }
        } catch (error) {
            console.error('Erro ao verificar autenticação:', error);
        }
    }, 2000); // Verificar a cada 2 segundos
}

// Cancelar autenticação
function cancelAuth() {
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
    }
    authToken = null;
    currentUserId = null;
    currentUserName = null;
    document.getElementById('loginContent').style.display = 'block';
    document.getElementById('authWaiting').style.display = 'none';
}

// Botão de cancelar
document.getElementById('authCancelBtn').addEventListener('click', cancelAuth);

// Verificar autenticação ao carregar
checkAuth();

// === User Profile Component ===
async function loadUserProfile() {
    try {
        const response = await fetch('/api/user-info');
        const data = await response.json();
        
        if (data.authenticated && data.userName) {
            const userProfile = document.getElementById('userProfile');
            const userAvatar = document.getElementById('userAvatar');
            const userName = document.getElementById('userName');
            
            // Definir avatar ou usar um placeholder
            if (data.avatar) {
                userAvatar.src = data.avatar;
            } else {
                // Avatar padrão se não tiver
                userAvatar.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"%3E%3Cpath d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/%3E%3C/svg%3E';
            }
            
            userName.textContent = data.userName;
            userProfile.style.display = 'flex';
        }
    } catch (error) {
        console.error('Erro ao carregar perfil do usuário:', error);
    }
}

// Toggle user dropdown
const userProfile = document.getElementById('userProfile');
const userDropdown = document.getElementById('userDropdown');

if (userProfile) {
    userProfile.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('active');
    });
}

// Logout handler
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            const response = await fetch('/api/logout', {
                method: 'POST'
            });
            
            if (response.ok) {
                location.reload(); // Recarregar para mostrar modal de login
            }
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            alert('Erro ao fazer logout. Tente novamente.');
        }
    });
}

// Fechar dropdown ao clicar fora
document.addEventListener('click', () => {
    if (userDropdown) {
        userDropdown.classList.remove('active');
    }
});

// Carregar perfil do usuário
loadUserProfile();

// Theme Selector
const themeSelectorBtn = document.getElementById('themeSelectorBtn');
const themeDropdown = document.getElementById('themeDropdown');
const themeOptions = document.querySelectorAll('.theme-option');

// Load saved theme from localStorage (dark is the default now)
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
updateActiveTheme(savedTheme);

// Dropdown open/close helpers
function openThemeDropdown(focusFirst = false) {
    themeDropdown.classList.add('active');
    themeSelectorBtn.setAttribute('aria-expanded', 'true');
    if (focusFirst) {
        const first = themeDropdown.querySelector('.theme-option');
        if (first) first.focus();
    }
}

function closeThemeDropdown() {
    themeDropdown.classList.remove('active');
    themeSelectorBtn.setAttribute('aria-expanded', 'false');
}

// Toggle dropdown
themeSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (themeDropdown.classList.contains('active')) closeThemeDropdown();
    else openThemeDropdown(true);
});

// Keyboard on button: Enter/Space to toggle, ArrowDown open and focus first, Esc close
themeSelectorBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        themeSelectorBtn.click();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        openThemeDropdown(true);
    } else if (e.key === 'Escape') {
        closeThemeDropdown();
    }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!themeDropdown.contains(e.target) && e.target !== themeSelectorBtn) {
        closeThemeDropdown();
    }
});

// Activate theme from option
function selectThemeFromOption(optionEl) {
    const theme = optionEl.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateActiveTheme(theme);
    closeThemeDropdown();
    themeSelectorBtn.focus();
}

// Theme selection and keyboard navigation
themeOptions.forEach(option => {
    option.addEventListener('click', () => selectThemeFromOption(option));

    option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectThemeFromOption(option);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = option.nextElementSibling;
            if (next && next.classList.contains('theme-option')) next.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = option.previousElementSibling;
            if (prev && prev.classList.contains('theme-option')) prev.focus();
            else themeSelectorBtn.focus();
        } else if (e.key === 'Escape') {
            closeThemeDropdown();
            themeSelectorBtn.focus();
        }
    });
});

function updateActiveTheme(theme) {
    themeOptions.forEach(opt => {
        const isActive = opt.getAttribute('data-theme') === theme;
        opt.classList.toggle('active', isActive);
        opt.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
}

async function loadStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const statusBadge = document.getElementById("statusBadge");
        const playersCount = document.getElementById("playersCount");
        const playersOnlineCount = document.getElementById("playersOnlineCount");
        const playersList = document.getElementById("playersList");
        
        if (data.error) {
            statusBadge.className = "server-status offline";
            statusBadge.innerHTML = '<div class="pulse-dot"></div><span>Offline</span>';
            playersCount.textContent = "-- / 20";
            playersOnlineCount.textContent = "0";
            playersList.innerHTML = '<div class="empty-players">Servidor offline...</div>';
        } else {
            statusBadge.className = "server-status";
            statusBadge.innerHTML = '<div class="pulse-dot green"></div><span>Online</span>';
            playersCount.textContent = `${data.players_online} / ${data.players_max}`;
            
            // Atualizar lista de jogadores
            playersOnlineCount.textContent = data.players_online || 0;
            
            if (data.players_list && data.players_list.length > 0) {
                playersList.innerHTML = data.players_list.map(player => `
                    <div class="player-item">
                        <div class="player-indicator"></div>
                        <span>${player}</span>
                    </div>
                `).join('');
            } else if (data.players_online > 0) {
                // Caso o servidor não retorne a lista mas tenha jogadores
                playersList.innerHTML = '<div class="empty-players">Lista de jogadores não disponível...</div>';
            } else {
                playersList.innerHTML = '<div class="empty-players">Nenhum jogador online no momento...</div>';
            }
        }
    } catch (error) {
        console.error('Erro ao carregar status:', error);
        document.getElementById("statusBadge").className = "server-status offline";
        document.getElementById("playersOnlineCount").textContent = "0";
        document.getElementById("playersList").innerHTML = '<div class="empty-players">Erro ao carregar...</div>';
    }
}

function updateDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const dateTimeString = `${day}/${month}/${year} ${hours}:${minutes}`;
    document.getElementById('currentDateTime').innerHTML = dateTimeString;
}

async function updateSystemMetrics() {
    try {
        const res = await fetch('/api/system-metrics');
        const data = await res.json();
        
        // Atualizar CPU
        const cpuValue = document.getElementById('cpuValue');
        const cpuBar = document.getElementById('cpuBar');
        const cpuNum = Number(data.cpu_percent) || 0;
        // Exibir com 1 casa decimal e vírgula (e.g. 0,0%)
        cpuValue.textContent = (cpuNum.toFixed(1).toString().replace('.',',')) + '%';
        // Largura da barra usa valor numérico (ponto decimal não afeta)
        cpuBar.style.width = `${cpuNum}%`;
        
        // Cor da barra baseada no uso
        cpuBar.className = 'metric-bar-fill';
        if (data.cpu_percent > 80) {
            cpuBar.classList.add('high');
        } else if (data.cpu_percent > 60) {
            cpuBar.classList.add('medium');
        }
        
        // Atualizar RAM
        const ramValue = document.getElementById('ramValue');
        const ramBar = document.getElementById('ramBar');
        const ramNum = Number(data.ram_percent) || 0;
        ramValue.textContent = (ramNum.toFixed(1).toString().replace('.',',')) + '%';
        ramBar.style.width = `${ramNum}%`;
        
        // Cor da barra baseada no uso
        ramBar.className = 'metric-bar-fill';
        if (data.ram_percent > 80) {
            ramBar.classList.add('high');
        } else if (data.ram_percent > 60) {
            ramBar.classList.add('medium');
        }
    } catch (error) {
        console.error('Erro ao buscar métricas do sistema:', error);
    }
}

// Copy IP button behaviour
(function(){
    const copyBtn = document.getElementById('copyIpBtn');
    const addr = document.getElementById('serverAddress');
    if (!copyBtn || !addr) return;

    // armazenar SVG original para restaurar depois
    copyBtn.dataset.original = copyBtn.innerHTML;

    const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20.3 7.7l-1.4-1.4z" fill="#4ade80"/></svg>';

    copyBtn.addEventListener('click', async function(e){
        e.preventDefault();
        const text = addr.textContent.trim();
        try {
            await navigator.clipboard.writeText(text);
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = checkSvg;
            setTimeout(()=> {
                copyBtn.innerHTML = copyBtn.dataset.original;
                copyBtn.classList.remove('copied');
            }, 1800);
        } catch (err) {
            console.error('Erro ao copiar IP:', err);
            // fallback: selecionar e tentar copiar
            try {
                const range = document.createRange();
                range.selectNodeContents(addr);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('copy');
                sel.removeAllRanges();
                alert('Endereço copiado (fallback)');
            } catch (e) {
                alert('Não foi possível copiar o endereço');
            }
        }
    });
})();

// Funções do Modal de Logs
const logsBtn = document.getElementById('logsBtn');
const logsModal = document.getElementById('logsModal');
const logsCloseBtn = document.getElementById('logsCloseBtn');
const logsContent = document.getElementById('logsContent');

async function openLogsModal() {
    logsModal.classList.add('active');
    logsContent.innerHTML = '<div class="logs-loading">⟳ CARREGANDO LOGS...</div>';
    
    try {
        const res = await fetch('/api/logs');
        const data = await res.json();
        
        if (data.success && data.logs) {
            if (data.logs.length === 0) {
                logsContent.innerHTML = '<div class="logs-loading">NENHUM LOG ENCONTRADO</div>';
                return;
            }
            
            // Processar e exibir logs
            const logsHtml = data.logs.map(line => {
                let className = 'log-line info';
                
                // Detectar tipo de log baseado no conteúdo
                if (line.includes('/WARN') || line.includes('WARNING')) {
                    className = 'log-line warn';
                } else if (line.includes('/ERROR') || line.includes('Exception') || line.includes('Error')) {
                    className = 'log-line error';
                } else if (line.includes('/DEBUG')) {
                    className = 'log-line debug';
                }
                
                // Escapar HTML para evitar problemas
                const escapedLine = line
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
                
                return `<div class="${className}">${escapedLine}</div>`;
            }).join('');
            
            logsContent.innerHTML = logsHtml;
            
            // Auto-scroll para o final
            logsContent.scrollTop = logsContent.scrollHeight;
        } else {
            logsContent.innerHTML = `<div class="logs-error">ERRO AO CARREGAR LOGS:<br/>${data.error || 'Erro desconhecido'}</div>`;
        }
    } catch (error) {
        console.error('Erro ao carregar logs:', error);
        logsContent.innerHTML = `<div class="logs-error">ERRO DE CONEXÃO:<br/>${error.message}</div>`;
    }
}

function closeLogsModal() {
    logsModal.classList.remove('active');
}

logsBtn.addEventListener('click', openLogsModal);
logsCloseBtn.addEventListener('click', closeLogsModal);

// Fechar modal ao clicar fora
logsModal.addEventListener('click', (e) => {
    if (e.target === logsModal) {
        closeLogsModal();
    }
});

// Fechar modal com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && logsModal.classList.contains('active')) {
        closeLogsModal();
    }
});

// Modal do BlueMap
const bluemapBtn = document.getElementById('bluemapBtn');
const bluemapModal = document.getElementById('bluemapModal');
const bluemapCloseBtn = document.getElementById('bluemapCloseBtn');
const bluemapIframe = document.getElementById('bluemapIframe');
const mapBtn1 = document.getElementById('mapBtn1');
const mapBtn2 = document.getElementById('mapBtn2');

// URLs dos diferentes mapas do BlueMap
const mapUrls = {
    '1': 'http://10.150.135.158:8100/#world:-8554:79:7109:51:2.22:0.97:0:0:perspective',
    '2': 'http://10.150.135.158:8100/#world:-8529:79:7114:0:1.36:1.02:0:0:free' // Altere para a URL do seu segundo mapa
};

let currentMap = '1';

function switchMap(mapId) {
    currentMap = mapId;
    bluemapIframe.src = mapUrls[mapId];
    
    // Atualiza os botões ativos
    document.querySelectorAll('.bluemap-map-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (mapId === '1') {
        mapBtn1.classList.add('active');
    } else if (mapId === '2') {
        mapBtn2.classList.add('active');
    }
}

function openBluemapModal() {
    // Define a URL do BlueMap no iframe quando o modal é aberto
    bluemapIframe.src = mapUrls[currentMap];
    bluemapModal.classList.add('active');
}

function closeBluemapModal() {
    bluemapModal.classList.remove('active');
    // Remove o src do iframe para parar de carregar quando fechado
    bluemapIframe.src = '';
}

bluemapBtn.addEventListener('click', openBluemapModal);
bluemapCloseBtn.addEventListener('click', closeBluemapModal);

// Event listeners para os botões de mapa
mapBtn1.addEventListener('click', () => switchMap('1'));
mapBtn2.addEventListener('click', () => switchMap('2'));

// Fechar modal ao clicar fora
bluemapModal.addEventListener('click', (e) => {
    if (e.target === bluemapModal) {
        closeBluemapModal();
    }
});

// Fechar modal com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bluemapModal.classList.contains('active')) {
        closeBluemapModal();
    }
});

// Discord Members Toggle - Facebook Style
const membersToggle = document.getElementById('membersToggle');
const membersSidebar = document.getElementById('membersSidebar');
const membersHeader = document.querySelector('.members-header');
const toggleAvatars = document.getElementById('toggleAvatars');
const toggleCount = document.getElementById('toggleCount');

// Função para atualizar o botão de toggle com avatares
function updateToggleButton(onlineMembers, count) {
    toggleCount.textContent = count > 0 ? count : '0';
    
    // Mostrar até 3 avatares
    const displayMembers = onlineMembers.slice(0, 3);
    
    if (displayMembers.length > 0) {
        toggleAvatars.innerHTML = displayMembers.map((member, index) => `
            <div style="position: relative;">
                <img src="${member.avatar}" 
                     alt="${member.displayName}" 
                     class="toggle-avatar"
                     style="z-index: ${10 - index};"
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22%3E%3Crect fill=%22%23000%22 width=%2232%22 height=%2232%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23fff%22 font-size=%2214%22 font-weight=%22bold%22%3E${member.displayName.charAt(0).toUpperCase()}%3C/text%3E%3C/svg%3E'">
                ${index === 0 ? '<div class="toggle-status-dot"></div>' : ''}
            </div>
        `).join('');
    } else {
        toggleAvatars.innerHTML = `
            <div style="width: 32px; height: 32px; border-radius: 50%; background: #000; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px;">
                👥
            </div>
        `;
    }
}

membersToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    membersSidebar.classList.toggle('open');
    membersToggle.classList.toggle('open');
});

// Clicar no cabeçalho também fecha/abre
if (membersHeader) {
    membersHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        membersSidebar.classList.remove('open');
        membersToggle.classList.remove('open');
    });
}

// Fechar sidebar ao clicar fora
document.addEventListener('click', (e) => {
    if (!membersSidebar.contains(e.target) && !membersToggle.contains(e.target)) {
        membersSidebar.classList.remove('open');
        membersToggle.classList.remove('open');
    }
});

// Discord Members Functionality
async function loadDiscordMembers() {
    const membersList = document.getElementById('membersList');
    const membersCount = document.getElementById('membersCount');
    
    try {
        const response = await fetch('http://10.150.135.158:3011/members');
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.message || 'Failed to load members');
        }
        
        // A resposta agora vem com { members: [...], cached: true }
        const members = data.members || data;
        
        // Ordenar: online primeiro, depois por nome
        const sortedMembers = members.sort((a, b) => {
            const statusOrder = { online: 0, idle: 1, dnd: 2, offline: 3 };
            const statusDiff = statusOrder[a.status] - statusOrder[b.status];
            if (statusDiff !== 0) return statusDiff;
            return a.displayName.localeCompare(b.displayName);
        });
        
        // Contar membros online
        const onlineCount = sortedMembers.filter(m => m.status === 'online').length;
        const onlineMembers = sortedMembers.filter(m => m.status === 'online');
        
        membersCount.textContent = `${onlineCount}/${sortedMembers.length}`;
        
        // Atualizar botão de toggle com avatares
        updateToggleButton(onlineMembers, onlineCount);
        
        // Renderizar membros
        membersList.innerHTML = sortedMembers.map(member => `
            <div class="member-item">
                <div class="member-avatar-wrapper">
                    <img src="${member.avatar}" alt="${member.displayName}" class="member-avatar" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect fill=%22%23000%22 width=%2240%22 height=%2240%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23fff%22 font-size=%2218%22 font-weight=%22bold%22%3E${member.displayName.charAt(0).toUpperCase()}%3C/text%3E%3C/svg%3E'">
                    <div class="member-status ${member.status}"></div>
                </div>
                <div class="member-info">
                    <div class="member-name">${member.displayName}</div>
                    <div class="member-username">@${member.name}</div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading Discord members:', error);
        membersList.innerHTML = `
            <div class="members-error">
                Discord bot offline<br/>
                <small>Start with: docker-compose up -d</small>
            </div>
        `;
        membersCount.textContent = '--';
        updateToggleButton([], 0);
    }
}

// Top Players Functionality
async function loadTopPlayers() {
    const topPlayersGrid = document.getElementById('topPlayersGrid');
    const topPlayersOnline = document.getElementById('topPlayersOnline');
    
    try {
        const response = await fetch('/api/top-players');
        const data = await response.json();
        
        if (!data.success || !data.players || data.players.length === 0) {
            topPlayersGrid.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #666;">
                    Nenhum jogador encontrado ainda...
                </div>
            `;
            topPlayersOnline.textContent = '0 online';
            return;
        }
        
        const players = data.players;
        const onlineCount = data.online_count || 0;
        
        // Atualizar contador de online
        topPlayersOnline.textContent = `${onlineCount} online agora`;
        
        // Renderizar apenas os top 4 jogadores
        const topFour = players.slice(0, 4);
        
        topPlayersGrid.innerHTML = topFour.map(player => `
            <div class="player-card" data-player="${player.name}" onclick="loadPlayerStats('${player.name}')">
                ${player.is_online ? `
                    <div class="player-online-dot">
                        <span class="pulse-ring"></span>
                        <span class="pulse-core"></span>
                    </div>
                ` : ''}
                <div class="player-content">
                    <div class="player-avatar-wrapper">
                        <img src="https://mc-heads.net/avatar/${player.name}/64" 
                             alt="${player.name}'s head" 
                             class="player-avatar"
                             onerror="this.src='https://mc-heads.net/avatar/steve/64'">
                        <div class="avatar-border"></div>
                    </div>
                    <div class="player-info">
                        <h3 class="player-nickname">${player.name}</h3>
                        <div class="player-stats">
                            <div class="player-stat playtime">
                                <svg class="stat-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                    <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                </svg>
                                <span>${player.playtime}</span>
                            </div>
                            <div class="player-stat last-seen has-tooltip" ${player.last_seen_full ? `data-tooltip="${player.last_seen_full}"` : ''}>
                                <svg class="stat-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
                                    <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/>
                                    <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                    <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                </svg>
                                <span>${player.last_seen}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="player-progress">
                    <div class="player-progress-bar" style="width: ${player.progress}%;"></div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading top players:', error);
        topPlayersGrid.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #666;">
                Erro ao carregar jogadores...
            </div>
        `;
        topPlayersOnline.textContent = '-- online';
    }
}

// Player Stats Functionality
let selectedPlayer = null;

async function loadPlayerStats(playerName) {
    const statsPanel = document.getElementById('statsPanel');
    const tabHint = document.getElementById('tabHint');
    const storageTab = document.getElementById('storageTab');
    const statsTab = document.getElementById('statsTab');
    const storagePanel = document.getElementById('storagePanel');
    
    selectedPlayer = playerName;
    
    // Switch to stats tab
    if (statsTab && storageTab) {
        statsTab.classList.add('active');
        storageTab.classList.remove('active');
        statsPanel.classList.add('active');
        storagePanel.classList.remove('active');
    }
    
    // Update hint
    if (tabHint) {
        tabHint.textContent = `Exibindo estatísticas de ${playerName}`;
    }
    
    // Show loading
    statsPanel.innerHTML = `
        <div class="stats-loading">
            <div class="stats-loading-spinner"></div>
            <span>Carregando estatísticas de ${playerName}...</span>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/player-stats/${playerName}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao carregar estatísticas');
        }
        
        const stats = data.stats;
        
        // Calculate max damage for bar widths
        const maxDamage = Math.max(stats.damage_dealt, stats.damage_taken, 1);
        
        statsPanel.innerHTML = `
            <!-- Main Stats Grid -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-card-value">${stats.playtime}</div>
                    <div class="stat-card-label">Tempo Jogado</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${stats.deaths}</div>
                    <div class="stat-card-label">Mortes</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${stats.mob_kills}</div>
                    <div class="stat-card-label">Mobs Mortos</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${stats.advancements_completed}</div>
                    <div class="stat-card-label">Conquistas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${stats.distance_walked.toFixed(1)} km</div>
                    <div class="stat-card-label">Distância Caminhada</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${formatNumber(stats.blocks_mined)}</div>
                    <div class="stat-card-label">Blocos Minerados</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${formatNumber(stats.items_crafted)}</div>
                    <div class="stat-card-label">Itens Craftados</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${formatNumber(stats.jumps)}</div>
                    <div class="stat-card-label">Pulos</div>
                </div>
            </div>
            
            <!-- Damage Stats -->
            <div class="damage-stats">
                <div class="damage-stat">
                    <div class="damage-stat-header">
                        <span class="damage-stat-label">Dano Causado</span>
                        <span class="damage-stat-value">${formatNumber(stats.damage_dealt)}</span>
                    </div>
                    <div class="damage-bar">
                        <div class="damage-bar-fill dealt" style="width: ${(stats.damage_dealt / maxDamage) * 100}%;"></div>
                    </div>
                </div>
                <div class="damage-stat">
                    <div class="damage-stat-header">
                        <span class="damage-stat-label">Dano Recebido</span>
                        <span class="damage-stat-value">${formatNumber(stats.damage_taken)}</span>
                    </div>
                    <div class="damage-bar">
                        <div class="damage-bar-fill taken" style="width: ${(stats.damage_taken / maxDamage) * 100}%;"></div>
                    </div>
                </div>
            </div>
            
            <!-- Stats Lists -->
            <div class="stats-lists" style="margin-top: 24px;">
                <div class="stat-list">
                    <div class="stat-list-title">🗡️ Top Mobs Eliminados</div>
                    ${stats.top_mobs_killed.length > 0 ? 
                        stats.top_mobs_killed.map(mob => `
                            <div class="stat-list-item">
                                <span class="stat-list-item-name">${mob.mob}</span>
                                <span class="stat-list-item-value">${mob.count}x</span>
                            </div>
                        `).join('') :
                        '<div class="stat-list-empty">Nenhum mob eliminado ainda</div>'
                    }
                </div>
                
                <div class="stat-list">
                    <div class="stat-list-title">⛏️ Top Blocos Minerados</div>
                    ${stats.top_mined.length > 0 ?
                        stats.top_mined.map(item => `
                            <div class="stat-list-item">
                                <span class="stat-list-item-name">${item.item}</span>
                                <span class="stat-list-item-value">${formatNumber(item.count)}x</span>
                            </div>
                        `).join('') :
                        '<div class="stat-list-empty">Nenhum bloco minerado ainda</div>'
                    }
                </div>
                
                <div class="stat-list">
                    <div class="stat-list-title">💀 Morto Por</div>
                    ${stats.killed_by.length > 0 ?
                        stats.killed_by.map(mob => `
                            <div class="stat-list-item">
                                <span class="stat-list-item-name">${mob.mob}</span>
                                <span class="stat-list-item-value">${mob.count}x</span>
                            </div>
                        `).join('') :
                        '<div class="stat-list-empty">Invencível até agora! 🎉</div>'
                    }
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading player stats:', error);
        statsPanel.innerHTML = `
            <div class="player-stats-placeholder">
                <div class="placeholder-icon">❌</div>
                <p>Erro ao carregar estatísticas: ${error.message}</p>
            </div>
        `;
    }
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString('pt-BR');
}

// === Tab Switching System ===
function initTabs() {
    const storageTab = document.getElementById('storageTab');
    const statsTab = document.getElementById('statsTab');
    const storagePanel = document.getElementById('storagePanel');
    const statsPanel = document.getElementById('statsPanel');
    const tabHint = document.getElementById('tabHint');
    
    if (!storageTab || !statsTab) return;
    
    storageTab.addEventListener('click', () => {
        storageTab.classList.add('active');
        statsTab.classList.remove('active');
        storagePanel.classList.add('active');
        statsPanel.classList.remove('active');
        tabHint.textContent = '';
    });
    
    statsTab.addEventListener('click', () => {
        statsTab.classList.add('active');
        storageTab.classList.remove('active');
        statsPanel.classList.add('active');
        storagePanel.classList.remove('active');
        tabHint.textContent = 'Clique em um card acima para ver as estatísticas';
    });
}

// === AE2 Storage System ===
let allStorageItems = [];
const AE2_API_URL = 'http://10.150.135.158:3003/api/items';
const AE2_STORAGE_API_URL = 'http://10.150.135.158:3003/api/storage';

// === Storage Cells Rack ===
async function loadStorageCells() {
    const storageCellsGrid = document.getElementById('storageCellsGrid');
    const storageCellsTotal = document.getElementById('storageCellsTotal');
    const storageCellsUsage = document.getElementById('storageCellsUsage');
    
    try {
        const response = await fetch(AE2_STORAGE_API_URL);
        const data = await response.json();
        
        if (!data.storage) {
            throw new Error('Formato de dados inválido');
        }
        
        const storage = data.storage;
        const cells = storage.cells || [];
        
        // Update total display
        const usedBytes = storage.usedBytes || 0;
        const totalBytes = storage.totalBytes || 0;
        const percentUsed = storage.percentUsed || 0;
        
        storageCellsTotal.textContent = `${formatBytes(usedBytes)} / ${formatBytes(totalBytes)}`;
        storageCellsUsage.textContent = `${percentUsed.toFixed(1)}%`;
        
        // Update toggle button color based on usage
        const toggleBtn = document.getElementById('storageCellsToggle');
        toggleBtn.classList.remove('low', 'medium', 'high', 'critical');
        toggleBtn.classList.add(getUsageClass(percentUsed));
        
        if (cells.length === 0) {
            storageCellsGrid.innerHTML = '<div class="storage-cells-empty">Nenhuma storage cell encontrada</div>';
            return;
        }
        
        // Render cells
        storageCellsGrid.innerHTML = cells.map((cell, index) => {
            const cellName = cell.name?.name || 'Unknown Cell';
            const displayName = formatCellName(cellName);
            const usedBytes = cell.usedBytes || 0;
            const totalBytes = cell.totalBytes || 4096; // Default to 4k if not set
            const usedTypes = cell.usedTypes || 0;
            const totalTypes = cell.totalTypes || 63;
            
            // Calculate percentage based on bytes
            let percent = 0;
            if (totalBytes > 0) {
                percent = (usedBytes / totalBytes) * 100;
            } else if (usedBytes > 0) {
                // If totalBytes is 0 but usedBytes > 0, estimate based on cell type
                const cellCapacity = getCellCapacity(cellName);
                percent = (usedBytes / cellCapacity) * 100;
            }
            
            const usageClass = getUsageClass(percent);
            
            // Parse mod and item for texture
            const [mod, itemName] = cellName.split(':');
            const textureUrl = `/textures/${mod}/${itemName}.png`;
            
            return `
                <div class="storage-cell" title="${cellName}">
                    <img class="storage-cell-icon" 
                         src="${textureUrl}" 
                         alt="${displayName}"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                    <div class="storage-cell-icon-fallback" style="display:none;">📦</div>
                    <div class="storage-cell-info">
                        <div class="storage-cell-name">${displayName}</div>
                        <div class="storage-cell-bar-container">
                            <div class="storage-cell-bar ${usageClass}" style="width: ${Math.min(percent, 100)}%"></div>
                        </div>
                        <div class="storage-cell-stats">
                            <span class="storage-cell-percent ${usageClass}">${percent.toFixed(1)}%</span>
                            <span class="storage-cell-types">${usedTypes}/${totalTypes} tipos</span>
                            <span class="storage-cell-bytes">${formatBytes(usedBytes)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erro ao carregar storage cells:', error);
        storageCellsGrid.innerHTML = `<div class="storage-cells-error">❌ Erro: ${error.message}</div>`;
        storageCellsUsage.textContent = '--';
    }
}

function formatCellName(name) {
    // Convert "ae2:item_storage_cell_4k" to "4K Storage Cell"
    const match = name.match(/(\d+)k/i);
    if (match) {
        return `${match[1]}K Cell`;
    }
    // Fallback: extract last part and format
    const parts = name.split(':');
    const itemPart = parts[parts.length - 1];
    return itemPart
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .substring(0, 20);
}

function getCellCapacity(cellName) {
    // Return approximate byte capacity based on cell type
    if (cellName.includes('256k')) return 262144;
    if (cellName.includes('64k')) return 65536;
    if (cellName.includes('16k')) return 16384;
    if (cellName.includes('4k')) return 4096;
    if (cellName.includes('1k')) return 1024;
    return 4096; // Default
}

function formatBytes(bytes) {
    if (bytes >= 1048576) {
        return (bytes / 1048576).toFixed(1) + ' MB';
    } else if (bytes >= 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    }
    return bytes + ' B';
}

function getUsageClass(percent) {
    if (percent >= 90) return 'critical';
    if (percent >= 70) return 'high';
    if (percent >= 40) return 'medium';
    return 'low';
}

function initStorageCellsRack() {
    const toggleBtn = document.getElementById('storageCellsToggle');
    const rackPanel = document.getElementById('storageCellsRack');
    
    if (!toggleBtn || !rackPanel) return;
    
    toggleBtn.addEventListener('click', () => {
        const isActive = rackPanel.classList.toggle('active');
        toggleBtn.classList.toggle('active', isActive);
        
        // Load cells when opening
        if (isActive) {
            loadStorageCells();
        }
    });
}

async function loadStorageItems() {

    const storageGrid = document.getElementById('storageGrid');
    const storageCount = document.getElementById('storageCount');
    
    try {
        const response = await fetch(AE2_API_URL);
        const data = await response.json();
        
        if (!data.items || !Array.isArray(data.items)) {
            throw new Error('Formato de dados inválido');
        }
        
        // Sort by amount (descending)
        allStorageItems = data.items.sort((a, b) => b.amount - a.amount);
        
        // Update count
        const totalItems = allStorageItems.reduce((sum, item) => sum + item.amount, 0);
        storageCount.textContent = `${allStorageItems.length} tipos · ${formatStorageNumber(totalItems)} itens`;
        
        // Render items
        renderStorageItems(allStorageItems);
        
    } catch (error) {
        console.error('Erro ao carregar storage:', error);
        storageGrid.innerHTML = `
            <div class="storage-error">
                <p>❌ Erro ao carregar itens do AE2</p>
                <p style="font-size: 11px; margin-top: 8px;">${error.message}</p>
            </div>
        `;
    }
}

function renderStorageItems(items) {
    const storageGrid = document.getElementById('storageGrid');
    
    if (items.length === 0) {
        storageGrid.innerHTML = '<div class="storage-empty">Nenhum item encontrado</div>';
        return;
    }
    
    storageGrid.innerHTML = items.map(item => {
        const displayName = item.displayName.replace(/^\[|\]$/g, ''); // Remove brackets
        const itemId = item.name;
        const amount = formatStorageAmount(item.amount);
        const fullAmount = item.amount.toLocaleString('pt-BR');
        
        // Parse mod and item name from itemId (e.g., "minecraft:diamond" -> mod="minecraft", itemName="diamond")
        const [mod, itemName] = itemId.split(':');
        const textureUrl = `/textures/${mod}/${itemName}.png`;
        const fallbackHue = hashStringToHue(mod);
        
        return `
            <div class="storage-item" 
                 data-item-id="${itemId}" 
                 data-item-name="${displayName.toLowerCase()}"
                 data-display-name="${displayName}"
                 data-full-amount="${fullAmount}"
                 data-mod="${mod}">
                <img class="storage-item-icon" 
                     src="${textureUrl}" 
                     alt="${displayName}"
                     loading="lazy"
                     onerror="handleTextureError(this, '${mod}', '${itemName}', '${displayName.charAt(0).toUpperCase()}', ${fallbackHue})">
                <div class="storage-item-fallback" style="display:none;"></div>
                <span class="storage-item-amount">${amount}</span>
            </div>
        `;
    }).join('');
}

// Handle texture loading errors with fallback chain
function handleTextureError(img, mod, itemName, letter, hue) {
    const fallbackDiv = img.nextElementSibling;
    
    // If it's minecraft, try external CDN as second attempt
    if (mod === 'minecraft' && !img.dataset.triedCdn) {
        img.dataset.triedCdn = 'true';
        img.src = `https://minecraft-api.vercel.app/images/items/${itemName}.png`;
        return;
    }
    
    // Show fallback
    img.style.display = 'none';
    fallbackDiv.style.display = 'flex';
    fallbackDiv.style.background = `linear-gradient(135deg, hsl(${hue}, 40%, 25%) 0%, hsl(${hue}, 50%, 15%) 100%)`;
    fallbackDiv.style.border = `1px solid hsl(${hue}, 50%, 35%)`;
    fallbackDiv.textContent = letter;
}

function hashStringToHue(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash % 360);
}

function formatStorageAmount(amount) {
    if (amount >= 1000000) {
        return (amount / 1000000).toFixed(1) + 'M';
    } else if (amount >= 1000) {
        return (amount / 1000).toFixed(1) + 'K';
    }
    return amount.toString();
}

function formatStorageNumber(num) {
    return num.toLocaleString('pt-BR');
}

function initStorageTooltips() {
    const storageGrid = document.getElementById('storageGrid');
    const tooltip = document.getElementById('globalStorageTooltip');
    const tooltipName = document.getElementById('globalTooltipName');
    const tooltipId = document.getElementById('globalTooltipId');
    const tooltipAmount = document.getElementById('globalTooltipAmount');
    const tooltipMod = document.getElementById('globalTooltipMod');
    
    if (!storageGrid || !tooltip) return;
    
    storageGrid.addEventListener('mouseover', (e) => {
        const item = e.target.closest('.storage-item');
        if (!item) return;
        
        // Update tooltip content
        tooltipName.textContent = item.dataset.displayName;
        tooltipId.textContent = item.dataset.itemId;
        tooltipAmount.textContent = item.dataset.fullAmount;
        tooltipMod.textContent = item.dataset.mod;
        
        // Position tooltip
        const rect = item.getBoundingClientRect();
        const tooltipHeight = 100; // approximate tooltip height
        
        // Check if tooltip would go above viewport
        if (rect.top < tooltipHeight + 10) {
            // Show below
            tooltip.classList.add('below');
            tooltip.style.top = (rect.bottom + 8) + 'px';
        } else {
            // Show above
            tooltip.classList.remove('below');
            tooltip.style.top = (rect.top - tooltipHeight - 8) + 'px';
        }
        
        tooltip.style.left = (rect.left + rect.width / 2) + 'px';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.classList.add('visible');
    });
    
    storageGrid.addEventListener('mouseout', (e) => {
        const item = e.target.closest('.storage-item');
        if (!item) return;
        
        // Check if we're still within a storage item
        const relatedTarget = e.relatedTarget;
        if (relatedTarget && relatedTarget.closest && relatedTarget.closest('.storage-item')) {
            return;
        }
        
        tooltip.classList.remove('visible');
    });
    
    // Hide tooltip when leaving the grid entirely
    storageGrid.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
    });
}

function initStorageSearch() {
    const searchInput = document.getElementById('storageSearch');
    const refreshBtn = document.getElementById('storageRefreshBtn');
    
    if (!searchInput) return;
    
    // Refresh button click handler
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('spinning');
            await Promise.all([
                loadStorageItems(),
                loadStorageCells()
            ]);
            setTimeout(() => refreshBtn.classList.remove('spinning'), 300);
        });
    }
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (query === '') {
            renderStorageItems(allStorageItems);
            return;
        }
        
        const filtered = allStorageItems.filter(item => {
            const displayName = item.displayName.toLowerCase();
            const itemId = item.name.toLowerCase();
            return displayName.includes(query) || itemId.includes(query);
        });
        
        renderStorageItems(filtered);
        
        // Update count
        const storageCount = document.getElementById('storageCount');
        storageCount.textContent = `${filtered.length} de ${allStorageItems.length} tipos`;
    });
}

// Initialize tabs
initTabs();

// Initialize storage
loadStorageItems();
initStorageSearch();
initStorageTooltips();
initStorageCellsRack();
loadStorageCells(); // Load initial data for the toggle button

// Initialize
loadStatus();
updateDateTime();
updateSystemMetrics();
loadDiscordMembers();
loadTopPlayers();
setInterval(loadStatus, 5000);
setInterval(updateDateTime, 60000);
setInterval(updateSystemMetrics, 2000);
setInterval(loadDiscordMembers, 30000); // Atualiza membros a cada 30 segundos
setInterval(loadTopPlayers, 15000); // Atualiza top players a cada 15 segundos
