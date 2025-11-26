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

// Load saved theme from localStorage
const savedTheme = localStorage.getItem('theme') || 'light';
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

// Pagination state
let currentPage = 1;
const imagesPerPage = 9;
let allImages = [];

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

async function loadGallery() {
    try {
        const res = await fetch('/api/images');
        const images = await res.json();
        
        // Verificar se é array e garantir que está no formato correto
        if (!Array.isArray(images)) {
            console.error('Resposta da API não é um array:', images);
            showEmptyState();
            return;
        }
        
        allImages = images;
        
        if (images.length === 0) {
            showEmptyState();
        } else {
            showGallery();
            renderPage(currentPage);
        }
    } catch (error) {
        console.error('Erro ao carregar galeria:', error);
        showEmptyState();
    }
}

// Funções para edição de legenda
let currentEditingImage = null;

async function openCaptionModal(imageName, currentCaption) {
    currentEditingImage = imageName;
    document.getElementById('captionInput').value = currentCaption || '';
    document.getElementById('captionModal').classList.add('active');
}

function closeCaptionModal() {
    document.getElementById('captionModal').classList.remove('active');
    currentEditingImage = null;
}

async function saveCaption() {
    if (!currentEditingImage) return;
    
    const caption = document.getElementById('captionInput').value;
    
    try {
        const res = await fetch(`/api/caption/${currentEditingImage}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ caption })
        });
        
        const data = await res.json();
        
        if (data.success) {
            closeCaptionModal();
            await loadGallery();
        } else {
            alert('Erro ao salvar comentário: ' + (data.error || 'Erro desconhecido'));
        }
    } catch (error) {
        console.error('Erro ao salvar comentário:', error);
        alert('Erro ao salvar comentário!');
    }
}

document.getElementById('captionCancel').addEventListener('click', closeCaptionModal);
document.getElementById('captionSave').addEventListener('click', saveCaption);

function showEmptyState() {
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('galleryGrid').style.display = 'none';
    document.getElementById('pagination').style.display = 'none';
}

function showGallery() {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('galleryGrid').style.display = 'block';
    document.getElementById('pagination').style.display = 'flex';
}

function renderPage(page) {
    const startIndex = (page - 1) * imagesPerPage;
    const endIndex = startIndex + imagesPerPage;
    const pageImages = allImages.slice(startIndex, endIndex);
    
    const galleryGrid = document.getElementById('galleryGrid');
    galleryGrid.innerHTML = pageImages.map((img, index) => {
        const globalIndex = startIndex + index + 1;
        const filename = img.filename || img;
        const caption = img.caption || '';
        
        // Escapar aspas na legenda para HTML
        const escapedCaption = caption.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        
        return `
            <div class="gallery-item">
                <button class="edit-btn" onclick="event.stopPropagation(); openCaptionModal('${filename}', '${escapedCaption}')" title="Editar comentário">✎</button>
                <button class="delete-btn" onclick="event.stopPropagation(); confirmDelete('${filename}')" title="Excluir imagem">DEL</button>
                ${caption ? `<div class="image-caption-overlay"><div class="image-caption-text">${caption}</div></div>` : ''}
                <div onclick="openImageModal('/imagens/${filename}')">
                    <img src="/imagens/${filename}" alt="Gallery image" loading="lazy">
                    <div class="gallery-item-caption">
                        <span>FIG_${String(globalIndex).padStart(3, '0')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    updatePagination();
}

function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    modalImage.src = imageSrc;
    modal.classList.add('active');
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.remove('active');
}

document.getElementById('imageModal').addEventListener('click', closeImageModal);

function updatePagination() {
    const totalPages = Math.ceil(allImages.length / imagesPerPage);
    
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage === totalPages;
}

document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderPage(currentPage);
        document.querySelector('.main-content').scrollTop = 0;
    }
});

document.getElementById('nextBtn').addEventListener('click', () => {
    const totalPages = Math.ceil(allImages.length / imagesPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderPage(currentPage);
        document.querySelector('.main-content').scrollTop = 0;
    }
});

// Upload de imagem
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');

uploadBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Verificar limite de 100 imagens
    if (allImages.length >= 100) {
        alert('Limite de 100 imagens atingido! Exclua algumas imagens antes de fazer upload.');
        fileInput.value = '';
        return;
    }
    
    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
        alert('Por favor, selecione apenas arquivos de imagem!');
        return;
    }
    
    // Validar tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('A imagem deve ter no máximo 10MB!');
        return;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();
        
        if (data.success) {
            fileInput.value = '';
            await loadGallery();
            // Ir para a última página onde a nova imagem está
            const totalPages = Math.ceil(allImages.length / imagesPerPage);
            currentPage = totalPages;
            renderPage(currentPage);
        } else {
            alert('Erro ao fazer upload: ' + (data.error || 'Erro desconhecido'));
        }
    } catch (error) {
        console.error('Erro ao fazer upload:', error);
        alert('Erro ao fazer upload da imagem!');
    }
});

// Funções de confirmação e exclusão
let imageToDelete = null;

function confirmDelete(imageName) {
    // Suportar tanto string quanto objeto
    imageToDelete = typeof imageName === 'string' ? imageName : imageName.filename;
    document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    imageToDelete = null;
}

document.getElementById('confirmNo').addEventListener('click', closeConfirmModal);

document.getElementById('confirmYes').addEventListener('click', async () => {
    if (!imageToDelete) return;
    
    try {
        const res = await fetch(`/api/images/${imageToDelete}`, {
            method: 'DELETE'
        });
        
        const data = await res.json();
        
        if (data.success) {
            closeConfirmModal();
            
            // Recarregar galeria
            await loadGallery();
            
            // Ajustar página se necessário
            const totalPages = Math.ceil(allImages.length / imagesPerPage);
            if (currentPage > totalPages && totalPages > 0) {
                currentPage = totalPages;
            } else if (allImages.length === 0) {
                currentPage = 1;
            }
            
            if (allImages.length > 0) {
                renderPage(currentPage);
            }
        } else {
            alert('Erro ao excluir imagem: ' + (data.error || 'Erro desconhecido'));
            closeConfirmModal();
        }
    } catch (error) {
        console.error('Erro ao excluir imagem:', error);
        alert('Erro ao excluir imagem!');
        closeConfirmModal();
    }
});

// Copy IP button behaviour
(function(){
    const copyBtn = document.getElementById('copyIpBtn');
    const addr = document.getElementById('serverAddress');
    if (!copyBtn || !addr) return;

    // armazenar SVG original para restaurar depois
    copyBtn.dataset.original = copyBtn.innerHTML;

    const checkSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20.3 7.7l-1.4-1.4z" fill="#00ff00"/></svg>';

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

// Initialize
loadStatus();
loadGallery();
updateDateTime();
updateSystemMetrics();
loadDiscordMembers();
setInterval(loadStatus, 5000);
setInterval(updateDateTime, 60000);
setInterval(updateSystemMetrics, 2000);
setInterval(loadDiscordMembers, 30000); // Atualiza membros a cada 30 segundos
